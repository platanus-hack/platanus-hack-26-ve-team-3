"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { apiV1, fetchAuditPackageBytes } from "@/lib/client/apiV1";
import { formatInt } from "@/lib/client/format";

/** Mínimo y mediana (entera hacia abajo, igual que el verificador) del tamaño del grupo de cada boleta. */
export function groupSizeStats(sizes: number[]): { min: number; median: number; count: number } | null {
  if (sizes.length === 0) return null;
  const s = [...sizes].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return { min: s[0], median: s.length % 2 ? s[m] : Math.floor((s[m - 1] + s[m]) / 2), count: s.length };
}

/** Tamaños publicados en el paquete (`groupSize` de cada boleta del modo continuo). El verificador los recomputa. */
export function groupSizesOf(pkg: unknown): number[] {
  const ledger = (pkg as { ledger?: { kind?: string; groupSize?: number }[] } | null)?.ledger ?? [];
  return ledger.flatMap((e) => (e.kind === "ballot" && typeof e.groupSize === "number" ? [e.groupSize] : []));
}

/**
 * D-22, modo continuo: tamaño del grupo (conjunto de anonimato) de cada boleta. Quien vota temprano se esconde entre
 * menos personas. Mientras se vota solo se muestra el grupo actual; al cerrar, mínimo y mediana desde el paquete.
 */
export function AnonymityCard({ electionId, k, closed }: { electionId: string; k: number; closed: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  const [stats, setStats] = useState<ReturnType<typeof groupSizeStats>>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (closed) {
          const { text } = await fetchAuditPackageBytes(electionId);
          if (!cancelled) setStats(groupSizeStats(groupSizesOf(JSON.parse(text))));
        } else {
          const g = await apiV1.getGroup(electionId);
          if (!cancelled) setNow(g.size ?? g.commitments.length);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [electionId, closed]);

  return (
    <Card data-testid="anonymity-card">
      <CardHeader>
        <CardTitle>Entre cuántas personas se esconde cada voto</CardTitle>
        <CardDescription>
          Votación al instante: cada boleta se prueba contra el grupo de inscritos que había al votar. Quien vota temprano se esconde entre menos personas. No se aceptan votos con menos de {formatInt(k)} inscritos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {closed ? (
          stats ? (
            <StatGrid className="md:grid-cols-3">
              <Stat label="Mínimo" value={<span data-testid="anonymity-min">{formatInt(stats.min)}</span>} hint="personas en el grupo" />
              <Stat label="Mediana" value={<span data-testid="anonymity-median">{formatInt(stats.median)}</span>} hint="personas en el grupo" />
              <Stat label="Boletas" value={formatInt(stats.count)} hint={`mínimo exigido: ${formatInt(k)}`} />
            </StatGrid>
          ) : (
            <p className="text-small text-muted-foreground">{failed ? "No se pudo leer el paquete de auditoría." : "Sin boletas todavía."}</p>
          )
        ) : (
          <p className="text-body" data-testid="anonymity-now">
            {now === null ? (failed ? "No se pudo leer el grupo." : "Leyendo el grupo…") : `Ahora hay ${formatInt(now)} inscritos. El tamaño de cada boleta se publica al cerrar, en el paquete de auditoría (el verificador lo recomputa).`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
