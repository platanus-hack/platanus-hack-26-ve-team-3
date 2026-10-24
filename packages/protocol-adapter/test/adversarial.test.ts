import { beforeAll, describe, expect, it } from "vitest";
import { appendBallot, buildDemoElection, createLedger, isCanonicalField, LedgerRejection, SNARK_SCALAR_FIELD, tally, verifyProof, type DemoElection } from "../src/index";
import type { BallotEntry } from "../src/index";
import { ballotEntries } from "../src/index";

let demo: DemoElection;
beforeAll(async () => {
  demo = await buildDemoElection({ votes: [1, 0], electionId: "test-adversarial" });
}, 60_000);

async function rejection(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return e instanceof LedgerRejection ? e.code : `other:${(e as Error).message}`;
  }
  return "accepted";
}

describe("codificación canónica (hallazgos C1 y A1)", () => {
  it("isCanonicalField: rechaza ceros a la izquierda, hex, signo y valores ≥ r", () => {
    expect(isCanonicalField("0")).toBe(true);
    expect(isCanonicalField("123")).toBe(true);
    expect(isCanonicalField("0123")).toBe(false);
    expect(isCanonicalField("0x1")).toBe(false);
    expect(isCanonicalField("-1")).toBe(false);
    expect(isCanonicalField(SNARK_SCALAR_FIELD.toString())).toBe(false);
    expect(isCanonicalField(1 as unknown)).toBe(false);
  });

  it("C1: re-enviar la misma boleta con nullifier '0'+n o hex → INVALID_ENCODING (nunca se acepta un doble voto)", async () => {
    const ledger = structuredClone(demo.ledger);
    const p = (ledger.entries[0] as BallotEntry).proof;
    expect(await rejection(appendBallot(ledger, { ...p, nullifier: `0${p.nullifier}` }, ledger.groupRoot))).toBe("INVALID_ENCODING");
    expect(await rejection(appendBallot(ledger, { ...p, nullifier: `0x${BigInt(p.nullifier).toString(16)}` }, ledger.groupRoot))).toBe("INVALID_ENCODING");
    expect(await rejection(appendBallot(ledger, p, ledger.groupRoot))).toBe("DOUBLE_VOTE");
    expect(ledger.entries).toHaveLength(2);
  });

  it("A1: message en hex o fuera de rango → INVALID_ENCODING antes de entrar al ledger", async () => {
    const fresh = createLedger(demo.manifest.electionId, demo.ledger.groupRoot);
    const p = (demo.ledger.entries[0] as BallotEntry).proof; // message "1"
    expect(await rejection(appendBallot(fresh, { ...p, message: "0x1" }, fresh.groupRoot))).toBe("INVALID_ENCODING");
    expect(await rejection(appendBallot(fresh, p, fresh.groupRoot, { optionCount: 1 }))).toBe("INVALID_ENCODING");
    expect(fresh.entries).toHaveLength(0);
    expect(await rejection(appendBallot(fresh, p, fresh.groupRoot, { optionCount: 3 }))).toBe("accepted");
  });
});

/**
 * Casos adversariales de docs/ADVERSARIAL_TESTS.md (rama docs/seguridad) contra el adaptador real:
 * pruebas Groth16 de verdad, sin mocks de appendBallot ni de verifyProof.
 */
describe("AT-03 nullifier repetido (adaptador)", () => {
  it("AT-03a: la misma prueba reinsertada tal cual → DOUBLE_VOTE y el ledger no crece", async () => {
    const ledger = structuredClone(demo.ledger);
    expect(await rejection(appendBallot(ledger, (ledger.entries[0] as BallotEntry).proof, ledger.groupRoot))).toBe("DOUBLE_VOTE");
    expect(ledger.entries).toHaveLength(2);
  });

  it("AT-03b: rechaza nullifier no canónico en sus tres variantes ('0'+n, '00'+n, '0x'+hex) y no infla el ledger", async () => {
    const ledger = structuredClone(demo.ledger);
    const p = (ledger.entries[0] as BallotEntry).proof;
    const variants = [`0${p.nullifier}`, `00${p.nullifier}`, `0x${BigInt(p.nullifier).toString(16)}`];
    for (const nullifier of variants) {
      // Las tres variantes representan el MISMO número: el ataque solo funciona si el ledger compara texto.
      expect(BigInt(nullifier)).toBe(BigInt(p.nullifier));
      // …y la prueba Groth16 sigue verificando con la codificación alternativa: la única defensa es la canonicidad.
      expect(await verifyProof({ ...p, nullifier })).toBe(true);
      const code = await rejection(appendBallot(ledger, { ...p, nullifier }, ledger.groupRoot, { optionCount: 3 }));
      expect(["INVALID_ENCODING", "DOUBLE_VOTE"]).toContain(code);
    }
    expect(ledger.entries).toHaveLength(2);
  });

  it("AT-03b (otros campos): '0'+x en message, scope, merkleTreeRoot o points[] → INVALID_ENCODING", async () => {
    const fresh = createLedger(demo.manifest.electionId, demo.ledger.groupRoot);
    const p = (demo.ledger.entries[0] as BallotEntry).proof;
    const mutations = [
      { ...p, message: `0${p.message}` },
      { ...p, scope: `0${p.scope}` },
      { ...p, merkleTreeRoot: `0${p.merkleTreeRoot}` },
      { ...p, points: p.points.map((x, i) => (i === 3 ? `0${x}` : x)) as typeof p.points },
    ];
    for (const m of mutations) expect(await rejection(appendBallot(fresh, m, fresh.groupRoot, { optionCount: 3 }))).toBe("INVALID_ENCODING");
    expect(fresh.entries).toHaveLength(0);
  });

  it("AT-03c: message '0x1' (la prueba Groth16 sigue verificando) se rechaza en la entrada; el recuento honesto queda sin inválidas", async () => {
    const fresh = createLedger(demo.manifest.electionId, demo.ledger.groupRoot);
    const [p0, p1] = ballotEntries(demo.ledger).map((e) => e.proof); // message "1" y "0"
    expect(await verifyProof({ ...p0, message: "0x1" })).toBe(true);
    expect(await rejection(appendBallot(fresh, { ...p0, message: "0x1" }, fresh.groupRoot, { optionCount: 3 }))).toBe("INVALID_ENCODING");
    expect(await rejection(appendBallot(fresh, p0, fresh.groupRoot, { optionCount: 3 }))).toBe("accepted");
    expect(await rejection(appendBallot(fresh, p1, fresh.groupRoot, { optionCount: 3 }))).toBe("accepted");
    expect(tally(fresh, 3)).toEqual({ counts: [1, 1, 0], invalid: 0, total: 2 });
  });
});
