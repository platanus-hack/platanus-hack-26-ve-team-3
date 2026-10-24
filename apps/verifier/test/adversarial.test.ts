import { beforeAll, describe, expect, it } from "vitest";
import { verifyPackage } from "../src/index";
import { buildDemoElection, groupRoot, genesisHash, hashCanonical, rechain, type AuditPackage } from "@quorum/protocol-adapter";

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
  it("C1: doble voto con nullifier '0'+n (cadena rehecha) → valid:false (package_schema: decimal canónico)", async () => {
    const t = structuredClone(pkg);
    const p = t.ledger[0].proof;
    t.ledger.push({ ...t.ledger[0], proof: { ...p, nullifier: `0${p.nullifier}` } });
    const r = await verifyPackage(reseal(t));
    expect(r.valid).toBe(false);
    expect(r.checks[0]).toMatchObject({ name: "package_schema", passed: false });
    expect(r.checks[0].reason).toMatch(/nullifier.*canónico/);
  });

  it("M3: commitment duplicado en el padrón (raíz y génesis recalculadas) → commitments_unique falla", async () => {
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
