/**
 * Utilidades públicas del ledger. El registro on-chain del voto NO se hace desde la web (threat model C2: un `Cast`
 * desde la wallet del votante liga wallet ↔ boleta). Si algún día se activa, lo hace `@quorum/wallet` tras
 * `NEXT_PUBLIC_QUORUM_ONCHAIN_CAST=true`; el voto va siempre como `POST /vote { proof }`.
 */

/** Forma canónica decimal (sin ceros a la izquierda). Acepta decimal; rechaza lo demás. Ver threat model C1. */
export function normalizeNullifier(raw: string): string | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  return BigInt(t).toString();
}

/** Busca un nullifier en las entradas de un ledger público (comparación canónica). */
export function findNullifier<T extends { idx: number; hash: string; nullifier: string }>(entries: T[], nullifier: string): T | null {
  const n = normalizeNullifier(nullifier);
  if (!n) return null;
  return entries.find((e) => normalizeNullifier(e.nullifier) === n) ?? null;
}
