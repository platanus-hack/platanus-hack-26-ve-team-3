"use client";

import { useEffect, useState } from "react";
import { apiV1 } from "@/lib/client/apiV1";
import { WaitingPulse } from "./WaitingPulse";

const POLL_MS = 3000;

/** Texto del aviso de K (exportado para tests). */
export function anonymityGateText(k: number, size: number): string {
  return `Tu voto se habilita cuando haya ${k} personas inscritas (ahora ${size})`;
}

/**
 * D-22, modo continuo: no se aceptan votos mientras el grupo tenga menos de K personas inscritas (privacidad: con muy
 * pocas, se sabría quién votó qué). Muestra la espera animada con el aviso y consulta cada 3 s; la boleta aparece sola
 * al alcanzar K. Sin K (modo con fases) o ya alcanzado: muestra la boleta directamente.
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
    <div className="flex w-full flex-col items-center gap-3 py-2 text-center" data-testid="anonymity-gate">
      <WaitingPulse mode="continuous" k={k} size={size}>
        {size !== null ? (
          <div className="flex flex-col gap-2 text-body text-muted-foreground">
            <p data-testid="anonymity-gate-text" className="sr-only">{anonymityGateText(k, size)}</p>
            <p>Con muy pocas personas se podría deducir quién votó qué. Deja esta página abierta: la boleta aparecerá aquí sola.</p>
          </div>
        ) : null}
      </WaitingPulse>
    </div>
  );
}
