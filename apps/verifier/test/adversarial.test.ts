import { beforeAll, describe, expect, it } from "vitest";
import { verifyPackage } from "../src/index";
import { buildAuditPackage, buildDemoElection, encodeAnchorCalldata, groupRoot, genesisHash, hashCanonical, rechain, runDraw, tally as recount, tallyHash, type AuditPackage, type DrawRule } from "@quorum/protocol-adapter";
import { recomputeDraw, type AnchorReader } from "../src/index";

const failing = (r: Awaited<ReturnType<typeof verifyPackage>>) => r.checks.filter((c) => !c.passed).map((c) => c.name);
let pkg: AuditPackage;
beforeAll(async () => {
  pkg = (await buildDemoElection({ votes: [1, 0], electionId: "test-verifier-adversarial" })).pkg;
}, 60_000);

/** Rehace cadena, finalHash y checksums como lo haría un atacante cuidadoso. */
function reseal(t: AuditPackage): AuditPackage {
  t.ledger = rechain(t.ledger, t.genesisHash);
  t.finalHash = t.ledger.length ? t.ledger[t.ledger.length - 1].hash : t.genesisHash;
  t.checksums = { ...t.checksums, ledger: hashCanonical(t.ledger), commitments: hashCanonical(t.commitments) };
  return t;
}

describe("verificador: hallazgos C1 y M3", () => {
  it("AT-03b / C1: doble voto con nullifier '0'+n (cadena rehecha) → valid:false (package_schema: decimal canónico)", async () => {
    const t = structuredClone(pkg);
    const p = t.ledger[0].proof;
    t.ledger.push({ ...t.ledger[0], proof: { ...p, nullifier: `0${p.nullifier}` } });
    const r = await verifyPackage(reseal(t));
    expect(r.valid).toBe(false);
    expect(r.checks[0]).toMatchObject({ name: "package_schema", passed: false });
    expect(r.checks[0].reason).toMatch(/nullifier.*canónico/);
  });

  it("AT-08c / M3: commitment duplicado en el padrón (raíz y génesis recalculadas) → commitments_unique falla", async () => {
    const t = structuredClone(pkg);
    t.commitments.push(t.commitments[0]);
    t.groupRoot = groupRoot(t.commitments);
    t.genesisHash = genesisHash(t.electionId, t.scope, t.groupRoot);
    const r = await verifyPackage(reseal(t));
    expect(r.valid).toBe(false);
    expect(failing(r)).toContain("commitments_unique");
    expect(r.checks.find((c) => c.name === "commitments_unique")?.reason).toMatch(/commitment #2 duplica #0/);
  });

  it("paquete legítimo → commitments_unique pasa", async () => {
    const r = await verifyPackage(pkg);
    expect(r.valid).toBe(true);
    expect(r.checks.find((c) => c.name === "commitments_unique")?.passed).toBe(true);
  });
});

const reasonOf = (r: Awaited<ReturnType<typeof verifyPackage>>, name: string) => r.checks.find((c) => c.name === name)?.reason ?? "";
const BASE_SEPOLIA = 84532;
const ANCHOR_TX = `0x${"a1".repeat(32)}` as const;
/** Lector de ancla simulado: la tx on-chain contiene el calldata del paquete ORIGINAL (lo que se ancló al cerrar). */
function anchoredReader(original: AuditPackage): AnchorReader {
  const input = encodeAnchorCalldata({ finalHash: original.finalHash, groupRoot: original.groupRoot, tallyHash: original.tallyHash, electionId: original.electionId });
  const from = "0x1111111111111111111111111111111111111111";
  return async () => ({ chainId: BASE_SEPOLIA, from, to: from, input });
}

describe("AT-02 ledger reordenado", () => {
  it("(a) intercambiar #0 y #1 sin rehacer hashes → chain_integrity 'cadena rota en #0'", async () => {
    const t = structuredClone(pkg);
    [t.ledger[0], t.ledger[1]] = [t.ledger[1], t.ledger[0]];
    const r = await verifyPackage(t);
    expect(r.valid).toBe(false);
    expect(failing(r)).toContain("chain_integrity");
    expect(reasonOf(r, "chain_integrity")).toMatch(/cadena rota en #0/);
  });

  it("(b) intercambiar y rehacer cadena + finalHash + checksums → valid:true sin ancla (indetectable), cambia finalHash y se declara completitud-del-ledger no garantizada", async () => {
    const t = structuredClone(pkg);
    [t.ledger[0], t.ledger[1]] = [t.ledger[1], t.ledger[0]];
    const r = await verifyPackage(reseal(t));
    expect(r.valid).toBe(true);
    expect(t.tally).toEqual(pkg.tally);
    // El reordenamiento cambia finalHash ⇒ cambia la semilla del sorteo (A5). Queda escrito aquí.
    expect(t.finalHash).not.toBe(pkg.finalHash);
    expect(r.unsupportedGuarantees.some((g) => g.startsWith("completitud-del-ledger"))).toBe(true);
  });

  it("(c) igual que (b) pero con ancla del finalHash original → anchor_matches 'hash final ≠ ancla'", async () => {
    const original = structuredClone(pkg);
    original.anchor = { chainId: BASE_SEPOLIA, txHash: ANCHOR_TX };
    const honest = await verifyPackage(original, { anchorReader: anchoredReader(original) });
    expect(honest.valid).toBe(true);
    const t = structuredClone(original);
    [t.ledger[0], t.ledger[1]] = [t.ledger[1], t.ledger[0]];
    const r = await verifyPackage(reseal(t), { anchorReader: anchoredReader(original) });
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["anchor_matches"]);
    expect(reasonOf(r, "anchor_matches")).toMatch(/hash final ≠ ancla/);
  });
});

describe("AT-03 nullifier repetido (verificador)", () => {
  it("AT-03a: la boleta #0 duplicada tal cual (cadena rehecha) → nullifiers_unique '#2 repite el nullifier de #0'", async () => {
    const t = structuredClone(pkg);
    t.ledger.push(structuredClone(t.ledger[0]));
    const r = await verifyPackage(reseal(t));
    expect(r.valid).toBe(false);
    expect(failing(r)).toContain("nullifiers_unique");
    expect(reasonOf(r, "nullifiers_unique")).toMatch(/#2 repite el nullifier de #0/);
  });

  it("AT-03b: variantes '00'+n y '0x'+hex con cadena, tally y checksums rehechos → valid:false (nunca un total inflado válido)", async () => {
    for (const enc of [(n: string) => `00${n}`, (n: string) => `0x${BigInt(n).toString(16)}`]) {
      const t = structuredClone(pkg);
      const p = t.ledger[0].proof;
      t.ledger.push({ ...t.ledger[0], proof: { ...p, nullifier: enc(p.nullifier) } });
      reseal(t);
      t.tally = { ...t.tally, counts: t.tally.counts.map((c, i) => (i === Number(p.message) ? c + 1 : c)), total: t.tally.total + 1 };
      t.tallyHash = tallyHash(t.tally);
      t.checksums.tally = t.tallyHash;
      const r = await verifyPackage(t);
      expect(r.valid).toBe(false);
      expect(r.checks[0]).toMatchObject({ name: "package_schema", passed: false });
      expect(r.checks[0].reason).toMatch(/nullifier/);
    }
  });

  it("AT-03c: con la entrada canónica la elección honesta sigue valid:true; un message '0x1' colado en el paquete hace fallar package_schema", async () => {
    expect((await verifyPackage(pkg)).valid).toBe(true);
    const t = structuredClone(pkg);
    t.ledger[0] = { ...t.ledger[0], proof: { ...t.ledger[0].proof, message: "0x1" } };
    const r = await verifyPackage(reseal(t));
    expect(r.valid).toBe(false);
    expect(r.checks[0].reason).toMatch(/ledger\.0\.proof\.message/);
  });
});

describe("AT-05 sorteo", () => {
  const rule: DrawRule = {
    candidates: [
      { id: "p-01", label: "Iluminación del estacionamiento" },
      { id: "p-02", label: "Jardín comunal" },
      { id: "p-03", label: "Bomba de agua" },
      { id: "p-04", label: "Cámaras de la entrada" },
    ],
    winnersCount: { kind: "from-result", optionValues: [1, 2, 3] },
    tieBreak: "lowest",
  };
  let drawn: AuditPackage;
  beforeAll(async () => {
    const demo = await buildDemoElection({ votes: [1, 1, 0], electionId: "test-at05-draw" });
    const manifest = { ...demo.manifest, drawRule: rule };
    const t = recount(demo.ledger, 3);
    drawn = buildAuditPackage({ electionId: manifest.electionId, manifest, commitments: demo.commitments, ledger: demo.ledger, tally: t, draw: runDraw(rule, t, demo.pkg.finalHash) });
  }, 60_000);

  it("legítimo → valid:true y draw_matches pasa", async () => {
    const r = await verifyPackage(drawn);
    expect(r.valid).toBe(true);
    expect(r.checks.find((c) => c.name === "draw_matches")?.passed).toBe(true);
  });

  it("(a) seed ≠ keccak256(finalHash) → draw_matches", async () => {
    const t = structuredClone(drawn);
    t.draw!.seed = `0x${"ff".repeat(32)}`;
    const r = await verifyPackage(t);
    expect(failing(r)).toEqual(["draw_matches"]);
    expect(reasonOf(r, "draw_matches")).toMatch(/semilla publicada .* ≠ keccak256\(finalHash\)/);
  });

  it("(b) seed correcta pero ganadores permutados o cambiados → draw_matches", async () => {
    const swapped = structuredClone(drawn);
    swapped.draw!.winners = [...drawn.draw!.winners].reverse();
    expect(drawn.draw!.winners.length).toBe(2);
    expect(reasonOf(await verifyPackage(swapped), "draw_matches")).toMatch(/ganadores publicados/);
    const changed = structuredClone(drawn);
    changed.draw!.winners = rule.candidates.map((c) => c.id).filter((id) => !drawn.draw!.winners.includes(id));
    expect(failing(await verifyPackage(changed))).toEqual(["draw_matches"]);
  });

  it("(c) candidato añadido tras publicar y ganadores recomputados con la semilla correcta → manifest_hash falla (candidatos en el manifiesto, fix A5)", async () => {
    const t = structuredClone(drawn);
    t.manifest.drawRule!.candidates.push({ id: "p-00", label: "Proyecto añadido después" });
    const re = recomputeDraw(t.manifest.drawRule!.candidates.map((c) => c.id), 2, t.finalHash as `0x${string}`);
    t.draw = { ...t.draw!, ...re };
    const r = await verifyPackage(t);
    expect(r.valid).toBe(false);
    expect(failing(r)).toContain("manifest_hash");
  });

  it("(d) N distinto del que sale del recuento → draw_matches 'N publicado ≠ N recomputado'", async () => {
    const t = structuredClone(drawn);
    const re = recomputeDraw(rule.candidates.map((c) => c.id), 3, t.finalHash as `0x${string}`);
    t.draw = { ...t.draw!, ...re };
    const r = await verifyPackage(t);
    expect(failing(r)).toEqual(["draw_matches"]);
    expect(reasonOf(r, "draw_matches")).toMatch(/N publicado 3 ≠ N recomputado 2/);
  });
});

describe("AT-06 tally inflado", () => {
  it("total += 1 sin tocar el ledger (tallyHash y checksum rehechos) → tally_matches 'total: publicado 3, boletas en el ledger 2'", async () => {
    const t = structuredClone(pkg);
    t.tally = { ...t.tally, total: t.tally.total + 1 };
    t.tallyHash = tallyHash(t.tally);
    t.checksums.tally = t.tallyHash;
    const r = await verifyPackage(t);
    expect(failing(r)).toEqual(["tally_matches"]);
    expect(reasonOf(r, "tally_matches")).toMatch(/total: publicado 3, boletas en el ledger 2/);
  });
});
