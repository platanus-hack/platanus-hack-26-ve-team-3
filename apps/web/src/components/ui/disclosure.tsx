import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/client/cn";

type Props = { title: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; defaultOpen?: boolean; variant?: "box" | "link"; testId?: string };

export function Disclosure({ title, children, className, bodyClassName, defaultOpen, variant = "box", testId }: Props) {
  if (variant === "link") {
    return (
      <details open={defaultOpen} className={cn("group", className)} data-testid={testId}>
        <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-1 text-body font-semibold text-primary-ink underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          {title}
          <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className={cn("mt-2", bodyClassName)}>{children}</div>
      </details>
    );
  }
  return (
    <details open={defaultOpen} className={cn("group rounded-md border border-border text-small", className)} data-testid={testId}>
      <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className={cn("border-t border-border p-3", bodyClassName)}>{children}</div>
    </details>
  );
}
