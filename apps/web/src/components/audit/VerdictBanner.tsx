import { CircleHelp, ShieldCheck, XCircle } from "lucide-react";
import type { HonestStatus } from "@/components/StatusPill";
import { cn } from "@/lib/client/cn";

/**
 * Veredicto grande, legible en proyector y en un teléfono de 360 px. Solo recibe el estado ya derivado del
 * `AuditResult` del verificador (o "no verificable" si el verificador no pudo correr). Nunca de un booleano local.
 */
export function VerdictBanner({ status, title, children, testId = "verdict-banner" }: { status: Extract<HonestStatus, "verificado" | "no verificable" | "fallo detectado">; title?: string; children?: React.ReactNode; testId?: string }) {
  const s = {
    verificado: { cls: "border-success/60 bg-success-soft text-success-strong", icon: <ShieldCheck aria-hidden="true" />, label: "Verificado" },
    "no verificable": { cls: "border-warning/60 bg-warning-soft text-warning-strong", icon: <CircleHelp aria-hidden="true" />, label: "No verificable" },
    "fallo detectado": { cls: "border-danger/60 bg-danger-soft text-danger-strong", icon: <XCircle aria-hidden="true" />, label: "Fallo detectado" },
  }[status];
  return (
    <div role="status" aria-live="polite" data-testid={testId} data-status={status} className={cn("flex flex-col gap-2 rounded-lg border-2 p-4 md:p-6", s.cls)}>
      <p className="flex items-center gap-3 text-[1.75rem] leading-tight font-extrabold uppercase tracking-wide md:text-[2.75rem] [&_svg]:size-8 md:[&_svg]:size-12 [&_svg]:shrink-0">
        {s.icon}
        <span>{s.label}</span>
      </p>
      {title ? <p className="text-heading font-bold text-foreground">{title}</p> : null}
      {children ? <div className="text-body text-foreground">{children}</div> : null}
    </div>
  );
}
