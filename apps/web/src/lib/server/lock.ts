/**
 * Exclusión mutua en proceso por clave (p. ej. electionId). Serializa mutaciones del ledger y del dedupe
 * facial para que no haya carreras entre peticiones concurrentes. No es distribuido (demo de un proceso).
 */
const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const tail = next.catch(() => undefined);
  locks.set(key, tail);
  try {
    return await next;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}
