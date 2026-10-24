/**
 * "Recomputar aquí" del sorteo verificable (D-12, contrato v1 → Sorteo).
 *
 * Usa EXACTAMENTE la misma función que el servidor y el verificador independiente (check `draw_matches`):
 * `drawWinners(candidates, n, finalHash)` de `@quorum/protocol-adapter` (src/draw.ts, carril crypto).
 * Sin implementación paralela en la web: si el cálculo del navegador no coincide con lo publicado, es un fallo.
 */
import type { Candidate } from "@quorum/contracts";

export type Recomputed = { seed: string; winners: string[]; n: number };

const isHex32 = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{64}$/.test(s);

/** Repite el sorteo en el navegador con el adaptador (import dinámico: sólo se carga al pulsar "Recomputar aquí"). */
export async function recomputeDraw(candidates: Pick<Candidate, "id">[], n: number, finalHash: string): Promise<Recomputed> {
  if (!isHex32(finalHash)) throw new Error("finalHash debe ser hex de 32 bytes");
  const { drawWinners } = await import("@quorum/protocol-adapter");
  const out = drawWinners(candidates, n, finalHash.toLowerCase() as `0x${string}`);
  return { seed: out.seed, winners: [...out.winners], n: out.n };
}

export type DrawComparison = "coincide" | "no coincide";

/**
 * Compara el sorteo publicado (`GET /draw`) con el recomputado. Debe coincidir la semilla y la lista ORDENADA de
 * ganadores (el orden es el resultado del Fisher–Yates; el verificador también lo exige).
 */
export function compareDraw(published: { winners: string[]; seed: string }, recomputed: Recomputed): DrawComparison {
  const sameSeed = published.seed.toLowerCase() === recomputed.seed.toLowerCase();
  const sameWinners = published.winners.length === recomputed.winners.length && published.winners.every((w, i) => w === recomputed.winners[i]);
  return sameSeed && sameWinners ? "coincide" : "no coincide";
}
