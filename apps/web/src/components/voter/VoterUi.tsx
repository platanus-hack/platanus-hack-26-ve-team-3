import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/client/cn";

/** Contenedor del flujo del votante: texto base 18 px, una columna, cómodo a una mano desde 360 px. */
export function VoterShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("q-container q-narrow flex flex-col gap-5 py-5 text-heading md:py-10", className)}>{children}</div>;
}

/** "Paso 1 de 2": texto + barra. Sólo la inscripción tiene pasos; el voto es una pantalla. */
export function StepIndicator({ current, total = 2 }: { current: number; total?: number }) {
  return (
    <div data-testid="step-indicator">
      <p className="text-base font-semibold text-muted-foreground">
        Paso {current} de {total}
      </p>
      <div className="mt-1 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < current ? "bg-primary" : "bg-primary-muted/50")} />
        ))}
      </div>
    </div>
  );
}

/** Todo lo técnico vive aquí (para quien audite). Cerrado por defecto. */
export function TechDetails({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <details className={cn("group rounded-md border border-border bg-card", className)} data-testid="tech-details">
      <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-2 px-3 text-base font-semibold text-muted-foreground [&::-webkit-details-marker]:hidden">
        Detalles técnicos <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-border p-3 text-small">{children}</div>
    </details>
  );
}

export function TechRow({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <div className="q-mono break-all font-semibold" data-testid={testId}>
        {children}
      </div>
    </div>
  );
}
