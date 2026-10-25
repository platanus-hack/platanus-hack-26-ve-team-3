"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, TriangleAlert } from "lucide-react";
import { MIN_VOTES_FOR_BREAKDOWN, type AuditResult, type ElectionStatus } from "@quorum/contracts";
import { cn } from "@/lib/client/cn";
import { formatInt, formatPercent, shortHash } from "@/lib/client/format";
import { OptionAvatar, RankedCards, rankOptions, type RankedOption } from "./RankedCards";

type Props = {
  electionId: string;
  status: ElectionStatus;
  /** Opciones con el conteo público (`count: null` = sin desglose). */
  options: { id: string; label: string; subtitle?: string; image?: string; count: number | null }[];
  totalVotes: number;
  /** Respuesta real del verificador (`GET /audit`); `null` = no llegó o no existe. Sin ella no se dice «verificado». */
  audit?: AuditResult | null;
  className?: string;
};

/** Qué muestra la pantalla de cierre según el estado y los agregados. */
export type WinnerOutcome = { kind: "failed" } | { kind: "hidden" } | { kind: "tie"; tied: RankedOption[]; rest: RankedOption[] } | { kind: "winner"; winner: RankedOption; rest: RankedOption[] };

export function winnerOutcome(status: ElectionStatus, options: Props["options"], totalVotes: number): WinnerOutcome {
  if (status === "failed") return { kind: "failed" };
  if (totalVotes < MIN_VOTES_FOR_BREAKDOWN || options.length === 0 || options.some((o) => o.count === null)) return { kind: "hidden" };
  const ranked = rankOptions(options.map((o) => ({ ...o, count: o.count ?? 0 })));
  const top = ranked[0]!.count;
  if (top === 0) return { kind: "hidden" };
  const tied = ranked.filter((o) => o.count === top);
  if (tied.length > 1) return { kind: "tie", tied, rest: ranked.filter((o) => o.count !== top) };
  return { kind: "winner", winner: ranked[0]!, rest: ranked.slice(1) };
}

const DARK = "bg-[radial-gradient(120%_140%_at_100%_0%,#1f2a44_0,#111122_55%)] text-[#f0eeee]";

/**
 * Pantalla de cierre a lo ancho sobre Corbeau (#111122): foto grande del ganador con halo, pastilla con su porcentaje,
 * nombre y subtítulo; debajo las demás opciones ordenadas. Textos honestos: «Resultado verificado» solo con la
 * respuesta real del verificador (método, versión y huella de entrada); `failed` ⇒ «Fallo detectado», sin ganador;
 * empate en el primer lugar ⇒ «Empate» sin declarar ganador; menos de 5 votos ⇒ sin desglose.
 */
export function WinnerScreen({ electionId, status, options, totalVotes, audit = null, className }: Props) {
  const outcome = winnerOutcome(status, options, totalVotes);
  const share = (n: number) => (totalVotes > 0 ? n / totalVotes : 0);
  const href = `/e/${encodeURIComponent(electionId)}`;
  const verified = status !== "failed" && audit?.valid === true;

  const verdict = (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[0.8125rem] text-[#b9bac4]">
      {verified ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.1] px-3 py-1 font-semibold text-[#f0eeee]" data-testid="winner-verdict">
          <ShieldCheck className="size-4 text-[#8fd0b5]" aria-hidden="true" /> Resultado verificado
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.1] px-3 py-1 font-semibold text-[#f0eeee]" data-testid="winner-verdict">
          Resultado publicado · pendiente de comprobar
        </span>
      )}
      {audit ? (
        <span className="q-mono text-[0.75rem]">
          {audit.protocol} · verificador {audit.verifierVersion} · entrada {shortHash(audit.inputArtifactDigest)}
        </span>
      ) : null}
    </div>
  );

  const footer = (
    <p className="text-center text-small text-[#b9bac4]">
      {formatInt(totalVotes)} {totalVotes === 1 ? "voto incluido" : "votos incluidos"} · solo totales, nunca quién votó.{" "}
      <Link href={href} className="inline-flex min-h-tap items-center gap-1 font-semibold text-[#ff8e72] underline underline-offset-4">
        Comprobar el resultado <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </p>
  );

  if (outcome.kind === "failed") {
    return (
      <section data-testid="winner-screen" data-outcome="failed" aria-labelledby="winner-title" className={cn("flex flex-col items-center gap-5 rounded-[1.75rem] px-5 py-8 md:px-10 md:py-12", DARK, className)}>
        <span className="grid size-16 place-items-center rounded-full bg-[#b4233c]/25 text-[#ff9aa8]">
          <TriangleAlert className="size-8" aria-hidden="true" />
        </span>
        <h2 id="winner-title" className="text-center font-display text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em] md:text-[2.5rem]">
          Fallo detectado
        </h2>
        <p className="max-w-[32rem] text-center text-body text-[#d6d6de]">El verificador rechazó el paquete: no hay ganador que declarar. El detalle de cada comprobación está en Transparencia.</p>
        <Link href={href} className="inline-flex min-h-tap items-center gap-2 rounded-full bg-[#f0eeee] px-5 font-semibold text-[#111122]">
          Ver en Transparencia <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  if (outcome.kind === "hidden") {
    return (
      <section data-testid="winner-screen" data-outcome="hidden" aria-labelledby="winner-title" className={cn("flex flex-col items-center gap-5 rounded-[1.75rem] px-5 py-8 md:px-10 md:py-12", DARK, className)}>
        {verdict}
        <h2 id="winner-title" className="text-center font-display text-[1.75rem] font-bold leading-[1.1] tracking-[-0.02em] md:text-[2.5rem]">
          Se publicó sin desglose
        </h2>
        <p className="max-w-[32rem] text-center text-body text-[#d6d6de]">
          Menos de {MIN_VOTES_FOR_BREAKDOWN} votos: por privacidad no se muestra el resultado por opción ni se declara ganador.
        </p>
        {footer}
      </section>
    );
  }

  const rest = outcome.rest;
  return (
    <section data-testid="winner-screen" data-outcome={outcome.kind} aria-labelledby="winner-title" className={cn("flex flex-col gap-6 rounded-[1.75rem] px-5 py-8 md:gap-8 md:px-10 md:py-12", DARK, className)}>
      {verdict}
      {outcome.kind === "winner" ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="relative grid place-items-center">
            <span aria-hidden="true" className="absolute inset-0 -m-4 rounded-full bg-[radial-gradient(circle,rgb(255_142_114/0.45)_0,rgb(255_142_114/0)_70%)] blur-sm" />
            <OptionAvatar label={outcome.winner.label} image={outcome.winner.image} tone="dark" className="relative size-32 text-[3.5rem] shadow-[0_0_0_4px_#111122,0_0_0_8px_#ff8e72] md:size-40 md:text-[4rem]" />
          </span>
          <span className="q-num inline-flex rounded-full bg-[#ff714e] px-4 py-1.5 text-[1.25rem] font-bold leading-none text-[#111122] md:text-[1.5rem]" data-testid="winner-share">
            {formatPercent(share(outcome.winner.count))}
          </span>
          <h2 id="winner-title" className="max-w-[24ch] font-display text-[2rem] font-bold leading-[1.05] tracking-[-0.03em] md:text-[3.25rem]" data-testid="winner-name">
            {outcome.winner.label}
          </h2>
          {outcome.winner.subtitle ? <p className="text-body text-[#b9bac4] md:text-[1.125rem]">{outcome.winner.subtitle}</p> : null}
          <p className="text-small text-[#b9bac4]">
            {formatInt(outcome.winner.count)} de {formatInt(totalVotes)} votos
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <h2 id="winner-title" className="font-display text-[2rem] font-bold leading-[1.05] tracking-[-0.03em] md:text-[3.25rem]" data-testid="winner-name">
            Empate
          </h2>
          <span className="q-num inline-flex rounded-full bg-white/[0.12] px-4 py-1.5 text-[1.25rem] font-bold leading-none text-[#f0eeee]" data-testid="winner-share">
            {formatPercent(share(outcome.tied[0]!.count))} cada una
          </span>
          <ul className="flex flex-wrap justify-center gap-5 md:gap-8" aria-label="Opciones empatadas en el primer lugar">
            {outcome.tied.map((o) => (
              <li key={o.id} className="flex w-[7.5rem] flex-col items-center gap-2 md:w-[10rem]">
                <OptionAvatar label={o.label} image={o.image} tone="dark" className="size-24 text-[2.5rem] shadow-[0_0_0_3px_#111122,0_0_0_6px_rgb(240_238_238/0.7)] md:size-32 md:text-[3rem]" />
                <span className="line-clamp-2 text-body font-bold leading-tight md:text-[1.125rem]">{o.label}</span>
                {o.subtitle ? <span className="line-clamp-1 text-small text-[#b9bac4]">{o.subtitle}</span> : null}
              </li>
            ))}
          </ul>
          <p className="max-w-[32rem] text-small text-[#b9bac4]">Mismo número de votos en el primer lugar: no se declara ganador. Las reglas de desempate las fija la organización.</p>
        </div>
      )}

      {rest.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="q-eyebrow text-[#9698a3]">Las demás opciones</p>
          <RankedCards options={rest} totalVotes={totalVotes} tone="dark" size="md" highlightLead={false} />
        </div>
      ) : null}
      {footer}
    </section>
  );
}
