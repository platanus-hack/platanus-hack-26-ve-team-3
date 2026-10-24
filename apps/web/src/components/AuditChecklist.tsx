import type { AuditResult } from "@quorum/contracts";
import { Download } from "lucide-react";
import { StatusPill, type HonestStatus } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, shortHash } from "@/lib/client/format";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/client/cn";

/**
 * Resultado del verificador independiente. El estado global sale SOLO de `result.valid` del verificador real.
 * - valid === true  → "verificado"
 * - checks con algún passed === false → "fallo detectado"
 * - sin checks evaluados (p. ej. verifier-not-integrated) → "no verificable"
 */
export function overallStatus(result: AuditResult): HonestStatus {
  if (result.checks.some((c) => checkStatus(c) === "fallo detectado")) return "fallo detectado";
  if (result.valid === true) return "verificado";
  return "no verificable";
}

/**
 * Estado honesto de un check. Si el verificador trae `status` (tres estados: "verificado" | "fallo detectado" |
 * "no evaluado") manda ese campo; "no evaluado" se pinta "no verificable" (ámbar), nunca verde.
 * Sin `status` (verificadores anteriores): un check que pasó pero cuya razón empieza por "no evaluado" tampoco es verde.
 */
export function checkStatus(c: { passed: boolean; reason?: string; status?: "verificado" | "fallo detectado" | "no evaluado" }): HonestStatus {
  // Con `status` manda el verificador: un check que no pasó por falta de datos (RPC caído, archivo que no es un
  // paquete) es "no evaluado" → "no verificable", no evidencia de manipulación.
  if (c.status === "fallo detectado") return "fallo detectado";
  if (c.status === "no evaluado") return "no verificable";
  if (c.status === "verificado") return c.passed ? "verificado" : "fallo detectado";
  if (!c.passed) return "fallo detectado";
  if (c.reason && /^no evaluado/i.test(c.reason.trim())) return "no verificable";
  return "verificado";
}

const checkName: Record<string, string> = {
  package_schema: "Formato del paquete",
  manifest_hash: "Hash del manifiesto",
  group_root: "Raíz del padrón",
  commitments_unique: "Padrón sin duplicados",
  chain_integrity: "Cadena del registro",
  proofs_valid: "Pruebas de pertenencia",
  nullifiers_unique: "Un voto por credencial",
  tally_matches: "Recuento reproducido",
  anchor_matches: "Ancla on-chain",
  draw_matches: "Sorteo recomputado",
  "artifact-integrity": "Integridad de artefactos",
  "crypto-proof": "Prueba criptográfica",
  "result-consistency": "Coherencia del resultado",
  "evidence-availability": "Disponibilidad de evidencias",
  "manifest-hash": "Hash del manifiesto",
  "verifier-not-integrated": "Verificador no integrado",
};

/** Checks que el verificador declaró "no evaluado" (p. ej. ancla sin RPC). Con alguno, "verificado" nunca es pleno (M2). */
export function notEvaluated(result: AuditResult): string[] {
  return result.checks.filter((c) => checkStatus(c) === "no verificable").map((c) => c.name);
}

export function AuditChecklist({ result, onDownload, runtime, title = "Resultado del verificador" }: { result: AuditResult; onDownload?: () => void; runtime?: "navegador" | "servidor"; title?: string }) {
  const status = overallStatus(result);
  const pending = notEvaluated(result);
  const statuses = result.checks.map(checkStatus);
  const count = (k: string) => statuses.filter((x) => x === k).length;
  const summary = [`${result.checks.length} comprobaciones`, `${count("verificado")} verificadas`, count("fallo detectado") ? `${count("fallo detectado")} con fallo` : null, count("no verificable") ? `${count("no verificable")} sin evaluar` : null].filter(Boolean).join(" · ");
  const ordered = [...result.checks].sort((a, b) => Number(checkStatus(b) === "fallo detectado") - Number(checkStatus(a) === "fallo detectado"));
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2" role="status" data-testid="audit-verdict">
            <StatusPill status={status} size="lg" />
            {status === "verificado" && pending.length > 0 ? <StatusPill status="no verificable" className="normal-case" /> : null}
          </div>
        </div>
        {status === "verificado" && pending.length > 0 ? (
          <p className="text-small font-semibold text-warning-strong">Verificación parcial: {pending.map((n) => checkName[n] ?? n).join(", ")} sin evaluar.</p>
        ) : null}
        <CardDescription>
          Método <span className="q-mono">{result.protocol}</span>
          {runtime ? <> · {runtime === "navegador" ? "en tu navegador" : "en el servidor"}</> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {result.checks.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-small text-muted-foreground">
            El verificador no evaluó ninguna comprobación. No se puede afirmar nada sobre este escrutinio.
          </p>
        ) : (
          <>
            <p className="text-small text-muted-foreground" data-testid="checks-summary">
              {summary}
            </p>
            <Disclosure title={<h3 id="checks-h" className="text-body font-bold">Ver las {result.checks.length} comprobaciones</h3>} defaultOpen={status === "fallo detectado"} bodyClassName="p-0">
              <ul className="divide-y divide-border">
                {ordered.map((c, i) => {
                  const st = checkStatus(c);
                  return (
                    <li key={`${c.name}-${i}`} data-check={c.name} data-status={st} className="flex items-start justify-between gap-3 px-3 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{checkName[c.name] ?? c.name}</p>
                        {c.reason ? <p className={cn("mt-0.5 text-small text-muted-foreground", st !== "fallo detectado" && "line-clamp-2")}>{c.reason}</p> : null}
                        <p className="q-mono mt-0.5 text-[0.6875rem] text-subtle">{c.name}</p>
                      </div>
                      <StatusPill status={st} size="sm" className="shrink-0" />
                    </li>
                  );
                })}
              </ul>
            </Disclosure>
          </>
        )}

        <Disclosure
          title={
            <h3 id="unsupported-h" className="text-body font-bold">
              Propiedades no evaluadas ({result.unsupportedGuarantees.length})
            </h3>
          }
        >
          {result.unsupportedGuarantees.length === 0 ? (
            <p className="text-small text-muted-foreground">Sin propiedades pendientes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.unsupportedGuarantees.map((g) => (
                <li key={g} className="flex flex-col gap-1 py-1 sm:flex-row sm:items-start sm:gap-2">
                  <StatusPill status="no verificable" className="w-fit shrink-0" />
                  <span className="text-small text-muted-foreground">{g}</span>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>

        <Disclosure title="Detalles técnicos" bodyClassName="flex flex-col gap-3">
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Versión</dt>
              <dd className="q-mono font-semibold" data-testid="verifier-version">
                {result.verifierVersion}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha</dt>
              <dd className="font-semibold">{formatDateTime(result.checkedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Elección</dt>
              <dd className="q-mono font-semibold">{result.electionId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Hash de entrada (paquete)</dt>
              <dd className="q-mono font-semibold" title={result.inputArtifactDigest} data-testid="input-artifact-digest">
                {shortHash(result.inputArtifactDigest, 18, 10)}
              </dd>
            </div>
          </dl>
          <pre className="q-mono max-h-80 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
        </Disclosure>

        {onDownload ? (
          <Button variant="secondary" onClick={onDownload}>
            <Download aria-hidden="true" /> Descargar resultado (JSON)
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
