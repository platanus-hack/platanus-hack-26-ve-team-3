import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/client/cn";

export function CheckList({ items, tone = "yes", className }: { items: React.ReactNode[]; tone?: "yes" | "no"; className?: string }) {
  const Icon = tone === "yes" ? Check : Minus;
  return (
    <ul className={cn("space-y-3", tone === "no" && "text-muted-foreground", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0 rounded-full p-0.5", tone === "yes" ? "bg-success-soft text-success-strong" : "bg-muted")} />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
