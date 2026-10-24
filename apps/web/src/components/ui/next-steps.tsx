import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/client/cn";

export type NextStep = { label: React.ReactNode; hint?: React.ReactNode; state: "done" | "current" | "todo" };

export function NextSteps({ steps, className }: { steps: NextStep[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {steps.map((s, i) => (
        <li key={i} className="relative flex gap-3 pb-5 last:pb-0" aria-current={s.state === "current" ? "step" : undefined}>
          {i < steps.length - 1 ? <span aria-hidden="true" className={cn("absolute left-[0.9375rem] top-8 h-[calc(100%-2rem)] w-0.5", s.state === "done" ? "bg-success" : "bg-border")} /> : null}
          <span
            aria-hidden="true"
            className={cn(
              "relative grid size-8 shrink-0 place-items-center rounded-full text-small font-semibold",
              s.state === "done" && "bg-success-soft text-success-strong",
              s.state === "current" && "bg-accent text-primary-foreground ring-4 ring-accent/25",
              s.state === "todo" && "bg-muted text-subtle",
            )}
          >
            {s.state === "done" ? <Check className="size-4" strokeWidth={3} /> : s.state === "current" ? <span className="size-2.5 animate-pulse rounded-full bg-current" /> : i + 1}
          </span>
          <span className="flex min-w-0 flex-col pt-1 text-left">
            <span className={cn("text-body", s.state === "todo" ? "text-muted-foreground" : "font-semibold")}>{s.label}</span>
            {s.hint ? <span className="text-small text-muted-foreground">{s.hint}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
