import * as React from "react";
import { cn } from "@/lib/client/cn";

export function Glass({ className, strong, ...props }: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-glass-border shadow-card backdrop-blur-xl backdrop-saturate-150",
        strong ? "bg-glass-strong" : "bg-glass",
        className,
      )}
      {...props}
    />
  );
}
