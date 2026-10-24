import { Inbox } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/client/cn";

export function LoadingState({ label = "Cargando…", className, lines = 3 }: { label?: string; className?: string; lines?: number }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2 text-small text-muted-foreground">
        <span className="q-spinner" aria-hidden="true" />
        {label}
      </div>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="q-skeleton h-4" style={{ width: `${90 - i * 15}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action, className }: { title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center", className)}>
      <Inbox className="size-8 text-subtle" aria-hidden="true" />
      <p className="text-heading font-bold">{title}</p>
      {children ? <div className="max-w-prose text-small text-muted-foreground">{children}</div> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title = "No se pudo cargar", message, onRetry, children, className }: { title?: string; message: string; onRetry?: () => void; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Alert tone="danger" title={title}>
        {message}
      </Alert>
      <div className="flex flex-wrap gap-2">
        {onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        ) : null}
        {children}
      </div>
    </div>
  );
}
