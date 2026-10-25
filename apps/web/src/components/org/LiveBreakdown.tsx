"use client";

import { Clock, Eye } from "lucide-react";
import { MIN_VOTES_FOR_BREAKDOWN, type Aggregates } from "@quorum/contracts";
import { formatInt, formatPercent } from "@/lib/client/format";
import { cn } from "@/lib/client/cn";

type Row = { id: string; label: string; count: number };

/** Líder(es) del ranking: una opción con su ventaja sobre la segunda, o empate entre varias. */
export function leaderOf(rows: Row[]): { kind: "lead"; label: string; margin: number } | { kind: "tie"; labels: string[] } | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const top = sorted[0].count;
  if (top === 0) return null;
  const tied = sorted.filter((r) => r.count === top);
  if (tied.length > 1) return { kind: "tie", labels: tied.map((r) => r.label) };
  return { kind: "lead", label: sorted[0].label, margin: top - (sorted[1]?.count ?? 0) };
}

const joinEs = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * «Por opción» del panel (votación en curso y final), desde `GET /tally` (solo agregados). Ranking horizontal de mayor
 * a menor: la(s) líder(es) en aqua `#004466`, las demás en gris azulado; nunca naranja para datos. Con `count: null`
 * (menos de 5 votos) no hay desglose: barras fantasma y «N de 5 votos · se publica desde 5».
 * Movimiento: solo la transición CSS del ancho (desactivada con `prefers-reduced-motion` desde globals.css).
 */
export function LiveBreakdown({ tally, final = false, className }: { tally: Aggregates | null; final?: boolean; className?: string }) {
  const card = "flex flex-col gap-4 rounded-[1.5rem] bg-card p-[1.125rem] shadow-[0_0_0_1px_rgb(17_17_34/0.05),0_1px_3px_rgb(17_17_34/0.05),0_22px_44px_-26px_rgb(0_68_102/0.32)] lg:p-6";
  if (!tally) {
    return (
      <section data-testid="live-breakdown" aria-busy="true" aria-label="Por opción" className={cn(card, className)}>
        <div className="q-skeleton h-6 w-40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="q-skeleton h-9 w-full" />
        ))}
      </section>
    );
  }
  const total = tally.totalVotes;
  const hidden = tally.options.length === 0 || tally.options.some((o) => o.count === null);
  const rows: Row[] = tally.options.map((o) => ({ id: o.id, label: o.label, count: o.count ?? 0 })).sort((a, b) => b.count - a.count);
  const top = rows[0]?.count ?? 0;
  const lead = hidden ? null : leaderOf(rows);
  const pill = (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 py-1 text-[0.75rem] font-semibold text-muted-foreground">
      <Clock className="size-3.5" aria-hidden="true" />
      {final ? "Se confirma con el verificador" : "Preliminar · se confirma al cerrar"}
    </span>
  );

  return (
    <section data-testid="live-breakdown" aria-labelledby="live-breakdown-title" className={cn(card, className)}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="live-breakdown-title" className="inline-flex flex-wrap items-center gap-2 text-small font-semibold text-muted-foreground" data-testid="live-leader" aria-live="polite">
          {hidden || !lead ? (
            <span>{final ? "Resultado" : "Por opción"}</span>
          ) : lead.kind === "lead" ? (
            <>
              {final ? "Ganó" : "Va ganando"}
              <span className="inline-grid h-9 min-w-9 place-items-center rounded-[0.625rem] bg-chart-2 px-2 font-display text-[1.25rem] font-bold text-white dark:text-background">{lead.label}</span>
              por {formatInt(lead.margin)} {lead.margin === 1 ? "voto" : "votos"}
            </>
          ) : (
            <>Empate entre {joinEs(lead.labels)}</>
          )}
        </h2>
        {pill}
      </div>

      {hidden ? (
        <div className="relative">
          <ul aria-hidden="true" className="flex flex-col gap-3 opacity-40">
            {tally.options.map((o) => (
              <li key={o.id} className="h-9 rounded-[0.625rem] bg-[#edf1f4] dark:bg-muted" />
            ))}
          </ul>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary-ink">
              <Eye className="size-6" aria-hidden="true" />
            </span>
            <p className="q-num text-[1.75rem] font-bold leading-none" aria-live="polite">
              {formatInt(Math.min(total, MIN_VOTES_FOR_BREAKDOWN))} de {MIN_VOTES_FOR_BREAKDOWN} votos
            </p>
            <div className="flex gap-1.5" aria-hidden="true">
              {Array.from({ length: MIN_VOTES_FOR_BREAKDOWN }).map((_, i) => (
                <span key={i} className={cn("h-2 w-8 rounded-full", i < total ? "bg-chart-2" : "bg-[#dbe3e9] dark:bg-muted")} />
              ))}
            </div>
            <p className="max-w-[22rem] text-small text-muted-foreground">Se publica desde {MIN_VOTES_FOR_BREAKDOWN} votos, para que nadie deduzca qué votó cada quien.</p>
          </div>
        </div>
      ) : (
        <>
          <ol className="flex flex-col gap-3 lg:gap-4" aria-hidden="true">
            {rows.map((r) => {
              const isLead = r.count === top && top > 0;
              return (
                <li key={r.id} className="grid grid-cols-[2rem_minmax(0,1fr)_4.75rem] items-center gap-3 lg:grid-cols-[minmax(3rem,auto)_minmax(0,1fr)_7rem] lg:gap-5">
                  <span className={cn("truncate text-center font-display text-[1.5rem] font-bold lg:text-[2rem]", isLead && "text-chart-2")} title={r.label}>
                    {r.label}
                  </span>
                  <span className="h-9 overflow-hidden rounded-[0.625rem] bg-[#edf1f4] dark:bg-muted lg:h-12 lg:rounded-[0.75rem]">
                    <span className={cn("block h-full rounded-[0.625rem] transition-[width] duration-700 ease-out lg:rounded-[0.75rem]", isLead ? "bg-chart-2" : "bg-[#6d8798]")} style={{ width: `${top ? (r.count / top) * 100 : 0}%` }} />
                  </span>
                  <span className="text-right leading-[1.1]">
                    <b className="q-num block text-[1.25rem] font-bold lg:text-[1.75rem]">{formatInt(r.count)}</b>
                    <small className="block text-[0.75rem] font-semibold text-muted-foreground">{formatPercent(total ? r.count / total : 0)}</small>
                  </span>
                </li>
              );
            })}
          </ol>
          <table className="sr-only">
            <caption>Votos por opción, de mayor a menor</caption>
            <thead>
              <tr>
                <th scope="col">Opción</th>
                <th scope="col">Votos</th>
                <th scope="col">Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.label}</th>
                  <td>{formatInt(r.count)}</td>
                  <td>{formatPercent(total ? r.count / total : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
