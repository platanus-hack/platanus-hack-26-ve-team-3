import { Check } from "lucide-react";
import { cn } from "@/lib/client/cn";

export function SuccessMark({ className, small = false }: { className?: string; small?: boolean }) {
  return (
    <span aria-hidden="true" className={cn("grid place-items-center rounded-full bg-success-soft text-success-strong", small ? "size-14" : "size-20", className)}>
      <Check className={small ? "size-7" : "size-10"} strokeWidth={2.5} />
    </span>
  );
}
