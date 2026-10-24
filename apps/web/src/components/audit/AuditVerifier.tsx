"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { AuditChecklist } from "@/components/AuditChecklist";
import { EmptyState, LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { FixtureTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeError } from "@/lib/client/api";
import { downloadJson } from "@/lib/client/download";
import { isLabPackage, type AnchorRead } from "@/lib/client/lab/alter";
import { alterationById, checkLabel, type AlterationId, type AnchorMode } from "@/lib/client/lab/catalog";
import { prepare } from "@/lib/client/lab/prepare";
import { decodeEmbedded, digestMatches, parseFragment, parseRecipe, type ShareRecipe } from "@/lib/client/lab/share";
import { loadSource, parseJsonBytes, type LoadedBytes } from "@/lib/client/lab/source";
import { publicAnchorRpc, sha256Bytes, verifyPackageInBrowser, type BrowserVerification } from "@/lib/client/zk";
import { statusOf } from "./AttackLab";
import { PackageLoader } from "./PackageLoader";
import { VerdictBanner } from "./VerdictBanner";
import { PageHeader } from "@/components/ui/page-header";

/** Lo que se va a verificar: bytes exactos + opciones del verificador + contexto honesto. */
type Target = {
  bytes: Uint8Array;
  label: string;
  isFixture: boolean;
  digest: string;
  verifyOpts: { anchorRpcUrl?: string; anchorReader?: (tx: `0x${string}`) => Promise<AnchorRead> };
  /** Copia alterada por el jurado (receta o enlace autónomo). */
  jury?: { alteration: AlterationId | null; anchor: AnchorMode; expectedDigest?: string; digestOk?: boolean };
};

async function toTarget(p: LoadedBytes, extra: Partial<Target> = {}): Promise<Target> {
  return { bytes: p.bytes, label: p.label, isFixture: p.isFixture, digest: `sha256:${await sha256Bytes(p.bytes)}`, verifyOpts: { anchorRpcUrl: publicAnchorRpc }, ...extra };
}

/** Reproduce la copia del jurado a partir del original público y la receta. */
async function fromRecipe(r: ShareRecipe): Promise<Target> {
  const src = await loadSource(r.source);
  const original = parseJsonBytes(src.bytes);
  if (!isLabPackage(original)) throw new Error("El paquete original no tiene el formato semaphore-ledger v1.");
  const p = prepare(original, r.alteration, r.anchor === "real" && !publicAnchorRpc ? "none" : r.anchor, publicAnchorRpc);
  const digest = `sha256:${await sha256Bytes(p.bytes)}`;
  return {
    bytes: p.bytes,
    label: `Copia del jurado: «${alterationById(r.alteration)!.title}» sobre ${src.label.toLowerCase()}`,
    isFixture: src.isFixture,
    digest,
    verifyOpts: p.verifyOpts,
    jury: { alteration: r.alteration, anchor: r.anchor, expectedDigest: r.digest, digestOk: digestMatches(digest, r.digest) },
  };
}

export function AuditVerifier() {
  const params = useSearchParams();
  const [target, setTarget] = useState<Target | null>(null);
  // Hay descarga automática si la URL trae receta, id o fixture (el fragmento #pkg se decodifica al instante).
  const [preparing, setPreparing] = useState(() => !!(parseRecipe(new URLSearchParams(params.toString())) || params.get("id")?.trim() || params.get("fixture") === "1"));
  const [prepError, setPrepError] = useState<string | null>(null);
  const [run, setRun] = useState<BrowserVerification | null>(null);
  const [verifying, setVerifying] = useState(false);

  const use = useCallback((t: Target) => {
    setTarget(t);
    setRun(null);
    setPrepError(null);
  }, []);

  useEffect(() => {
    let alive = true;
    const recipe = parseRecipe(new URLSearchParams(params.toString()));
    const frag = typeof window !== "undefined" ? parseFragment(window.location.hash) : null;
    const id = params.get("id")?.trim();
    let job: Promise<Target> | null = null;
    if (frag) {
      job = decodeEmbedded(frag.pkg).then((bytes) =>
        toTarget({ bytes, label: "Copia incluida en el enlace (no viajó al servidor)", isFixture: false, source: null }, { jury: { alteration: frag.alteration, anchor: "none" } }),
      );
    } else if (recipe) job = fromRecipe(recipe);
    else if (id) job = loadSource({ kind: "election", id }).then((p) => toTarget(p));
    else if (params.get("fixture") === "1") job = loadSource({ kind: "fixture" }).then((p) => toTarget(p));
    if (!job) return;
    job
      .then((t) => alive && use(t))
      .catch((e) => alive && setPrepError(describeError(e)))
      .finally(() => alive && setPreparing(false));
    return () => {
      alive = false;
    };
  }, [params, use]);

  async function verify() {
    if (!target) return;
    setRun(null);
    setVerifying(true);
    try {
      setRun(await verifyPackageInBrowser(target.bytes, target.verifyOpts));
    } finally {
      setVerifying(false);
    }
  }

  const jury = target?.jury;
  const result = run?.ok ? run.result : null;
  const failing = result?.checks.filter((c) => !c.passed) ?? [];
  const drawUnchecked = !!result && hasDraw(target?.bytes) && !result.checks.some((c) => c.name === "draw_matches");

  return (
    <div className="q-fade-in q-container flex max-w-4xl flex-col gap-6 py-6 md:py-10">
      <PageHeader title={jury ? "Verificar la copia del jurado" : "Verificar escrutinio"} description="El verificador corre en este navegador sobre el paquete público. El veredicto sale de él, no de nuestro servidor.">
        <Link href="/audit/lab" className="w-fit text-small font-semibold text-primary-ink underline underline-offset-4">
          Probar alterando una copia
        </Link>
      </PageHeader>

      {jury ? (
        <Alert tone="warning" title="Esto es una copia alterada a propósito">
          {jury.alteration ? <>Alteración: «{alterationById(jury.alteration)?.title}». </> : null}
          La hizo el jurado sobre una copia; el paquete original no cambió. Verifícala tú mismo.
          {jury.anchor === "sim" ? <> El ancla es una <strong>simulación</strong>: el acta se toma del original que descargó tu teléfono.</> : null}
        </Alert>
      ) : null}

      {!jury ? (
        <Card>
          <CardHeader>
            <CardTitle>1. Paquete de auditoría</CardTitle>
            <CardDescription>Por id de la elección, por URL, subiendo el archivo o pegando el JSON.</CardDescription>
          </CardHeader>
          <CardContent>
            <PackageLoader initialId={params.get("id") ?? ""} onLoaded={(p) => void toTarget(p).then(use)} allowFixture />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{jury ? "Copia a verificar" : "2. Verificación"}</CardTitle>
            {target?.isFixture ? <FixtureTag /> : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {preparing ? <LoadingState label={jury || params.get("alt") ? "Reproduciendo la copia del jurado…" : "Descargando el paquete…"} /> : null}
          {prepError ? (
            <Alert tone="warning" title="No verificable: no se pudo preparar el paquete">
              {prepError}
            </Alert>
          ) : null}
          {!target && !preparing && !prepError ? <EmptyState title="Sin paquete cargado">Carga un paquete para habilitar la verificación.</EmptyState> : null}
          {target ? (
            <>
              <dl className="grid grid-cols-1 gap-3 text-small sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">Origen</dt>
                  <dd className="font-semibold break-words">{target.label}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">SHA-256 de entrada (calculado aquí)</dt>
                  <dd className="q-mono font-semibold break-all" data-testid="input-sha256">
                    {target.digest}
                  </dd>
                </div>
              </dl>
              {jury?.expectedDigest ? (
                <Alert tone={jury.digestOk ? "info" : "warning"} title={jury.digestOk ? "Es la misma copia que alteró el jurado" : "Tu copia NO coincide con la del jurado"}>
                  Huella del jurado <span className="q-mono">{jury.expectedDigest}…</span>
                  {jury.digestOk ? " = huella de tu copia." : " ≠ huella de tu copia: el original que descargaste cambió o el enlace está mal. Igual puedes verificarla."}
                </Alert>
              ) : null}
              <Button size="lg" onClick={verify} loading={verifying} className="w-full sm:w-fit" data-testid="verify-button">
                <ShieldCheck aria-hidden="true" /> {jury ? "Verificar la copia del jurado" : "Verificar en este navegador"}
              </Button>
              {verifying ? (
                <p role="status" aria-live="polite" className="text-small text-muted-foreground">
                  Verificando en tu navegador (incluye las pruebas Groth16)…
                </p>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      {run ? (
        <VerdictBanner status={statusOf(run)} title={run.ok && run.result.electionId !== "unknown" ? `Elección ${run.result.electionId}` : undefined}>
          {!run.ok ? (
            <p>El verificador no pudo completar la verificación: {run.error}. No se puede afirmar nada sobre este paquete.</p>
          ) : failing.length ? (
            <ul className="flex flex-col gap-1">
              {failing.map((c) => (
                <li key={c.name}>
                  Falla <strong>{checkLabel(c.name)}</strong> (<code className="q-mono">{c.name}</code>): {c.reason}
                </li>
              ))}
            </ul>
          ) : (
            <p>Todas las comprobaciones evaluadas pasaron en {run.ms} ms. Revisa abajo las que quedaron sin evaluar.</p>
          )}
        </VerdictBanner>
      ) : null}

      {drawUnchecked ? (
        <Alert tone="warning" title="Sorteo no verificable con este verificador" role="status">
          El paquete trae un sorteo, pero la versión <span className="q-mono">{result?.verifierVersion}</span> no emite el check <span className="q-mono">draw_matches</span>: los ganadores publicados no se comprobaron aquí.
        </Alert>
      ) : null}

      {result ? (
        <AuditChecklist
          result={result}
          runtime="navegador"
          onDownload={() => downloadJson(`verificacion-${result.electionId}-${result.checkedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`, result)}
        />
      ) : null}
    </div>
  );
}

function hasDraw(bytes: Uint8Array | undefined): boolean {
  if (!bytes) return false;
  try {
    const p = parseJsonBytes(bytes) as { draw?: unknown } | null;
    return !!p && typeof p === "object" && p.draw != null;
  } catch {
    return false;
  }
}
