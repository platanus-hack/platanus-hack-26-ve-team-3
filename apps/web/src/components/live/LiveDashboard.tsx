"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveLayout as LiveLayoutSchema, type LiveLayout } from "@quorum/contracts";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/states";
import { BarTile, CountdownTile, DonutTile, StatTile, TextTile } from "@/components/LiveResultTile";
import { api, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { PhaseTimeline } from "@/components/election/PhaseTimeline";
import { phaseLabel } from "@/lib/client/phases";
import type { Aggregates, ElectionStatus as ElectionPhase } from "@quorum/contracts";
import { defaultLayout } from "@/lib/client/fixtures";
import { formatDateTime } from "@/lib/client/format";

const POLL_MS = 3000;

/** Renderiza el `LiveLayout` (elegido por el LLM o default por tipo) con los agregados que publica el servidor. */
export function LiveDashboard({ electionId }: { electionId: string }) {
  const [title, setTitle] = useState<string>("");
  const [layout, setLayout] = useState<LiveLayout | null>(null);
  const [layoutSource, setLayoutSource] = useState<"servidor" | "por defecto">("por defecto");
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
          setLayoutSource("servidor");
        }
      } catch {
        /* el título y el layout caen a valores por defecto */
      }
      try {
        const l = await api.getLayout(electionId);
        if (cancelled) return;
        setLayout(l);
        setLayoutSource("servidor");
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
    <div className="q-container flex flex-col gap-6 py-6 md:py-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Resultados en vivo</Badge>
          {phase ? <Badge tone={phase === "open" ? "success" : "neutral"}>{phaseLabel[phase]}</Badge> : null}
          <Badge tone="neutral">Layout: {layoutSource}</Badge>
        </div>
        <h1 className="text-title font-bold tracking-tight md:text-display">{title || "Elección"}</h1>
        <p className="text-small text-muted-foreground" aria-live="polite">
          Sólo agregados (participación y, desde 5 votos, conteo por opción); se actualiza cada 3 s. {updatedAt ? `Última actualización: ${formatDateTime(new Date(updatedAt).toISOString())}` : ""}
        </p>
      </header>

      {phase ? <PhaseTimeline phase={phase} /> : null}
      {phase === "registration" ? (
        <p role="status" className="rounded-md border border-border bg-neutral-soft p-3 text-small">
          Inscripción en curso: la votación aún no abre. Los agregados aparecerán cuando se congele el padrón.
        </p>
      ) : null}

      {error && !data ? <ErrorState message={error} onRetry={fetchTally} /> : null}
      {error && data ? (
        <p role="status" className="rounded-md border border-warning/50 bg-warning-soft p-2 text-small">
          Sin conexión momentánea: mostrando el último dato recibido. {error}
        </p>
      ) : null}
      {!data && !error ? <LoadingState label="Cargando agregados…" lines={4} /> : null}

      {data && layout ? (
        <div className={`grid grid-cols-1 gap-4 ${cols}`}>
          {layout.tiles.map((tile, i) => {
            switch (tile.type) {
              case "stat":
                return <StatTile key={i} metric={tile.metric} data={data} />;
              case "bar-chart":
                return <BarTile key={i} data={data} orientation={tile.orientation} />;
              case "donut":
                return <DonutTile key={i} data={data} />;
              case "countdown":
                return <CountdownTile key={i} closesAt={data.closesAt} status={data.status} />;
              case "text":
                return <TextTile key={i} template={tile.template} />;
            }
          })}
        </div>
      ) : null}

      <p className="text-small text-muted-foreground">
        Estas cifras las publica el organizador. El resultado sólo es confiable cuando lo confirma el{" "}
        <Link href="/audit" className="underline underline-offset-4">
          verificador independiente
        </Link>
        . Ver también el{" "}
        <Link href={`/e/${encodeURIComponent(electionId)}`} className="underline underline-offset-4">
          centro de transparencia
        </Link>
        .
      </p>
    </div>
  );
}
