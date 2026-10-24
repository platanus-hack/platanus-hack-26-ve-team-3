"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { apiV1 } from "@/lib/client/apiV1";

const POLL_MS = 3000;

/** Texto del aviso de K (exportado para tests). */
export function anonymityGateText(k: number, size: number): string {
  return `Tu voto se habilita cuando haya ${k} personas inscritas (ahora ${size})`;
}

/**
 * D-22, modo continuo: no se aceptan votos mientras el grupo tenga menos de K personas inscritas (privacidad: con muy
 * pocas, se sabría quién votó qué). Muestra el aviso y consulta cada 3 s; la boleta aparece sola al alcanzar K.
 * Sin K (modo con fases) o ya alcanzado: muestra la boleta directamente.
 */
export function AnonymityGate({ electionId, minAnonymitySet, children }: { electionId: string; minAnonymitySet: number | null | undefined; children: React.ReactNode }) {
  const k = minAnonymitySet ?? 0;
  const [size, setSize] = useState<number | null>(null);
  const ready = k <= 1 || (size !== null && size >= k);

  useEffect(() => {
    if (k <= 1 || ready) return;
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" && size !== null) return;
      try {
        const g = await apiV1.getGroup(electionId);
        if (!cancelled) setSize(g.size ?? g.commitments.length);
      } catch {
        /* sin red: se reintenta en el próximo turno */
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [electionId, k, ready, size]);

  if (ready) return <>{children}</>;
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-lg border border-border bg-card px-4 py-5 text-center" data-testid="anonymity-gate">
      <Users className="size-12 text-primary" aria-hidden="true" strokeWidth={1.75} />
      {size === null ? (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-heading text-muted-foreground">
          <span className="q-spinner" aria-hidden="true" /> Preparando tu boleta…
        </p>
      ) : (
        <>
          <p role="status" aria-live="polite" className="text-title font-bold leading-tight" data-testid="anonymity-gate-text">
            {anonymityGateText(k, size)}
          </p>
          <p className="text-body text-muted-foreground">Así nadie puede saber qué votaste. Deja esta página abierta: la boleta aparecerá aquí sola.</p>
        </>
      )}
    </div>
  );
}
