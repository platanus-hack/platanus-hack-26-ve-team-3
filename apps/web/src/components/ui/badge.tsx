import * as React from "react";
import { cn } from "@/lib/client/cn";

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "warning" | "success" | "danger" }) {
  const t = {
    neutral: "bg-neutral-soft text-muted-foreground border-border",
    warning: "bg-warning-soft text-warning-strong border-warning/40",
    success: "bg-success-soft text-success-strong border-success/40",
    danger: "bg-danger-soft text-danger-strong border-danger/40",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-small font-semibold", t, className)} {...props} />;
}

/** Etiqueta obligatoria para datos de ejemplo. */
export function FixtureTag({ children = "fixture" }: { children?: React.ReactNode }) {
  return (
    <Badge tone="warning" className="q-mono uppercase tracking-wide">
      {children}
    </Badge>
  );
}
