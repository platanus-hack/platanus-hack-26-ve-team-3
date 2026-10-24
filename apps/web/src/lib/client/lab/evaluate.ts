/**
 * Compara la salida REAL del verificador sobre la copia con la del original y con lo que el guion espera.
 * No decide "verificado": solo explica qué check cambió. El veredicto global sale de `AuditResult.valid`.
 */
import type { AuditResult } from "@quorum/contracts";

export type LabVerdict =
  /** Todos los checks esperados fallaron. */
  | "detectado"
  /** Falló algo, pero no (todos) los checks que esperaba el guion. */
  | "detectado-otro"
  /** El guion advierte que en este modo no se detecta, y en efecto no se detectó. */
  | "no-detectable"
  /** Se esperaba detección y el verificador no marcó ningún fallo nuevo. */
  | "no-detectado"
  /** El verificador no emite alguno de los checks esperados (p. ej. `draw_matches` en una versión anterior). */
  | "no-evaluado";

export type Evaluation = {
  verdict: LabVerdict;
  expected: string[];
  /** Checks esperados que fallaron. */
  hit: string[];
  /** Checks esperados que el verificador no emitió. */
  missing: string[];
  /** Checks que pasaban en el original y fallan en la copia. */
  newlyFailed: string[];
};

export function evaluate(expected: string[], altered: AuditResult, baseline?: AuditResult | null): Evaluation {
  const failed = new Set(altered.checks.filter((c) => !c.passed).map((c) => c.name));
  const emitted = new Set(altered.checks.map((c) => c.name));
  const baseFailed = new Set((baseline?.checks ?? []).filter((c) => !c.passed).map((c) => c.name));
  const newlyFailed = [...failed].filter((n) => !baseFailed.has(n));
  const hit = expected.filter((n) => failed.has(n));
  const missing = expected.filter((n) => !emitted.has(n));

  let verdict: LabVerdict;
  if (expected.length === 0) verdict = failed.size === 0 ? "no-detectable" : "detectado-otro";
  else if (hit.length === expected.length) verdict = "detectado";
  else if (missing.length > 0 && failed.size === 0) verdict = "no-evaluado";
  else if (failed.size > 0) verdict = "detectado-otro";
  else verdict = "no-detectado";
  return { verdict, expected, hit, missing, newlyFailed };
}
