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
    <div className={cn("q-fade-in flex flex-col items-center gap-3 rounded-lg border border-border/70 bg-card px-6 py-10 text-center shadow-card", className)}>
      <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        <Inbox className="size-6" />
      </span>
      <p className="text-heading font-semibold">{title}</p>
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
