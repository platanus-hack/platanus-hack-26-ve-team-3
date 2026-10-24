import { verifyProof, type SemaphoreProof } from "@semaphore-protocol/core";
import { hashCanonical } from "./hash";
import { electionScope, groupRoot as computeRoot, MERKLE_TREE_DEPTH } from "./identity";

export type Hex32 = `0x${string}`;

/**
 * Boleta del ledger.
 *  - Modo con fases (padrón congelado): `{ idx, prevHash, hash, proof }`, hash = sha256({ idx, prevHash, proof }).
 *  - Modo continuo: además `kind:"ballot"` y `groupSize` (tamaño del grupo en la raíz de la prueba = conjunto de
 *    anonimato de esa boleta); hash = sha256({ idx, prevHash, kind, proof, groupSize }).
 * La raíz contra la que se generó la prueba es `proof.merkleTreeRoot`.
 */
export type BallotEntry = {
  idx: number;
  prevHash: Hex32;
  hash: Hex32;
  proof: SemaphoreProof;
  kind?: "ballot";
  groupSize?: number;
};

/** Modo continuo: alguien completó su inscripción y su commitment entró al grupo (sin voterId). */
export type MemberAddedEntry = {
  idx: number;
  prevHash: Hex32;
  /** sha256(canonicalJson({ idx, prevHash, kind:"member_added", member })) */
  hash: Hex32;
  kind: "member_added";
  member: { index: number; commitment: string; rootAfter: string };
};

export type LedgerEntry = BallotEntry | MemberAddedEntry;

/**
 * Modo continuo (D-23): el grupo crece mientras se vota. Una boleta es válida si su raíz es una raíz histórica del
 * grupo, de un estado anterior o igual del ledger, entre las últimas `rootWindow` raíces (como el historial de raíces
 * de los contratos de Semaphore v4), y el grupo en esa raíz tiene al menos `minAnonymitySet` miembros.
 */
export type EnrollmentPolicy = { mode: "continuous"; minAnonymitySet: number; rootWindow: number };
export const DEFAULT_MIN_ANONYMITY_SET = 5;
export const DEFAULT_ROOT_WINDOW = 32;
/** Raíz del grupo vacío en Semaphore v4 (LeanIMT sin hojas). */
export const EMPTY_GROUP_ROOT = "0";
/** Capacidad del árbol con los artefactos vendorizados (profundidad 10). */
export const MAX_GROUP_SIZE = 2 ** MERKLE_TREE_DEPTH;

/** Ledger append-only. Serializable tal cual (sin Sets ni bigints). */
export type Ledger = {
  electionId: string;
  scope: string;
  /** Con fases: raíz congelada. Continuo: raíz VIGENTE (la del último `member_added`, o "0" si está vacío). */
  groupRoot: string;
  /** Con fases: sha256({ kind:"quorum-ledger-genesis", electionId, scope, groupRoot }). Continuo: ver `continuousGenesisHash`. */
  genesisHash: Hex32;
  entries: LedgerEntry[];
  /** Presente solo en modo continuo. */
  enrollment?: EnrollmentPolicy;
};

export type LedgerRejectionCode =
  | "WRONG_ROOT"
  | "STALE_ROOT"
  | "ANONYMITY_SET_TOO_SMALL"
  | "DOUBLE_VOTE"
  | "INVALID_PROOF"
  | "WRONG_SCOPE"
  | "WRONG_DEPTH"
  | "INVALID_ENCODING"
  | "DUPLICATE_MEMBER"
  | "GROUP_FULL"
  | "WRONG_MODE";

export function isMemberEntry(e: LedgerEntry): e is MemberAddedEntry {
  return (e as { kind?: string }).kind === "member_added";
}
export function isBallotEntry(e: LedgerEntry): e is BallotEntry {
  return !isMemberEntry(e);
}
/** Solo las boletas, en orden. */
export function ballotEntries(ledger: Pick<Ledger, "entries">): BallotEntry[] {
  return ledger.entries.filter(isBallotEntry);
}
/** Commitments del grupo en orden de inscripción (modo continuo). */
export function memberCommitments(ledger: Pick<Ledger, "entries">): string[] {
  return ledger.entries.filter(isMemberEntry).map((e) => e.member.commitment);
}
/** Historial de raíces: `[{ root, size }]` tras cada `member_added` (size = miembros en esa raíz). */
export function rootHistory(ledger: Pick<Ledger, "entries">): { root: string; size: number }[] {
  return ledger.entries.filter(isMemberEntry).map((e) => ({ root: e.member.rootAfter, size: e.member.index + 1 }));
}

/** Módulo del campo escalar de BN254 (r). Todo valor de la prueba debe ser < r. */
export const SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/**
 * Decimal canónico: sin ceros a la izquierda, sin signo, sin hex, y < r.
 * Semaphore/snarkjs aceptan "0"+n o "0x…" como el mismo número; sin esta regla una misma credencial
 * podría votar dos veces con dos codificaciones del mismo nullifier (hallazgo C1) o sabotear el recuento (A1).
 */
export function isCanonicalField(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d{0,77})$/.test(value) && BigInt(value) < SNARK_SCALAR_FIELD;
}

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

/** Génesis del modo continuo: liga elección, scope, grupo vacío y la política (ventana y K). */
export function continuousGenesisHash(electionId: string, scope: string, enrollment: EnrollmentPolicy): Hex32 {
  return hashCanonical({ kind: "quorum-ledger-genesis", electionId, scope, groupRoot: EMPTY_GROUP_ROOT, enrollment });
}

/** Hash de cualquier entrada (con fases o continua) a partir de su contenido; ignora el `hash` que traiga. */
export function hashOfEntry(idx: number, prevHash: Hex32, e: Omit<BallotEntry, "idx" | "prevHash" | "hash"> | Omit<MemberAddedEntry, "idx" | "prevHash" | "hash">): Hex32 {
  if ((e as { kind?: string }).kind === "member_added") {
    const m = (e as MemberAddedEntry).member;
    return hashCanonical({ idx, prevHash, kind: "member_added", member: m });
  }
  const b = e as BallotEntry;
  if (b.kind === "ballot") return hashCanonical({ idx, prevHash, kind: "ballot", proof: b.proof, groupSize: b.groupSize });
  return entryHash(idx, prevHash, b.proof);
}

/** Ledger vacío en modo continuo: el grupo empieza sin miembros y crece con cada inscripción. */
export function createContinuousLedger(electionId: string, policy: Partial<Omit<EnrollmentPolicy, "mode">> = {}): Ledger {
  const enrollment: EnrollmentPolicy = {
    mode: "continuous",
    minAnonymitySet: policy.minAnonymitySet ?? DEFAULT_MIN_ANONYMITY_SET,
    rootWindow: policy.rootWindow ?? DEFAULT_ROOT_WINDOW,
  };
  if (!Number.isInteger(enrollment.minAnonymitySet) || enrollment.minAnonymitySet < 1) throw new RangeError("minAnonymitySet must be an integer >= 1");
  if (!Number.isInteger(enrollment.rootWindow) || enrollment.rootWindow < 1) throw new RangeError("rootWindow must be an integer >= 1");
  const scope = electionScope(electionId);
  return { electionId, scope, groupRoot: EMPTY_GROUP_ROOT, genesisHash: continuousGenesisHash(electionId, scope, enrollment), entries: [], enrollment };
}

/**
 * Modo continuo: agrega un commitment al grupo y registra `member_added { index, commitment, rootAfter }` en la cadena.
 * La raíz se recalcula con el Group (LeanIMT) de Semaphore sobre todos los commitments en orden.
 */
export function appendMember(ledger: Ledger, commitment: string): MemberAddedEntry {
  if (!ledger.enrollment) throw new LedgerRejection("WRONG_MODE", "appendMember solo existe en modo continuo");
  if (!isCanonicalField(commitment) || commitment === "0") throw new LedgerRejection("INVALID_ENCODING", "commitment must be a canonical non-zero decimal < BN254 field");
  const members = memberCommitments(ledger);
  if (members.some((c) => c === commitment)) throw new LedgerRejection("DUPLICATE_MEMBER", "commitment already in the group");
  if (members.length >= MAX_GROUP_SIZE) throw new LedgerRejection("GROUP_FULL", `group is full (${MAX_GROUP_SIZE})`);
  const rootAfter = computeRoot([...members, commitment]);
  const idx = ledger.entries.length;
  const prevHash = finalHash(ledger);
  const member = { index: members.length, commitment, rootAfter };
  const entry: MemberAddedEntry = { idx, prevHash, hash: hashOfEntry(idx, prevHash, { kind: "member_added", member }), kind: "member_added", member };
  ledger.entries.push(entry);
  ledger.groupRoot = rootAfter;
  return entry;
}

/**
 * Regla de validez de la raíz de una boleta en modo continuo, sobre el historial de raíces ANTERIOR a la boleta.
 * Devuelve el tamaño del grupo en esa raíz o lanza `LedgerRejection` (WRONG_ROOT / STALE_ROOT / ANONYMITY_SET_TOO_SMALL).
 */
export function checkContinuousRoot(history: readonly { root: string; size: number }[], root: string, policy: EnrollmentPolicy): number {
  let pos = -1;
  for (let i = history.length - 1; i >= 0; i--) if (history[i].root === root) { pos = i; break; }
  if (pos < 0) throw new LedgerRejection("WRONG_ROOT", `proof root ${root} is not a historical root of this group`);
  const age = history.length - 1 - pos;
  if (age >= policy.rootWindow) throw new LedgerRejection("STALE_ROOT", `proof root is ${age} roots old (window ${policy.rootWindow})`);
  const size = history[pos].size;
  if (size < policy.minAnonymitySet) throw new LedgerRejection("ANONYMITY_SET_TOO_SMALL", `group had ${size} members at that root (minimum ${policy.minAnonymitySet})`);
  return size;
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
export async function appendBallot(ledger: Ledger, proof: SemaphoreProof, groupRoot: string, opts: { optionCount?: number } = {}): Promise<BallotEntry> {
  const fields: [string, unknown][] = [["merkleTreeRoot", proof.merkleTreeRoot], ["message", proof.message], ["nullifier", proof.nullifier], ["scope", proof.scope], ...proof.points.map((p, i) => [`points[${i}]`, p] as [string, unknown])];
  for (const [name, v] of fields) if (!isCanonicalField(v)) throw new LedgerRejection("INVALID_ENCODING", `${name} must be a canonical decimal < BN254 field`);
  if (proof.points.length !== 8) throw new LedgerRejection("INVALID_ENCODING", "points must have 8 elements");
  if (opts.optionCount !== undefined && BigInt(proof.message) >= BigInt(opts.optionCount)) throw new LedgerRejection("INVALID_ENCODING", `message ${proof.message} is not an option index < ${opts.optionCount}`);
  let groupSize: number | undefined;
  if (ledger.enrollment) {
    // Continuo: raíz histórica dentro de la ventana y con al menos K miembros (el `groupRoot` pasado se ignora).
    void groupRoot;
    groupSize = checkContinuousRoot(rootHistory(ledger), proof.merkleTreeRoot, ledger.enrollment);
  } else {
    if (groupRoot !== ledger.groupRoot) throw new LedgerRejection("WRONG_ROOT", `ledger root ${ledger.groupRoot} != supplied ${groupRoot}`);
    if (proof.merkleTreeRoot !== ledger.groupRoot) throw new LedgerRejection("WRONG_ROOT", `proof root ${proof.merkleTreeRoot} != ledger root ${ledger.groupRoot}`);
  }
  if (proof.scope !== ledger.scope) throw new LedgerRejection("WRONG_SCOPE", `proof scope ${proof.scope} != election scope ${ledger.scope}`);
  if (proof.merkleTreeDepth !== MERKLE_TREE_DEPTH) throw new LedgerRejection("WRONG_DEPTH", `proof depth ${proof.merkleTreeDepth} != ${MERKLE_TREE_DEPTH}`);
  const n = BigInt(proof.nullifier);
  if (ballotEntries(ledger).some((e) => BigInt(e.proof.nullifier) === n)) throw new LedgerRejection("DOUBLE_VOTE", `nullifier ${proof.nullifier} already in ledger`);
  if (!(await verifyProof(proof))) throw new LedgerRejection("INVALID_PROOF", "Semaphore Groth16 proof does not verify");
  const idx = ledger.entries.length;
  const prevHash = finalHash(ledger);
  const entry: BallotEntry =
    groupSize !== undefined
      ? { idx, prevHash, hash: hashOfEntry(idx, prevHash, { kind: "ballot", proof, groupSize }), kind: "ballot", proof, groupSize }
      : { idx, prevHash, hash: entryHash(idx, prevHash, proof), proof };
  ledger.entries.push(entry);
  return entry;
}

export type Tally = {
  /** counts[i] = boletas cuyo `message` es exactamente la opción i (los `member_added` no cuentan). */
  counts: number[];
  /** Boletas con mensaje fuera de [0, optionCount). Se publican como inválidas, nunca se reparten. */
  invalid: number;
  total: number;
};

/** Recuento reproducible: cuenta el `message` de cada boleta del ledger. No es una "prueba de tally"; es un recuento que cualquiera repite. */
export function tally(ledger: Pick<Ledger, "entries">, optionCount: number): Tally {
  const counts = new Array<number>(optionCount).fill(0);
  let invalid = 0;
  const ballots = ballotEntries(ledger);
  for (const e of ballots) {
    const m = Number(e.proof.message);
    if (Number.isInteger(m) && m >= 0 && m < optionCount && /^\d+$/.test(e.proof.message)) counts[m] += 1;
    else invalid += 1;
  }
  return { counts, invalid, total: ballots.length };
}

/**
 * Recalcula prevHash/hash de una lista de entradas a partir de `genesis`. Útil para reconstruir
 * un ledger o para fabricar fixtures de manipulación "consistente" (el atacante también rehace la cadena).
 */
export function rechain(entries: readonly (Omit<BallotEntry, "idx" | "prevHash" | "hash"> | Omit<MemberAddedEntry, "idx" | "prevHash" | "hash">)[], genesis: Hex32): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  let prev = genesis;
  entries.forEach((e, idx) => {
    const hash = hashOfEntry(idx, prev, e);
    const { idx: _i, prevHash: _p, hash: _h, ...rest } = e as LedgerEntry;
    void _i; void _p; void _h;
    out.push({ ...(rest as object), idx, prevHash: prev, hash } as LedgerEntry);
    prev = hash;
  });
  return out;
}
