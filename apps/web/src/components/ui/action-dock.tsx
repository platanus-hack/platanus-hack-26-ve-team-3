import * as React from "react";
import { cn } from "@/lib/client/cn";

export function ActionDock({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("sticky bottom-0 z-20 -mx-4 flex gap-2 border-t border-border/70 bg-background/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md md:static md:mx-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none", className)}>
      {children}
    </div>
  );
}
