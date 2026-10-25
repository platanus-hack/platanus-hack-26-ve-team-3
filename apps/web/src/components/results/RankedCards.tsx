"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/client/cn";
import { formatInt, formatPercent } from "@/lib/client/format";
import { optionInitial } from "@/lib/client/optionImage";

/** Opción con su conteo público (ya cruzada por `id` con las opciones de la elección para traer `subtitle` e `image`). */
export type RankedOption = { id: string; label: string; subtitle?: string; image?: string; count: number };

type Props = {
  options: RankedOption[];
  totalVotes: number;
  size?: "md" | "lg";
  /** `dark`: sobre fondo Corbeau (pantalla de ganador). */
  tone?: "light" | "dark";
  /** Cuando la pantalla ya ofrece una tabla para lectores de pantalla (p. ej. LiveBreakdown), las tarjetas se ocultan al lector. */
  ariaHidden?: boolean;
  /** `false` cuando la lista no incluye al primer lugar (p. ej. «las demás» bajo el ganador): nadie se marca como líder. */
  highlightLead?: boolean;
  className?: string;
};

/** Cada cuánto rotan las opciones empatadas (ms). */
export const TIE_ROTATE_MS = 4000;
/** Duración del deslizamiento de una tarjeta a su nueva posición (ms). */
export const SLIDE_MS = 500;

/**
 * Orden de mayor a menor (estable por la posición original) y, dentro de cada grupo empatado, rotación cíclica según
 * `tick` para que las empatadas se turnen el puesto. Sin empates `tick` no cambia nada.
 */
export function rankOptions<T extends { count: number }>(options: T[], tick = 0): T[] {
  const sorted = options.map((o, i) => ({ o, i })).sort((a, b) => b.o.count - a.o.count || a.i - b.i);
  const out: T[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j]!.o.count === sorted[i]!.o.count) j++;
    const group = sorted.slice(i, j).map((x) => x.o);
    const n = group.length;
    const shift = n > 1 ? tick % n : 0;
    for (let k = 0; k < n; k++) out.push(group[(k + shift) % n]!);
    i = j;
  }
  return out;
}

export const hasTies = (options: { count: number }[]) => {
  const seen = new Set<number>();
  for (const o of options) {
    if (seen.has(o.count)) return true;
    seen.add(o.count);
  }
  return false;
};

function reducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Avatar redondo: foto (data URI de la elección) o inicial sobre aqua suave. Decorativo: el nombre va al lado. */
export function OptionAvatar({ label, image, className, tone = "light" }: { label: string; image?: string; className?: string; tone?: "light" | "dark" }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element -- data URI ya comprimida en el teléfono (192 px); next/image no aplica.
    <img src={image} alt="" className={cn("shrink-0 rounded-full object-cover", className)} draggable={false} />
  ) : (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-full font-display font-bold", tone === "dark" ? "bg-white/[0.12] text-white" : "bg-primary-soft text-primary-ink", className)}>
      {optionInitial(label)}
    </span>
  );
}

/**
 * Tarjetas verticales ordenadas por votos (mayor a menor): avatar, nombre, subtítulo, porcentaje grande y barra de
 * proporción. Cuando el orden cambia entre dos actualizaciones del tally, las tarjetas se deslizan a su nueva posición
 * (FLIP manual: se mide la posición antes y después y se anima `transform`). Las empatadas se turnan el puesto cada
 * `TIE_ROTATE_MS`. Con `prefers-reduced-motion` no hay deslizamiento (regla global en globals.css y chequeo aquí).
 */
export function RankedCards({ options, totalVotes, size = "md", tone = "light", ariaHidden = false, highlightLead = true, className }: Props) {
  const [tick, setTick] = useState(0);
  const tied = hasTies(options);
  const ranked = rankOptions(options, tick);
  const top = ranked[0]?.count ?? 0;
  const share = (n: number) => (totalVotes > 0 ? n / totalVotes : 0);
  const nodes = useRef(new Map<string, HTMLLIElement>());
  const rects = useRef(new Map<string, DOMRect>());

  useEffect(() => {
    if (!tied) return;
    const t = window.setInterval(() => setTick((x) => x + 1), TIE_ROTATE_MS);
    return () => window.clearInterval(t);
  }, [tied]);

  // FLIP: antes de pintar el nuevo orden ya conocemos las posiciones viejas (rects); invertimos y dejamos que la transición las lleve.
  useLayoutEffect(() => {
    const prev = rects.current;
    const next = new Map<string, DOMRect>();
    const animate = !reducedMotion();
    nodes.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      next.set(id, r);
      const was = prev.get(id);
      if (!was || !animate) return;
      const dy = was.top - r.top;
      const dx = was.left - r.left;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetHeight; // fuerza el cálculo de estilos con el transform invertido
      el.style.transition = `transform ${SLIDE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      el.style.transform = "";
    });
    rects.current = next;
  });

  const lg = size === "lg";
  const dark = tone === "dark";

  return (
    <ol
      data-testid="ranked-cards"
      aria-hidden={ariaHidden || undefined}
      aria-label={ariaHidden ? undefined : "Opciones por votos, de mayor a menor"}
      className={cn("flex flex-col", lg ? "gap-3 md:gap-4" : "gap-2.5", className)}
    >
      {ranked.map((o, i) => {
        const lead = highlightLead && top > 0 && o.count === top;
        const pct = share(o.count);
        return (
          <li
            key={o.id}
            ref={(el) => {
              if (el) nodes.current.set(o.id, el);
              else nodes.current.delete(o.id);
            }}
            data-testid="ranked-card"
            data-option-id={o.id}
            data-rank={i + 1}
            data-lead={lead || undefined}
            className={cn(
              "q-ranked-card relative flex flex-col rounded-[1.25rem] will-change-transform",
              lg ? "gap-3 p-4 md:gap-3.5 md:p-5" : "gap-2.5 p-3.5",
              dark
                ? cn("bg-white/[0.06] text-[#f0eeee]", lead && "bg-white/[0.1] shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.28)]")
                : cn("bg-card shadow-[0_0_0_1px_rgb(17_17_34/0.06)]", lead && "shadow-[0_0_0_1.5px_var(--color-primary-ink),0_12px_28px_-18px_rgb(0_68_102/0.45)]"),
            )}
          >
            <div className={cn("flex items-center", lg ? "gap-3.5 md:gap-4" : "gap-3")}>
              <OptionAvatar label={o.label} image={o.image} tone={tone} className={lg ? "size-14 text-[1.5rem] md:size-16 md:text-[1.75rem]" : "size-11 text-[1.25rem]"} />
              <div className="min-w-0 flex-1">
                <p className={cn("line-clamp-2 break-words font-bold leading-tight", lg ? "text-[1.125rem] md:text-[1.375rem]" : "text-body")}>{o.label}</p>
                {o.subtitle ? <p className={cn("truncate", lg ? "text-small md:text-body" : "text-small", dark ? "text-[#b9bac4]" : "text-muted-foreground")}>{o.subtitle}</p> : null}
                <span className="sr-only">
                  {" "}
                  — {formatInt(o.count)} {o.count === 1 ? "voto" : "votos"}
                </span>
              </div>
              <span className={cn("q-num shrink-0 font-bold leading-none", lg ? "text-[2rem] md:text-[2.5rem]" : "text-[1.5rem]", dark ? (lead ? "text-[#ff8e72]" : "text-white") : "text-primary-ink")}>
                {formatPercent(pct)}
              </span>
            </div>
            <span aria-hidden="true" className={cn("block h-1.5 overflow-hidden rounded-full", dark ? "bg-white/[0.12]" : "bg-[#edf1f4]")}>
              <span
                className={cn("block h-full rounded-full transition-[width] duration-700 ease-out", dark ? (lead ? "bg-[#ff8e72]" : "bg-white/70") : lead ? "bg-primary-ink" : "bg-[#6d8798]")}
                style={{ width: `${pct * 100}%` }}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
