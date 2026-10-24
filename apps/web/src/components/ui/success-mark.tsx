import { Check } from "lucide-react";
import { cn } from "@/lib/client/cn";

export function SuccessMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid size-20 place-items-center rounded-full bg-success-soft text-success-strong", className)}>
      <Check className="size-10" strokeWidth={2.5} />
    </span>
  );
}
