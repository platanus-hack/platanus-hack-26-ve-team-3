"use client";

import { useId } from "react";
import type { Option } from "@/lib/client/types";
import { cn } from "@/lib/client/cn";

/**
 * Boleta: 2–4 opciones como radio group accesible (teclado, labels reales, ≥44px).
 * No guarda nada: el padre decide cuándo confirmar.
 */
export function Ballot({ title, options, value, onChange, disabled }: { title: string; options: Option[]; value: string | null; onChange: (id: string) => void; disabled?: boolean }) {
  const groupId = useId();
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 text-heading font-bold">{title}</legend>
      {options.map((opt, i) => {
        const id = `${groupId}-${opt.id}`;
        const selected = value === opt.id;
        return (
          <label
            key={opt.id}
            htmlFor={id}
            className={cn(
              "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border bg-card p-3 transition-colors",
              selected ? "border-primary ring-2 ring-ring/40" : "border-border hover:bg-muted",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <input id={id} type="radio" name={groupId} value={opt.id} checked={selected} onChange={() => onChange(opt.id)} className="size-5 shrink-0 accent-[var(--color-primary)]" />
            <span className="flex-1 text-body">
              <span className="mr-2 q-mono text-small text-subtle">{String.fromCharCode(65 + i)}</span>
              {opt.label}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
