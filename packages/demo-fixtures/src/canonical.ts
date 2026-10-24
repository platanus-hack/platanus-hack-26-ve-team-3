import { createHash } from "node:crypto";

/**
 * Canonicalización determinista para checksums de fixtures:
 * claves ordenadas, sin espacios, arrays en su orden original.
 * Es una convención de los FIXTURES; el verificador real (apps/verifier)
 * documenta su propia canonicalización según el motor elegido (ADR-001).
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
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

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Digest `sha256:<hex>` de la forma canónica de un valor. */
export function digestOf(value: unknown): string {
  return `sha256:${sha256Hex(canonicalize(value))}`;
}
