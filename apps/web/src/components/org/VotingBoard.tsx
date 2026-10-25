"use client";

import type { Aggregates } from "@quorum/contracts";
import { formatStartTime, spokenCountdown, useCountdown } from "@/lib/client/clock";
import { formatInt, formatPercent } from "@/lib/client/format";

/** Reloj siempre «H:MM:SS» (el marcador del panel), nunca negativo. */
export function hmsText(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Marcador de tiempo restante (tarjeta Corbeau): «TIEMPO RESTANTE · CIERRA 8:15 p. m.», reloj grande y barra entre la
 * apertura (`votingStartsAt`, o `startsAt` si falta) y el cierre (`endsAt`), con la hora del servidor (`offset`).
 */
export function TimeBoard({ openedAt, endsAt, offset }: { openedAt: string; endsAt: string; offset: number }) {
  const left = useCountdown(endsAt, offset, 500);
  const start = Date.parse(openedAt);
  const end = Date.parse(endsAt);
  const span = Math.max(1, end - start);
  const elapsed = left === null ? 0 : Math.min(span, Math.max(0, span - left));
  const pct = (elapsed / span) * 100;
  const totalMin = Math.round(span / 60_000);
  const elapsedMin = Math.floor(elapsed / 60_000);
  return (
    <section aria-label="Tiempo restante" className="flex flex-col gap-3.5 rounded-[1.5rem] bg-[radial-gradient(120%_140%_at_100%_0%,#1f2a44_0,#111122_55%)] px-5 pb-5 pt-[1.125rem] text-[#f0eeee] shadow-[0_24px_48px_-24px_rgb(17_17_34/0.6)] lg:p-6">
      <div className="flex items-center justify-between gap-2 text-[0.75rem] font-bold uppercase tracking-[0.07em] text-[#9698a3]">
        <span>Tiempo restante</span>
        <span>Cierra {formatStartTime(endsAt)}</span>
      </div>
      <div data-testid="org-clock" role="timer" aria-label={left !== null ? `Quedan ${spokenCountdown(Math.max(0, left))} de votación; cierra a las ${formatStartTime(endsAt)}` : "Calculando el tiempo"}>
        <span className="q-num block text-[3.5rem] font-bold leading-none tracking-[-0.03em] lg:text-[4rem]" aria-hidden="true">
          {left !== null ? hmsText(left) : "—:—"}
        </span>
        <span className="sr-only" aria-live="polite">
          {left !== null ? `Quedan ${spokenCountdown(Math.max(0, left))}` : ""}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-white/[0.12]" role="progressbar" aria-label="Tiempo transcurrido" aria-valuemin={0} aria-valuemax={totalMin} aria-valuenow={elapsedMin}>
        <i className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#ff845f] to-[#ff714e] transition-[width] duration-700" style={{ width: `${pct}%` }} />
        <b className="absolute top-1/2 -ml-[0.4375rem] -mt-[0.4375rem] size-3.5 rounded-full bg-white shadow-[0_0_0_4px_rgb(255_113_78/0.35)] transition-[left] duration-700" style={{ left: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[0.75rem] tabular-nums text-[#9698a3]">
        <span>Abrió {formatStartTime(openedAt)}</span>
        <span>
          {formatInt(elapsedMin)} de {formatInt(totalMin)} min
        </span>
        <span>{formatStartTime(endsAt)}</span>
      </div>
    </section>
  );
}

/** «Participación»: anillo + «19 de 27 votaron · 70 %» desde `GET /tally`. */
export function TurnoutCard({ tally }: { tally: Aggregates | null }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const t = tally?.turnout ?? 0;
  return (
    <section aria-label="Participación" data-testid="org-turnout" className="flex items-center gap-4 rounded-[1.5rem] bg-card p-[1.125rem] shadow-[0_0_0_1px_rgb(17_17_34/0.05),0_1px_3px_rgb(17_17_34/0.05),0_22px_44px_-26px_rgb(0_68_102/0.32)] lg:flex-col lg:items-stretch lg:p-6">
      <p className="sr-only lg:not-sr-only lg:text-[0.75rem] lg:font-bold lg:uppercase lg:tracking-[0.07em] lg:text-muted-foreground">Participación</p>
      <div className="relative size-[6.5rem] shrink-0 lg:mx-auto lg:size-[8.5rem]" aria-hidden="true">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-muted)" strokeWidth="12" />
          <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-chart-2)" strokeWidth="12" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - t)} className="transition-[stroke-dashoffset] duration-1000 ease-out" />
        </svg>
        <span className="q-num absolute inset-0 grid place-items-center text-[1.625rem] font-bold lg:text-[2.25rem]">{tally ? formatPercent(t) : "—"}</span>
      </div>
      <div className="flex flex-col gap-1 lg:text-center" aria-live="polite">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.07em] text-muted-foreground lg:hidden">Participación</p>
        <p className="text-body text-muted-foreground">
          {tally ? (
            <>
              <b className="text-foreground">{formatInt(tally.totalVotes)}</b> de <b className="text-foreground">{formatInt(tally.eligible)}</b> votaron · {formatPercent(t)}
            </>
          ) : (
            "Cargando…"
          )}
        </p>
      </div>
    </section>
  );
}
