import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/client/cn";

type Tone = "info" | "success" | "warning" | "danger";

const tones: Record<Tone, { box: string; icon: React.ReactNode; prefix: string }> = {
  info: { box: "border-border bg-neutral-soft text-foreground", icon: <Info aria-hidden="true" />, prefix: "Nota" },
  success: { box: "border-success/40 bg-success-soft text-foreground", icon: <CheckCircle2 aria-hidden="true" />, prefix: "Listo" },
  warning: { box: "border-warning/50 bg-warning-soft text-foreground", icon: <AlertTriangle aria-hidden="true" />, prefix: "Atención" },
  danger: { box: "border-danger/50 bg-danger-soft text-foreground", icon: <XCircle aria-hidden="true" />, prefix: "Error" },
};

export function Alert({ tone = "info", title, children, className, role }: { tone?: Tone; title?: string; children?: React.ReactNode; className?: string; role?: "alert" | "status" }) {
  const t = tones[tone];
  return (
    <div role={role ?? (tone === "danger" ? "alert" : "status")} className={cn("flex gap-3 rounded-md border p-4 text-body [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0", t.box, className)}>
      {t.icon}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title ?? t.prefix}</p>
        {children ? <div className="mt-1 text-small text-muted-foreground [&_a]:underline">{children}</div> : null}
      </div>
    </div>
  );
}
