"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { StatusPill, type HonestStatus } from "@/components/StatusPill";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { loadReceipt } from "@/lib/client/identityVault";
import { findNullifier, normalizeNullifier } from "@/lib/client/onchain";
import type { VerifiedPackage } from "./VerifyNowPanel";

type Outcome = { status: HonestStatus; title: string; body: string };

/** Decide el estado honesto de "mi voto está". Exportado para tests. */
export type InclusionSource = "paquete verificado" | "ledger publicado" | "registro del servidor";

export function judgeInclusion(args: { found: { idx?: number } | null; source: InclusionSource; fromReceipt: boolean }): Outcome {
  const { found, source, fromReceipt } = args;
  if (found) {
    const pos = typeof found.idx === "number" && found.idx >= 0 ? ` (posición #${found.idx})` : "";
    return source === "paquete verificado"
      ? { status: "incluido", title: `Tu boleta está en el paquete que verificaste${pos}`, body: "El nullifier aparece en el registro que tu navegador acaba de verificar." }
      : { status: "incluido", title: `Tu boleta está en el ${source}${pos}`, body: "Al cierre, usa «Verificar ahora» y vuelve a comprobar contra el paquete verificado: es la comprobación que no depende de la palabra del servidor." };
  }
  if (fromReceipt) {
    return { status: "fallo detectado", title: "Tu boleta NO aparece", body: `Este navegador guardó un comprobante con este nullifier, pero no está en el ${source}. Guarda tu comprobante y repórtalo: es evidencia de una boleta eliminada.` };
  }
  return { status: "no verificable", title: "No encontrado", body: `Ese nullifier no está en el ${source}. Revisa que lo hayas copiado completo (sólo dígitos).` };
}

/**
 * "Mi voto está": busca el nullifier del votante (de su comprobante en este navegador o pegado a mano) en el paquete
 * que verificó en su navegador o, si aún no verificó, en `GET /api/elections/:id/ledger`. No revela la opción.
 */
export function MyVoteCheck({ electionId, verified }: { electionId: string; verified: VerifiedPackage | null }) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [fromReceipt, setFromReceipt] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOutcome(null);
    const n = normalizeNullifier(value);
    if (!n) return setError("El nullifier es un número decimal largo (sólo dígitos).");
    setLoading(true);
    try {
      if (verified) {
        setOutcome(judgeInclusion({ found: findNullifier(verified.ledger, n), source: "paquete verificado", fromReceipt }));
      } else {
        const ledger = await apiV1.getLedger(electionId);
        if (ledger.entries.length > 0 || ledger.proofsPublished !== false) {
          setOutcome(judgeInclusion({ found: findNullifier(ledger.entries, n), source: "ledger publicado", fromReceipt }));
        } else {
          // Durante la votación el ledger no publica entradas (threat model C3): se consulta el recibo por nullifier.
          try {
            const inc = await apiV1.getInclusion(electionId, n);
            setOutcome(judgeInclusion({ found: { idx: inc.index }, source: "registro del servidor", fromReceipt }));
          } catch (err) {
            if (err instanceof ApiClientError && err.code === "not_found") setOutcome(judgeInclusion({ found: null, source: "registro del servidor", fromReceipt }));
            else throw err;
          }
        }
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card id="mi-voto">
      <CardHeader>
        <CardTitle>Mi voto está</CardTitle>
        <CardDescription>
          Comprueba con tu nullifier que tu boleta sigue en el registro. {verified ? "Se busca en el paquete que verificaste en tu navegador." : "Aún no verificaste el paquete: se consulta el registro publicado (durante la votación, el recibo por nullifier)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form ref={formRef} onSubmit={check} className="flex flex-col gap-3" noValidate>
          <Field label="Nullifier" htmlFor={inputId} hint={fromReceipt ? "Tomado del comprobante guardado en este navegador." : "Pégalo desde tu comprobante."}>
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
          {outcome ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-1 rounded-md border border-border p-3" data-testid="my-vote-result">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={outcome.status} />
                <span className="font-semibold">{outcome.title}</span>
              </div>
              <p className="text-small text-muted-foreground">{outcome.body}</p>
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
