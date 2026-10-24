import { sha256, keccak256, stringToBytes } from "viem";

/**
 * JSON canónico: claves ordenadas recursivamente, sin espacios, bigint → string decimal.
 * Es la base de todos los hashes del paquete de auditoría. El verificador independiente
 * (apps/verifier) reimplementa exactamente esta función; si cambia aquí, cambia allá.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/** SHA-256 de un texto UTF-8, como hex con prefijo 0x (64 hex chars). */
export function sha256Utf8(text: string): `0x${string}` {
  return sha256(stringToBytes(text));
}

/** SHA-256 del JSON canónico de un valor. */
export function hashCanonical(value: unknown): `0x${string}` {
  return sha256Utf8(canonicalJson(value));
}

/** keccak256 de un texto UTF-8 como bigint reducido a 248 bits (cabe con holgura en el campo escalar de BN254). */
export function keccakToField(text: string): bigint {
  return BigInt(keccak256(stringToBytes(text))) >> 8n;
}
