"use client";

import { useState } from "react";
import type { ReviewSummary } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { orgMessage } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { formatDateTime } from "@/lib/client/format";
import { ConfirmInline } from "@/components/ui/confirm-inline";

const statusLabel = { pending: "Por revisar", approved: "Aprobado", rejected: "Rechazado" } as const;

/**
 * D-21 · "Casos por revisar (N)": personas cuyo rostro coincidió con alguien ya inscrito pero que entraron con su
 * propia credencial (p. ej. gemelos). El organizador mira a la persona y su credencial y decide. Sin datos biométricos:
 * solo hora, alias genérico y método. Cada aprobación se publica (como número) en el paquete de auditoría.
 */
export function ReviewsCard({ electionId, reviews, hasToken, onDecided, className }: { electionId: string; reviews: ReviewSummary[]; hasToken: boolean; onDecided: () => void; className?: string }) {
  const [confirm, setConfirm] = useState<{ id: string; decision: "approve" | "reject" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = reviews.filter((r) => r.status === "pending");
  const decided = reviews.filter((r) => r.status !== "pending");

  async function decide() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await apiV1.decideReview(electionId, confirm.id, confirm.decision);
      setConfirm(null);
      onDecided();
    } catch (e) {
      setError(orgMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="reviews-card" className={className}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Casos por revisar ({pending.length})</CardTitle>
          {pending.length > 0 ? <Badge tone="warning">Requiere tu decisión</Badge> : null}
        </div>
        <CardDescription>
          Su rostro se parece al de alguien ya inscrito, pero traen su propia credencial. Revísala en persona y decide.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending.length === 0 ? <p className="text-small text-muted-foreground">No hay casos pendientes.</p> : null}
        {pending.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="reviews-list">
            {pending.map((r) => (
              <li key={r.reviewId} className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="review-item">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{r.displayName}</p>
                  <Badge tone="warning">{statusLabel[r.status]}</Badge>
                </div>
                <p className="text-small text-muted-foreground">
                  Llegó {formatDateTime(r.createdAt)} · credencial del evento
                </p>
                {!hasToken ? null : confirm?.id === r.reviewId ? (
                  <ConfirmInline
                    message={confirm.decision === "approve" ? "¿Viste a esta persona y su credencial? Podrá votar y quedará contada como aprobación manual." : "Esta persona no podrá votar. ¿Rechazar?"}
                    confirmLabel={confirm.decision === "approve" ? "Sí, aprobar" : "Sí, rechazar"}
                    tone={confirm.decision === "approve" ? "primary" : "danger"}
                    onConfirm={decide}
                    onCancel={() => setConfirm(null)}
                    loading={busy}
                    confirmTestId="review-confirm"
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" onClick={() => setConfirm({ id: r.reviewId, decision: "reject" })} data-testid="review-reject">
                      Rechazar
                    </Button>
                    <Button onClick={() => setConfirm({ id: r.reviewId, decision: "approve" })} data-testid="review-approve">
                      Aprobar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {decided.length > 0 ? (
          <p className="text-small text-muted-foreground" data-testid="reviews-decided">
            Ya decididos: {decided.filter((r) => r.status === "approved").length} aprobados, {decided.filter((r) => r.status === "rejected").length} rechazados.
          </p>
        ) : null}
        {error ? (
          <Alert tone="danger" title="No se pudo guardar la decisión">
            {error}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
