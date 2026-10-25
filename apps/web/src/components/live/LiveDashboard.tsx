"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LiveLayout as LiveLayoutSchema, MIN_VOTES_FOR_BREAKDOWN, type LiveLayout } from "@quorum/contracts";
import { ErrorState, LoadingState } from "@/components/states";
import { DonutTile, TextTile } from "@/components/LiveResultTile";
import { ResultsCard } from "@/components/results/ResultsCard";
import { RankedCards } from "@/components/results/RankedCards";
import { WinnerScreen } from "@/components/results/WinnerScreen";
import { Backdrop } from "@/components/ui/backdrop";
import { api, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import type { Aggregates, AuditResult, ElectionStatus as ElectionPhase, Option } from "@quorum/contracts";
import { defaultLayout } from "@/lib/client/fixtures";
import { hasAuditPackage, phaseLabel } from "@/lib/client/phases";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";

const POLL_MS = 3000;

/**
 * Página pública en vivo. Arriba: tarjetas ordenadas con la foto de cada opción (`RankedCards`, cruzadas por `id` con
 * las opciones de la elección) mientras se vota; al cierre, `WinnerScreen` con el veredicto real de `GET /audit`.
 * Debajo, el `LiveLayout` (elegido por el LLM o default por tipo) con los agregados que publica el servidor.
 */
export function LiveDashboard({ electionId }: { electionId: string }) {
  const [title, setTitle] = useState<string>("");
  const [options, setOptions] = useState<Option[]>([]);
  const [layout, setLayout] = useState<LiveLayout | null>(null);
  const [data, setData] = useState<Aggregates | null>(null);
  const [phase, setPhase] = useState<ElectionPhase | null>(null);
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const auditFor = useRef<string | null>(null);
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
      // Al cierre: el veredicto viene del verificador real (método, versión y huella), nunca de un booleano local.
      if (hasAuditPackage(t.status) && auditFor.current !== t.status) {
        auditFor.current = t.status;
        try {
          const a = await apiV1.getAudit(electionId);
          setAudit(a.auditResult);
        } catch {
          setAudit(null);
        }
      }
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
        setOptions(e.options);
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
  const byId = new Map(options.map((o) => [o.id, o]));
  const withPhotos = data ? data.options.map((o) => ({ ...o, subtitle: byId.get(o.id)?.subtitle, image: byId.get(o.id)?.image })) : [];
  const breakdown = data ? data.totalVotes >= MIN_VOTES_FOR_BREAKDOWN && withPhotos.length > 0 && withPhotos.every((o) => o.count !== null) : false;
  const closed = data ? hasAuditPackage(data.status) : false;

  return (
    <div className="relative isolate overflow-x-clip">
      <Backdrop />
      <div className={`q-fade-in q-container flex flex-col gap-6 py-6 md:py-10 ${closed ? "max-w-5xl" : "max-w-3xl"}`}>
        <PageHeader title={title || "Votación"} meta={updatedAt ? `Actualizado ${new Date(updatedAt).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })}` : "Se actualiza solo"} />
        {phase === "registration" ? (
          <Alert tone="info" title="La votación aún no abre">
            Los resultados aparecen al empezar.
          </Alert>
        ) : null}

        {error && !data ? <ErrorState message={error} onRetry={fetchTally} /> : null}
        {error && data ? (
          <Alert tone="warning" title="Sin conexión">
            Mostrando el último dato.
          </Alert>
        ) : null}
        {!data && !error ? <LoadingState label="Cargando resultados…" lines={4} /> : null}

        {data && closed ? <WinnerScreen electionId={electionId} status={data.status} options={withPhotos} totalVotes={data.totalVotes} audit={audit} /> : null}
        {data && phase !== "registration" ? (
          <ResultsCard options={data.options} totalVotes={data.totalVotes} eligible={data.eligible} turnout={data.turnout} live={data.status === "open"} statusLabel={phaseLabel[data.status]} closesAt={data.closesAt} compact={closed || breakdown}>
            {/* Una sola carta: «En vivo», participación y «va ganando» arriba; debajo, en la misma carta, las tarjetas con foto que se reordenan. */}
            {!closed && breakdown ? <RankedCards ariaHidden options={withPhotos.map((o) => ({ ...o, count: o.count ?? 0 }))} totalVotes={data.totalVotes} size="lg" /> : null}
          </ResultsCard>
        ) : null}

        {data && extraTiles.length > 0 ? (
          <div className={`grid grid-cols-1 gap-3 md:gap-4 ${cols}`}>
            {extraTiles.map((tile, i) => (
              <div key={i} className="min-w-0">
                {tile.type === "donut" ? <DonutTile data={data} /> : tile.type === "text" ? <div className="hidden md:block"><TextTile template={tile.template} /></div> : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-small text-muted-foreground">
          Solo totales: nunca quién votó.{" "}
          <Link href={`/e/${encodeURIComponent(electionId)}`} className="font-semibold text-primary-ink underline underline-offset-4">
            Comprobar el resultado
          </Link>
        </p>
      </div>
    </div>
  );
}
