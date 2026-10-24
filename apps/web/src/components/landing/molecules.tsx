import * as React from "react";
import { ResultsCard } from "@/components/results/ResultsCard";
import { Glass } from "@/components/ui/glass";
import { CountTo } from "./count";
import { cn } from "@/lib/client/cn";

export function FloatingChip({ icon, children, className }: { icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Glass strong className={cn("absolute z-10 flex items-center gap-2 rounded-full px-3.5 py-2 text-small font-semibold shadow-elevated [&_svg]:size-4", className)}>
      {icon}
      {children}
    </Glass>
  );
}

export function StatItem({ value, from, label, delay }: { value: number; from: number; label: string; delay?: number }) {
  return (
    <div className="flex flex-col-reverse justify-end">
      <dt className="mt-1 text-small text-muted-foreground">{label}</dt>
      <dd className="q-num text-title font-semibold leading-none tabular-nums">
        <CountTo from={from} to={value} delay={delay} />
      </dd>
    </div>
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
