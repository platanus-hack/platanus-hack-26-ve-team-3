"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, DoorOpen, MonitorUp, Square } from "lucide-react";
import { DEFAULT_MIN_ANONYMITY_SET, type Election, type RoomStatus } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat, StatGrid } from "@/components/ui/stat";
import { openProjector } from "@/components/room/RoomCard";
import { describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { copyText } from "@/lib/client/download";
import { formatInt } from "@/lib/client/format";
import { roomApi } from "@/lib/client/room";

const POLL_MS = 3000;
/** "Abrir" en modo continuo: sala con tope y duración máximos permitidos (se puede volver a tocar para ampliar). */
export const CONTINUOUS_ROOM = { maxSeats: 500, expiresInMin: 180 } as const;

export type LiveCounts = { enrolled: number; voted: number };

/** Contadores en vivo: inscritos = miembros del grupo; votaron = boletas en el registro (no la autodeclaración). */
export async function fetchLiveCounts(electionId: string): Promise<LiveCounts> {
  const t = await apiV1.getTally(electionId);
  return { enrolled: t.eligible, voted: t.totalVotes };
}

/**
 * D-22, panel del organizador en modo continuo: solo "Abrir" (inscripción + votación a la vez) y "Cerrar"
 * (sala + votación), con contadores en vivo (inscritos / votaron), el enlace de la sala y "Proyectar".
 */
export function ContinuousCard({ election, hasToken, onChanged }: { election: Election; hasToken: boolean; onChanged: (e?: Election) => void }) {
  const electionId = election.id;
  const [room, setRoom] = useState<RoomStatus | null>(null);
  const [counts, setCounts] = useState<LiveCounts | null>(null);
  const [busy, setBusy] = useState<"open" | "close" | null>(null);
  const [confirm, setConfirm] = useState<"open" | "close" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const k = election.minAnonymitySet ?? DEFAULT_MIN_ANONYMITY_SET;
  const phase = election.status;

  const refresh = useCallback(async () => {
    const [r, c] = await Promise.allSettled([roomApi.status(electionId), phase === "draft" ? Promise.resolve(null) : fetchLiveCounts(electionId)]);
    if (r.status === "fulfilled") setRoom(r.value);
    if (c.status === "fulfilled" && c.value) setCounts(c.value);
  }, [electionId, phase]);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, hasToken]);

  async function open() {
    setBusy("open");
    setError(null);
    try {
      let next: Election | undefined;
      if (phase === "draft") next = await apiV1.publish(electionId); // draft → open (inscripción + votación)
      setRoom(await roomApi.open(electionId, { ...CONTINUOUS_ROOM }));
      setConfirm(null);
      onChanged(next);
    } catch (e) {
      setError(describeError(e));
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    setBusy("close");
    setError(null);
    try {
      const next = await apiV1.close(electionId);
      setConfirm(null);
      onChanged(next);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  const roomOpen = room?.open ?? false;
  const canOpen = phase === "draft" || (phase === "open" && !roomOpen);

  return (
    <Card className="border-transparent shadow-elevated" data-testid="continuous-card">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Votación al instante</CardTitle>
          <Badge tone={phase === "open" && roomOpen ? "success" : "neutral"} data-testid="continuous-state">
            {phase === "draft" ? "Sin abrir" : phase === "open" ? (roomOpen ? "Abierta: se inscriben y votan" : "Votación abierta · sala cerrada") : "Cerrada"}
          </Badge>
        </div>
        <CardDescription>La gente escanea el QR, se inscribe y vota en el momento. Los votos se aceptan desde {formatInt(k)} inscritos, para que nadie sepa qué votó cada quien.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {phase !== "draft" ? (
          <StatGrid>
            <Stat label="Inscritos" value={<span data-testid="live-enrolled">{counts ? formatInt(counts.enrolled) : "—"}</span>} hint={counts && counts.enrolled < k ? `Faltan ${formatInt(k - counts.enrolled)} para habilitar el voto` : undefined} />
            <Stat label="Votaron" value={<span data-testid="live-voted">{counts ? formatInt(counts.voted) : "—"}</span>} />
          </StatGrid>
        ) : null}

        {room?.joinUrl && roomOpen ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3 sm:flex-row sm:items-center">
            <p className="q-mono min-w-0 flex-1 break-all text-small" data-testid="room-join-url">
              {room.joinUrl}
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                if (await copyText(room.joinUrl!)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
            >
              <Copy aria-hidden="true" /> {copied ? "Copiado" : "Copiar enlace"}
            </Button>
          </div>
        ) : null}

        {!hasToken ? <p className="text-small text-muted-foreground">Abrir y cerrar requiere el token del organizador.</p> : null}

        {confirm ? (
          <div className="q-fade-in flex flex-col gap-3 rounded-md bg-muted p-4">
            <p className="text-body">
              {confirm === "open"
                ? phase === "draft"
                  ? "Se abren la inscripción y la votación a la vez. Después no se pueden editar pregunta, opciones ni fechas. ¿Seguimos?"
                  : "Se vuelve a abrir la sala con el mismo QR. ¿Seguimos?"
                : "Se cierran la inscripción y la votación, y se publica el resultado verificable. ¿Seguimos?"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy !== null}>
                Cancelar
              </Button>
              <Button variant={confirm === "close" ? "danger" : undefined} onClick={confirm === "open" ? open : close} loading={busy !== null} data-testid="continuous-confirm">
                {confirm === "open" ? "Sí, abrir" : "Sí, cerrar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            {canOpen ? (
              <Button size="lg" full onClick={() => setConfirm("open")} disabled={!hasToken} data-testid="continuous-open">
                <DoorOpen aria-hidden="true" /> Abrir
              </Button>
            ) : null}
            {phase === "open" ? (
              <Button size="lg" full variant={canOpen ? "secondary" : undefined} onClick={() => setConfirm("close")} disabled={!hasToken} data-testid="continuous-close">
                <Square aria-hidden="true" /> Cerrar
              </Button>
            ) : null}
          </div>
        )}

        {phase === "open" ? (
          <Button variant="secondary" onClick={() => openProjector(electionId)} data-testid="room-project" className="w-fit">
            <MonitorUp aria-hidden="true" /> Proyectar
          </Button>
        ) : null}

        {error ? (
          <Alert tone="danger" title="La acción falló">
            {error}
          </Alert>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {copied ? "Enlace copiado" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
