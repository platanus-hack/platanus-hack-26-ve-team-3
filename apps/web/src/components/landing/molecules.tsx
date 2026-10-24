import * as React from "react";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";

export function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="mt-1 text-small text-muted-foreground">{label}</dt>
      <dd className="q-num text-title font-semibold leading-none">{value}</dd>
    </div>
  );
}

export function StepCard({ n, icon, title, body, className }: { n: number; icon: React.ReactNode; title: string; body: string; className?: string }) {
  return (
    <Glass className={cn("flex flex-col gap-3 p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-elevated", className)}>
      <div className="flex items-center justify-between">
        <span className="grid size-11 place-items-center rounded-md bg-primary-soft text-primary-soft-foreground [&_svg]:size-5">{icon}</span>
        <span className="q-num text-heading text-subtle">0{n}</span>
      </div>
      <h3 className="text-heading font-semibold">{title}</h3>
      <p className="text-body text-muted-foreground">{body}</p>
    </Glass>
  );
}
