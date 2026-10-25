"use client";

import { Check, Minus, X } from "lucide-react";
import { cn } from "@/lib/client/cn";

/** Marca con la que termina un paso: ✓ hecho, «–» no evaluado, ✗ fallo detectado. */
export type StepMark = "ok" | "skip" | "fail";
export type Step = { label: string; mark: StepMark };

/** Duración mínima de cada paso: la secuencia se ve aunque la respuesta llegue antes. Exportada para tests. */
export const STEP_MS = 600;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Lista de pasos de una verificación: los pasos aparecen uno a uno; el que está en curso lleva un punto que pulsa
 * (`.q-step-dot`, apagado con `prefers-reduced-motion`) y los terminados su marca. La usan «¿Está mi voto?» y
 * «Verificar ahora». Cada etiqueta dice lo que de verdad se hizo (nunca «tu voto está en la blockchain»).
 */
export function StepList({ steps, done, finished, testId = "verify-steps", className }: { steps: Step[]; done: number; finished: boolean; testId?: string; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-small", className)} data-testid={testId} aria-label="Pasos de la comprobación">
      {steps.map((s, i) => {
        const state: "pending" | "active" | "done" = i < done ? "done" : i === done && !finished ? "active" : "pending";
        if (state === "pending") return null;
        return (
          <li key={s.label} className="q-step-in flex items-center gap-3" data-step-state={state} data-step-mark={state === "done" ? s.mark : undefined}>
            <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
              {state === "active" ? (
                <span className="q-step-dot block size-2.5 rounded-full bg-primary" />
              ) : s.mark === "ok" ? (
                <Check className="size-4 text-success-strong" strokeWidth={3} />
              ) : s.mark === "fail" ? (
                <X className="size-4 text-danger-strong" strokeWidth={3} />
              ) : (
                <Minus className="size-4 text-warning-strong" strokeWidth={3} />
              )}
            </span>
            <span className={cn(state === "active" ? "font-semibold" : "text-muted-foreground")}>
              {s.label}
              {state === "active" ? "…" : ""}
            </span>
            <span className="sr-only">{state === "active" ? "en curso" : s.mark === "ok" ? "listo" : s.mark === "fail" ? "fallo detectado" : "no evaluado"}</span>
          </li>
        );
      })}
    </ol>
  );
}
