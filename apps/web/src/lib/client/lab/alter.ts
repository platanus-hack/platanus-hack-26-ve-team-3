/**
 * Alteraciones deterministas sobre una COPIA profunda del paquete `quorum-audit/1` (semaphore-ledger).
 * El original nunca se toca. Son deterministas a propósito: la URL compartida lleva la "receta"
 * (origen + id de alteración) y cada teléfono reproduce exactamente la misma copia y comprueba su huella.
 *
 * Para rehacer hashes usamos las mismas herramientas que tendría el organizador/atacante
 * (`@quorum/protocol-adapter`); no se implementa criptografía aquí.
 */
import { encodeAnchorCalldata, groupRoot as computeGroupRoot, hashCanonical, rechain, runDraw, tally as recount, type DrawRule, type LedgerEntry } from "@quorum/protocol-adapter";
import { alterationById, type AlterationId } from "./catalog";

type Hex = `0x${string}`;
type Proof = LedgerEntry["proof"];
type Entry = { idx: number; prevHash: Hex; hash: Hex; proof: Proof };
type Tally = { counts: number[]; invalid: number; total: number };
type Draw = { seed: Hex; n: number; winners: string[]; method: string; finalHash: Hex };

/** Forma mínima del paquete que necesitamos leer. Todo lo demás se copia tal cual. */
export type LabPackage = {
  electionId: string;
  manifest: { options: { id: string; label: string }[]; drawRule?: { candidates: { id: string; label: string }[] } } & Record<string, unknown>;
  groupRoot: string;
  commitments: string[];
  ledger: Entry[];
  genesisHash: Hex;
  tally: Tally;
  tallyHash: Hex;
  finalHash: Hex;
  anchor: { chainId: number; txHash?: Hex; attestationUid?: Hex } | null;
  checksums: { manifest: Hex; commitments: Hex; ledger: Hex; tally: Hex };
  draw?: Draw;
  /** Declaración de censo abierto en sala (opcional, fuera de los hashes). */
  rollPolicy?: unknown;
} & Record<string, unknown>;

export type Change = {
  path: string;
  before: string;
  after: string;
  /** `tamper` = lo que hizo el jurado; `recomputed` = lo que el atacante rehízo para disimular. */
  kind: "tamper" | "recomputed";
};

export type AlterationOutcome = { altered: LabPackage; changes: Change[] };

export class AlterationUnavailable extends Error {}

export const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** ¿El paquete parece `semaphore-ledger` v1? (validación superficial; la real la hace el verificador). */
export function isLabPackage(v: unknown): v is LabPackage {
  const p = v as Partial<LabPackage> | null;
  return !!p && typeof p === "object" && Array.isArray(p.ledger) && Array.isArray(p.commitments) && !!p.tally && Array.isArray(p.tally.counts) && typeof p.finalHash === "string";
}

/** Motivo por el que una alteración no aplica a este paquete, o null si aplica. */
export function unavailableReason(pkg: unknown, id: AlterationId): string | null {
  if (!isLabPackage(pkg)) return "El paquete no tiene el formato semaphore-ledger v1.";
  const spec = alterationById(id);
  if (spec?.needs === "draw" && !pkg.draw) return "Este paquete no trae sorteo (la elección aún no está en fase «sorteo realizado»).";
  if (spec?.needs === "draw" && id === "draw-winner") {
    const cands = pkg.manifest.drawRule?.candidates ?? [];
    if (!cands.some((c) => !pkg.draw!.winners.includes(c.id))) return "Todos los candidatos ganaron: no hay a quién colar.";
  }
  if (spec?.needs === "two-ballots" && pkg.ledger.length < 2) return "Hacen falta al menos 2 boletas en el registro.";
  if (spec?.needs === "room" && !pkg.rollPolicy) return "Este paquete no declara censo abierto en sala (rollPolicy): no hay nada que ocultar.";
  if ((id === "ballot-message" || id === "nullifier-dup" || id === "drop-raw" || id === "drop-rechain" || id === "ledger-extra-field") && pkg.ledger.length < 1) return "El registro no tiene boletas.";
  return null;
}

const short = (v: unknown): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (s === undefined) return "—";
  return s.length > 28 ? `${s.slice(0, 16)}…${s.slice(-8)}` : s;
};

/** Rehace cadena, recuento, finalHash y checksums como lo haría un organizador que quiere disimular. */
function recomputeAll(p: LabPackage, before: LabPackage, changes: Change[]) {
  p.ledger = rechain(p.ledger, p.genesisHash) as Entry[];
  const t = recount({ entries: p.ledger }, p.manifest.options.length);
  p.tally = t;
  p.tallyHash = hashCanonical(t);
  p.finalHash = p.ledger.length ? p.ledger[p.ledger.length - 1].hash : p.genesisHash;
  p.checksums = { ...p.checksums, ledger: hashCanonical(p.ledger), tally: hashCanonical(t), commitments: hashCanonical(p.commitments) };
  const push = (path: string, a: unknown, b: unknown) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ path, before: short(a), after: short(b), kind: "recomputed" });
  };
  push("tally.counts", before.tally.counts, p.tally.counts);
  push("tally.total", before.tally.total, p.tally.total);
  push("tallyHash", before.tallyHash, p.tallyHash);
  push("finalHash", before.finalHash, p.finalHash);
  push("checksums.ledger", before.checksums.ledger, p.checksums.ledger);
  push("checksums.tally", before.checksums.tally, p.checksums.tally);
  // Con sorteo, el atacante cuidadoso también lo rehace sobre el nuevo finalHash (otra semilla, quizá otros ganadores):
  // el paquete queda coherente por dentro y solo lo delata el ancla (o el público que vio el sorteo original).
  if (p.draw && p.manifest.drawRule) {
    try {
      const d = runDraw(p.manifest.drawRule as unknown as DrawRule, p.tally, p.finalHash);
      p.draw = { ...d, winners: [...d.winners] };
      push("draw.seed", before.draw?.seed, p.draw.seed);
      push("draw.winners", before.draw?.winners, p.draw.winners);
    } catch {
      /* sin boletas válidas la regla no fija N: se deja el sorteo como estaba (el verificador lo marcará) */
    }
  }
}

/** Commitment ficticio y determinista (< campo BN254): nadie tiene su clave. */
function fakeCommitment(): string {
  return (BigInt(hashCanonical("quorum-lab:credencial-colada")) >> 8n).toString();
}

function flipLastHex(h: Hex): Hex {
  const last = h.slice(-1);
  return `${h.slice(0, -1)}${last === "0" ? "1" : "0"}` as Hex;
}

export function applyAlteration(original: unknown, id: AlterationId): AlterationOutcome {
  const why = unavailableReason(original, id);
  if (why) throw new AlterationUnavailable(why);
  const before = original as LabPackage;
  const p = deepClone(before);
  const changes: Change[] = [];
  const tamper = (path: string, a: unknown, b: unknown) => changes.push({ path, before: short(a), after: short(b), kind: "tamper" });

  switch (id) {
    case "ballot-message": {
      const n = p.manifest.options.length;
      const cur = Number(p.ledger[0].proof.message);
      const next = String(((Number.isInteger(cur) ? cur : 0) + 1) % n);
      tamper("ledger[0].proof.message", p.ledger[0].proof.message, next);
      p.ledger[0].proof = { ...p.ledger[0].proof, message: next };
      recomputeAll(p, before, changes);
      break;
    }
    case "ledger-reorder": {
      [p.ledger[0], p.ledger[1]] = [p.ledger[1], p.ledger[0]];
      tamper("ledger[0] ↔ ledger[1]", `#0 nullifier ${short(before.ledger[0].proof.nullifier)}`, `#0 nullifier ${short(p.ledger[0].proof.nullifier)}`);
      break;
    }
    case "nullifier-dup": {
      const dup = deepClone(p.ledger[0]);
      p.ledger.push(dup);
      tamper(`ledger[${p.ledger.length - 1}]`, "(no existía)", `copia de #0 · nullifier ${short(dup.proof.nullifier)}`);
      recomputeAll(p, before, changes);
      break;
    }
    case "tally-inflate": {
      tamper("tally.counts[0]", p.tally.counts[0], p.tally.counts[0] + 1);
      tamper("tally.total", p.tally.total, p.tally.total + 1);
      p.tally = { ...p.tally, counts: p.tally.counts.map((c, i) => (i === 0 ? c + 1 : c)), total: p.tally.total + 1 };
      p.tallyHash = hashCanonical(p.tally);
      p.checksums = { ...p.checksums, tally: p.tallyHash };
      changes.push({ path: "tallyHash", before: short(before.tallyHash), after: short(p.tallyHash), kind: "recomputed" });
      changes.push({ path: "checksums.tally", before: short(before.checksums.tally), after: short(p.checksums.tally), kind: "recomputed" });
      break;
    }
    case "group-root": {
      const fake = computeGroupRoot([...p.commitments, fakeCommitment()]);
      tamper("groupRoot", p.groupRoot, fake);
      p.groupRoot = fake;
      break;
    }
    case "roll-insert": {
      const c = fakeCommitment();
      p.commitments = [...p.commitments, c];
      tamper(`commitments[${p.commitments.length - 1}]`, "(no existía)", c);
      p.checksums = { ...p.checksums, commitments: hashCanonical(p.commitments) };
      changes.push({ path: "checksums.commitments", before: short(before.checksums.commitments), after: short(p.checksums.commitments), kind: "recomputed" });
      break;
    }
    case "final-hash": {
      const next = flipLastHex(p.finalHash);
      tamper("finalHash", p.finalHash, next);
      p.finalHash = next;
      break;
    }
    case "draw-seed": {
      const d = p.draw!;
      const next = flipLastHex(d.seed);
      tamper("draw.seed", d.seed, next);
      p.draw = { ...d, seed: next };
      break;
    }
    case "draw-winner": {
      const d = p.draw!;
      const intruder = [...(p.manifest.drawRule?.candidates ?? [])].map((c) => c.id).sort().find((cid) => !d.winners.includes(cid))!;
      const winners = [intruder, ...d.winners.slice(1)];
      tamper("draw.winners[0]", d.winners[0], intruder);
      p.draw = { ...d, winners };
      break;
    }
    case "drop-raw": {
      const [gone] = p.ledger.splice(0, 1);
      tamper("ledger[0]", `boleta · nullifier ${short(gone.proof.nullifier)}`, "(eliminada)");
      break;
    }
    case "ledger-extra-field": {
      const entry = p.ledger[0] as Entry & { voterId?: string };
      entry.voterId = "v_vecina_ana";
      tamper("ledger[0].voterId", "(no existía)", entry.voterId);
      p.checksums = { ...p.checksums, ledger: hashCanonical(p.ledger) };
      changes.push({ path: "checksums.ledger", before: short(before.checksums.ledger), after: short(p.checksums.ledger), kind: "recomputed" });
      break;
    }
    case "room-hide": {
      tamper("rollPolicy", p.rollPolicy, "(eliminado)");
      delete p.rollPolicy;
      break;
    }
    case "drop-rechain": {
      const [gone] = p.ledger.splice(0, 1);
      tamper("ledger[0]", `boleta · nullifier ${short(gone.proof.nullifier)}`, "(eliminada)");
      recomputeAll(p, before, changes);
      break;
    }
  }
  return { altered: p, changes };
}

// ---------------------------------------------------------------------------
// Ancla simulada (etiquetada `simulación`): para el fixture o un paquete sin ancla.
// El acta (finalHash, groupRoot, tallyHash, electionId) se toma del ORIGINAL antes de alterar,
// como si se hubiera anclado en Base Sepolia al cierre. En una elección real se lee la tx de verdad.
// ---------------------------------------------------------------------------
export const SIM_ANCHOR_CHAIN_ID = 84532;
export const SIM_ANCHOR_TX: Hex = `0x${"5a".repeat(32)}`;

export type AnchorRead = { chainId: number; from: string; to: string | null; input: Hex };

export function simulatedAnchor(original: LabPackage): { anchor: { chainId: number; txHash: Hex }; reader: (tx: Hex) => Promise<AnchorRead> } {
  const input = encodeAnchorCalldata({ finalHash: original.finalHash, groupRoot: original.groupRoot, tallyHash: original.tallyHash, electionId: original.electionId });
  const zero = "0x0000000000000000000000000000000000000000";
  return {
    anchor: { chainId: SIM_ANCHOR_CHAIN_ID, txHash: SIM_ANCHOR_TX },
    reader: async (tx) => {
      if (tx.toLowerCase() !== SIM_ANCHOR_TX) throw new Error("ancla simulada: tx desconocida");
      return { chainId: SIM_ANCHOR_CHAIN_ID, from: zero, to: zero, input };
    },
  };
}

/** Serialización estable de la copia (bytes que se verifican, se descargan y cuya huella va en la URL compartida). */
export const serializePackage = (p: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(p));
