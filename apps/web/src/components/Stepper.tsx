import { Check } from "lucide-react";
import { cn } from "@/lib/client/cn";

export type Step = { id: string; label: string };

export function Stepper({ steps, current, className }: { steps: Step[]; current: number; className?: string }) {
  return (
    <nav aria-label="Progreso" className={cn("w-full", className)}>
      <p className="mb-2 text-small text-muted-foreground md:sr-only">
        Paso {current + 1} de {steps.length}: <span className="font-semibold text-foreground">{steps[current]?.label}</span>
      </p>
      <ol className="flex items-center gap-1">
        {steps.map((step, i) => {
          const state = i < current ? "done" : i === current ? "current" : "todo";
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1" aria-current={state === "current" ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-small font-bold",
                  state === "done" && "border-success bg-success text-white",
                  state === "current" && "border-primary bg-primary text-primary-foreground shadow-primary ring-4 ring-ring/15",
                  state === "todo" && "border-border bg-card text-subtle",
                )}
              >
                {state === "done" ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                <span className="sr-only">{state === "done" ? "completado" : state === "current" ? "actual" : "pendiente"}</span>
              </span>
              <span className={cn("hidden truncate text-small md:inline", state === "current" ? "font-semibold text-foreground" : "text-muted-foreground")}>{step.label}</span>
              {i < steps.length - 1 ? <span aria-hidden="true" className={cn("h-px min-w-2 flex-1", i < current ? "bg-success" : "bg-border")} /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
