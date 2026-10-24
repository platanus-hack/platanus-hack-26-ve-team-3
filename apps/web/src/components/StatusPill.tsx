import { CheckCircle2, CircleDashed, CircleHelp, Inbox, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/client/cn";

/** Estados honestos de la spec. `verificado` sólo lo pinta la pantalla del auditor con `valid === true` del verificador real. */
export type HonestStatus = "pendiente" | "recibido" | "incluido" | "verificado" | "no verificable" | "fallo detectado";

const styles: Record<HonestStatus, { cls: string; icon: React.ReactNode }> = {
  pendiente: { cls: "bg-neutral-soft text-muted-foreground border-border", icon: <CircleDashed aria-hidden="true" /> },
  recibido: { cls: "bg-neutral-soft text-foreground border-border", icon: <Inbox aria-hidden="true" /> },
  incluido: { cls: "bg-success-soft text-success-strong border-success/40", icon: <CheckCircle2 aria-hidden="true" /> },
  verificado: { cls: "bg-success-soft text-success-strong border-success/60", icon: <ShieldCheck aria-hidden="true" /> },
  "no verificable": { cls: "bg-warning-soft text-warning-strong border-warning/50", icon: <CircleHelp aria-hidden="true" /> },
  "fallo detectado": { cls: "bg-danger-soft text-danger-strong border-danger/50", icon: <XCircle aria-hidden="true" /> },
};

export function StatusPill({ status, className, size = "md" }: { status: HonestStatus; className?: string; size?: "sm" | "md" | "lg" }) {
  const s = styles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold",
        size === "lg" ? "px-3 py-1.5 text-body [&_svg]:size-5" : size === "sm" ? "gap-1 px-2 py-0.5 text-[0.6875rem] [&_svg]:size-3.5" : "px-2.5 py-0.5 text-small [&_svg]:size-4",
        s.cls,
        className,
      )}
    >
      {s.icon}
      <span className="inline-block first-letter:uppercase">{status}</span>
    </span>
  );
}
