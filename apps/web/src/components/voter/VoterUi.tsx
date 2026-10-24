import { cn } from "@/lib/client/cn";
import { Disclosure } from "@/components/ui/disclosure";

/** Contenedor del flujo del votante: texto base 18 px, una columna, cómodo a una mano desde 360 px. */
export function VoterShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("q-fade-in q-container q-narrow flex flex-col gap-5 py-5 text-heading md:py-10", className)}>{children}</div>;
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
    <Disclosure title="Detalles técnicos" testId="tech-details" className={cn("bg-card text-muted-foreground", className)} bodyClassName="flex flex-col gap-3 text-foreground">
      {children}
    </Disclosure>
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
