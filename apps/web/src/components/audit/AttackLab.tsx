"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuditResult } from "@quorum/contracts";
import { RotateCcw } from "lucide-react";
import { AuditChecklist, notEvaluated, overallStatus } from "@/components/AuditChecklist";
import { LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { Disclosure } from "@/components/ui/disclosure";
import { FixtureTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/StatusPill";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { describeError } from "@/lib/client/api";
import { cn } from "@/lib/client/cn";
import { shortHash } from "@/lib/client/format";
import { isLabPackage, serializePackage, unavailableReason, type Change, type LabPackage } from "@/lib/client/lab/alter";
import { ALTERATIONS, alterationById, checkLabel, CONTINUOUS_ALTERATIONS, expectedFor, type AlterationId, type AnchorMode } from "@/lib/client/lab/catalog";
import { evaluate, type Evaluation } from "@/lib/client/lab/evaluate";
import { canUseRealAnchor, prepare } from "@/lib/client/lab/prepare";
import { loadSource, parseJsonBytes, type LoadedBytes } from "@/lib/client/lab/source";
import { publicAnchorRpc, verifyPackageInBrowser, type BrowserVerification } from "@/lib/client/zk";
import { AlterationDiff } from "./AlterationDiff";
import { PackageLoader } from "./PackageLoader";
import { ShareAlteration } from "./ShareAlteration";
import { VerdictBanner } from "./VerdictBanner";
import { PageHeader } from "@/components/ui/page-header";

type Run = { alteration: AlterationId; anchor: AnchorMode; changes: Change[]; bytes: Uint8Array; plainBytes: Uint8Array; verification: BrowserVerification; evaluation: Evaluation | null };

const ANCHOR_MODES: { id: AnchorMode; title: string; hint: string }[] = [
  { id: "none", title: "Sin ancla", hint: "Solo el paquete." },
  { id: "sim", title: "Ancla simulada", hint: "simulación: acta del original como si se hubiera anclado al cierre." },
  { id: "real", title: "Ancla real", hint: "Lee la tx en Base Sepolia (requiere txHash y RPC público)." },
];

export const statusOf = (v: BrowserVerification): "verificado" | "no verificable" | "fallo detectado" => {
  if (!v.ok) return "no verificable";
  const s = overallStatus(v.result);
  return s === "verificado" || s === "fallo detectado" ? s : "no verificable";
};

/** Laboratorio del jurado: altera una COPIA del paquete real y ejecuta el verificador en este navegador. */
export function AttackLab() {
  const params = useSearchParams();
  const initialId = params.get("id")?.trim() ?? "";
  const [loaded, setLoaded] = useState<LoadedBytes | null>(null);
  const [original, setOriginal] = useState<LabPackage | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<AnchorMode>("none");
  const [baseline, setBaseline] = useState<Partial<Record<AnchorMode, BrowserVerification>>>({});
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState<AlterationId | null>(null);

  const onLoaded = useCallback((p: LoadedBytes) => {
    setRun(null);
    setBaseline({});
    setLoadError(null);
    try {
      const data = parseJsonBytes(p.bytes);
      if (!isLabPackage(data)) throw new Error("No es un paquete semaphore-ledger v1 (faltan ledger, commitments, tally o finalHash).");
      setLoaded(p);
      setOriginal(data);
      setAnchor(canUseRealAnchor(data, publicAnchorRpc) ? "real" : "none");
    } catch (e) {
      setLoaded(p);
      setOriginal(null);
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadSource(initialId ? { kind: "election", id: initialId } : { kind: "fixture" })
      .then((p) => alive && onLoaded(p))
      .catch((e) => alive && setLoadError(describeError(e)));
    return () => {
      alive = false;
    };
  }, [initialId, onLoaded]);

  // Verificación del ORIGINAL en el modo de ancla actual (referencia para comparar).
  useEffect(() => {
    if (!original || !loaded || baseline[anchor]) return;
    let alive = true;
    const p = prepare(original, null, anchor, publicAnchorRpc);
    const bytes = anchor === "sim" ? p.bytes : loaded.bytes; // sin ancla simulada: los bytes tal cual llegaron
    void verifyPackageInBrowser(bytes, p.verifyOpts).then((v) => alive && setBaseline((b) => ({ ...b, [anchor]: v })));
    return () => {
      alive = false;
    };
  }, [original, loaded, anchor, baseline]);

  async function tamper(id: AlterationId, mode = anchor) {
    if (!original) return;
    setBusy(id);
    try {
      const p = prepare(original, id, mode, publicAnchorRpc);
      const plain = mode === "sim" ? serializePackage(prepare(original, id, "none").pkg) : p.bytes;
      const verification = await verifyPackageInBrowser(p.bytes, p.verifyOpts);
      const spec = alterationById(id)!;
      const evaluation = verification.ok ? evaluate(expectedFor(spec, mode), verification.result, baseline[mode]?.ok ? baseline[mode].result : null) : null;
      setRun({ alteration: id, anchor: mode, changes: p.changes, bytes: p.bytes, plainBytes: plain, verification, evaluation });
    } catch (e) {
      setRun({
        alteration: id,
        anchor: mode,
        changes: [],
        bytes: new Uint8Array(),
        plainBytes: new Uint8Array(),
        verification: { ok: false, error: e instanceof Error ? e.message : String(e), inputDigest: null, ms: 0, runtime: "navegador" },
        evaluation: null,
      });
    } finally {
      setBusy(null);
    }
    requestAnimationFrame(() => document.getElementById("lab-result")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
  }

  function changeAnchor(mode: AnchorMode) {
    setAnchor(mode);
    if (run) void tamper(run.alteration, mode);
  }

  function reset() {
    setRun(null);
    const el = document.getElementById("lab-alteraciones");
    el?.scrollIntoView({ block: "start" });
    el?.focus({ preventScroll: true });
  }

  const realOk = original ? canUseRealAnchor(original, publicAnchorRpc) : false;
  const listProps = { anchor, run, busy, onTamper: tamper };
  const base = baseline[anchor];

  return (
    <div className="q-fade-in q-container flex max-w-5xl flex-col gap-6 py-6 md:py-10">
      <PageHeader title="Altera una copia. Mira qué falla." description="Cada botón cambia una copia del paquete y corre el verificador aquí. El original no se toca.">
        {loaded?.isFixture ? <FixtureTag className="self-start" /> : null}
        <Link href="/audit" className="w-fit text-small font-semibold text-primary-ink underline underline-offset-4">
          Ir al auditor
        </Link>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>1. Paquete original</CardTitle>
          <CardDescription>
            {initialId ? "Paquete publicado de la elección indicada en la URL." : "Sin id en la URL: se carga el paquete de ejemplo. Puedes cargar el de una elección real."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!loaded && !loadError ? <LoadingState label="Descargando el paquete…" /> : null}
          {loadError ? (
            <Alert tone="warning" title="No verificable: no se pudo usar el paquete">
              {loadError}
            </Alert>
          ) : null}
          {loaded && original ? (
            <dl className="grid grid-cols-1 gap-3 text-small sm:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Origen</dt>
                <dd className="font-semibold break-words">{loaded.label}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Elección</dt>
                <dd className="q-mono font-semibold break-all">{original.electionId}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Original en este modo</dt>
                <dd data-testid="baseline-status">{base ? <MiniStatus v={base} /> : <span className="text-muted-foreground">verificando…</span>}</dd>
              </div>
            </dl>
          ) : null}
          {base && base.ok && !base.result.valid ? (
            <Alert tone="warning" title="El original ya no verifica con este verificador">
              Las alteraciones se comparan contra este punto de partida; los checks que ya fallaban en el original no cuentan como detección.
            </Alert>
          ) : null}
          <Disclosure title="Cambiar de paquete" className="text-body">
            <PackageLoader initialId={initialId} onLoaded={onLoaded} allowFixture />
          </Disclosure>
        </CardContent>
      </Card>

      {original ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Ancla on-chain</CardTitle>
            <CardDescription>Con ancla, el verificador compara el paquete con el acta registrada al cierre. Algunas trampas solo se detectan así.</CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <legend className="sr-only">Modo de ancla</legend>
              {ANCHOR_MODES.map((m) => {
                const disabled = m.id === "real" && !realOk;
                return (
                  <label
                    key={m.id}
                    className={cn(
                      "flex min-h-tap cursor-pointer gap-2 rounded-md border p-3 has-[:checked]:border-primary has-[:checked]:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring",
                      disabled && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <input
                      type="radio"
                      name="anchor"
                      value={m.id}
                      checked={anchor === m.id}
                      disabled={disabled}
                      onChange={() => changeAnchor(m.id)}
                      className="mt-1 size-4 accent-[var(--color-primary)]"
                    />
                    <span className="flex flex-col">
                      <span className="font-semibold">
                        {m.title} {m.id === "sim" ? <FixtureTag>simulación</FixtureTag> : null}
                      </span>
                      <span className="text-small text-muted-foreground">{disabled ? "No disponible: el paquete no trae txHash o no hay RPC público configurado." : m.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </CardContent>
        </Card>
      ) : null}

      {original ? (
        <Card id="lab-alteraciones" tabIndex={-1} className="scroll-mt-20 outline-none">
          <CardHeader>
            <CardTitle>3. Elige una alteración</CardTitle>
            <CardDescription>Un toque altera la copia y la verifica.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {/* Votación al instante (D-22): arriba van las 3 alteraciones que aplican a ese formato; el resto, plegado. */}
            <AlterationList ids={isContinuousPackage(original) ? CONTINUOUS_MAIN : MAIN_ALTERATIONS} label="Alteraciones principales" original={original} {...listProps} />
            <Disclosure title="Más alteraciones" className="text-body" testId="more-alterations">
              <AlterationList ids={isContinuousPackage(original) ? CONTINUOUS_MORE : MORE_ALTERATIONS} label="Más alteraciones" original={original} {...listProps} />
            </Disclosure>
          </CardContent>
        </Card>
      ) : null}

      <div id="lab-result" className="scroll-mt-20">
        {run && original ? <LabResult run={run} source={loaded?.source ?? null} onReset={reset} /> : null}
      </div>
    </div>
  );
}

const MAIN_ALTERATIONS: AlterationId[] = ["ballot-message", "tally-inflate", "nullifier-dup", "drop-rechain"];
const MORE_ALTERATIONS = ALTERATIONS.map((a) => a.id).filter((id) => !MAIN_ALTERATIONS.includes(id));
const CONTINUOUS_MAIN: AlterationId[] = [...CONTINUOUS_ALTERATIONS];
const CONTINUOUS_MORE = ALTERATIONS.map((a) => a.id).filter((id) => !CONTINUOUS_MAIN.includes(id));
const isContinuousPackage = (pkg: LabPackage): boolean => Boolean((pkg.manifest as { enrollment?: unknown }).enrollment);

type ListProps = { ids: AlterationId[]; label: string; original: LabPackage; anchor: AnchorMode; run: Run | null; busy: AlterationId | null; onTamper: (id: AlterationId) => void };

function AlterationList({ ids, label, original, anchor, run, busy, onTamper }: ListProps) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label={label}>
      {ids.map((id) => {
        const a = alterationById(id)!;
        const why = unavailableReason(original, a.id);
        const exp = expectedFor(a, anchor);
        const active = run?.alteration === a.id;
        return (
          <li key={a.id}>
            <button
              type="button"
              data-testid={`alt-${a.id}`}
              disabled={!!why || busy !== null}
              aria-pressed={active}
              aria-describedby={`alt-${a.id}-desc`}
              onClick={() => onTamper(a.id)}
              className={cn(
                "flex h-full min-h-tap w-full cursor-pointer flex-col items-start gap-1 rounded-md border p-3 text-left transition-[background-color,border-color] duration-150 hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-60",
                active ? "border-danger bg-danger-soft" : "border-border bg-card",
              )}
            >
              <span className="flex w-full items-center justify-between gap-2 text-body font-bold">
                {a.title}
                {busy === a.id ? (
                  <>
                    <span className="q-spinner" aria-hidden="true" />
                    <span className="sr-only" role="status">
                      Verificando…
                    </span>
                  </>
                ) : null}
              </span>
              <span id={`alt-${a.id}-desc`} className="text-small text-muted-foreground">
                {why ?? a.body}
              </span>
              <span className="text-[0.75rem] text-subtle">
                Falla:{" "}
                {exp.length ? (
                  exp.map((n) => (
                    <code key={n} className="q-mono mr-1 rounded bg-muted px-1">
                      {n}
                    </code>
                  ))
                ) : (
                  <strong className="text-warning-strong">nada (no detectable sin ancla)</strong>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function MiniStatus({ v }: { v: BrowserVerification }) {
  const s = statusOf(v);
  const pending = v.ok && s === "verificado" ? notEvaluated(v.result) : [];
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusPill status={s} size="sm" />
      {pending.length ? <span className="text-small font-semibold text-warning-strong">Parcial: sin evaluar {pending.join(", ")}</span> : null}
    </span>
  );
}

function LabResult({ run, source, onReset }: { run: Run; source: LoadedBytes["source"]; onReset: () => void }) {
  const spec = alterationById(run.alteration)!;
  const v = run.verification;
  const status = statusOf(v);
  const ev = run.evaluation;
  const result: AuditResult | null = v.ok ? v.result : null;
  const failing = useMemo(() => (result ? result.checks.filter((c) => !c.passed) : []), [result]);
  const primary = failing.find((c) => ev?.hit.includes(c.name)) ?? failing[0];

  return (
    <section aria-labelledby="lab-result-h" className="flex flex-col gap-4" data-testid="lab-result" data-alteration={run.alteration} data-verdict={ev?.verdict ?? "error"}>
      <h2 id="lab-result-h" className="sr-only">
        Resultado sobre la copia alterada
      </h2>
      <VerdictBanner status={status} title={`Copia alterada: ${spec.title}`}>
        {!v.ok ? (
          <p>El verificador no pudo completar la verificación: {v.error}. No se puede afirmar nada sobre esta copia.</p>
        ) : primary ? (
          <p>
            Falla <strong>{checkLabel(primary.name)}</strong> (<code className="q-mono">{primary.name}</code>): {primary.reason}
          </p>
        ) : (
          <p>Ninguna comprobación falló sobre esta copia.</p>
        )}
      </VerdictBanner>

      {ev ? <EvaluationNote ev={ev} anchor={run.anchor} note={spec.note} version={result?.verifierVersion ?? ""} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Qué se alteró</CardTitle>
          <CardDescription>
            Huella de la copia verificada: <span className="q-mono break-all">{v.inputDigest ? shortHash(v.inputDigest, 20, 8) : "—"}</span>
            {run.anchor === "sim" ? (
              <>
                {" "}
                · con ancla <FixtureTag>simulación</FixtureTag>
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <AlterationDiff changes={run.changes} />
          {v.inputDigest ? (
            <ShareAlteration key={v.inputDigest} source={source} alteration={run.alteration} anchor={run.anchor} digest={v.inputDigest} plainBytes={run.plainBytes} alteredBytes={run.bytes} />
          ) : null}
          <Button variant="ghost" onClick={onReset} className="w-full sm:w-fit">
            <RotateCcw aria-hidden="true" /> Volver a elegir
          </Button>
        </CardContent>
      </Card>

      {result ? <AuditChecklist result={result} runtime="navegador" title="Salida completa del verificador sobre la copia" /> : null}
    </section>
  );
}

function EvaluationNote({ ev, anchor, note, version }: { ev: Evaluation; anchor: AnchorMode; note?: string; version: string }) {
  const list = (xs: string[]) => xs.map((n) => `${checkLabel(n)} (${n})`).join(", ");
  const content: Record<Evaluation["verdict"], { tone: "info" | "warning" | "danger"; title: string; body: string }> = {
    detectado: { tone: "info", title: "Coincide con el guion", body: `El verificador marcó como fallido: ${list(ev.hit)}.` },
    "detectado-otro": { tone: "info", title: "Detectado por otro check", body: `El guion esperaba ${ev.expected.length ? list(ev.expected) : "ningún fallo"}; fallaron: ${list(ev.newlyFailed)}.` },
    "no-detectable": {
      tone: "warning",
      title: "No detectado, como advierte el guion",
      body:
        anchor === "none"
          ? "Sin ancla, un paquete rehecho de punta a punta es coherente por dentro. Cambia a «Ancla simulada» o «Ancla real» para ver cómo el ancla lo delata."
          : "En este modo no se espera detección.",
    },
    "no-detectado": { tone: "danger", title: "El verificador NO detectó esta alteración", body: `Se esperaba que fallara ${list(ev.expected)}. Esto debe reportarse al equipo del verificador.` },
    "no-evaluado": { tone: "warning", title: "No evaluado por este verificador", body: `La versión ${version} no emite ${list(ev.missing)}; no puede evaluar esta alteración.` },
  };
  const c = content[ev.verdict];
  return (
    <Alert tone={c.tone} title={c.title} role="status">
      <p data-testid="lab-evaluation">{c.body}</p>
      {note ? <p className="mt-1">{note}</p> : null}
    </Alert>
  );
}
