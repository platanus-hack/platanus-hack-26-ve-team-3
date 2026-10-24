"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, DoorClosed, DoorOpen, MonitorUp } from "lucide-react";
import type { RoomStatus } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { describeError } from "@/lib/client/api";
import { copyText } from "@/lib/client/download";
import { formatInt } from "@/lib/client/format";
import { loadOrgToken } from "@/lib/client/orgStore";
import { roomApi } from "@/lib/client/room";
import { remaining, useNow } from "./useNow";

const POLL_MS = 3000;
const closedLabel: Record<NonNullable<RoomStatus["closedReason"]>, string> = {
  manual: "Cerrada por el organizador",
  expired: "Expirada",
  "election-opened": "Cerrada: la votación comenzó",
};

/** Abre el proyector en otra pestaña. El token va en el fragmento (#t=…): nunca llega al servidor y el proyector lo borra de la URL. */
export function openProjector(electionId: string) {
  const token = loadOrgToken(electionId);
  const url = `/e/${encodeURIComponent(electionId)}/proyector${token ? `#t=${encodeURIComponent(token)}` : ""}`;
  window.open(url, "_blank");
}

/**
 * Tarjeta "Sala abierta" del panel (fase `registration`): tope y minutos, Abrir / Ampliar / Cerrar, código y enlace,
 * botón "Proyectar". Datos de `GET/POST/DELETE /api/elections/:id/room` con Bearer.
 */
export function RoomCard({ electionId, hasToken }: { electionId: string; hasToken: boolean }) {
  const now = useNow(1000);
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seats, setSeats] = useState("60");
  const [minutes, setMinutes] = useState("15");
  const [busy, setBusy] = useState<"open" | "close" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await roomApi.status(electionId));
      setLoadError(null);
    } catch (e) {
      setLoadError(describeError(e));
    }
  }, [electionId]);

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

  const maxSeats = Number(seats);
  const expiresInMin = Number(minutes);
  const seatsOk = Number.isInteger(maxSeats) && maxSeats >= 1 && maxSeats <= 500 && maxSeats >= (status?.seatsTaken ?? 0);
  const minutesOk = Number.isInteger(expiresInMin) && expiresInMin >= 1 && expiresInMin <= 180;

  async function open() {
    if (!seatsOk || !minutesOk) return;
    setBusy("open");
    setActionError(null);
    try {
      setStatus(await roomApi.open(electionId, { maxSeats, expiresInMin }));
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    setBusy("close");
    setActionError(null);
    try {
      setStatus(await roomApi.close(electionId));
      setConfirmClose(false);
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string) {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const isOpen = status?.open ?? false;
  const left = isOpen ? remaining(status?.expiresAt, now) : null;

  return (
    <Card data-testid="room-card">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Sala abierta</CardTitle>
          {status ? (
            <Badge tone={isOpen ? "success" : "neutral"} data-testid="room-state">
              {isOpen ? "Abierta" : status.closedReason ? closedLabel[status.closedReason] : "Sin abrir"}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          El público entra escaneando un QR, con un alias y sin estar en el padrón. Es un censo abierto: la única barrera para duplicados es la deduplicación facial demo, y así queda declarado en el paquete de auditoría.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loadError && !status ? <Alert tone="warning" title="No se pudo leer el estado de la sala">{loadError}</Alert> : null}

        {status ? (
          <dl className="grid grid-cols-2 gap-3 text-small sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Lugares</dt>
              <dd className="text-heading font-bold" data-testid="room-seats-org">
                {formatInt(status.seatsTaken)}
                {status.maxSeats !== null ? ` de ${formatInt(status.maxSeats)}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Cierra en</dt>
              <dd className="text-heading font-bold">{left ?? "—"}</dd>
            </div>
            {status.roomCode ? (
              <div>
                <dt className="text-muted-foreground">Código</dt>
                <dd className="q-mono text-heading font-bold tracking-widest" data-testid="room-code">
                  {status.roomCode}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {status?.joinUrl ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted p-3 sm:flex-row sm:items-center">
            <p className="q-mono min-w-0 flex-1 break-all text-small" data-testid="room-join-url">
              {status.joinUrl}
            </p>
            <Button size="sm" variant="secondary" onClick={() => copy(status.joinUrl!)}>
              <Copy aria-hidden="true" /> {copied ? "Copiado" : "Copiar enlace"}
            </Button>
          </div>
        ) : null}

        {!hasToken ? (
          <p className="text-small text-muted-foreground">Abrir, ampliar o cerrar la sala requiere el token del organizador.</p>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Tope de personas" htmlFor="room-seats" hint={`1 a 500${status?.seatsTaken ? `, al menos ${status.seatsTaken}` : ""}`} error={seats && !seatsOk ? "Tope fuera de rango" : null}>
              <Input id="room-seats" type="number" inputMode="numeric" min={Math.max(1, status?.seatsTaken ?? 1)} max={500} value={seats} onChange={(e) => setSeats(e.target.value)} />
            </Field>
            <Field label="Minutos abierta" htmlFor="room-minutes" hint="1 a 180, desde ahora" error={minutes && !minutesOk ? "Minutos fuera de rango" : null}>
              <Input id="room-minutes" type="number" inputMode="numeric" min={1} max={180} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
            </Field>
            <Button onClick={open} loading={busy === "open"} disabled={!seatsOk || !minutesOk || busy !== null} data-testid="room-open">
              <DoorOpen aria-hidden="true" /> {isOpen ? "Ampliar" : "Abrir sala"}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => openProjector(electionId)} data-testid="room-project">
            <MonitorUp aria-hidden="true" /> Proyectar
          </Button>
          {hasToken && isOpen ? (
            confirmClose ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger/50 p-2">
                <span className="text-small">Nadie más podrá entrar con este código. ¿Cerrar?</span>
                <Button size="sm" variant="danger" onClick={close} loading={busy === "close"}>
                  Sí, cerrar sala
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmClose(false)}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmClose(true)}>
                <DoorClosed aria-hidden="true" /> Cerrar sala
              </Button>
            )
          ) : null}
        </div>
        {isOpen ? <p className="text-small text-muted-foreground">&quot;Ampliar&quot; conserva el mismo código y QR: cambia el tope y reinicia los minutos desde ahora.</p> : null}
        {actionError ? (
          <Alert tone="danger" title="La acción sobre la sala falló">
            {actionError}
          </Alert>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {copied ? "Enlace copiado" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
