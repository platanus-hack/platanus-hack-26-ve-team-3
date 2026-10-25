"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, CheckCircle2, CircleHelp, Copy, ExternalLink, Search, Stamp, XCircle } from "lucide-react";
import { StatusPill, type HonestStatus } from "@/components/StatusPill";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input } from "@/components/ui/input";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { copyText } from "@/lib/client/download";
import { cn } from "@/lib/client/cn";
import { shortHash } from "@/lib/client/format";
import { loadReceipt } from "@/lib/client/identityVault";
import { findNullifier, normalizeNullifier, type AnchorCheck } from "@/lib/client/onchain";
import { basescanTxUrl } from "@/lib/client/room";
import { sleep, STEP_MS, StepList, type Step } from "./StepList";
import type { Election } from "@quorum/contracts";
import type { VerifiedPackage } from "./VerifyNowPanel";

type Outcome = { status: HonestStatus; title: string; body: string };
/** `election.anchor` de `GET /api/elections/:id` (contracts exporta el esquema, no el tipo). */
export type AnchorInfo = NonNullable<Election["anchor"]>;

/** Decide el estado honesto de "mi voto está". Exportado para tests. */
export type InclusionSource = "paquete verificado" | "ledger publicado" | "registro del servidor";

const SOURCE_LABEL: Record<InclusionSource, string> = { "paquete verificado": "el paquete que verificaste", "ledger publicado": "el registro publicado", "registro del servidor": "el registro del servidor" };

export function judgeInclusion(args: { found: { idx?: number } | null; source: InclusionSource; fromReceipt: boolean }): Outcome {
  const { found, source, fromReceipt } = args;
  const where = SOURCE_LABEL[source];
  if (found) {
    const pos = typeof found.idx === "number" && found.idx >= 0 ? ` · posición #${found.idx}` : "";
    return source === "paquete verificado"
      ? { status: "incluido", title: `Tu boleta está en el paquete que verificaste${pos}`, body: "Tu código aparece en el registro que tu teléfono acaba de comprobar." }
      : { status: "incluido", title: `Tu boleta está en ${where}${pos}`, body: "Al cierre, toca «Verificar ahora» y compruébalo de nuevo sin depender del servidor." };
  }
  if (fromReceipt) {
    return { status: "fallo detectado", title: "Tu boleta NO aparece", body: `Este teléfono guardó un comprobante con este código, pero no está en ${where}. Guárdalo y repórtalo: es evidencia de una boleta eliminada.` };
  }
  return { status: "no verificable", title: "No encontrado", body: `Ese código no está en ${where}. Revisa que lo hayas copiado completo.` };
}

/* ---------- Pasos de la verificación (animación honesta: cada paso dice qué se hizo de verdad) ---------- */

export { STEP_MS, type Step, type StepMark } from "./StepList";

/**
 * Pasos que se muestran. El tercero depende del sello: con `anchor` se compara con lo que el verificador del navegador
 * dijo de `anchor_matches` (✓ sólo si lo verificó; «no evaluado» si no corrió); sin sello, se dice que se ancla al cerrar.
 */
export function buildSteps(args: { anchor: AnchorInfo | null; anchorCheck: AnchorCheck | null | undefined }): Step[] {
  const third: Step = !args.anchor
    ? { label: "Sin sello todavía: se ancla al cerrar", mark: "skip" }
    : args.anchorCheck === "verificado"
      ? { label: "Comparando con el sello en Base Sepolia", mark: "ok" }
      : args.anchorCheck === "fallo detectado"
        ? { label: "Comparando con el sello en Base Sepolia", mark: "fail" }
        : { label: "Comparando con el sello en Base Sepolia", mark: "skip" };
  return [{ label: "Buscando tu código en el registro", mark: "ok" }, { label: "Comprobando el hash de tu boleta", mark: "ok" }, third];
}

type Found = { idx?: number; hash?: string; hashFromReceipt?: boolean } | null;
type Result = { outcome: Outcome; found: Found; nullifier: string };

/**
 * "Mi voto está": busca el nullifier del votante (de su comprobante en este navegador o pegado a mano) en el paquete
 * que verificó en su navegador o, si aún no verificó, en `GET /api/elections/:id/ledger`. No revela la opción.
 * Lo que puede afirmar: la boleta está en el registro (posición y hash) y ese registro quedó sellado en Base Sepolia
 * al cerrar (`anchor`). Nunca «tu voto está en la blockchain».
 */
export function MyVoteCheck({ electionId, verified, anchor = null, frame = "card" }: { electionId: string; verified: VerifiedPackage | null; anchor?: AnchorInfo | null; /** `plain`: sin tarjeta ni título (va dentro del acordeón «¿Está mi voto?» de Transparencia). */ frame?: "card" | "plain" }) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [fromReceipt, setFromReceipt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const runRef = useRef(0);

  // El comprobante vive en localStorage (sólo cliente): se lee tras montar para no romper la hidratación.
  useEffect(() => {
    const r = loadReceipt(electionId);
    if (!r) return;
    const t = window.setTimeout(() => {
      setValue(r.nullifier);
      setFromReceipt(true);
      // Desde el comprobante ("Comprobar mi voto" → ?comprobar=1#mi-voto): comprobar sin pedir otro toque.
      if (new URLSearchParams(window.location.search).get("comprobar") === "1") window.setTimeout(() => formRef.current?.requestSubmit(), 50);
    }, 0);
    return () => clearTimeout(t);
  }, [electionId]);

  async function lookup(n: string): Promise<Result> {
    if (verified) {
      const f = findNullifier(verified.ledger, n);
      return { outcome: judgeInclusion({ found: f, source: "paquete verificado", fromReceipt }), found: f ? { idx: f.idx, hash: f.hash } : null, nullifier: n };
    }
    const ledger = await apiV1.getLedger(electionId);
    if (ledger.entries.length > 0 || ledger.proofsPublished !== false) {
      const f = findNullifier(ledger.entries, n);
      return { outcome: judgeInclusion({ found: f, source: "ledger publicado", fromReceipt }), found: f ? { idx: f.idx, hash: f.hash } : null, nullifier: n };
    }
    // Durante la votación el ledger no publica entradas (threat model C3): se consulta el recibo por nullifier.
    try {
      const inc = await apiV1.getInclusion(electionId, n);
      const stored = loadReceipt(electionId);
      const fromStored = !inc.hash && stored && normalizeNullifier(stored.nullifier) === n && typeof stored.hash === "string";
      const found: Found = { idx: inc.index, hash: inc.hash ?? (fromStored ? stored.hash : undefined), hashFromReceipt: !!fromStored };
      return { outcome: judgeInclusion({ found: { idx: inc.index }, source: "registro del servidor", fromReceipt }), found, nullifier: n };
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "not_found") return { outcome: judgeInclusion({ found: null, source: "registro del servidor", fromReceipt }), found: null, nullifier: n };
      throw err;
    }
  }

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const n = normalizeNullifier(value);
    if (!n) return setError("El código son solo números. Cópialo completo desde tu comprobante.");
    const run = ++runRef.current;
    const plan = buildSteps({ anchor, anchorCheck: verified?.anchorCheck });
    setSteps(plan);
    setDone(0);
    setLoading(true);
    // La consulta corre en paralelo con la secuencia: cada paso dura al menos STEP_MS para que se vea.
    const work = lookup(n);
    work.catch(() => undefined);
    try {
      for (let i = 0; i < plan.length; i++) {
        await sleep(STEP_MS);
        if (runRef.current !== run) return;
        setDone(i + 1);
      }
      const r = await work;
      if (runRef.current !== run) return;
      setResult(r);
    } catch (err) {
      if (runRef.current !== run) return;
      setSteps(null);
      setError(describeError(err));
    } finally {
      if (runRef.current === run) setLoading(false);
    }
  }

  const anchorUrl = anchor ? basescanTxUrl(anchor.chainId, anchor.txHash) : null;

  const description = <>Pega el código de tu comprobante. {verified ? "Se busca en el paquete que verificaste." : "Se consulta el registro publicado."}</>;
  const form = (
        <form ref={formRef} onSubmit={check} className="flex flex-col gap-3" noValidate>
          {frame === "plain" ? <p className="text-small text-muted-foreground">{description}</p> : null}
          <Field label="Código del comprobante" htmlFor={inputId} hint={fromReceipt ? "Tomado del comprobante de este teléfono." : "Pégalo desde tu comprobante."}>
            <Input
              id={inputId}
              inputMode="numeric"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setFromReceipt(false);
              }}
              className="q-mono"
              aria-describedby={`${inputId}-hint`}
            />
          </Field>
          <Button type="submit" variant="secondary" loading={loading} className="w-full sm:w-fit" disabled={!value.trim()}>
            <Search aria-hidden="true" /> Comprobar
          </Button>
          {error ? (
            <Alert tone="danger" title="No se pudo comprobar">
              {error}
            </Alert>
          ) : null}
          <div role="status" aria-live="polite" className="flex flex-col gap-3">
            {steps ? <StepList steps={steps} done={done} finished={result !== null} testId="my-vote-steps" /> : null}
            {result ? <ResultCard result={result} anchor={anchor} anchorUrl={anchorUrl} anchorCheck={verified?.anchorCheck ?? null} /> : null}
          </div>
        </form>
  );
  if (frame === "plain") return form;
  return (
    <Card id="mi-voto">
      <CardHeader>
        <CardTitle>¿Está mi voto?</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{form}</CardContent>
    </Card>
  );
}

/* ---------- Resultado: estado + UNA frase, fila del sello y «Detalles técnicos» plegados ---------- */

/**
 * Tarjeta de resultado en tres capas para no abrumar: (a) pill de estado y una sola frase («Tu boleta está en … ·
 * posición #N», o el fallo/no encontrado con su explicación); (b) fila compacta del sello en Base Sepolia con enlace a
 * Basescan; (c) «Detalles técnicos» plegado: código del comprobante, hash de la boleta y posición, con Copiar.
 */
function ResultCard({ result, anchor, anchorUrl, anchorCheck }: { result: Result; anchor: AnchorInfo | null; anchorUrl: string | null; anchorCheck: AnchorCheck | null }) {
  const { outcome, found, nullifier } = result;
  const included = outcome.status === "incluido";
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-3" data-testid="my-vote-result" data-status={outcome.status}>
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={outcome.status} />
          <span className="font-semibold" data-testid="my-vote-summary">{outcome.title}</span>
        </div>
        {included ? null : <p className="text-small text-muted-foreground">{outcome.body}</p>}
      </div>

      <SealRow anchor={anchor} anchorUrl={anchorUrl} anchorCheck={anchorCheck} />

      <Disclosure title="Detalles técnicos" testId="my-vote-details" bodyClassName="flex flex-col gap-3">
        <dl className="flex flex-col gap-2">
          <MonoRow label="Código del comprobante" value={nullifier} testId="my-vote-code" />
          {found ? (
            <>
              <MonoRow
                label="Hash de tu boleta en el registro"
                value={found.hash ?? null}
                note={found.hashFromReceipt ? "según el comprobante de este teléfono" : undefined}
                empty="El registro aún no publica el hash; se verá al cierre."
                testId="my-vote-hash"
              />
              <MonoRow label="Posición en el registro" value={typeof found.idx === "number" && found.idx >= 0 ? `#${found.idx}` : null} empty="Sin posición publicada" testId="my-vote-index" copy={false} />
            </>
          ) : null}
        </dl>
        {included ? <p className="text-small text-muted-foreground">{outcome.body}</p> : null}
      </Disclosure>
    </div>
  );
}

function MonoRow({ label, value, note, empty, testId, copy = true }: { label: string; value: string | null; note?: string; empty?: string; testId: string; copy?: boolean }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  async function onCopy() {
    if (!value) return;
    const ok = await copyText(value);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2000);
  }
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-small text-muted-foreground">
        {label}
        {note ? <span className="ml-1 text-subtle">· {note}</span> : null}
      </dt>
      <dd className="flex items-start gap-2">
        {value ? (
          <>
            <span className="q-mono min-w-0 flex-1 break-all rounded-md border border-border bg-muted px-2 py-2 text-small" data-testid={testId}>
              {value}
            </span>
            {copy ? (
              <Button type="button" variant="ghost" size="sm" onClick={onCopy} aria-label={`Copiar ${label.toLowerCase()}`} className="min-w-tap shrink-0 px-3">
                {copied === "ok" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                <span className="sr-only sm:not-sr-only">{copied === "ok" ? "Copiado" : copied === "fail" ? "No se pudo" : "Copiar"}</span>
              </Button>
            ) : null}
          </>
        ) : (
          <span className="text-small text-muted-foreground" data-testid={testId}>
            {empty ?? "—"}
          </span>
        )}
      </dd>
    </div>
  );
}

/** Texto corto del estado del sello según lo que dijo el verificador del navegador sobre `anchor_matches`. */
const SEAL_STATE: Record<AnchorCheck, { icon: React.ReactNode; text: string; cls: string }> = {
  verificado: { icon: <CheckCircle2 aria-hidden="true" />, text: "coincide · comprobado por tu teléfono", cls: "text-success-strong" },
  "fallo detectado": { icon: <XCircle aria-hidden="true" />, text: "no coincide con lo que verificó tu teléfono", cls: "text-danger-strong" },
  "no verificable": { icon: <CircleHelp aria-hidden="true" />, text: "no evaluado por tu teléfono", cls: "text-muted-foreground" },
};

/**
 * Fila compacta del sello. Lo único on-chain es el `finalHash` del registro, anclado al cerrar (D-13); la boleta NO va a
 * la cadena. «Coincide» sólo cuando el verificador del navegador evaluó `anchor_matches` como verificado.
 * A 360 px: texto a la izquierda y «Ver en Basescan» debajo; desde `sm`, una sola fila con el enlace a la derecha.
 */
function SealRow({ anchor, anchorUrl, anchorCheck }: { anchor: AnchorInfo | null; anchorUrl: string | null; anchorCheck: AnchorCheck | null }) {
  if (!anchor) {
    return (
      <p className="flex items-center gap-2 text-small text-muted-foreground" data-testid="my-vote-anchor">
        <Stamp className="size-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold text-foreground">Sello:</span> se publica al cerrar la votación.
        </span>
      </p>
    );
  }
  const st = SEAL_STATE[anchorCheck ?? "no verificable"];
  return (
    <div className="flex flex-col gap-1 text-small sm:flex-row sm:items-center sm:justify-between sm:gap-3" data-testid="my-vote-anchor" data-anchor-check={anchorCheck ?? "no verificable"}>
      <p className="flex min-w-0 items-start gap-2">
        <Stamp className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          <span className="font-semibold">Sellado en Base Sepolia</span>{" "}
          <span className={cn("inline-flex items-center gap-1 align-bottom [&_svg]:size-4 [&_svg]:shrink-0", st.cls)}>
            {st.icon}
            {st.text}
          </span>
        </span>
      </p>
      {anchorUrl ? (
        <a href={anchorUrl} target="_blank" rel="noreferrer" title={anchor.txHash} className="inline-flex min-h-tap w-fit shrink-0 items-center gap-1.5 pl-6 font-semibold underline underline-offset-4 sm:pl-0" data-testid="my-vote-anchor-link">
          Ver en Basescan <ExternalLink className="size-4" aria-hidden="true" />
          <span className="q-mono text-[0.75rem] font-normal">{shortHash(anchor.txHash, 6, 4)}</span>
        </a>
      ) : (
        <span className="q-mono shrink-0 pl-6 text-[0.75rem] sm:pl-0" title={anchor.txHash} data-testid="my-vote-anchor-tx">
          {shortHash(anchor.txHash, 6, 4)} · cadena {anchor.chainId}
        </span>
      )}
    </div>
  );
}
