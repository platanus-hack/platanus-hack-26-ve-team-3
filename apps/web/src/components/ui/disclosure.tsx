import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/client/cn";

export function Disclosure({ title, children, className, bodyClassName, defaultOpen }: { title: React.ReactNode; children: React.ReactNode; className?: string; bodyClassName?: string; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className={cn("group rounded-md border border-border text-small", className)}>
      <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-2 px-3 font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className={cn("border-t border-border p-3", bodyClassName)}>{children}</div>
    </details>
  );
}
