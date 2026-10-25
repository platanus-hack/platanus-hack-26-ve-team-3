"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Clock, Copy, DoorOpen, KeyRound, MessageCircle, MonitorUp, Smartphone, Users } from "lucide-react";
import type { Election } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/states";
import { QrCode } from "@/components/room/QrCode";
import { openProjector } from "@/components/room/RoomCard";
import { remaining, useNow } from "@/components/room/useNow";
import { useRoomStatus } from "@/components/room/useRoomStatus";
import { orgMessage } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { formatStartTime, useCountdown } from "@/lib/client/clock";
import { copyText } from "@/lib/client/download";
import { formatInt } from "@/lib/client/format";
import { consumeTokenReveal, loadOrgToken } from "@/lib/client/orgStore";
import { roomApi } from "@/lib/client/room";
import { PUBLISH_ROOM } from "./ElectionComposer";
import { StartTimePicker } from "./StartTimePicker";

/** "en 15 min" / "en 1 h 05 min" / "en menos de 1 min". */
export function inMinutes(ms: number): string {
  const min = Math.ceil(ms / 60_000);
  if (ms <= 60_000) return "en menos de 1 min";
  if (min < 60) return `en ${min} min`;
  return `en ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")} min`;
}

/** Enlace de WhatsApp (wa.me) con el texto y el enlace de la sala. No envía nada: abre WhatsApp para que lo mandes tú. */
export function whatsappHref(title: string, joinUrl: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`Vota en «${title}»: ${joinUrl}`)}`;
}

/**
 * «¡Listo! Comparte la votación» (`/org/<id>/listo`), justo después de publicar: QR grande y código de la sala,
 * enlace con Copiar, Proyectar y WhatsApp, a qué hora empieza la votación (con «Cambiar la hora»), el token del
 * organizador plegado (se revela una sola vez) e «Ir al panel». Todo sale de `GET /elections/:id` y `GET /room`.
 */
export function ReadyScreen({ electionId }: { electionId: string }) {
  const [election, setElection] = useState<Election | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "token" | null>(null);
  const [changing, setChanging] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const now = useNow(1000);

  useEffect(() => {
    // Igual que el panel: consumeTokenReveal dentro del timeout (StrictMode monta dos veces en desarrollo).
    const timer = window.setTimeout(() => {
      const t = loadOrgToken(electionId);
      const first = consumeTokenReveal(electionId);
      setToken(t);
      if (first && t) setReveal(t);
      setTokenChecked(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [electionId]);

  useEffect(() => {
    let cancelled = false;
    apiV1
      .getElection(electionId)
      .then((e) => !cancelled && (setElection(e), setError(null)))
      .catch((e) => !cancelled && setError(orgMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [electionId, attempt]);

  const feed = useRoomStatus(electionId, { enabled: tokenChecked, hasToken: Boolean(token) });
  const room = feed.status;
  const startsAt = room?.votingStartsAt ?? election?.votingStartsAt ?? null;
  const startLeft = useCountdown(startsAt, feed.offset, 1000);

  const reload = useCallback(() => {
    setAttempt((a) => a + 1);
    void feed.refresh();
  }, [feed]);

  async function copy(text: string, key: "link" | "token") {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  async function openRoom() {
    setOpening(true);
    setOpenError(null);
    try {
      feed.setStatus(await roomApi.open(electionId, { ...PUBLISH_ROOM }));
    } catch (e) {
      setOpenError(orgMessage(e));
    } finally {
      setOpening(false);
    }
  }

  if (error && !election) {
    return (
      <div className="q-container py-10">
        <ErrorState title="No se pudo cargar la votación" message={error} onRetry={reload}>
          <Link href={`/org/${encodeURIComponent(electionId)}`} className={buttonVariants({ variant: "ghost" })}>
            Ir al panel
          </Link>
        </ErrorState>
      </div>
    );
  }
  if (!election || !tokenChecked) {
    return (
      <div className="q-container py-10">
        <LoadingState label="Preparando la sala…" lines={4} />
      </div>
    );
  }

  const continuous = election.votingMode === "continuous";
  const enrolling = election.status === "registration" || (continuous && election.status === "open");
  const roomOpen = Boolean(room?.open && room.joinUrl && room.roomCode);
  const panelHref = `/org/${encodeURIComponent(electionId)}`;
  const closesIn = roomOpen ? remaining(room?.expiresAt, now) : null;

  return (
    <div className="q-fade-in q-container py-6 md:py-10" data-testid="ready-screen">
      <div className="mx-auto mb-6 flex max-w-[56rem] flex-col gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-success-soft text-success-strong">
            <Check className="size-6" strokeWidth={2.5} />
          </span>
          <h1 className="font-display text-[1.75rem] font-bold leading-[1.08] tracking-[-0.03em] md:text-[2.5rem]">¡Listo! Comparte la votación</h1>
        </div>
        <p className="line-clamp-2 text-muted-foreground">{election.title}</p>
      </div>

      {!token ? (
        <Alert tone="warning" title="Este navegador no tiene tu token de organizador" className="mx-auto mb-6 max-w-[56rem]">
          Sin el token no se ve el QR de la sala. Ábrelo desde el navegador donde creaste la votación o pégalo en el panel.
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[26rem_minmax(0,30rem)] lg:items-start lg:justify-center lg:gap-10">
        {/* Sala: QR y código */}
        <section aria-label="Sala" className="flex flex-col items-center gap-4 rounded-xl bg-card p-5 text-center shadow-elevated md:p-6">
          {enrolling ? (
            <Badge tone="success" className="gap-1.5" data-testid="ready-state">
              <i aria-hidden="true" className="size-2 rounded-full bg-current" />
              {continuous ? "Votación abierta" : "Inscripción abierta"}
            </Badge>
          ) : (
            <Badge tone="neutral" data-testid="ready-state">
              La inscripción terminó
            </Badge>
          )}
          {roomOpen ? (
            <>
              <div className="grid w-full max-w-[19rem] place-items-center rounded-lg border border-border bg-white p-3">
                <QrCode value={room!.joinUrl!} label={`Código QR para entrar a la sala ${room!.roomCode}`} className="w-full max-w-[17rem] lg:max-w-[22rem]" />
              </div>
              <div className="flex flex-col gap-1">
                <p className="q-eyebrow">Código de sala</p>
                <p className="q-mono text-[2rem] font-bold leading-[1.1] tracking-[0.18em]" data-testid="room-code">
                  {room!.roomCode}
                </p>
              </div>
              <p className="flex items-center gap-2 text-small text-muted-foreground" aria-live="polite">
                <Users className="size-4" aria-hidden="true" />
                {room!.maxSeats !== null ? `${formatInt(room!.maxSeats)} lugares` : "Sin tope"}
                {closesIn ? ` · la inscripción cierra en ${closesIn}` : ""}
              </p>
            </>
          ) : !feed.status && !feed.error ? (
            <LoadingState label="Abriendo la sala…" lines={2} className="w-full" />
          ) : (
            <div className="flex w-full flex-col items-center gap-3 py-4">
              <p className="text-body text-muted-foreground">{enrolling ? "La sala no está abierta todavía." : "La sala ya cerró."}</p>
              {enrolling && token ? (
                <Button onClick={openRoom} loading={opening} data-testid="ready-open-room">
                  <DoorOpen aria-hidden="true" /> Abrir la sala ({PUBLISH_ROOM.maxSeats} lugares · {PUBLISH_ROOM.expiresInMin} min)
                </Button>
              ) : null}
              {openError ? (
                <Alert tone="danger" title="No se pudo abrir la sala" className="w-full text-left">
                  {openError}
                </Alert>
              ) : null}
            </div>
          )}
        </section>

        {/* Compartir */}
        <section aria-label="Compartir" className="flex flex-col gap-4">
          {roomOpen ? (
            <>
              <div className="flex flex-col gap-2">
                <p className="text-small font-semibold text-muted-foreground" id="ready-link-label">
                  Enlace de la sala
                </p>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted py-1 pl-3.5 pr-1">
                  <span className="min-w-0 flex-1 truncate text-small font-semibold" data-testid="room-join-url" title={room!.joinUrl} aria-labelledby="ready-link-label">
                    {room!.joinUrl!.replace(/^https?:\/\//, "")}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => copy(room!.joinUrl!, "link")} data-testid="ready-copy">
                    <Copy aria-hidden="true" /> {copied === "link" ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => openProjector(electionId)} data-testid="ready-project">
                  <MonitorUp aria-hidden="true" /> Proyectar
                </Button>
                <a href={whatsappHref(election.title, room!.joinUrl!)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "secondary" })} data-testid="ready-whatsapp">
                  <MessageCircle aria-hidden="true" /> WhatsApp
                </a>
              </div>
            </>
          ) : null}

          {continuous ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-5 shadow-card">
              <span className="grid size-tap shrink-0 place-items-center rounded-md bg-primary-soft text-primary-ink">
                <Clock className="size-5" aria-hidden="true" />
              </span>
              <p className="text-body">La votación ya está abierta: la gente se inscribe y vota en el momento. La cierras desde el panel.</p>
            </div>
          ) : enrolling ? (
            <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-card p-5 shadow-card" data-testid="ready-start">
              <span className="grid size-tap shrink-0 place-items-center rounded-md bg-primary-soft text-primary-ink">
                <Clock className="size-5" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-small text-muted-foreground">La votación empieza</p>
                {startsAt && startLeft !== null && startLeft > 0 ? (
                  <p className="text-heading font-semibold" data-testid="ready-start-countdown" aria-live="polite">
                    a las {formatStartTime(startsAt)} <span className="font-medium text-muted-foreground">({inMinutes(startLeft)})</span>
                  </p>
                ) : startsAt && startLeft !== null ? (
                  <p className="text-heading font-semibold" data-testid="ready-start-countdown">
                    ahora: se está abriendo
                  </p>
                ) : (
                  <p className="text-heading font-semibold" data-testid="ready-start-countdown">
                    cuando la abras tú
                  </p>
                )}
                <p className="text-small text-muted-foreground">{startsAt ? "Cuando cierra la inscripción. Puedes abrirla antes desde el panel." : "Sin hora fija: la abres desde el panel."}</p>
                {token ? (
                  changing ? (
                    <div className="mt-2">
                      <StartTimePicker
                        electionId={electionId}
                        record={feed.record}
                        hasStart={Boolean(startsAt)}
                        onDone={() => {
                          setChanging(false);
                          void feed.refresh();
                        }}
                      />
                      <Button variant="ghost" size="sm" className="mt-2" onClick={() => setChanging(false)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" className="mt-2 w-fit" onClick={() => setChanging(true)} data-testid="ready-start-change">
                      Cambiar la hora
                    </Button>
                  )
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="flex items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-primary-ink" aria-hidden="true" />
            <span>
              <b>Tú también votas:</b> escanea el QR con tu teléfono o abre el enlace.
            </span>
          </p>

          {reveal ? (
            <details className="group rounded-md border border-warning/40 bg-warning-soft">
              <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-2 px-3.5 text-small font-semibold [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2 text-warning-strong">
                  <KeyRound className="size-4" aria-hidden="true" /> Guarda tu token de organizador
                </span>
                <ChevronDown className="size-5 shrink-0 text-warning-strong transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="flex flex-col gap-3 border-t border-warning/30 p-3.5">
                <p className="text-small">Se muestra una sola vez. Sin él no podrás abrir, cerrar ni sortear desde otro navegador.</p>
                <p className="q-mono rounded-md border border-border bg-card px-3 py-2 text-small text-foreground" data-testid="org-token">
                  {reveal}
                </p>
                <Button variant="secondary" size="sm" className="w-fit" onClick={() => copy(reveal, "token")}>
                  <Copy aria-hidden="true" /> {copied === "token" ? "Copiado" : "Copiar token"}
                </Button>
              </div>
            </details>
          ) : null}

          <div className="pt-2">
            <Link href={panelHref} className={cn(buttonVariants({ size: "lg", full: true }))} data-testid="ready-go-panel">
              Ir al panel
            </Link>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {copied ? "Copiado al portapapeles" : ""}
          </p>
        </section>
      </div>
    </div>
  );
}
