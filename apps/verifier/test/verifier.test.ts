import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditResult as AuditResultSchema } from "@quorum/contracts";
import { verifyPackage, type AnchorReader } from "../src/index";
// Solo en tests: el adaptador genera un paquete real al vuelo y codifica el calldata del ancla simulada.
import { buildDemoElection, encodeAnchorCalldata, rechain, tally as recount, tallyHash, hashCanonical } from "@quorum/protocol-adapter";

const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/demo-fixtures/protocol");
const load = (name: string) => JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), "utf8"));
const failing = (r: Awaited<ReturnType<typeof verifyPackage>>) => r.checks.filter((c) => !c.passed).map((c) => c.name);
const reasonOf = (r: Awaited<ReturnType<typeof verifyPackage>>, name: string) => r.checks.find((c) => c.name === name)?.reason ?? "";

describe("fixtures de packages/demo-fixtures/protocol", () => {
  it("valid.json → valid:true, todos los checks pasan, ancla no evaluada declarada en unsupportedGuarantees", async () => {
    const r = await verifyPackage(load("valid"));
    expect(AuditResultSchema.safeParse(r).success).toBe(true);
    expect(r.valid).toBe(true);
    expect(r.protocol).toBe("semaphore-ledger");
    expect(r.checks.map((c) => c.name)).toEqual(["package_schema", "manifest_hash", "group_root", "commitments_unique", "chain_integrity", "proofs_valid", "nullifiers_unique", "tally_matches", "anchor_matches"]);
    expect(reasonOf(r, "anchor_matches")).toMatch(/no evaluado/);
    expect(r.unsupportedGuarantees.join("\n")).toMatch(/secreto-del-contenido/);
    expect(r.unsupportedGuarantees.join("\n")).toMatch(/resistencia-a-coaccion/);
    expect(r.unsupportedGuarantees.join("\n")).toMatch(/inmutabilidad-on-chain/);
    expect(reasonOf(r, "tally_matches")).toContain("[1,2,0]");
  });

  it("tampered_total.json → tally_matches falla con la discrepancia concreta", async () => {
    const r = await verifyPackage(load("tampered_total"));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["tally_matches"]);
    expect(reasonOf(r, "tally_matches")).toMatch(/opción 0 \(opt-a\): publicado 2, recomputado 1/);
  });

  it("tampered_proof.json → proofs_valid falla en la boleta #1", async () => {
    const r = await verifyPackage(load("tampered_proof"));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["proofs_valid"]);
    expect(reasonOf(r, "proofs_valid")).toMatch(/boleta #1: la prueba Groth16 de Semaphore no verifica/);
  });

  it("removed_record.json → chain_integrity rota en #1 y tally ≠ recuento", async () => {
    const r = await verifyPackage(load("removed_record"));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["chain_integrity", "tally_matches"]);
    expect(reasonOf(r, "chain_integrity")).toMatch(/cadena rota en #1/);
  });

  it("removed_record_rechained.json → SIN ancla el verificador no lo detecta (límite declarado)", async () => {
    const r = await verifyPackage(load("removed_record_rechained"));
    expect(r.valid).toBe(true);
    expect(r.unsupportedGuarantees.join("\n")).toMatch(/completitud-del-ledger/);
  });

  it("wrong_manifest.json → manifest_hash falla", async () => {
    const r = await verifyPackage(load("wrong_manifest"));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["manifest_hash"]);
    expect(reasonOf(r, "manifest_hash")).toMatch(/manifiesto alterado/);
  });

  it("double_vote.json → nullifiers_unique falla (#3 repite #0)", async () => {
    const r = await verifyPackage(load("double_vote"));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["nullifiers_unique"]);
    expect(reasonOf(r, "nullifiers_unique")).toMatch(/#3 repite el nullifier de #0/);
  });

  it("wrong_root.json → group_root falla (padrón alterado)", async () => {
    const r = await verifyPackage(load("wrong_root"));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["group_root"]);
    expect(reasonOf(r, "group_root")).toMatch(/padrón alterado/);
  });

  it("entrada que no es un paquete → package_schema falla, nunca lanza", async () => {
    const r = await verifyPackage({ hello: "world" });
    expect(r.valid).toBe(false);
    expect(r.checks[0]).toMatchObject({ name: "package_schema", passed: false });
    const r2 = await verifyPackage({ ...load("valid"), protocol: "davinci" });
    expect(r2.valid).toBe(false);
  });
});

describe("flujo completo generado en el test + ancla simulada", () => {
  it("paquete real de 3 votantes verifica; con ancla simulada anchor_matches pasa; eliminación rehecha se detecta contra el ancla", async () => {
    const demo = await buildDemoElection({ votes: [2, 2, 0], electionId: "test-anchor-election" });
    const pkg = demo.pkg;
    const calldata = encodeAnchorCalldata({ finalHash: pkg.finalHash, groupRoot: pkg.groupRoot, tallyHash: pkg.tallyHash, electionId: pkg.electionId });
    const txHash = `0x${"a1".repeat(32)}` as const;
    const reader: AnchorReader = async (h) => {
      if (h !== txHash) throw new Error("tx not found");
      return { chainId: 84532, from: "0x1111111111111111111111111111111111111111", to: "0x1111111111111111111111111111111111111111", input: calldata };
    };
    const anchored = { ...pkg, anchor: { chainId: 84532, txHash } };

    const ok = await verifyPackage(anchored, { anchorReader: reader });
    expect(ok.valid).toBe(true);
    // El calldata coincide, pero este manifiesto no fija organizador (M1): no se sabe quién ancló → "no evaluado", no "verificado".
    expect(ok.checks.find((c) => c.name === "anchor_matches")).toMatchObject({ passed: true, status: "no evaluado" });
    expect(ok.unsupportedGuarantees.join("\n")).not.toMatch(/inmutabilidad-on-chain/);

    // sin RPC: no evaluado
    const noRpc = await verifyPackage(anchored);
    expect(noRpc.valid).toBe(true);
    expect(noRpc.checks.find((c) => c.name === "anchor_matches")?.reason).toMatch(/sin --anchor-rpc/);

    // eliminación "sofisticada" (cadena, tally y checksums rehechos): solo el ancla la delata
    const t = JSON.parse(JSON.stringify(anchored)) as typeof anchored;
    t.ledger.splice(0, 1);
    t.ledger = rechain(t.ledger, t.genesisHash);
    t.finalHash = t.ledger[t.ledger.length - 1].hash;
    t.tally = recount({ entries: t.ledger }, t.manifest.options.length);
    t.tallyHash = tallyHash(t.tally);
    t.checksums = { ...t.checksums, ledger: hashCanonical(t.ledger), tally: hashCanonical(t.tally) };
    const caught = await verifyPackage(t, { anchorReader: reader });
    expect(caught.valid).toBe(false);
    expect(caught.checks.filter((c) => !c.passed).map((c) => c.name)).toEqual(["anchor_matches"]);
    expect(caught.checks.find((c) => c.name === "anchor_matches")?.reason).toMatch(/hash final ≠ ancla/);

    // RPC caído ⇒ nunca éxito: valid:false con estado "no evaluado" (no se acusa manipulación sin evidencia)
    const down = await verifyPackage(anchored, { anchorReader: async () => { throw new Error("ECONNREFUSED"); } });
    expect(down.valid).toBe(false);
    expect(down.checks.find((c) => c.name === "anchor_matches")?.status).toBe("no evaluado");
    expect(down.checks.find((c) => c.name === "anchor_matches")?.reason).toMatch(/no se pudo leer/);
  }, 60_000);
});

describe("rollPolicy (sala abierta) — declarativa", () => {
  it("open-room → sigue valid:true y se declara en unsupportedGuarantees con tope y entradas", async () => {
    const pkg = { ...load("valid"), rollPolicy: { kind: "open-room", maxSeats: 60, joined: 27, enrolled: 3, eligibility: "face-dedupe-demo", note: "x" } };
    const r = await verifyPackage(pkg);
    expect(r.valid).toBe(true);
    const note = r.unsupportedGuarantees.find((g) => g.startsWith("censo-abierto-en-sala"));
    expect(note).toMatch(/la elegibilidad depende de la deduplicación facial demo, no de un padrón/);
    expect(note).toMatch(/tope 60 asientos, entraron 27, 3 llegaron al padrón/);
  });

  it("event-badge (D-19) → valid:true y declara credencial + rostro y que el QR no es secreto", async () => {
    const pkg = { ...load("valid"), rollPolicy: { kind: "event-badge", maxSeats: 120, check: "list", face: "full", joined: 40, enrolled: 38, eligibility: "badge-once+face-dedupe-demo", note: "x" } };
    const r = await verifyPackage(pkg);
    expect(r.valid).toBe(true);
    const note = r.unsupportedGuarantees.find((g) => g.startsWith("credencial-de-evento"));
    expect(note).toMatch(/la credencial demuestra que es participante del evento \(comprobada contra una lista cargada por el organizador\) y se usa una sola vez/);
    expect(note).toMatch(/el rostro \(deduplicación facial demo\) impide que una misma persona use varias credenciales/);
    expect(note).toMatch(/El QR de la credencial no es secreto/);
    expect(note).toMatch(/tope 120 asientos, entraron 40, 38 llegaron al padrón/);
    expect(r.unsupportedGuarantees.some((g) => g.startsWith("censo-abierto-en-sala"))).toBe(false);
  });

  it("event-badge sin rostro (face distinto de full) → package_schema falla", async () => {
    const bad = await verifyPackage({ ...load("valid"), rollPolicy: { kind: "event-badge", maxSeats: 10, check: "live", face: "off", joined: 1, enrolled: 1, eligibility: "badge-once+face-dedupe-demo" } });
    expect(bad.valid).toBe(false);
    expect(failing(bad)).toEqual(["package_schema"]);
  });

  it("sin rollPolicy no aparece la nota; rollPolicy mal formada → package_schema falla", async () => {
    const r = await verifyPackage(load("valid"));
    expect(r.unsupportedGuarantees.some((g) => g.startsWith("censo-abierto-en-sala"))).toBe(false);
    const bad = await verifyPackage({ ...load("valid"), rollPolicy: { kind: "open-room", maxSeats: 0 } });
    expect(bad.valid).toBe(false);
    expect(failing(bad)).toEqual(["package_schema"]);
  });
});
