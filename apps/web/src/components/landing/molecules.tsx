import * as React from "react";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";
import { ProgressRow } from "@/components/ui/progress-row";

export function FloatingChip({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Glass strong className={cn("absolute z-10 flex items-center gap-2 rounded-full px-3.5 py-2 text-small font-semibold shadow-elevated [&_svg]:size-4", className)}>
      {icon}
      {children}
    </Glass>
  );
}

export function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="q-num text-title font-semibold leading-none">{value}</span>
      <span className="mt-1 text-small text-muted-foreground">{label}</span>
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

export function ResultsPreview({ className }: { className?: string }) {
  const options = [
    { label: "Sábado 14", share: 0.62 },
    { label: "Domingo 15", share: 0.38 },
  ];
  return (
    <Glass strong className={cn("rounded-xl p-6 shadow-elevated", className)} aria-label="Ejemplo de resultados en vivo">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-small font-semibold text-primary-ink">
          <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" />
          En vivo
        </span>
        <span className="q-num text-small text-muted-foreground">48 / 60</span>
      </div>
      <p className="mt-4 text-heading font-semibold">Fecha de la asamblea</p>
      <p className="q-num mt-4 text-[3rem] font-semibold leading-none">80%</p>
      <p className="text-small text-muted-foreground">participación</p>
      <ul className="mt-5 flex flex-col gap-3">
        {options.map((o, i) => (
          <li key={o.label}>
            <ProgressRow label={o.label} value={<span className="font-semibold text-foreground">{Math.round(o.share * 100)}%</span>} share={o.share} color={i === 0 ? undefined : "var(--color-primary-muted)"} delay={300 + i * 120} />
          </li>
        ))}
      </ul>
    </Glass>
  );
}
