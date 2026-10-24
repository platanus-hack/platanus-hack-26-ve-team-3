import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { PHASE_LINE, phaseIndex, phaseLabel } from "@/lib/client/phases";
import type { ElectionStatus as ElectionPhase } from "@quorum/contracts";

/**
 * Línea de fases `registration → open → closed → tallying → auditable → drawn`.
 * Texto siempre visible (no sólo color); `aria-current="step"` en la fase actual; `failed` se marca en rojo con texto.
 */
export function PhaseTimeline({ phase, className }: { phase: ElectionPhase; className?: string }) {
  const current = phaseIndex(phase);
  const failed = phase === "failed";
  return (
    <nav aria-label="Fases de la votación" className={cn("w-full", className)} data-testid="phase-timeline">
      <p className="mb-2 text-small text-muted-foreground">
        Fase actual: <span className="font-semibold text-foreground">{phaseLabel[phase]}</span>
        {current >= 0 ? <span className="md:hidden"> · {current + 1} de {PHASE_LINE.length}</span> : null}
      </p>
      <ol className="flex gap-1.5 md:grid md:grid-cols-6 md:gap-2">
        {PHASE_LINE.map((p, i) => {
          const state = failed && i === current ? "failed" : i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={p.id}
              aria-current={state === "current" || state === "failed" ? "step" : undefined}
              className={cn(
                "h-1.5 flex-1 rounded-full md:flex md:h-auto md:min-h-tap md:flex-col md:justify-center md:rounded-md md:border md:px-3 md:py-2 md:text-small",
                state === "done" && "bg-success md:border-transparent md:bg-success-soft md:text-success-strong",
                state === "current" && "bg-primary md:border-primary md:bg-primary-soft md:font-semibold md:text-primary-soft-foreground md:ring-4 md:ring-ring/15",
                state === "failed" && "bg-danger md:border-danger/60 md:bg-danger-soft md:font-semibold md:text-danger-strong",
                state === "todo" && "bg-border md:border-dashed md:border-input md:bg-card/60 md:text-subtle",
              )}
            >
              <span className="sr-only md:not-sr-only md:flex md:items-center md:gap-1">
                {state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : state === "failed" ? <AlertTriangle className="size-3.5" aria-hidden="true" /> : <span className="q-mono">{i + 1}</span>}
                {p.label}
              </span>
              <span className="sr-only">{state === "done" ? " (completada)" : state === "current" ? " (actual)" : state === "failed" ? " (falló la verificación)" : " (pendiente)"}</span>
              <span className="hidden text-[0.75rem] leading-tight text-muted-foreground md:block">{p.hint}</span>
            </li>
          );
        })}
      </ol>
      {phase === "draft" ? <p className="mt-2 text-small text-muted-foreground">Borrador: la inscripción aún no ha empezado.</p> : null}
    </nav>
  );
}
