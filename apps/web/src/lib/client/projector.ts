/**
 * Lógica pura del proyector (`/e/[id]/proyector`), separada para tests.
 * El estado del verificador sale SOLO del `auditResult` que devolvió el verificador real (`GET /audit`): nunca de la fase.
 */
import { z } from "zod";
import type { HonestStatus } from "@/components/StatusPill";

/** Check tolerante: `passed`/`reason` (contrato actual) y, si el verificador lo envía, `status` de tres estados. */
const LooseCheck = z.object({ name: z.string(), passed: z.boolean().optional(), reason: z.string().optional(), status: z.string().optional() }).passthrough();
export const LooseAudit = z.object({
  auditResult: z
    .object({
      valid: z.boolean(),
      verifierVersion: z.string().optional(),
      inputArtifactDigest: z.string().optional(),
      checkedAt: z.string().optional(),
      checks: z.array(LooseCheck).default([]),
      unsupportedGuarantees: z.array(z.string()).optional().default([]),
    })
    .passthrough(),
  packageDigest: z.string().optional(),
  anchorStatus: z.union([z.string(), z.object({ mode: z.string(), reason: z.string().optional() }).passthrough()]).nullable().optional(),
});
export type LooseAudit = z.infer<typeof LooseAudit>;
export type LooseCheck = z.infer<typeof LooseCheck>;

const PASS = new Set(["pass", "passed", "ok", "valid", "verified", "verificado"]);
const FAIL = new Set(["fail", "failed", "invalid", "error", "fallo", "fallo detectado"]);
const UNEVAL = new Set(["not-evaluated", "not_evaluated", "notevaluated", "skipped", "unsupported", "unverifiable", "no evaluado", "no verificable", "pending"]);

/** Tres estados por check: `status` si viene; si no, `passed` + "no evaluado" en `reason` (igual que AuditChecklist). */
export function checkTriState(c: LooseCheck): HonestStatus {
  const s = c.status?.trim().toLowerCase();
  if (s) {
    if (PASS.has(s)) return "verificado";
    if (FAIL.has(s)) return "fallo detectado";
    if (UNEVAL.has(s)) return "no verificable";
  }
  if (c.passed === false) return "fallo detectado";
  if (c.passed === undefined) return "no verificable";
  if (c.reason && /^no evaluado/i.test(c.reason.trim())) return "no verificable";
  return "verificado";
}

/** Estado global: `valid` del verificador manda; un fallo en cualquier check es fallo; sin evaluación no hay "verificado". */
export function auditTriState(a: LooseAudit["auditResult"]): { overall: HonestStatus; partial: boolean } {
  const states = a.checks.map(checkTriState);
  if (states.includes("fallo detectado")) return { overall: "fallo detectado", partial: false };
  if (a.valid === true && states.length > 0) return { overall: "verificado", partial: states.includes("no verificable") };
  if (a.valid === false) return { overall: "fallo detectado", partial: false };
  return { overall: "no verificable", partial: false };
}

export function anchorModeText(s: LooseAudit["anchorStatus"]): string | null {
  if (!s) return null;
  if (typeof s === "string") return s;
  return s.reason ?? s.mode;
}

/** Opción con más votos (o null si hay empate en el máximo o no hay conteo). */
export function leadingOption<T extends { count: number | null }>(options: T[]): T | null {
  const counted = options.filter((o): o is T & { count: number } => typeof o.count === "number");
  if (counted.length === 0) return null;
  const max = Math.max(...counted.map((o) => o.count));
  const top = counted.filter((o) => o.count === max);
  return top.length === 1 && max > 0 ? top[0] : null;
}

/** Lee `#t=<token>` (proyector abierto desde el panel) y lo quita de la URL. */
export function takeTokenFromHash(loc: Pick<Location, "hash" | "pathname" | "search">, replace: (url: string) => void): string | null {
  const m = /(?:^#|&)t=([^&]+)/.exec(loc.hash);
  if (!m) return null;
  replace(loc.pathname + loc.search);
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
