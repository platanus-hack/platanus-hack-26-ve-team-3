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
      </p>
      <ol className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {PHASE_LINE.map((p, i) => {
          const state = failed && i === current ? "failed" : i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li
              key={p.id}
              aria-current={state === "current" || state === "failed" ? "step" : undefined}
              className={cn(
                "flex min-h-tap flex-col justify-center rounded-md border px-3 py-2 text-small",
                state === "done" && "border-transparent bg-success-soft text-success-strong",
                state === "current" && "border-primary bg-primary-soft font-semibold text-primary-soft-foreground ring-4 ring-ring/15",
                state === "failed" && "border-danger/60 bg-danger-soft font-semibold text-danger-strong",
                state === "todo" && "border-dashed border-input bg-card/60 text-subtle",
              )}
            >
              <span className="flex items-center gap-1">
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
