import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/client/cn";

type Props = {
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  tone?: "primary" | "danger";
  warnings?: string[];
  warningTestId?: string;
  confirmTestId?: string;
  className?: string;
};

export function ConfirmInline({ message, confirmLabel, onConfirm, onCancel, loading, tone = "primary", warnings = [], warningTestId, confirmTestId, className }: Props) {
  return (
    <div className={cn("q-fade-in flex flex-col gap-3 rounded-md bg-muted p-4", className)}>
      {warnings.map((w) => (
        <p key={w} className="text-small font-semibold text-warning-strong" data-testid={warningTestId}>
          {w}
        </p>
      ))}
      <p className="text-body">{message}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading} data-testid={confirmTestId}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
