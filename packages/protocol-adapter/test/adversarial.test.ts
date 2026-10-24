import { beforeAll, describe, expect, it } from "vitest";
import { appendBallot, buildDemoElection, createLedger, isCanonicalField, LedgerRejection, SNARK_SCALAR_FIELD, type DemoElection } from "../src/index.js";

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
    const p = ledger.entries[0].proof;
    expect(await rejection(appendBallot(ledger, { ...p, nullifier: `0${p.nullifier}` }, ledger.groupRoot))).toBe("INVALID_ENCODING");
    expect(await rejection(appendBallot(ledger, { ...p, nullifier: `0x${BigInt(p.nullifier).toString(16)}` }, ledger.groupRoot))).toBe("INVALID_ENCODING");
    expect(await rejection(appendBallot(ledger, p, ledger.groupRoot))).toBe("DOUBLE_VOTE");
    expect(ledger.entries).toHaveLength(2);
  });

  it("A1: message en hex o fuera de rango → INVALID_ENCODING antes de entrar al ledger", async () => {
    const fresh = createLedger(demo.manifest.electionId, demo.ledger.groupRoot);
    const p = demo.ledger.entries[0].proof; // message "1"
    expect(await rejection(appendBallot(fresh, { ...p, message: "0x1" }, fresh.groupRoot))).toBe("INVALID_ENCODING");
    expect(await rejection(appendBallot(fresh, p, fresh.groupRoot, { optionCount: 1 }))).toBe("INVALID_ENCODING");
    expect(fresh.entries).toHaveLength(0);
    expect(await rejection(appendBallot(fresh, p, fresh.groupRoot, { optionCount: 3 }))).toBe("accepted");
  });
});
