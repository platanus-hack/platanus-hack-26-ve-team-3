"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { formatInt } from "@/lib/client/format";
import type { Candidate } from "@/lib/client/v1";

/** id estable y legible: slug del nombre + sufijo; el sorteo ordena por id, así que no debe cambiar al editar. */
export function candidateId(label: string, taken: Set<string>): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "proyecto";
  let id = `p-${base}`;
  let i = 2;
  while (taken.has(id)) id = `p-${base}-${i++}`;
  return id;
}

/** Lista de proyectos postulados al sorteo (D-12). Sólo lectura si no hay `onChange`. */
export function CandidatesList({ candidates, onRemove }: { candidates: Candidate[]; onRemove?: (id: string) => void }) {
  if (candidates.length === 0) return <p className="rounded-md border border-dashed border-border p-3 text-small text-muted-foreground">Sin proyectos postulados. Sin proyectos no hay sorteo.</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid="candidates-list">
      {candidates.map((c) => (
        <li key={c.id} className="flex items-center gap-2 rounded-md border border-border p-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{c.label}</p>
            <p className="text-small text-muted-foreground">
              <span className="q-mono">{c.id}</span>
              {typeof c.amount === "number" ? ` · monto ${formatInt(c.amount)}` : ""}
            </p>
          </div>
          {onRemove ? (
            <Button variant="ghost" size="sm" aria-label={`Quitar ${c.label}`} onClick={() => onRemove(c.id)}>
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Editor controlado de candidatos. Se usa al CREAR la votación: el backend los fija en el manifiesto (`drawRule`) y no
 * se pueden cambiar después (cualquier cambio invalidaría el hash del manifiesto).
 */
export function CandidatesEditor({ candidates, onChange }: { candidates: Candidate[]; onChange: (c: Candidate[]) => void }) {
  const id = useId();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const l = label.trim();
    if (l.length < 3) return setError("El nombre del proyecto debe tener al menos 3 caracteres.");
    if (candidates.length >= 50) return setError("Máximo 50 proyectos.");
    const a = amount.trim() ? Number(amount.replace(/\./g, "").replace(",", ".")) : undefined;
    if (a !== undefined && (!Number.isFinite(a) || a < 0)) return setError("El monto debe ser un número positivo.");
    setError(null);
    onChange([...candidates, { id: candidateId(l, new Set(candidates.map((c) => c.id))), label: l, ...(a !== undefined ? { amount: a } : {}) }]);
    setLabel("");
    setAmount("");
  }

  return (
    <div className="flex flex-col gap-3">
      <CandidatesList candidates={candidates} onRemove={(cid) => onChange(candidates.filter((c) => c.id !== cid))} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="Proyecto" htmlFor={`${id}-label`}>
          <Input id={`${id}-label`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} placeholder="Ej.: Huerto comunitario" />
        </Field>
        <Field label="Monto (opcional)" htmlFor={`${id}-amount`}>
          <Input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={add}>
          <Plus aria-hidden="true" /> Agregar proyecto
        </Button>
      </div>
      {error ? (
        <Alert tone="danger" title="Revisa el proyecto">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
