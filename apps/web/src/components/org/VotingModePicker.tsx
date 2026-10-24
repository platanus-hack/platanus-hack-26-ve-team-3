"use client";

import type { VotingMode } from "@quorum/contracts";
import { Badge } from "@/components/ui/badge";

/** D-23: "¿Cuándo se vota?" — asistente de creación. El modo continuo es el predeterminado. */
export const VOTING_MODES: { id: VotingMode; label: string; cost: string; badge?: string }[] = [
  { id: "continuous", label: "Al instante", cost: "Se inscriben y votan en el momento.", badge: "Recomendado para eventos" },
  { id: "phased", label: "Con hora de inicio", cost: "Primero se inscriben todos; la votación empieza a la hora que elijas o cuando la abras." },
];

export const votingModeLabel: Record<VotingMode, string> = { continuous: "Al instante (se inscriben y votan en el momento)", phased: "Con hora de inicio (primero se inscriben todos)" };

export function VotingModePicker({ value, onChange, idPrefix = "mode" }: { value: VotingMode; onChange: (m: VotingMode) => void; idPrefix?: string }) {
  return (
    <fieldset className="flex flex-col gap-2" data-testid="voting-mode-picker">
      <legend className="mb-2 text-small font-medium text-muted-foreground">¿Cuándo se vota?</legend>
      {VOTING_MODES.map((m) => (
        <label key={m.id} className={`flex min-h-tap cursor-pointer items-start gap-3 rounded-md border bg-card p-4 transition-colors ${value === m.id ? "border-foreground shadow-card" : "border-border hover:border-subtle"}`}>
          <input type="radio" name={`${idPrefix}-voting`} value={m.id} checked={value === m.id} onChange={() => onChange(m.id)} className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]" />
          <span className="flex flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {m.label}
              {m.badge ? <Badge tone="success">{m.badge}</Badge> : null}
            </span>
            <span className="text-small text-muted-foreground">{m.cost}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
