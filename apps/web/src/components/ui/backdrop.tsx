import { cn } from "@/lib/client/cn";

export function Backdrop({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("q-grid-bg pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem]", className)} />;
}
