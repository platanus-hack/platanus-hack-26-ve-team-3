"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Calculator, Trophy } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1, fetchAuditPackageBytes } from "@/lib/client/apiV1";
import { compareDraw, recomputeDraw, type DrawComparison, type Recomputed } from "@/lib/client/draw";
import { formatInt, shortHash } from "@/lib/client/format";
import type { DrawResponse as DrawInfo, Election as ElectionV1 } from "@quorum/contracts";
import { Disclosure } from "@/components/ui/disclosure";
import { PageHeader } from "@/components/ui/page-header";

const comparisonStyle: Record<DrawComparison, { tone: "success" | "danger"; text: string }> = {
  coincide: { tone: "success", text: "Coincide con el publicado" },
  "no coincide": { tone: "danger", text: "No coincide: fallo detectado" },
};

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Sorteo verificable (D-12): semilla = keccak256(hash final del ledger); Fisher–Yates determinista sobre los candidatos.
 * "Recomputar aquí" repite el cálculo en el navegador y lo compara con lo publicado; además compara el hash final
 * del sorteo con el `finalHash` del paquete de auditoría descargado.
 */
export function DrawView({ electionId }: { electionId: string }) {
  const [election, setElection] = useState<ElectionV1 | null>(null);
  const [draw, setDraw] = useState<DrawInfo | null>(null);
  const [notDrawn, setNotDrawn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputed, setRecomputed] = useState<Recomputed | null>(null);
  const [packageFinalHash, setPackageFinalHash] = useState<string | null | "error">(null);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const e = await apiV1.getElection(electionId);
        if (cancelled) return;
        setElection(e);
        try {
          const d = await apiV1.getDraw(electionId);
          if (!cancelled) setDraw(d);
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiClientError && (err.code === "not_found" || err.status === 409)) setNotDrawn(true);
          else setError(describeError(err));
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [electionId, attempt]);

  // Revelación escalonada de ganadores (sin animación con prefers-reduced-motion).
  useEffect(() => {
    if (!draw) return;
    if (prefersReducedMotion()) {
      const t = window.setTimeout(() => setRevealed(draw.winners.length), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setRevealed(i);
      if (i >= draw.winners.length) clearInterval(t);
    }, 700);
    return () => clearInterval(t);
  }, [draw]);

  const retry = useCallback(() => {
    setError(null);
    setNotDrawn(false);
    setAttempt((a) => a + 1);
  }, []);

  async function recompute() {
    if (!draw) return;
    setRecomputing(true);
    setRecomputeError(null);
    try {
      setRecomputed(await recomputeDraw(draw.candidates, draw.n, draw.finalHash));
      try {
        const { text } = await fetchAuditPackageBytes(electionId);
        const fh = (JSON.parse(text) as { finalHash?: unknown }).finalHash;
        setPackageFinalHash(typeof fh === "string" ? fh : "error");
      } catch {
        setPackageFinalHash("error");
      }
    } catch (e) {
      setRecomputeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecomputing(false);
    }
  }

  if (error) {
    return (
      <div className="q-container py-10">
        <ErrorState title="No se pudo cargar el sorteo" message={error} onRetry={retry} />
      </div>
    );
  }
  if (!election || (!draw && !notDrawn)) {
    return (
      <div className="q-container py-10">
        <LoadingState label="Cargando sorteo…" lines={4} />
      </div>
    );
  }

  const label = (id: string) => draw?.candidates.find((c) => c.id === id)?.label ?? election.candidates?.find((c) => c.id === id)?.label ?? id;
  const comparison = draw && recomputed ? compareDraw(draw, recomputed) : null;
  const finalHashOk = packageFinalHash && packageFinalHash !== "error" && draw ? packageFinalHash.toLowerCase() === draw.finalHash.toLowerCase() : null;

  return (
    <div className="q-fade-in q-container flex flex-col gap-6 py-6 md:py-10">
      <PageHeader title={election.title} meta="Sorteo" />

      {!draw ? (
        <EmptyState
          title="El sorteo aún no se ha realizado"
          action={
            <Link href={`/e/${encodeURIComponent(electionId)}/live`} className={buttonVariants()}>
              Ver resultados
            </Link>
          }
        >
          Se hace al cerrar la votación. Nadie puede saber el resultado antes.
        </EmptyState>
      ) : (
        <>
          <Card className="border-transparent shadow-elevated">
            <CardHeader>
              <p className="q-eyebrow">{formatInt(draw.n)} proyectos a financiar · {election.winnersCountFromResult ? "lo decidió la votación" : "fijado por el organizador"}</p>
              <CardTitle as="h2" className="text-title">
                Ganadores
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2">
                {draw.winners.slice(0, revealed).map((id, i) => {
                  const c = draw.candidates.find((x) => x.id === id);
                  return (
                    <li key={id} className="q-fade-in flex min-h-tap items-center gap-3 rounded-md bg-success-soft p-3" data-testid="draw-winner">
                      <Trophy className="size-5 shrink-0 text-success-strong" aria-hidden="true" />
                      <span className="q-num w-6 shrink-0 font-semibold text-success-strong">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{label(id)}</span>
                        {typeof c?.amount === "number" ? <span className="block text-small text-muted-foreground">Monto {formatInt(c.amount)}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <p className="sr-only" role="status" aria-live="polite">
                {revealed > 0 ? `Ganador ${revealed}: ${label(draw.winners[revealed - 1])}` : ""}
              </p>
              <Disclosure title={`Todos los proyectos (${draw.candidates.length})`} className="mt-4">
                <ol className="flex flex-col gap-2">
                  {[...draw.candidates]
                    .sort((a, b) => (a.id < b.id ? -1 : 1))
                    .map((c, i) => (
                      <li key={c.id} className="flex items-center gap-3">
                        <span className="q-num w-5 shrink-0 text-center text-subtle">{i + 1}</span>
                        <span className="flex-1">{c.label}</span>
                        {typeof c.amount === "number" ? <span className="q-num text-muted-foreground">{formatInt(c.amount)}</span> : null}
                      </li>
                    ))}
                </ol>
              </Disclosure>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comprueba el sorteo</CardTitle>
              <CardDescription>Tu teléfono repite el sorteo y lo compara con el publicado.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={recompute} loading={recomputing} full className="sm:w-fit">
                <Calculator aria-hidden="true" /> Repetir el sorteo aquí
              </Button>
              {recomputeError ? (
                <Alert tone="danger" title="No se pudo repetir el sorteo">
                  {recomputeError}
                </Alert>
              ) : null}
              {recomputed && comparison ? (
                <div role="status" aria-live="polite" className="flex flex-col gap-3" data-testid="draw-recompute">
                  <Alert tone={comparisonStyle[comparison].tone} title={comparisonStyle[comparison].text}>
                    Ganadores: <span className="font-semibold">{recomputed.winners.map(label).join(" · ") || "—"}</span>
                  </Alert>
                  <Disclosure title="Detalles técnicos" bodyClassName="flex flex-col gap-2">
                    <p>
                      Seed recomputada: <span className="q-mono break-all">{shortHash(recomputed.seed, 18, 10)}</span>
                      {recomputed.seed.toLowerCase() === draw.seed.toLowerCase() ? " (igual a la publicada)" : " (distinta de la publicada)"}
                    </p>
                    <p>
                      finalHash del paquete de auditoría:{" "}
                      {packageFinalHash === "error" ? "no se pudo leer el paquete" : finalHashOk ? "coincide con el usado en el sorteo" : packageFinalHash ? "NO coincide con el usado en el sorteo" : "—"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Hash final del registro:</span> <span className="q-mono break-all">{draw.finalHash}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">seed = keccak256(finalHash):</span> <span className="q-mono break-all">{draw.seed}</span>
                    </p>
                    <p className="text-muted-foreground">Método: {draw.method ?? "keccak256(finalHash) · Fisher–Yates"}</p>
                  </Disclosure>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
