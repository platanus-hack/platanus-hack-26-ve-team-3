import * as React from "react";
import { cn } from "@/lib/client/cn";

export function PageHeader({ title, description, meta, children, className }: { title: React.ReactNode; description?: React.ReactNode; meta?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <h1 className="font-display text-[1.75rem] font-bold leading-[1.08] tracking-[-0.03em] md:text-[2.5rem]">{title}</h1>
      {description ? <p className="max-w-prose text-body text-muted-foreground">{description}</p> : null}
      {meta ? <p className="text-small text-muted-foreground">{meta}</p> : null}
      {children}
    </header>
  );
}

export function ActionBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid auto-cols-fr grid-flow-col gap-2 sm:flex", className)}>{children}</div>;
}
