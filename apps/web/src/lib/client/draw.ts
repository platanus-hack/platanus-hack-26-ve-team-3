/**
 * "Recomputar aquí" del sorteo verificable (D-12, contrato v1 → Sorteo).
 *
 * Fuente preferida: `drawWinners(candidates, n, finalHash)` de `@quorum/protocol-adapter` (src/draw.ts, carril crypto).
 * Si esa función aún no existe en el adaptador, se usa una IMPLEMENTACIÓN DE REFERENCIA LOCAL escrita a partir del texto
 * del contrato. Como la codificación exacta de `keccak256(seed, i)` no está fijada en el contrato, un desacuerdo con la
 * referencia local se muestra como "no verificable", nunca como "fallo detectado". Sólo la implementación del adaptador
 * puede producir "coincide"/"no coincide" con autoridad.
 */
import { encodePacked, keccak256, type Hex } from "viem";
import type { Candidate } from "./v1";

export type DrawSource = "adapter" | "local-reference";
export type Recomputed = { source: DrawSource; seed: string; winners: string[]; order: string[] };

const isHex32 = (s: string): s is Hex => /^0x[0-9a-fA-F]{64}$/.test(s);

/** Referencia local: seed = keccak256(finalHash); Fisher–Yates (de atrás hacia adelante) sobre ids ordenados con j = keccak256(seed ‖ uint256 i) mod (i+1). */
export function referenceDraw(candidates: Pick<Candidate, "id">[], n: number, finalHash: string): Recomputed {
  if (!isHex32(finalHash)) throw new Error("finalHash debe ser hex de 32 bytes");
  const seed = keccak256(finalHash);
  const order = [...candidates.map((c) => c.id)].sort();
  for (let i = order.length - 1; i > 0; i--) {
    const r = BigInt(keccak256(encodePacked(["bytes32", "uint256"], [seed, BigInt(i)])));
    const j = Number(r % BigInt(i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { source: "local-reference", seed, winners: order.slice(0, Math.max(0, Math.min(n, order.length))), order };
}

function normalizeAdapterOutput(out: unknown, fallbackSeed: string): { seed: string; winners: string[] } | null {
  const toIds = (arr: unknown[]) => arr.map((w) => (typeof w === "string" ? w : (w as { id?: unknown })?.id)).filter((x): x is string => typeof x === "string");
  if (Array.isArray(out)) return { seed: fallbackSeed, winners: toIds(out) };
  if (out && typeof out === "object" && Array.isArray((out as { winners?: unknown }).winners)) {
    const o = out as { winners: unknown[]; seed?: unknown };
    return { seed: typeof o.seed === "string" ? o.seed : fallbackSeed, winners: toIds(o.winners) };
  }
  return null;
}

/** Intenta el adaptador; si no exporta `drawWinners`, cae en la referencia local (y lo dice). */
export async function recomputeDraw(candidates: Candidate[], n: number, finalHash: string): Promise<Recomputed> {
  const ref = referenceDraw(candidates, n, finalHash);
  try {
    const mod = (await import("@quorum/protocol-adapter")) as unknown as Record<string, unknown>;
    const fn = mod.drawWinners;
    if (typeof fn === "function") {
      const out = await (fn as (c: Candidate[], n: number, h: string) => unknown)(candidates, n, finalHash);
      const norm = normalizeAdapterOutput(out, ref.seed);
      if (norm) return { source: "adapter", seed: norm.seed, winners: norm.winners, order: norm.winners };
    }
  } catch {
    /* adaptador no disponible: referencia local */
  }
  return ref;
}

export type DrawComparison = "coincide" | "no coincide" | "no verificable";

/** Compara el sorteo publicado con el recomputado. Con la referencia local, un desacuerdo es "no verificable". */
export function compareDraw(published: { winners: string[]; seed?: string }, recomputed: Recomputed): DrawComparison {
  // Se compara el CONJUNTO de ganadores: el orden de presentación puede variar entre implementaciones.
  const a = [...published.winners].sort();
  const b = [...recomputed.winners].sort();
  const same = a.length === b.length && a.every((w, i) => w === b[i]);
  if (same) return "coincide";
  return recomputed.source === "adapter" ? "no coincide" : "no verificable";
}
