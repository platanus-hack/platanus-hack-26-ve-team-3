import * as React from "react";
import { cn } from "@/lib/client/cn";

export function ProgressRow({ label, value, share, color, delay = 0, className }: { label: React.ReactNode; value: React.ReactNode; share: number; color?: string; delay?: number; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-body font-medium">{label}</span>
        <span className="q-num shrink-0 text-small text-muted-foreground">{value}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("q-grow h-full rounded-full", !color && "bg-accent")} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: color, animationDelay: `${delay}ms` }} />
      </div>
    </div>
  );
}
