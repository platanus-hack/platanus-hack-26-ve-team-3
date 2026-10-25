"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, ShieldQuestion } from "lucide-react";
import { checkName as CHECK_NAME, checkStatus, notEvaluated, overallStatus } from "@/components/AuditChecklist";
import { StatusPill } from "@/components/StatusPill";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAuditPackageBytes } from "@/lib/client/apiV1";
import type { AuditResponse as StoredAudit, Election } from "@quorum/contracts";
import { copyText } from "@/lib/client/download";
import { shortHash } from "@/lib/client/format";
import { anchorCheckOf, type AnchorCheck } from "@/lib/client/onchain";
import { basescanTxUrl } from "@/lib/client/room";
import { publicAnchorRpc, verifyPackageInBrowser, type BrowserVerification } from "@/lib/client/zk";
import { sleep, STEP_MS, StepList, type Step } from "./StepList";

export type PackageSource = { kind: "api"; electionId: string } | { kind: "fixture"; url: string; label: string };

/** Lo que "Mi voto está" necesita del paquete YA verificado en este navegador. `anchorCheck` viene del check `anchor_matches` del verificador. */
export type VerifiedPackage = { ledger: { nullifier: string; idx: number; hash: string }[]; finalHash: string | null; digest: string; anchorCheck?: AnchorCheck };

type AnchorInfo = NonNullable<Election["anchor"]>;

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

/** Pasos que se muestran mientras corre el verificador. El tercero depende del sello publicado. Exportada para tests. */
export function buildVerifySteps(anchor: AnchorInfo | null, anchorCheck: AnchorCheck | null = null): Step[] {
  const third: Step = !anchor
    ? { label: "Sin sello publicado: nada que comparar en Base Sepolia", mark: "skip" }
    : { label: "Comparando con el sello en Base Sepolia", mark: anchorCheck === "verificado" ? "ok" : anchorCheck === "fallo detectado" ? "fail" : "skip" };
  return [{ label: "Descargando el paquete", mark: "ok" }, { label: "Recalculando el recuento en tu teléfono", mark: "ok" }, third];
}

const ANCHOR_LINE: Record<AnchorCheck, string> = {
  verificado: "Tu teléfono comprobó que el sello coincide con el registro.",
  "no verificable": "Sello publicado · no evaluado por tu teléfono.",
  "fallo detectado": "El sello publicado no coincide con el registro que verificó tu teléfono.",
};

/**
 * "Verificar ahora": descarga el paquete de auditoría y ejecuta `verifyPackage` (de `@quorum/verifier`) EN ESTE NAVEGADOR.
 * Con `autoStart` arranca sola al montar (Transparencia de una votación cerrada). Mientras corre, la lista de pasos;
 * al terminar, UNA tarjeta compacta: veredicto (solo del `AuditResult` del verificador, jamás de un booleano del
 * servidor), huella del paquete y sello en Base Sepolia. Las comprobaciones completas las pinta quien la monta
 * (`onRun`) dentro de «Más detalles».
 */
export function VerifyNowPanel({
  source,
  serverAudit,
  anchor = null,
  autoStart = false,
  onVerified,
  onRun,
}: {
  source: PackageSource;
  serverAudit?: StoredAudit | null;
  anchor?: AnchorInfo | null;
  autoStart?: boolean;
  onVerified?: (p: VerifiedPackage) => void;
  /** Cada ejecución completa (ok o error); `null` al empezar una nueva. */
  onRun?: (run: BrowserVerification | null) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<BrowserVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [done, setDone] = useState(0);
  const [copied, setCopied] = useState(false);
  const runRef = useRef(0);
  const started = useRef(false);

  async function verify() {
    const id = ++runRef.current;
    const alive = () => runRef.current === id;
    setError(null);
    setRun(null);
    onRun?.(null);
    setSteps(buildVerifySteps(anchor));
    setDone(0);
    try {
      setPhase("downloading");
      const t0 = performance.now();
      const bytes = await loadBytes(source);
      await sleep(Math.max(0, STEP_MS - (performance.now() - t0)));
      if (!alive()) return;
      setDone(1);
      setPhase("verifying");
      const out = await verifyPackageInBrowser(bytes, { anchorRpcUrl: publicAnchorRpc });
      if (!alive()) return;
      setDone(2);
      await sleep(STEP_MS);
      if (!alive()) return;
      const anchorCheck = out.ok ? anchorCheckOf(out.result) : null;
      setSteps(buildVerifySteps(anchor, anchorCheck));
      setDone(3);
      setRun(out);
      onRun?.(out);
      setPhase(out.ok ? "done" : "error");
      if (out.ok) {
        const p = extract(bytes, out.inputDigest);
        if (p) onVerified?.({ ...p, anchorCheck: anchorCheck ?? undefined });
      } else setError(out.error);
    } catch (e) {
      if (!alive()) return;
      setSteps(null);
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arranca una vez al montar; «Verificar de nuevo» repite a mano.
  }, [autoStart]);

  const busy = phase === "downloading" || phase === "verifying";
  const result = run?.ok ? run.result : null;
  const status = result ? overallStatus(result) : null;
  const pending = result ? notEvaluated(result) : [];
  const failures = result ? result.checks.filter((c) => checkStatus(c) === "fallo detectado") : [];
  const anchorCheck: AnchorCheck | null = result ? anchorCheckOf(result) : null;
  const anchorUrl = anchor ? basescanTxUrl(anchor.chainId, anchor.txHash) : null;
  const digest = run?.inputDigest ?? null;
  const digestMatchesServer = result && serverAudit?.packageDigest ? normalizeDigest(serverAudit.packageDigest) === normalizeDigest(result.inputArtifactDigest) : null;

  async function copyDigest() {
    if (!digest) return;
    if (await copyText(digest)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <section aria-labelledby="verify-now-h" className="flex flex-col gap-3" id="verificar" data-testid="verify-now" data-phase={phase}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle id="verify-now-h">{busy ? "Verificando en tu teléfono" : result ? "Verificación en tu teléfono" : "Verificar ahora"}</CardTitle>
            {source.kind === "fixture" ? <Badge tone="neutral">{source.label}</Badge> : null}
            {status ? (
              <div className="flex flex-wrap items-center gap-2" role="status" data-testid="audit-verdict">
                <StatusPill status={status} size="lg" />
                {status === "verificado" && pending.length > 0 ? <StatusPill status="no verificable" className="normal-case" /> : null}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {phase === "idle" ? <p className="text-small text-muted-foreground">Tu teléfono recalcula el resultado sin confiar en el servidor.</p> : null}
          {steps ? <StepList steps={steps} done={done} finished={!busy} className={result ? "gap-1 p-2" : undefined} /> : null}

          {result && status ? (
            <div className="flex flex-col gap-3" data-testid="verify-summary" data-status={status}>
              {status === "verificado" && pending.length > 0 ? (
                <p className="text-small font-semibold text-warning-strong">Verificación parcial: {pending.map((n) => CHECK_NAME[n] ?? n).join(", ")} sin evaluar.</p>
              ) : null}
              {status === "verificado" && pending.length === 0 ? <p className="text-small text-muted-foreground">Tu teléfono reprodujo el recuento y comprobó cada boleta del paquete.</p> : null}
              {status === "no verificable" ? <p className="text-small text-muted-foreground">El verificador no pudo evaluar lo suficiente para afirmar nada sobre este escrutinio.</p> : null}
              {failures.length > 0 ? (
                <ul className="flex flex-col gap-1 rounded-md border border-danger/40 bg-danger-soft p-3 text-small" data-testid="verify-failures" aria-label="Comprobaciones con fallo">
                  {failures.map((c, i) => (
                    <li key={`${c.name}-${i}`}>
                      <span className="font-semibold">{CHECK_NAME[c.name] ?? c.name}</span>
                      {c.reason ? <span className="text-danger-strong">: {c.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              <dl className="flex flex-col gap-2 text-small">
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Huella del paquete que verificaste</dt>
                  <dd className="flex items-center gap-2">
                    <span className="q-mono min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-2 py-2" title={digest ?? undefined} data-testid="verify-digest">
                      {shortHash(digest, 16, 8)}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={copyDigest} aria-label="Copiar huella del paquete" className="min-w-tap shrink-0 px-3">
                      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                      <span className="sr-only sm:not-sr-only">{copied ? "Copiada" : "Copiar"}</span>
                    </Button>
                  </dd>
                  {digestMatchesServer === false ? <dd className="text-warning-strong">Distinto del paquete que verificó el servidor ({shortHash(serverAudit?.packageDigest, 12, 6)}). Confía en tu verificación.</dd> : null}
                </div>
                <div className="flex flex-col gap-1" data-testid="verify-anchor" data-anchor-check={anchorCheck ?? "no verificable"}>
                  <dt className="text-muted-foreground">Sello del registro en Base Sepolia</dt>
                  {anchor ? (
                    <dd className="flex flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        {anchorCheck === "fallo detectado" ? <StatusPill status="fallo detectado" size="sm" /> : null}
                        <span>{ANCHOR_LINE[anchorCheck ?? "no verificable"]}</span>
                      </span>
                      {anchorUrl ? (
                        <a href={anchorUrl} target="_blank" rel="noreferrer" title={anchor.txHash} className="inline-flex min-h-tap w-fit items-center gap-2 font-semibold underline underline-offset-4" data-testid="verify-anchor-link">
                          <ExternalLink className="size-4" aria-hidden="true" />
                          Ver en Basescan <span className="q-mono font-normal">{shortHash(anchor.txHash, 8, 4)}</span>
                        </a>
                      ) : (
                        <span className="q-mono break-all">Transacción {anchor.txHash} (cadena {anchor.chainId})</span>
                      )}
                    </dd>
                  ) : (
                    <dd className="text-muted-foreground">Sin sello: esta votación no publicó ancla en la cadena.</dd>
                  )}
                </div>
              </dl>
              <p className="q-mono truncate text-[0.75rem] text-muted-foreground" title={`Método ${result.protocol} · verificador ${result.verifierVersion} · ${run?.ms} ms en tu navegador`}>
                {result.protocol} · {result.verifierVersion} · {run?.ms} ms
              </p>
            </div>
          ) : null}

          {error ? (
            <Alert tone="danger" title="El verificador no pudo completar la verificación">
              {error} No se puede afirmar nada sobre este escrutinio desde aquí.
            </Alert>
          ) : null}

          <Button onClick={verify} loading={busy} variant={result ? "secondary" : "primary"} size={result ? "sm" : "default"} className="w-full sm:w-fit">
            <ShieldQuestion aria-hidden="true" /> {phase === "done" || phase === "error" ? "Verificar de nuevo" : "Verificar ahora"}
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}

export function normalizeDigest(d: string): string {
  return d.replace(/^sha256:/, "").replace(/^0x/, "").toLowerCase();
}
