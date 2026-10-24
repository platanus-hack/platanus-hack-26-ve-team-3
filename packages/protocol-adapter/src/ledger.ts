import { verifyProof, type SemaphoreProof } from "@semaphore-protocol/core";
import { hashCanonical } from "./hash.js";
import { electionScope, MERKLE_TREE_DEPTH } from "./identity.js";

export type Hex32 = `0x${string}`;

export type LedgerEntry = {
  idx: number;
  prevHash: Hex32;
  /** sha256(canonicalJson({ idx, prevHash, proof })) */
  hash: Hex32;
  proof: SemaphoreProof;
};

/** Ledger append-only de boletas. Serializable tal cual (sin Sets ni bigints). */
export type Ledger = {
  electionId: string;
  scope: string;
  groupRoot: string;
  /** sha256(canonicalJson({ kind:"quorum-ledger-genesis", electionId, scope, groupRoot })) */
  genesisHash: Hex32;
  entries: LedgerEntry[];
};

export type LedgerRejectionCode = "WRONG_ROOT" | "DOUBLE_VOTE" | "INVALID_PROOF" | "WRONG_SCOPE" | "WRONG_DEPTH";

export class LedgerRejection extends Error {
  constructor(public readonly code: LedgerRejectionCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "LedgerRejection";
  }
}

export function genesisHash(electionId: string, scope: string, groupRoot: string): Hex32 {
  return hashCanonical({ kind: "quorum-ledger-genesis", electionId, scope, groupRoot });
}

export function entryHash(idx: number, prevHash: Hex32, proof: SemaphoreProof): Hex32 {
  return hashCanonical({ idx, prevHash, proof });
}

/** Crea un ledger vacío ligado a una elección y a la raíz del padrón fijada en `publish`. */
export function createLedger(electionId: string, groupRoot: string): Ledger {
  const scope = electionScope(electionId);
  return { electionId, scope, groupRoot, genesisHash: genesisHash(electionId, scope, groupRoot), entries: [] };
}

export function finalHash(ledger: Ledger): Hex32 {
  const last = ledger.entries[ledger.entries.length - 1];
  return last ? last.hash : ledger.genesisHash;
}

/**
 * Añade una boleta al ledger tras validar, en este orden: raíz del padrón, scope, profundidad,
 * nullifier no repetido (DOUBLE_VOTE) y prueba Groth16 válida (INVALID_PROOF). Lanza `LedgerRejection`.
 * Semántica de doble voto en Quórum: se RECHAZA la segunda boleta (no hay reemplazo de voto).
 */
export async function appendBallot(ledger: Ledger, proof: SemaphoreProof, groupRoot: string): Promise<LedgerEntry> {
  if (groupRoot !== ledger.groupRoot) throw new LedgerRejection("WRONG_ROOT", `ledger root ${ledger.groupRoot} != supplied ${groupRoot}`);
  if (proof.merkleTreeRoot !== ledger.groupRoot) throw new LedgerRejection("WRONG_ROOT", `proof root ${proof.merkleTreeRoot} != ledger root ${ledger.groupRoot}`);
  if (proof.scope !== ledger.scope) throw new LedgerRejection("WRONG_SCOPE", `proof scope ${proof.scope} != election scope ${ledger.scope}`);
  if (proof.merkleTreeDepth !== MERKLE_TREE_DEPTH) throw new LedgerRejection("WRONG_DEPTH", `proof depth ${proof.merkleTreeDepth} != ${MERKLE_TREE_DEPTH}`);
  if (ledger.entries.some((e) => e.proof.nullifier === proof.nullifier)) throw new LedgerRejection("DOUBLE_VOTE", `nullifier ${proof.nullifier} already in ledger`);
  if (!(await verifyProof(proof))) throw new LedgerRejection("INVALID_PROOF", "Semaphore Groth16 proof does not verify");
  const idx = ledger.entries.length;
  const prevHash = finalHash(ledger);
  const entry: LedgerEntry = { idx, prevHash, hash: entryHash(idx, prevHash, proof), proof };
  ledger.entries.push(entry);
  return entry;
}

export type Tally = {
  /** counts[i] = boletas cuyo `message` es exactamente la opción i. */
  counts: number[];
  /** Boletas con mensaje fuera de [0, optionCount). Se publican como inválidas, nunca se reparten. */
  invalid: number;
  total: number;
};

/** Recuento reproducible: cuenta el `message` de cada boleta del ledger. No es una "prueba de tally"; es un recuento que cualquiera repite. */
export function tally(ledger: Pick<Ledger, "entries">, optionCount: number): Tally {
  const counts = new Array<number>(optionCount).fill(0);
  let invalid = 0;
  for (const e of ledger.entries) {
    const m = Number(e.proof.message);
    if (Number.isInteger(m) && m >= 0 && m < optionCount && /^\d+$/.test(e.proof.message)) counts[m] += 1;
    else invalid += 1;
  }
  return { counts, invalid, total: ledger.entries.length };
}

/**
 * Recalcula prevHash/hash de una lista de entradas a partir de `genesis`. Útil para reconstruir
 * un ledger o para fabricar fixtures de manipulación "consistente" (el atacante también rehace la cadena).
 */
export function rechain(entries: readonly Pick<LedgerEntry, "proof">[], genesis: Hex32): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  let prev = genesis;
  entries.forEach((e, idx) => {
    const hash = entryHash(idx, prev, e.proof);
    out.push({ idx, prevHash: prev, hash, proof: e.proof });
    prev = hash;
  });
  return out;
}
