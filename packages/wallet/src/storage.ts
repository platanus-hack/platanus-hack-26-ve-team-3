import { generatePrivateKey } from "viem/accounts";
import type { Hex } from "viem";

/** Subconjunto de `Storage` (localStorage) para poder inyectar memoria en tests. */
export type KeyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const SIGNER_KEY_STORAGE = {
  kernel: "quorum.wallet.kernelSigner.v1",
  "eoa-demo": "quorum.wallet.eoaDemo.v1",
} as const;

const PK = /^0x[0-9a-fA-F]{64}$/;

export function memoryStorage(): KeyStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

/**
 * Recupera la clave del signer local o crea una nueva. La clave vive solo en el navegador del
 * votante (nunca se envía al servidor). Si el storage falla (modo privado) queda en memoria y
 * `persisted=false` para que la UI avise que no se podrá recuperar.
 */
export function loadOrCreateSignerKey(storage: KeyStorage | null, storageKey: string): { privateKey: Hex; created: boolean; persisted: boolean } {
  try {
    const stored = storage?.getItem(storageKey);
    if (stored && PK.test(stored)) return { privateKey: stored as Hex, created: false, persisted: true };
  } catch {
    /* storage inaccesible */
  }
  const privateKey = generatePrivateKey();
  let persisted = false;
  try {
    if (storage) {
      storage.setItem(storageKey, privateKey);
      persisted = storage.getItem(storageKey) === privateKey;
    }
  } catch {
    persisted = false;
  }
  return { privateKey, created: true, persisted };
}

export function forgetSignerKey(storage: KeyStorage | null, storageKey: string): void {
  try {
    storage?.removeItem(storageKey);
  } catch {
    /* ignorar */
  }
}
