"use client";

import { useEffect, useState } from "react";
import { Clock, Trophy } from "lucide-react";
import { MIN_VOTES_FOR_BREAKDOWN } from "@quorum/contracts";
import { Glass } from "@/components/ui/glass";
import { ProgressRow } from "@/components/ui/progress-row";
import { cn } from "@/lib/client/cn";
import { formatCountdown, formatInt, formatPercent } from "@/lib/client/format";
import { rankColor } from "./series";

export type ResultOption = { id: string; label: string; count: number | null };

type Props = {
  options: ResultOption[];
  totalVotes: number;
  eligible: number;
  turnout: number;
  live: boolean;
  statusLabel?: string;
  title?: string;
  className?: string;
  ariaLabel?: string;
  closesAt?: string;
  /** Oculta la lista por opción (barras) cuando otra pieza de la página ya la muestra, p. ej. las tarjetas con foto de /live. La tabla accesible se conserva. */
  compact?: boolean;
  /** Contenido que va DENTRO de la misma carta, debajo de los totales (p. ej. las tarjetas por opción con foto): así todo se mueve junto. */
  children?: React.ReactNode;
};

function useCountdown(closesAt: string | undefined) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!closesAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [closesAt]);
  if (!closesAt || now === null) return null;
  const ms = new Date(closesAt).getTime() - now;
  return ms > 0 ? formatCountdown(ms) : null;
}

export function ResultsCard({ options, totalVotes, eligible, turnout, live, statusLabel, title, className, ariaLabel, closesAt, compact = false, children }: Props) {
  const left = useCountdown(live ? closesAt : undefined);
  const hidden = options.some((o) => o.count === null);
  const ranked = options
    .map((o) => ({ ...o, votes: o.count ?? 0 }))
    .sort((a, b) => b.votes - a.votes)
    .map((o, i) => ({ ...o, color: rankColor(i) }));
  const missing = Math.max(0, MIN_VOTES_FOR_BREAKDOWN - totalVotes);
  const leader = !hidden && totalVotes > 0 && ranked[0] && ranked[0].votes > (ranked[1]?.votes ?? -1) ? ranked[0] : null;
  const share = (n: number) => (totalVotes ? n / totalVotes : 0);

  return (
    <Glass strong className={cn("rounded-xl p-6 shadow-elevated md:p-8", className)} aria-label={ariaLabel}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-small font-semibold text-primary-ink">
          {live ? <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-accent" /> : null}
          {live ? "En vivo" : statusLabel}
        </span>
        {left ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-small font-semibold">
            <Clock aria-hidden="true" className="size-3.5" />
            Cierra en <span className="q-num">{left}</span>
          </span>
        ) : null}
      </div>
      {title ? <p className="mt-4 line-clamp-2 text-heading font-semibold">{title}</p> : null}

      <dl className="mt-5 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <dt className="q-eyebrow">Participación</dt>
          <dd className="q-num mt-1 text-[2.75rem] font-semibold leading-none md:text-[3.5rem]">{formatPercent(turnout)}</dd>
          <dd className="q-num mt-1 text-small text-muted-foreground">
            {formatInt(totalVotes)} de {formatInt(eligible)} votos
          </dd>
        </div>
        {leader ? (
          <div className="min-w-0">
            <dt className="q-eyebrow">{live ? "Va ganando" : "Más votada"}</dt>
            <dd className="mt-1 flex flex-col">
              {live ? (
                <>
                  {/* En vivo: el nombre manda y el porcentaje va pequeño, para que no se lea como un resultado final. */}
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-heading font-bold leading-tight">
                    <Trophy aria-hidden="true" className="size-5 shrink-0 text-primary-ink" />
                    <span className="line-clamp-2 break-words">{leader.label}</span>
                  </span>
                  <span className="q-num mt-1 text-small text-muted-foreground">{formatPercent(share(leader.votes))} de los votos · preliminar</span>
                </>
              ) : (
                <>
                  <span className="q-num text-[2rem] font-semibold leading-none md:text-[2.5rem]">{formatPercent(share(leader.votes))}</span>
                  <span className="mt-1 inline-flex min-w-0 items-center gap-1.5 text-body font-medium">
                    <Trophy aria-hidden="true" className="size-4 shrink-0 text-primary-ink" />
                    <span className="truncate">{leader.label}</span>
                  </span>
                </>
              )}
            </dd>
          </div>
        ) : null}
      </dl>

      {children ? (
        <div className="mt-6 flex flex-col gap-3 border-t border-border pt-5" data-testid="results-children">
          <p className="q-eyebrow">Por opción · {live ? "preliminar, se confirma al cerrar" : "se confirma con el verificador"}</p>
          {children}
        </div>
      ) : null}

      {hidden ? (
        <div className="mt-6 rounded-md bg-muted p-4">
          <p className="text-body font-semibold">{missing > 0 ? `Faltan ${missing} ${missing === 1 ? "voto" : "votos"} para ver el desglose` : "El desglose se publica por lotes de votos"}</p>
          <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-card">
            <div className="q-grow h-full rounded-full bg-accent" style={{ width: `${(Math.min(totalVotes, MIN_VOTES_FOR_BREAKDOWN) / MIN_VOTES_FOR_BREAKDOWN) * 100}%` }} />
          </div>
          <p className="mt-2 text-small text-muted-foreground">Por privacidad se muestra desde {MIN_VOTES_FOR_BREAKDOWN} votos.</p>
        </div>
      ) : (
        <>
          <div aria-hidden="true" className="mt-6 flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted" hidden={Boolean(children)}>
            {ranked
              .filter((o) => o.votes > 0)
              .map((o, i) => (
                <span key={o.id} className="q-grow h-full" style={{ flexGrow: o.votes, background: o.color, animationDelay: `${i * 80}ms` }} />
              ))}
          </div>
          <ul className="mt-6 flex flex-col gap-4 border-t border-border pt-5" aria-hidden="true" hidden={compact}>
            {ranked.map((o, i) => (
              <li key={o.id}>
                <ProgressRow
                  label={
                    <span className={cn("inline-flex items-center gap-2", o === leader && "font-semibold")}>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: o.color }} />
                      {o.label}
                    </span>
                  }
                  value={
                    <>
                      <span className="text-body font-semibold text-foreground">{formatPercent(share(o.votes))}</span> · {formatInt(o.votes)}
                    </>
                  }
                  share={share(o.votes)}
                  color={o.color}
                  delay={200 + i * 80}
                />
              </li>
            ))}
          </ul>
          <table className="sr-only">
            <caption>Votos por opción</caption>
            <thead>
              <tr>
                <th scope="col">Opción</th>
                <th scope="col">Votos</th>
                <th scope="col">Porcentaje</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((o) => (
                <tr key={o.id}>
                  <th scope="row">{o.label}</th>
                  <td>{o.votes}</td>
                  <td>{formatPercent(share(o.votes))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Glass>
  );
}
