"use client";

import { useState } from "react";
import { Download, ShieldQuestion } from "lucide-react";
import { AuditChecklist } from "@/components/AuditChecklist";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAuditPackageBytes } from "@/lib/client/apiV1";
import type { AuditResponse as StoredAudit } from "@quorum/contracts";
import { downloadJson } from "@/lib/client/download";
import { shortHash } from "@/lib/client/format";
import { anchorCheckOf, type AnchorCheck } from "@/lib/client/onchain";
import { publicAnchorRpc, verifyPackageInBrowser, type BrowserVerification } from "@/lib/client/zk";

export type PackageSource = { kind: "api"; electionId: string } | { kind: "fixture"; url: string; label: string };

/** Lo que "Mi voto está" necesita del paquete YA verificado en este navegador. `anchorCheck` viene del check `anchor_matches` del verificador. */
export type VerifiedPackage = { ledger: { nullifier: string; idx: number; hash: string }[]; finalHash: string | null; digest: string; anchorCheck?: AnchorCheck };

type Phase = "idle" | "downloading" | "verifying" | "done" | "error";

async function loadBytes(src: PackageSource): Promise<Uint8Array> {
  if (src.kind === "api") return (await fetchAuditPackageBytes(src.electionId)).bytes;
  const res = await fetch(src.url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el paquete fixture`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Extrae del paquete (ya pasado por el verificador) lo que "Mi voto está" y el sorteo necesitan. */
function extract(bytes: Uint8Array, digest: string): VerifiedPackage | null {
  try {
    const pkg = JSON.parse(new TextDecoder().decode(bytes)) as { ledger?: { idx: number; hash: string; proof?: { nullifier?: string } }[]; finalHash?: string };
    const ledger = (pkg.ledger ?? []).flatMap((e) => (e.proof?.nullifier ? [{ idx: e.idx, hash: e.hash, nullifier: e.proof.nullifier }] : []));
    return { ledger, finalHash: typeof pkg.finalHash === "string" ? pkg.finalHash : null, digest };
  } catch {
    return null;
  }
}

/**
 * "Verificar ahora": descarga el paquete de auditoría y ejecuta `verifyPackage` (de `@quorum/verifier`) EN ESTE NAVEGADOR.
 * Muestra método, versión, hash de entrada (SHA-256 de los bytes recibidos), salida completa y errores.
 * El estado global sale sólo del `AuditResult` que devuelve el verificador; jamás de un booleano del servidor.
 */
export function VerifyNowPanel({ source, serverAudit, onVerified }: { source: PackageSource; serverAudit?: StoredAudit | null; onVerified?: (p: VerifiedPackage) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<BrowserVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setError(null);
    setRun(null);
    try {
      setPhase("downloading");
      const bytes = await loadBytes(source);
      setPhase("verifying");
      const out = await verifyPackageInBrowser(bytes, { anchorRpcUrl: publicAnchorRpc });
      setRun(out);
      setPhase(out.ok ? "done" : "error");
      if (out.ok) {
        const p = extract(bytes, out.inputDigest);
        if (p) onVerified?.({ ...p, anchorCheck: anchorCheckOf(out.result) ?? undefined });
      } else setError(out.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  const busy = phase === "downloading" || phase === "verifying";
  const result = run?.ok ? run.result : null;
  const digestMatchesServer = result && serverAudit?.packageDigest ? normalizeDigest(serverAudit.packageDigest) === normalizeDigest(result.inputArtifactDigest) : null;

  return (
    <section aria-labelledby="verify-now-h" className="flex flex-col gap-4" id="verificar">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="verify-now-h">Verificar ahora</CardTitle>
            {source.kind === "fixture" ? <Badge tone="neutral">{source.label}</Badge> : null}
          </div>
          <CardDescription>
            Tu teléfono recalcula el resultado sin confiar en el servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button onClick={verify} loading={busy} className="w-full sm:w-fit">
            <ShieldQuestion aria-hidden="true" /> {phase === "done" || phase === "error" ? "Verificar de nuevo" : "Verificar ahora"}
          </Button>
          <p role="status" aria-live="polite" className="text-small text-muted-foreground">
            {phase === "downloading" ? "Descargando el paquete…" : phase === "verifying" ? "Comprobando en tu navegador… (puede tardar unos segundos)" : phase === "done" && run ? `Verificación ejecutada en ${run.ms} ms en tu navegador.` : ""}
          </p>
          {run?.inputDigest ? (
            <p className="text-small">
              Huella del paquete: <span className="q-mono font-semibold" title={run.inputDigest}>{shortHash(run.inputDigest, 14, 8)}</span>
            </p>
          ) : null}
          {error ? (
            <Alert tone="danger" title="El verificador no pudo completar la verificación">
              {error} No se puede afirmar nada sobre este escrutinio desde aquí.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {result ? (
        <>
          <AuditChecklist result={result} runtime="navegador" title="Resultado de tu verificación" onDownload={() => downloadJson(`verificacion-${result.electionId}.json`, result)} />
          {serverAudit?.packageDigest ? (
            <Alert tone={digestMatchesServer ? "info" : "warning"} title={digestMatchesServer ? "Mismo paquete que verificó el servidor" : "Paquete distinto al que verificó el servidor"}>
              El servidor publicó su propio resultado sobre <span className="q-mono">{shortHash(serverAudit.packageDigest, 14, 8)}</span>
              {digestMatchesServer ? "; coincide con lo que tú descargaste." : `; tú verificaste ${shortHash(result.inputArtifactDigest, 14, 8)}. Confía en tu verificación, no en la del servidor.`}
            </Alert>
          ) : null}
        </>
      ) : null}

      {source.kind === "api" ? (
        <a href={`/api/elections/${encodeURIComponent(source.electionId)}/artifacts`} download className="inline-flex min-h-tap w-fit items-center gap-2 text-small font-semibold underline underline-offset-4">
          <Download className="size-4" aria-hidden="true" /> Descargar el paquete para verificarlo con la CLI
        </a>
      ) : null}
    </section>
  );
}

function normalizeDigest(d: string): string {
  return d.replace(/^sha256:/, "").replace(/^0x/, "").toLowerCase();
}
