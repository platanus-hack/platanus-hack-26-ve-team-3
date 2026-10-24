"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveLayout as LiveLayoutSchema, type LiveLayout } from "@quorum/contracts";
import { ErrorState, LoadingState } from "@/components/states";
import { BarTile, CountdownTile, DonutTile, StatTile, TextTile } from "@/components/LiveResultTile";
import { api, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { PhaseTimeline } from "@/components/election/PhaseTimeline";
import type { Aggregates, ElectionStatus as ElectionPhase } from "@quorum/contracts";
import { defaultLayout } from "@/lib/client/fixtures";
import { formatDateTime } from "@/lib/client/format";
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

  const cols = layout?.columns === "3" ? "md:grid-cols-3" : layout?.columns === "2" ? "md:grid-cols-2" : "md:grid-cols-1";

  return (
    <div className="q-fade-in q-container flex flex-col gap-6 py-6 md:py-10">
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

      {data && layout ? (
        <div className={`grid grid-cols-2 gap-3 md:gap-4 ${cols}`}>
          {layout.tiles.map((tile, i) => (
            <div key={i} className={tile.type === "stat" ? "min-w-0" : "col-span-2 min-w-0 md:col-span-1"}>
              {(() => {
                switch (tile.type) {
                  case "stat":
                    return <StatTile metric={tile.metric} data={data} />;
                  case "bar-chart":
                    return <BarTile data={data} orientation={tile.orientation} />;
                  case "donut":
                    return <DonutTile data={data} />;
                  case "countdown":
                    return <CountdownTile closesAt={data.closesAt} status={data.status} />;
                  case "text":
                    return <TextTile template={tile.template} />;
                }
              })()}
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
  );
}
