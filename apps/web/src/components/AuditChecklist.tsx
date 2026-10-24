import type { AuditResult } from "@quorum/contracts";
import { Download } from "lucide-react";
import { StatusPill, type HonestStatus } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, shortHash } from "@/lib/client/format";

/**
 * Resultado del verificador independiente. El estado global sale SOLO de `result.valid` del verificador real.
 * - valid === true  → "verificado"
 * - checks con algún passed === false → "fallo detectado"
 * - sin checks evaluados (p. ej. verifier-not-integrated) → "no verificable"
 */
export function overallStatus(result: AuditResult): HonestStatus {
  if (result.valid === true) return "verificado";
  if (result.checks.some((c) => c.passed === false)) return "fallo detectado";
  return "no verificable";
}

/** Un check que pasó pero declara "no evaluado" (p. ej. ancla sin RPC) NO es una verificación: se pinta "no verificable". */
export function checkStatus(c: { passed: boolean; reason?: string }): HonestStatus {
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
          <p className="text-small font-semibold text-warning-strong">
            Verificación parcial: las comprobaciones evaluadas pasaron, pero {pending.map((n) => checkName[n] ?? n).join(", ")} quedó sin evaluar. Sin ancla evaluada no se garantiza que el registro esté completo.
          </p>
        ) : null}
        <CardDescription>
          Método: <span className="q-mono">{result.protocol}</span>
          {runtime ? <> · ejecutado en {runtime === "navegador" ? "tu navegador" : "el servidor"}</> : null} · Versión{" "}
          <span className="q-mono" data-testid="verifier-version">
            {result.verifierVersion}
          </span>{" "}
          · {formatDateTime(result.checkedAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
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

        <section aria-labelledby="checks-h">
          <h3 id="checks-h" className="mb-2 text-body font-bold">
            Comprobaciones ({result.checks.length})
          </h3>
          {result.checks.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-small text-muted-foreground">
              El verificador no evaluó ninguna comprobación. No se puede afirmar nada sobre este escrutinio.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.checks.map((c, i) => (
                <li key={`${c.name}-${i}`} data-check={c.name} data-status={checkStatus(c)} className="flex flex-col gap-1 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{checkName[c.name] ?? c.name}</p>
                    <p className="q-mono text-small text-subtle">{c.name}</p>
                    {c.reason ? <p className="mt-1 text-small text-muted-foreground">{c.reason}</p> : null}
                  </div>
                  <StatusPill status={checkStatus(c)} className="shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="unsupported-h">
          <h3 id="unsupported-h" className="mb-2 text-body font-bold">
            Propiedades no evaluadas
          </h3>
          {result.unsupportedGuarantees.length === 0 ? (
            <p className="text-small text-muted-foreground">El verificador no declaró propiedades sin evaluar. Esto no significa que todo esté garantizado: ver límites en el centro de transparencia.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {result.unsupportedGuarantees.map((g) => (
                <li key={g} className="flex flex-col gap-1 rounded-md border border-border p-2 sm:flex-row sm:items-start sm:gap-2">
                  <StatusPill status="no verificable" className="w-fit shrink-0" />
                  <span className="text-small text-muted-foreground">{g}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <details className="rounded-md border border-border p-3 text-small">
          <summary className="cursor-pointer font-semibold">Salida completa del verificador (JSON)</summary>
          <pre className="q-mono mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
        </details>

        {onDownload ? (
          <Button variant="secondary" onClick={onDownload}>
            <Download aria-hidden="true" /> Descargar resultado (JSON)
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
