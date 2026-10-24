import * as React from "react";
import { cn } from "@/lib/client/cn";

export type Choice<T extends string> = { value: T; label: React.ReactNode };

export function ChoiceChips<T extends string>({ name, legend, choices, value, onChange, className }: { name: string; legend: React.ReactNode; choices: Choice<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className="mb-2 text-small font-medium text-muted-foreground">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <label key={c.value} className="cursor-pointer">
            <input type="radio" name={name} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} className="peer sr-only" />
            <span className="inline-flex min-h-tap items-center rounded-full border border-input bg-card px-4 text-body font-medium transition-colors hover:border-subtle peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-4 peer-focus-visible:ring-ring/25">
              {c.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
