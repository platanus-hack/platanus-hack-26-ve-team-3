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

const checkName: Record<string, string> = {
  "artifact-integrity": "Integridad de artefactos",
  "crypto-proof": "Prueba criptográfica",
  "result-consistency": "Coherencia del resultado",
  "evidence-availability": "Disponibilidad de evidencias",
  "manifest-hash": "Hash del manifiesto",
  "verifier-not-integrated": "Verificador no integrado",
};

export function AuditChecklist({ result, onDownload }: { result: AuditResult; onDownload?: () => void }) {
  const status = overallStatus(result);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Resultado del verificador</CardTitle>
          <StatusPill status={status} size="lg" />
        </div>
        <CardDescription>
          Método: <span className="q-mono">{result.protocol}</span> · Verificador <span className="q-mono">v{result.verifierVersion}</span> · {formatDateTime(result.checkedAt)}
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
            <dd className="q-mono font-semibold" title={result.inputArtifactDigest}>
              {shortHash(result.inputArtifactDigest, 14, 8)}
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
                <li key={`${c.name}-${i}`} className="flex flex-col gap-1 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">{checkName[c.name] ?? c.name}</p>
                    <p className="q-mono text-small text-subtle">{c.name}</p>
                    {c.reason ? <p className="mt-1 text-small text-muted-foreground">{c.reason}</p> : null}
                  </div>
                  <StatusPill status={c.passed ? "verificado" : "fallo detectado"} className="shrink-0" />
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
            <ul className="flex flex-wrap gap-2">
              {result.unsupportedGuarantees.map((g) => (
                <li key={g}>
                  <StatusPill status="no verificable" />
                  <span className="q-mono ml-2 text-small">{g}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {onDownload ? (
          <Button variant="secondary" onClick={onDownload}>
            <Download aria-hidden="true" /> Descargar resultado (JSON)
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
