"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Copy, DoorClosed, DoorOpen, MonitorUp, Play } from "lucide-react";
import type { Election, RoomStatus } from "@quorum/contracts";
import { checkLabel, DEFAULT_ELIGIBILITY, EligibilityPicker, eligibilityInputOf, methodLabel, type EligibilityDraft } from "@/components/org/EligibilityPicker";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { countdownText, formatStartTime, timed, useCountdown, useServerClock } from "@/lib/client/clock";
import { copyText } from "@/lib/client/download";
import { formatInt } from "@/lib/client/format";
import { loadOrgToken } from "@/lib/client/orgStore";
import { casesLabel, openWarnings, readinessLine, type Readiness } from "@/lib/client/reviews";
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
export function RoomCard({ electionId, hasToken, onPhaseChange, eligibility, onElectionChange, readiness }: { electionId: string; hasToken: boolean; onPhaseChange?: () => void; eligibility?: Election["eligibility"]; onElectionChange?: (e: Election) => void; readiness?: Readiness | null }) {
  const now = useNow(1000);
  const { offset, record } = useServerClock();
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [seats, setSeats] = useState("60");
  const [minutes, setMinutes] = useState("15");
  const [busy, setBusy] = useState<"open" | "close" | "schedule" | "start" | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { value, sample } = await timed(() => roomApi.status(electionId));
      record(sample);
      setStatus(value);
      setLoadError(null);
    } catch (e) {
      setLoadError(describeError(e));
    }
  }, [electionId, record]);

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

  const isBadge = eligibility?.method === "event-badge";
  const canEditEligibility = hasToken && (status?.seatsTaken ?? 0) === 0;
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

  /** "Empezar en 5 min" / "+5 min" / "Sin hora": mueve el inicio programado (reloj del servidor). */
  async function reschedule(body: Parameters<typeof apiV1.schedule>[1]) {
    setBusy("schedule");
    setActionError(null);
    try {
      const { sample } = await timed(() => apiV1.schedule(electionId, body));
      record(sample);
      await refresh();
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  /** "Abrir ahora": la misma transición de siempre (`POST /open`), sin esperar la hora. */
  async function startNow() {
    setBusy("start");
    setActionError(null);
    try {
      await apiV1.open(electionId);
      setConfirmStart(false);
      onPhaseChange?.();
    } catch (e) {
      setActionError(describeError(e));
      void refresh();
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
  const startsAt = status?.votingStartsAt ?? null;
  const startLeft = useCountdown(startsAt, offset, 500);

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
          {isBadge
            ? "El público escanea el QR del proyector y su credencial. Cada credencial vale una vez."
            : "El público entra con el QR y un alias. Padrón abierto: la cámara es la única barrera contra duplicados."}
        </CardDescription>
        <p className="text-small" data-testid="room-eligibility">
          <span className="text-muted-foreground">¿Quién puede votar? </span>
          <strong>
            {isBadge ? `${methodLabel["event-badge"]} (comprobación ${checkLabel[eligibility?.badgeCheck ?? "live"]}${eligibility?.badgeCheck === "list" ? `, ${formatInt(eligibility.allowlistCount ?? 0)} usuarios` : ""})` : methodLabel["open-alias"]}
          </strong>
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEditEligibility && onElectionChange ? <EligibilityEditor electionId={electionId} eligibility={eligibility} onSaved={onElectionChange} /> : null}
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

        {status ? (
          <section className="flex flex-col gap-3 rounded-md border border-border p-3" aria-labelledby="start-title" data-testid="start-schedule">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-1 size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <h3 id="start-title" className="text-body font-semibold">
                  Inicio de la votación
                </h3>
                {startsAt && startLeft !== null && startLeft > 0 ? (
                  <>
                    <p className="text-title font-bold tabular-nums" data-testid="start-countdown">
                      La votación empieza en {countdownText(startLeft)}
                    </p>
                    <p className="text-small text-muted-foreground">
                      A las {formatStartTime(startsAt)}, sin que toques nada: se congela el padrón, se cierra la sala y los teléfonos inscritos muestran la boleta.
                    </p>
                  </>
                ) : startsAt && startLeft !== null ? (
                  <p className="text-small font-semibold" data-testid="start-countdown">
                    Llegó la hora programada ({formatStartTime(startsAt)}). Si nadie terminó la inscripción, la votación no puede abrir: el padrón estaría vacío.
                  </p>
                ) : (
                  <p className="text-small text-muted-foreground" data-testid="start-countdown">
                    Sin hora programada: la votación empieza cuando toques «Abrir ahora».
                  </p>
                )}
              </div>
            </div>
            {hasToken ? (
              <div className="flex flex-wrap gap-2">
                {confirmStart ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-danger/50 p-2">
                    {(readiness ? openWarnings(readiness) : []).map((w) => (
                      <span key={w} className="w-full text-small font-semibold" data-testid="start-now-warning">
                        {w}
                      </span>
                    ))}
                    <span className="text-small">Se congela el padrón y se cierra la sala. ¿Abrir la votación ahora?</span>
                    <Button size="sm" variant="danger" onClick={startNow} loading={busy === "start"} data-testid="start-now-confirm">
                      Sí, abrir ahora
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmStart(false)}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" onClick={() => setConfirmStart(true)} disabled={busy !== null} data-testid="start-now">
                    <Play aria-hidden="true" /> Abrir ahora
                  </Button>
                )}
                {readiness && !confirmStart ? (
                  <span className="inline-flex items-center text-small text-muted-foreground" data-testid="start-readiness">
                    {readinessLine(readiness)}
                    {readiness.pending > 0 ? <strong className="ml-1 text-warning-strong">· {casesLabel(readiness.pending)}</strong> : null}
                  </span>
                ) : null}
                <Button size="sm" variant="secondary" onClick={() => reschedule({ inSeconds: 300 })} disabled={busy !== null} data-testid="start-in-5">
                  <CalendarClock aria-hidden="true" /> Empezar en 5 min
                </Button>
                <Button size="sm" variant="secondary" onClick={() => reschedule({ addSeconds: 300 })} disabled={busy !== null} data-testid="start-plus-5">
                  +5 min
                </Button>
                {startsAt ? (
                  <Button size="sm" variant="ghost" onClick={() => reschedule({ votingStartsAt: null })} disabled={busy !== null}>
                    Quitar la hora
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>
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
        {isOpen ? <p className="text-small text-muted-foreground">&quot;Ampliar&quot; conserva el mismo código y QR: cambia el tope y reinicia los minutos desde ahora. Si la hora de inicio estaba en el cierre de la sala (lo normal), se mueve con él.</p> : null}
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

function draftOf(e: Election["eligibility"]): EligibilityDraft {
  if (!e || e.method !== "event-badge") return { ...DEFAULT_ELIGIBILITY, method: "open-alias" };
  return { method: "event-badge", badgeCheck: e.badgeCheck ?? "live", allowlist: "", prefix: e.badgeUrlPrefix ?? DEFAULT_ELIGIBILITY.prefix };
}

/** Cambiar "¿Quién puede votar?" en el panel, solo mientras nadie haya entrado por la sala (el servidor lo exige igual). */
function EligibilityEditor({ electionId, eligibility, onSaved }: { electionId: string; eligibility?: Election["eligibility"]; onSaved: (e: Election) => void }) {
  const [draft, setDraft] = useState<EligibilityDraft>(() => draftOf(eligibility));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const keepsList = eligibility?.badgeCheck === "list" && (eligibility.allowlistCount ?? 0) > 0;

  async function save() {
    setError(null);
    setSaved(false);
    // Con lista ya cargada y el campo vacío: conserva la lista anterior.
    const parsed = keepsList && draft.method === "event-badge" && draft.badgeCheck === "list" && !draft.allowlist.trim() ? { ok: true as const, value: { method: "event-badge" as const, badgeCheck: "list" as const, badgeUrlPrefix: draft.prefix } } : eligibilityInputOf(draft);
    if (!parsed.ok) return setError(parsed.error);
    setBusy(true);
    try {
      onSaved(await apiV1.setEligibility(electionId, parsed.value));
      setSaved(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-md border border-border p-3" data-testid="eligibility-editor">
      <summary className="min-h-tap cursor-pointer font-semibold">Cambiar quién puede votar (antes de que entre alguien)</summary>
      <div className="mt-3 flex flex-col gap-3">
        <EligibilityPicker value={draft} onChange={setDraft} idPrefix="room-elig" />
        {keepsList && draft.badgeCheck === "list" ? <p className="text-small text-muted-foreground">Deja la lista vacía para conservar los {formatInt(eligibility?.allowlistCount ?? 0)} usuarios ya cargados.</p> : null}
        <Button variant="secondary" onClick={save} loading={busy} className="w-fit" data-testid="eligibility-save">
          Guardar
        </Button>
        {saved ? <p className="text-small text-success-strong" role="status">Guardado.</p> : null}
        {error ? (
          <Alert tone="danger" title="No se pudo guardar">
            {error}
          </Alert>
        ) : null}
      </div>
    </details>
  );
}
