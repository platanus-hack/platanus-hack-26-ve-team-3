/**
 * D-23 modo continuo en el verificador independiente: recomputa la secuencia de raíces desde los member_added,
 * exige que cada boleta use una raíz histórica dentro de la ventana y con al menos K miembros, y sigue validando
 * igual los paquetes con fases (compatibilidad).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyPackage } from "../src/index";
// Solo en tests: el adaptador fabrica paquetes reales (pruebas Groth16 de verdad).
import {
  buildContinuousDemoElection,
  castBallot,
  continuousGenesisHash,
  createVoterIdentity,
  defaultArtifacts,
  hashCanonical,
  manifestHash,
  rechain,
  tally as recount,
  tallyHash,
  type AuditPackage,
  type BallotEntry,
  type ContinuousDemoElection,
  type EnrollmentPolicy,
  type MemberAddedEntry,
} from "@quorum/protocol-adapter";

type Result = Awaited<ReturnType<typeof verifyPackage>>;
const failing = (r: Result) => r.checks.filter((c) => !c.passed).map((c) => c.name);
const reasonOf = (r: Result, name: string) => r.checks.find((c) => c.name === name)?.reason ?? "";
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../../packages/demo-fixtures/protocol");

/** Lo que haría un organizador que reescribe el paquete entero: rehace cadena, tally, hashes y checksums. */
function reseal(p: AuditPackage, enrollment?: Partial<EnrollmentPolicy>): AuditPackage {
  if (enrollment) {
    p.manifest = { ...p.manifest, enrollment: { ...p.manifest.enrollment!, ...enrollment } };
    p.manifestHash = manifestHash(p.manifest);
    p.genesisHash = continuousGenesisHash(p.electionId, p.scope, p.manifest.enrollment!);
  }
  p.ledger = rechain(p.ledger, p.genesisHash);
  p.finalHash = p.ledger.length ? p.ledger[p.ledger.length - 1].hash : p.genesisHash;
  p.tally = recount({ entries: p.ledger }, p.manifest.options.length);
  p.tallyHash = tallyHash(p.tally);
  p.checksums = { manifest: hashCanonical(p.manifest), commitments: hashCanonical(p.commitments), ledger: hashCanonical(p.ledger), tally: hashCanonical(p.tally) };
  return p;
}

let demo: ContinuousDemoElection;
beforeAll(async () => {
  // 5 entran (K=5) → votan #0 y #1 → entran 3 más → #2 vota con la raíz de 5 (3 raíces encima) → #6 con la vigente (8).
  demo = await buildContinuousDemoElection({
    electionId: "verifier-continuo",
    minAnonymitySet: 5,
    rootWindow: 32,
    steps: ["join", "join", "join", "join", "join", { vote: 0, option: 0 }, { vote: 1, option: 1 }, "join", "join", "join", { vote: 2, option: 1, rootOfSize: 5 }, { vote: 6, option: 2 }],
  });
}, 120_000);

describe("paquete continuo honesto", () => {
  it("valid:true; root_history y anonymity_set_min verificados; mínimo y mediana del grupo; límites declarados", async () => {
    expect(demo.rejections).toEqual([]);
    const r = await verifyPackage(demo.pkg);
    expect(failing(r)).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual([
      "package_schema",
      "manifest_hash",
      "group_root",
      "commitments_unique",
      "chain_integrity",
      "root_history",
      "anonymity_set_min",
      "proofs_valid",
      "nullifiers_unique",
      "tally_matches",
      "anchor_matches",
    ]);
    expect(reasonOf(r, "package_schema")).toMatch(/modo continuo: K=5, ventana 32 raíces\), 8 inscripciones y 4 boletas/);
    expect(reasonOf(r, "anonymity_set_min")).toMatch(/mínimo 5, mediana 5/);
    expect(reasonOf(r, "tally_matches")).toContain("[1,2,1]");
    const u = r.unsupportedGuarantees.join("\n");
    expect(u).toMatch(/anonimato-variable-en-modo-continuo/);
    expect(u).toMatch(/correlacion-temporal-en-modo-continuo/);
  });
});

describe("manipulaciones del modo continuo → fallo detectado con causa", () => {
  it("boleta con raíz fuera de la ventana (el paquete declara ventana 2; la boleta #2 usa una raíz con 3 encima)", async () => {
    const r = await verifyPackage(reseal(clone(demo.pkg), { rootWindow: 2 }));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["root_history"]);
    expect(reasonOf(r, "root_history")).toMatch(/boleta #2 .*3 raíces encima, fuera de la ventana de 2/);
  });

  it("raíz inventada: prueba Groth16 válida pero contra un grupo que nunca existió en el ledger", async () => {
    const p = clone(demo.pkg);
    const members = demo.commitments.slice(0, 5);
    const fake = await castBallot(demo.voters[3].privateKey, [...members, createVoterIdentity().commitment], p.electionId, 0, defaultArtifacts());
    const at = p.ledger.findIndex((e) => (e as BallotEntry).proof && (e as BallotEntry).proof.nullifier === (p.ledger[5] as BallotEntry).proof.nullifier);
    p.ledger.splice(at + 2, 0, { idx: 0, prevHash: p.genesisHash, hash: p.genesisHash, kind: "ballot", proof: fake, groupSize: 6 });
    const r = await verifyPackage(reseal(p));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["root_history"]);
    expect(reasonOf(r, "root_history")).toMatch(/no es ninguna raíz histórica del grupo/);
  }, 60_000);

  it("K no alcanzado: el paquete declara K=6 pero hay boletas con 5 miembros en su raíz", async () => {
    const r = await verifyPackage(reseal(clone(demo.pkg), { minAnonymitySet: 6 }));
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["anonymity_set_min"]);
    expect(reasonOf(r, "anonymity_set_min")).toMatch(/K no alcanzado \(K=6\): boleta #0 .*con 5 miembros/);
  });

  it("groupSize publicado que miente (dice 8 en una boleta de 5) → root_history", async () => {
    const p = clone(demo.pkg);
    const b = p.ledger.find((e) => (e as BallotEntry).kind === "ballot") as BallotEntry;
    b.groupSize = 8;
    const r = await verifyPackage(reseal(p));
    expect(failing(r)).toEqual(["root_history"]);
    expect(reasonOf(r, "root_history")).toMatch(/groupSize publicado 8 ≠ tamaño recomputado del grupo en su raíz 5/);
  });

  it("rootAfter alterado en un member_added → group_root", async () => {
    const p = clone(demo.pkg);
    (p.ledger[2] as MemberAddedEntry).member.rootAfter = "12345";
    const r = await verifyPackage(reseal(p));
    expect(r.valid).toBe(false);
    expect(failing(r)).toContain("group_root");
    expect(reasonOf(r, "group_root")).toMatch(/ledger\[2\]: rootAfter publicado/);
  });

  it("commitments publicados ≠ secuencia de member_added (un miembro quitado del padrón) → group_root", async () => {
    const p = clone(demo.pkg);
    p.commitments = p.commitments.slice(0, -1);
    const r = await verifyPackage(reseal(p));
    expect(failing(r)).toContain("group_root");
  });

  it("doble voto (misma boleta reinsertada, cadena rehecha) → nullifiers_unique", async () => {
    const p = clone(demo.pkg);
    p.ledger.push(clone(p.ledger[5]));
    const r = await verifyPackage(reseal(p));
    expect(failing(r)).toEqual(["nullifiers_unique"]);
  });

  it("campo no declarado en un member_added (voterId) → package_schema", async () => {
    const p = clone(demo.pkg);
    (p.ledger[0] as unknown as Record<string, unknown>).voterId = "vt_1";
    const r = await verifyPackage(reseal(p));
    expect(r.checks[0]).toMatchObject({ name: "package_schema", passed: false, status: "fallo detectado" });
    expect(r.checks[0].reason).toMatch(/ledger\.0.*voterId/);
  });

  it("entrada con fases (sin kind) dentro de un paquete continuo → package_schema", async () => {
    const p = clone(demo.pkg);
    const b = p.ledger[5] as BallotEntry;
    p.ledger[5] = { idx: b.idx, prevHash: b.prevHash, hash: b.hash, proof: b.proof };
    const r = await verifyPackage(reseal(p));
    expect(r.checks[0]).toMatchObject({ name: "package_schema", passed: false });
  });

  it("quitar enrollment del manifiesto convierte el paquete en uno con fases y falla (entradas con kind no declaradas)", async () => {
    const p = clone(demo.pkg);
    delete (p.manifest as { enrollment?: unknown }).enrollment;
    p.manifestHash = manifestHash(p.manifest);
    const r = await verifyPackage(p);
    expect(r.valid).toBe(false);
    expect(r.checks[0]).toMatchObject({ name: "package_schema", passed: false });
  });
});

describe("compatibilidad: paquetes con fases ya publicados", () => {
  it("packages/demo-fixtures/protocol/valid.json sigue valid:true con los mismos checks de siempre", async () => {
    const valid = JSON.parse(readFileSync(resolve(fixturesDir, "valid.json"), "utf8"));
    const r = await verifyPackage(valid);
    expect(r.valid).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual(["package_schema", "manifest_hash", "group_root", "commitments_unique", "chain_integrity", "proofs_valid", "nullifiers_unique", "tally_matches", "anchor_matches"]);
    expect(r.unsupportedGuarantees.join("\n")).not.toMatch(/modo-continuo/);
  });
  it("los fixtures adulterados con fases siguen fallando por la misma causa", async () => {
    for (const [name, check] of [["tampered_total", "tally_matches"], ["wrong_root", "group_root"], ["double_vote", "nullifiers_unique"], ["tampered_proof", "proofs_valid"]] as const) {
      const r = await verifyPackage(JSON.parse(readFileSync(resolve(fixturesDir, `${name}.json`), "utf8")));
      expect(failing(r)).toContain(check);
    }
  });
});
