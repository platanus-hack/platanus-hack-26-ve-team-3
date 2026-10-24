import * as React from "react";
import { cn } from "@/lib/client/cn";

export function Stat({ label, value, hint, className }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <dt className="q-eyebrow">{label}</dt>
      <dd className="q-num text-[1.75rem] font-semibold leading-none">{value}</dd>
      {hint ? <dd className="text-small text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

export function StatGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-5", className)}>{children}</dl>;
}
