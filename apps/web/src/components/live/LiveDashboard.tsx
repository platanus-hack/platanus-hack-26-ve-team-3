"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveLayout as LiveLayoutSchema, type LiveLayout } from "@quorum/contracts";
import { ErrorState, LoadingState } from "@/components/states";
import { DonutTile, TextTile } from "@/components/LiveResultTile";
import { ResultsCard } from "@/components/results/ResultsCard";
import { Backdrop } from "@/components/ui/backdrop";
import { api, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { PhaseTimeline } from "@/components/election/PhaseTimeline";
import type { Aggregates, ElectionStatus as ElectionPhase } from "@quorum/contracts";
import { defaultLayout } from "@/lib/client/fixtures";
import { formatDateTime } from "@/lib/client/format";
import { phaseLabel } from "@/lib/client/phases";
import { PageHeader } from "@/components/ui/page-header";

const POLL_MS = 3000;

/** Renderiza el `LiveLayout` (elegido por el LLM o default por tipo) con los agregados que publica el servidor. */
export function LiveDashboard({ electionId }: { electionId: string }) {
  const [title, setTitle] = useState<string>("");
  const [layout, setLayout] = useState<LiveLayout | null>(null);
  const [data, setData] = useState<Aggregates | null>(null);
  const [phase, setPhase] = useState<ElectionPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const timer = useRef<number | null>(null);

  const fetchTally = useCallback(async () => {
    try {
      const t = await apiV1.getTally(electionId);
      setData(t);
      setPhase(t.status);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(describeError(e));
    }
  }, [electionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let kind = "multiple";
      try {
        const e = await apiV1.getElection(electionId);
        if (cancelled) return;
        setTitle(e.title);
        setPhase(e.status);
        kind = e.kind;
        const fromElection = LiveLayoutSchema.safeParse(e.layout);
        if (fromElection.success) {
          setLayout(fromElection.data);
        }
      } catch {
        /* el título y el layout caen a valores por defecto */
      }
      try {
        const l = await api.getLayout(electionId);
        if (cancelled) return;
        setLayout(l);
      } catch {
        if (!cancelled) setLayout((prev) => prev ?? defaultLayout(kind));
      }
      await fetchTally();
    })();
    return () => {
      cancelled = true;
    };
  }, [electionId, fetchTally]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void fetchTally();
      timer.current = window.setTimeout(tick, POLL_MS);
    };
    timer.current = window.setTimeout(tick, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fetchTally]);

  const extraTiles = layout?.tiles.filter((t) => t.type === "donut" || t.type === "text") ?? [];
  const cols = extraTiles.length >= 2 ? "md:grid-cols-2" : "md:grid-cols-1";

  return (
    <div className="relative isolate overflow-x-clip">
      <Backdrop />
      <div className="q-fade-in q-container flex max-w-3xl flex-col gap-6 py-6 md:py-10">
        <PageHeader title={title || "Elección"} meta={<span aria-live="polite">Se actualiza cada 3 s{updatedAt ? ` · ${formatDateTime(new Date(updatedAt).toISOString())}` : ""}</span>}>
          {phase ? <PhaseTimeline phase={phase} /> : null}
        </PageHeader>
        {phase === "registration" ? (
          <p role="status" className="rounded-md border border-border bg-neutral-soft p-3 text-small">
            La votación aún no abre. Los resultados aparecen al empezar.
          </p>
        ) : null}

        {error && !data ? <ErrorState message={error} onRetry={fetchTally} /> : null}
        {error && data ? (
          <p role="status" className="rounded-md border border-warning/50 bg-warning-soft p-2 text-small">
            Sin conexión: mostrando el último dato.
          </p>
        ) : null}
        {!data && !error ? <LoadingState label="Cargando agregados…" lines={4} /> : null}

        {data && phase !== "registration" ? (
          <ResultsCard options={data.options} totalVotes={data.totalVotes} eligible={data.eligible} turnout={data.turnout} live={data.status === "open"} statusLabel={phaseLabel[data.status]} closesAt={data.closesAt} />
        ) : null}

        {data && extraTiles.length > 0 ? (
          <div className={`grid grid-cols-1 gap-3 md:gap-4 ${cols}`}>
            {extraTiles.map((tile, i) => (
              <div key={i} className="min-w-0">
                {tile.type === "donut" ? <DonutTile data={data} /> : tile.type === "text" ? <TextTile template={tile.template} /> : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-small text-muted-foreground">
          El resultado final vale cuando lo confirma el{" "}
          <Link href={`/e/${encodeURIComponent(electionId)}`} className="underline underline-offset-4">
            verificador
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
