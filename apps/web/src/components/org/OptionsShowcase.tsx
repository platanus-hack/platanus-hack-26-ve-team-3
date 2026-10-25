"use client";

import type { Option } from "@quorum/contracts";
import { OptionAvatar } from "@/components/results/RankedCards";
import { cn } from "@/lib/client/cn";

/**
 * Cabina mientras se vota (pantalla grande): el título de la votación y las opciones como avatares circulares grandes
 * (foto o inicial) con nombre y subtítulo. Sin números ni ranking: los resultados en vivo se ven en cada teléfono y el
 * ganador aparece al cerrar. Un vaivén suave y escalonado (CSS, apagado con `prefers-reduced-motion`).
 */
export function OptionsShowcase({ title, options, className }: { title: string; options: Option[]; className?: string }) {
  const many = options.length > 4;
  return (
    <section
      aria-label="Opciones de la votación"
      data-testid="panel-options"
      className={cn("flex flex-col gap-6 rounded-[1.5rem] bg-card p-5 shadow-[0_0_0_1px_rgb(17_17_34/0.05),0_1px_3px_rgb(17_17_34/0.05),0_22px_44px_-26px_rgb(0_68_102/0.32)] lg:gap-10 lg:p-10", className)}
    >
      <h2 className="font-display text-[1.75rem] font-bold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[2.25rem] lg:text-[3rem]">{title}</h2>
      <ul className={cn("grid gap-6 lg:gap-8", many ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3", options.length <= 2 && "sm:grid-cols-2")} aria-label="Opciones">
        {options.map((o, i) => (
          <li key={o.id} className="flex min-w-0 flex-col items-center gap-3 text-center" data-testid="panel-option">
            <span className="q-float block" style={{ animationDelay: `${(i % 5) * 0.35}s` }}>
              <OptionAvatar label={o.label} image={o.image} className={cn("size-28 border-4 border-card shadow-[0_18px_36px_-16px_rgb(0_68_102/0.45)] sm:size-32", many ? "lg:size-36" : "lg:size-44")} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="line-clamp-2 break-words font-display text-[1.125rem] font-bold leading-tight sm:text-[1.25rem] lg:text-[1.5rem]">{o.label}</span>
              {o.subtitle ? <span className="line-clamp-2 text-small text-muted-foreground lg:text-body">{o.subtitle}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[0.6875rem] text-subtle">Los resultados se ven en cada teléfono al cerrar la votación.</p>
    </section>
  );
}
