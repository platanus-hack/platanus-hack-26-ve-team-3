import { concat, keccak256, toHex } from "viem";
import type { Hex32, Tally } from "./ledger.js";

/**
 * Sorteo verificable (D-12). No es una primitiva criptográfica nueva: es un barajado determinista
 * (Fisher-Yates) cuyo azar sale de keccak256 sobre el hash final del ledger. Cualquiera lo recomputa.
 *
 * - `seed = keccak256(finalHash)` (keccak de los 32 bytes de `finalHash`).
 * - Candidatos ordenados por `id` con el orden por defecto de JS (code units UTF-16).
 * - Para i = 0..n-1: `r_i = keccak256(seed ‖ uint256(i))`, `j = i + (r_i mod (len - i))`, swap(i, j).
 * - Ganadores = los n primeros tras el barajado parcial. `n = min(N, len)`.
 *
 * Límite honesto: el organizador controla cuándo se cierra (y por tanto qué `finalHash` sale); un organizador
 * que pudiera reordenar o descartar boletas antes del cierre podría intentar "moler" la semilla. El ancla
 * on-chain del `finalHash` y los recibos (nullifiers) de los votantes son lo que limita esa manipulación.
 */
export const DRAW_METHOD = "keccak256(finalHash)|fisher-yates" as const;

export type DrawCandidate = { id: string; label: string; amount?: number };

/** Regla de sorteo fijada en el manifiesto (entra en `manifestHash`, no se puede cambiar tras publicar). */
export type DrawRule = {
  candidates: DrawCandidate[];
  winnersCount: { kind: "fixed"; n: number } | { kind: "from-result"; optionValues: number[] };
};

export type DrawResult = { seed: Hex32; n: number; winners: string[]; method: typeof DRAW_METHOD; finalHash: Hex32 };

export function drawSeed(finalHash: Hex32): Hex32 {
  if (!/^0x[0-9a-f]{64}$/.test(finalHash)) throw new Error("finalHash must be 0x + 64 lowercase hex chars");
  return keccak256(finalHash);
}

/** Orden canónico de candidatos: por id, comparación de code units (Array.prototype.sort por defecto). */
export function sortCandidates<T extends { id: string }>(candidates: readonly T[]): T[] {
  return [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Selecciona `n` ganadores de forma determinista. Devuelve ids. */
export function drawWinners(candidates: readonly { id: string }[], n: number, finalHash: Hex32): { seed: Hex32; winners: string[]; n: number } {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("n must be a non-negative integer");
  const ids = sortCandidates(candidates).map((c) => c.id);
  if (new Set(ids).size !== ids.length) throw new Error("candidate ids must be unique");
  const seed = drawSeed(finalHash);
  const take = Math.min(n, ids.length);
  for (let i = 0; i < take; i++) {
    const r = BigInt(keccak256(concat([seed, toHex(BigInt(i), { size: 32 })])));
    const j = i + Number(r % BigInt(ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return { seed, winners: ids.slice(0, take), n: take };
}

/**
 * Índice de la opción ganadora según el recuento (máximo de `counts`; empate → el índice menor).
 * Devuelve null si no hay votos válidos.
 */
export function winningOptionIndex(t: Pick<Tally, "counts">): number | null {
  let best = -1;
  let bestCount = 0;
  t.counts.forEach((c, i) => {
    if (c > bestCount) {
      best = i;
      bestCount = c;
    }
  });
  return best >= 0 ? best : null;
}

/** N de ganadores según la regla del manifiesto y el recuento. Null si la regla depende del resultado y no hay votos. */
export function winnersCountFor(rule: DrawRule, t: Pick<Tally, "counts">): number | null {
  if (rule.winnersCount.kind === "fixed") return rule.winnersCount.n;
  const idx = winningOptionIndex(t);
  if (idx === null) return null;
  const v = rule.winnersCount.optionValues[idx];
  return v === undefined ? null : v;
}

/** Sorteo completo a partir de la regla, el recuento y el hash final del ledger. */
export function runDraw(rule: DrawRule, t: Pick<Tally, "counts">, finalHash: Hex32): DrawResult {
  const N = winnersCountFor(rule, t);
  if (N === null) throw new Error("NO_VOTES: the draw needs at least one valid ballot to fix N");
  const { seed, winners, n } = drawWinners(rule.candidates, N, finalHash);
  return { seed, n, winners, method: DRAW_METHOD, finalHash };
}
