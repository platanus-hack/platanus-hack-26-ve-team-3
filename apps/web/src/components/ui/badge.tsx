import * as React from "react";
import { cn } from "@/lib/client/cn";

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "primary" | "warning" | "success" | "danger" }) {
  const t = {
    neutral: "bg-neutral-soft text-muted-foreground border-border",
    primary: "bg-primary-soft text-primary-soft-foreground border-transparent",
    warning: "bg-warning-soft text-warning-strong border-warning/40",
    success: "bg-success-soft text-success-strong border-success/40",
    danger: "bg-danger-soft text-danger-strong border-danger/40",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-small font-semibold", t, className)} {...props} />;
}

export function FixtureTag({ children = "ejemplo", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <Badge tone="neutral" className={className}>
      {children}
    </Badge>
  );
}
