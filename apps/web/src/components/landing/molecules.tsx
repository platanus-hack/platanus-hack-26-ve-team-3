import * as React from "react";
import { ResultsCard } from "@/components/results/ResultsCard";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";

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
  return (
    <ResultsCard
      className={className}
      ariaLabel="Ejemplo de resultados en vivo"
      title="Fecha de la asamblea"
      live
      totalVotes={48}
      eligible={60}
      turnout={0.8}
      options={[
        { id: "sab", label: "Sábado 14", count: 30 },
        { id: "dom", label: "Domingo 15", count: 18 },
      ]}
    />
  );
}
