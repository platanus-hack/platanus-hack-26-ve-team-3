/**
 * D-22 modo continuo: el grupo Semaphore crece mientras se vota. Pruebas Groth16 reales (sin mocks).
 * Raíces históricas, ventana de N raíces, K mínimo de anonimato, cadena con member_added y compatibilidad con fases.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  appendBallot,
  appendMember,
  ballotEntries,
  buildContinuousDemoElection,
  castBallot,
  checkContinuousRoot,
  createContinuousLedger,
  createVoterIdentity,
  defaultArtifacts,
  finalHash,
  groupRoot,
  hashOfEntry,
  LedgerRejection,
  memberCommitments,
  rechain,
  rootHistory,
  tally,
  type ContinuousDemoElection,
} from "../src/index";

const artifacts = defaultArtifacts();
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return "accepted";
  } catch (e) {
    return e instanceof LedgerRejection ? e.code : `other:${(e as Error).message}`;
  }
};

describe("checkContinuousRoot (regla pura)", () => {
  const policy = { mode: "continuous" as const, minAnonymitySet: 3, rootWindow: 4 };
  const h = Array.from({ length: 10 }, (_, i) => ({ root: `r${i + 1}`, size: i + 1 }));
  it("acepta la raíz vigente y las anteriores dentro de la ventana; devuelve el tamaño del grupo en esa raíz", () => {
    expect(checkContinuousRoot(h, "r10", policy)).toBe(10);
    expect(checkContinuousRoot(h, "r7", policy)).toBe(7);
  });
  it("raíz fuera de la ventana → STALE_ROOT; raíz inventada → WRONG_ROOT", () => {
    expect(() => checkContinuousRoot(h, "r6", policy)).toThrow(/STALE_ROOT/);
    expect(() => checkContinuousRoot(h, "nope", policy)).toThrow(/WRONG_ROOT/);
  });
  it("raíz con menos de K miembros → ANONYMITY_SET_TOO_SMALL", () => {
    const short = h.slice(0, 4);
    expect(checkContinuousRoot(short, "r3", policy)).toBe(3);
    expect(() => checkContinuousRoot(short, "r2", policy)).toThrow(/ANONYMITY_SET_TOO_SMALL/);
  });
});

describe("ledger continuo: member_added encadenado", () => {
  it("cada inscripción agrega un evento con index, commitment y rootAfter = raíz del Group de Semaphore", () => {
    const l = createContinuousLedger("t-cont-members", { minAnonymitySet: 2 });
    expect(l.groupRoot).toBe("0");
    const ids = [createVoterIdentity(), createVoterIdentity(), createVoterIdentity()];
    ids.forEach((v, i) => {
      const e = appendMember(l, v.commitment);
      expect(e.member).toEqual({ index: i, commitment: v.commitment, rootAfter: groupRoot(ids.slice(0, i + 1).map((x) => x.commitment)) });
      expect(e.hash).toBe(hashOfEntry(e.idx, e.prevHash, e));
    });
    expect(l.groupRoot).toBe(groupRoot(ids.map((v) => v.commitment)));
    expect(rootHistory(l).map((r) => r.size)).toEqual([1, 2, 3]);
    expect(memberCommitments(l)).toEqual(ids.map((v) => v.commitment));
    expect(() => appendMember(l, ids[0].commitment)).toThrow(/DUPLICATE_MEMBER/);
    expect(() => appendMember(l, "0123")).toThrow(/INVALID_ENCODING/);
    // rechain reproduce exactamente la cadena (sirve al verificador y al laboratorio)
    expect(rechain(l.entries, l.genesisHash)).toEqual(l.entries.map((e) => ({ ...e })));
    expect(finalHash(l)).toBe(l.entries[2].hash);
  });
  it("el génesis liga la política (K y ventana): cambiarla cambia el génesis", () => {
    expect(createContinuousLedger("x", { minAnonymitySet: 5 }).genesisHash).not.toBe(createContinuousLedger("x", { minAnonymitySet: 4 }).genesisHash);
  });
});

describe("boletas en modo continuo (pruebas reales)", () => {
  let demo: ContinuousDemoElection;
  beforeAll(async () => {
    // 3 entran (K=3): vota #0; entran 2 más; #1 vota con la raíz VIEJA (tamaño 3, dentro de la ventana); #3 con la vigente.
    demo = await buildContinuousDemoElection({
      electionId: "t-cont-ballots",
      minAnonymitySet: 3,
      rootWindow: 4,
      steps: ["join", "join", "join", { vote: 0, option: 1 }, "join", "join", { vote: 1, option: 0, rootOfSize: 3 }, { vote: 3, option: 1 }, { vote: 0, option: 2 }],
    });
  }, 120_000);

  it("acepta boletas contra la raíz vigente y contra una raíz anterior dentro de la ventana; registra groupSize", () => {
    expect(demo.rejections).toEqual([{ step: 8, code: "DOUBLE_VOTE" }]);
    const ballots = ballotEntries(demo.ledger);
    expect(ballots.map((b) => b.groupSize)).toEqual([3, 3, 5]);
    expect(ballots.every((b) => b.kind === "ballot")).toBe(true);
    expect(tally(demo.ledger, 3)).toEqual({ counts: [1, 2, 0], invalid: 0, total: 3 });
    expect(demo.pkg.tally.total).toBe(3);
    expect(demo.pkg.commitments).toHaveLength(5);
    expect(demo.pkg.ledger).toHaveLength(8); // 5 member_added + 3 boletas
    expect(demo.pkg.manifest.enrollment).toEqual({ mode: "continuous", minAnonymitySet: 3, rootWindow: 4 });
  });

  it("K: con menos de K miembros la boleta se rechaza (ANONYMITY_SET_TOO_SMALL) y el ledger no crece", async () => {
    const l = createContinuousLedger("t-cont-k", { minAnonymitySet: 3 });
    const a = createVoterIdentity();
    const b = createVoterIdentity();
    appendMember(l, a.commitment);
    appendMember(l, b.commitment);
    const proof = await castBallot(a.privateKey, memberCommitments(l), l.electionId, 0, artifacts);
    expect(await code(appendBallot(l, proof, l.groupRoot))).toBe("ANONYMITY_SET_TOO_SMALL");
    expect(l.entries).toHaveLength(2);
    appendMember(l, createVoterIdentity().commitment);
    // La misma prueba (raíz de 2 miembros) sigue sin valer aunque ahora haya 3: cuenta el tamaño EN SU raíz.
    expect(await code(appendBallot(l, proof, l.groupRoot))).toBe("ANONYMITY_SET_TOO_SMALL");
    const fresh = await castBallot(a.privateKey, memberCommitments(l), l.electionId, 0, artifacts);
    expect(await code(appendBallot(l, fresh, l.groupRoot))).toBe("accepted");
  }, 60_000);

  it("ventana: una prueba contra una raíz más vieja que las últimas N se rechaza (STALE_ROOT)", async () => {
    const l = createContinuousLedger("t-cont-window", { minAnonymitySet: 1, rootWindow: 2 });
    const a = createVoterIdentity();
    appendMember(l, a.commitment);
    const proof = await castBallot(a.privateKey, memberCommitments(l), l.electionId, 0, artifacts);
    appendMember(l, createVoterIdentity().commitment); // la raíz de la prueba tiene 1 raíz encima: aún vale
    appendMember(l, createVoterIdentity().commitment); // 2 encima: fuera de la ventana de 2
    expect(await code(appendBallot(l, proof, l.groupRoot))).toBe("STALE_ROOT");
  }, 60_000);

  it("una prueba contra un grupo que nunca existió en el ledger → WRONG_ROOT", async () => {
    const l = createContinuousLedger("t-cont-fake", { minAnonymitySet: 1 });
    const a = createVoterIdentity();
    appendMember(l, a.commitment);
    const fake = await castBallot(a.privateKey, [a.commitment, createVoterIdentity().commitment], l.electionId, 0, artifacts);
    expect(await code(appendBallot(l, fake, l.groupRoot))).toBe("WRONG_ROOT");
  }, 60_000);
});
