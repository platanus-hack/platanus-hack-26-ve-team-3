"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Calculator, Trophy } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1, fetchAuditPackageBytes } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { compareDraw, recomputeDraw, type DrawComparison, type Recomputed } from "@/lib/client/draw";
import { formatInt, shortHash } from "@/lib/client/format";
import { phaseLabel } from "@/lib/client/phases";
import type { DrawResponse as DrawInfo, Election as ElectionV1 } from "@quorum/contracts";
import { PhaseTimeline } from "./PhaseTimeline";

const comparisonStyle: Record<DrawComparison, { tone: "success" | "danger" | "warning"; text: string }> = {
  coincide: { tone: "success", text: "Coincide: recomputado en tu navegador" },
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
    <div className="q-container flex flex-col gap-6 py-6 md:py-10">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Sorteo verificable</Badge>
          <Badge tone="neutral">{phaseLabel[election.status]}</Badge>
        </div>
        <h1 className="text-title font-bold tracking-tight md:text-display">{election.title}</h1>
        <PhaseTimeline phase={election.status} />
      </header>

      {!draw ? (
        <EmptyState title="El sorteo aún no se ha realizado" action={<Link href={`/e/${encodeURIComponent(electionId)}`} className={cn(buttonVariants({ variant: "secondary" }))}>Centro de transparencia</Link>}>
          Se hace cuando la votación es auditable. La semilla sale del hash final del registro de boletas, así que nadie la conoce antes del cierre.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle as="h2" className="text-body text-muted-foreground">
                  Proyectos a financiar (N)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-display font-bold">{formatInt(draw.n)}</p>
                <p className="text-small text-muted-foreground">{election.winnersCountFromResult ? "Fijado por la opción ganadora de la votación." : "Fijado por el organizador."}</p>
              </CardContent>
            </Card>
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle as="h2" className="text-body text-muted-foreground">
                  Semilla
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-small">
                <p>
                  <span className="text-muted-foreground">Hash final del registro:</span> <span className="q-mono break-all">{draw.finalHash}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">seed = keccak256(finalHash):</span> <span className="q-mono break-all">{draw.seed}</span>
                </p>
                <p className="text-muted-foreground">Método: {draw.method ?? "keccak256(finalHash) · Fisher–Yates"}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Proyectos postulados ({draw.candidates.length})</CardTitle>
              <CardDescription>Ganadores marcados con trofeo. Ordenados por id, como los recibe el algoritmo.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-live="polite">
                {[...draw.candidates].sort((a, b) => (a.id < b.id ? -1 : 1)).map((c, i) => {
                  const pos = draw.winners.indexOf(c.id);
                  const won = pos >= 0 && pos < revealed;
                  return (
                    <li key={c.id} className={cn("flex min-h-tap items-center gap-3 rounded-md border p-3 transition-colors", won ? "border-success bg-success-soft" : "border-border")} data-testid={won ? "draw-winner" : undefined}>
                      {won ? <Trophy className="size-5 shrink-0 text-success-strong" aria-hidden="true" /> : <span className="q-mono w-5 shrink-0 text-center text-small text-subtle">{i + 1}</span>}
                      <span className="flex-1">
                        <span className="font-semibold">{c.label}</span>
                        {typeof c.amount === "number" ? <span className="block text-small text-muted-foreground">Monto: {formatInt(c.amount)}</span> : null}
                      </span>
                      {won ? <span className="text-small font-semibold text-success-strong">Ganador #{pos + 1}</span> : null}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recomputar aquí</CardTitle>
              <CardDescription>Tu navegador repite el sorteo con la misma semilla y compara. No depende del servidor más que para leer los datos públicos.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button onClick={recompute} loading={recomputing} className="w-full sm:w-fit">
                <Calculator aria-hidden="true" /> Recomputar aquí
              </Button>
              {recomputeError ? (
                <Alert tone="danger" title="No se pudo recomputar">
                  {recomputeError}
                </Alert>
              ) : null}
              {recomputed && comparison ? (
                <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-md border border-border p-3 text-small" data-testid="draw-recompute">
                  <Badge tone={comparisonStyle[comparison].tone} className="w-fit">
                    {comparisonStyle[comparison].text}
                  </Badge>
                  <p>Implementación: drawWinners de @quorum/protocol-adapter (la misma que usan el servidor y el verificador).</p>
                  <p>
                    Recomputado: <span className="font-semibold">{recomputed.winners.map(label).join(" · ") || "—"}</span>
                  </p>
                  <p>
                    Seed recomputada: <span className="q-mono break-all">{shortHash(recomputed.seed, 18, 10)}</span>
                    {recomputed.seed.toLowerCase() === draw.seed.toLowerCase() ? " (igual a la publicada)" : " (distinta de la publicada)"}
                  </p>
                  <p>
                    finalHash del paquete de auditoría:{" "}
                    {packageFinalHash === "error" ? "no se pudo leer el paquete" : finalHashOk ? "coincide con el usado en el sorteo" : packageFinalHash ? "NO coincide con el usado en el sorteo" : "—"}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
