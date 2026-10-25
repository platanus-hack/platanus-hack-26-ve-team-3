"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChartNoAxesColumn, ChevronDown, Copy, DoorOpen, Download, Gift, KeyRound, Link2, Play, Send, Square, TriangleAlert, Users } from "lucide-react";
import type { Aggregates as AggregatesV1, Election as ElectionV1, ElectionStatus, ReviewSummary, VotersListResponse as VotersListV1 } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { ConfirmInline } from "@/components/ui/confirm-inline";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { WinnerScreen } from "@/components/results/WinnerScreen";
import { QrCode } from "@/components/room/QrCode";
import { RoomCard } from "@/components/room/RoomCard";
import { remaining, useNow } from "@/components/room/useNow";
import { useRoomStatus } from "@/components/room/useRoomStatus";
import { orgMessage, type InvitesResponse } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { countdownText, formatStartTime, spokenCountdown, timed, useCountdown, useServerClock } from "@/lib/client/clock";
import { copyText } from "@/lib/client/download";
import { formatInt } from "@/lib/client/format";
import { appendVoters, consumeTokenReveal, loadOrgToken, loadVoters, rememberElection, saveOrgToken, type StoredVoter } from "@/lib/client/orgStore";
import { roomApi } from "@/lib/client/room";
import { useAuditResult } from "@/lib/client/useAuditResult";
import { hasAuditPackage, nextOrganizerAction, type OrganizerAction } from "@/lib/client/phases";
import { openWarnings, readinessLine, type Readiness } from "@/lib/client/reviews";
import { CandidatesList } from "./CandidatesEditor";
import { ContinuousCard } from "./ContinuousCard";
import { PUBLISH_ROOM } from "./ElectionComposer";
import { LiveBreakdown } from "./LiveBreakdown";
import { TimeBoard, TurnoutCard } from "./VotingBoard";
import { ReviewsCard } from "./ReviewsCard";

type Channel = "dry-run" | "wame";
const stateLabel = { invited: "Invitado", registered: "Inscrito", voted: "Votó" } as const;
const NEEDS_KEY = "Necesitas tu token de organizador.";

/** Píldora de fase de la cabina (texto + punto: el estado nunca va solo en color). */
export const cockpitPhase: Record<ElectionStatus, { label: string; tone: "neutral" | "primary" | "warning" | "success" | "danger" }> = {
  draft: { label: "Borrador", tone: "neutral" },
  registration: { label: "Inscripción abierta", tone: "warning" },
  open: { label: "Votación en curso", tone: "success" },
  closed: { label: "Cerrada", tone: "neutral" },
  tallying: { label: "Cerrada", tone: "neutral" },
  auditable: { label: "Auditable", tone: "primary" },
  drawn: { label: "Sorteada", tone: "primary" },
  failed: { label: "Fallida", tone: "danger" },
};

type Section = "cases" | "room" | "voters" | "candidates" | "token" | "links";

/**
 * Panel del organizador como «cabina»: la fase manda. Inscripción: QR grande, «Empieza en», «Inscritos» y un solo
 * botón «Abrir votación». Votación: desglose en vivo, «Quedan», «Votaron» y «Cerrar votación». Después: cifras finales,
 * sorteo, exportar y verificar. Todo lo demás (sala, casos, participantes, proyectos, token, enlaces) vive en «Más».
 * Cada cifra sale de la API (`/elections/:id`, `/tally`, `/voters`, `/reviews`, `/room`); nada se pinta desde la DB local.
 */
export function OrgPanel({ electionId }: { electionId: string }) {
  const [election, setElection] = useState<ElectionV1 | null>(null);
  const [tally, setTally] = useState<AggregatesV1 | null>(null);
  const [voters, setVoters] = useState<NonNullable<VotersListV1["voters"]> | null>(null);
  const [counts, setCounts] = useState<VotersListV1["counts"] | null>(null);
  const [votersError, setVotersError] = useState<string | null>(null);
  const [localVoters, setLocalVoters] = useState<StoredVoter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [reveal, setReveal] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("dry-run");
  const [sending, setSending] = useState(false);
  const [inviteResults, setInviteResults] = useState<InvitesResponse["results"] | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [newList, setNewList] = useState("");
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewSummary[] | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Partial<Record<Section, boolean>>>({});
  const [openingRoom, setOpeningRoom] = useState(false);
  const clock = useServerClock();
  const now = useNow(1000);
  // Al cierre: la misma carta del ganador que ve el votante en /live, con el veredicto real de GET /audit (nunca un booleano local).
  const audit = useAuditResult(electionId, election?.status ?? null);

  // Token del organizador: sessionStorage; la primera vez tras crear la elección se revela en «Más › Token».
  useEffect(() => {
    // consumeTokenReveal va DENTRO del timeout: en desarrollo (StrictMode) el efecto se monta dos veces.
    const timer = window.setTimeout(() => {
      const t = loadOrgToken(electionId);
      const first = consumeTokenReveal(electionId);
      setToken(t);
      setTokenChecked(true);
      if (first && t) {
        setReveal(t);
        setMoreOpen(true);
        setOpenSections((s) => ({ ...s, token: true }));
      }
      setLocalVoters(loadVoters(electionId));
    }, 0);
    return () => clearTimeout(timer);
  }, [electionId]);

  const { record } = clock;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { value: e, sample } = await timed(() => apiV1.getElection(electionId));
        if (cancelled) return;
        record(sample);
        setElection(e);
        rememberElection(e.id, e.title);
        const [t, v, rv] = await Promise.allSettled([
          apiV1.getTally(electionId),
          apiV1.listVoters(electionId),
          // D-21: casos por revisar (solo con token y mientras alguien se puede inscribir).
          token && (e.status === "registration" || (e.votingMode === "continuous" && e.status === "open")) ? apiV1.listReviews(electionId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setReviews(rv.status === "fulfilled" && rv.value ? rv.value.reviews : null);
        setTally(t.status === "fulfilled" ? t.value : null);
        if (v.status === "fulfilled") {
          setVoters(v.value.voters ?? null);
          setCounts(v.value.counts ?? null);
          setVotersError(null);
        } else {
          setVoters(null);
          setVotersError(orgMessage(v.reason));
        }
      } catch (err) {
        if (!cancelled) setError(orgMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [electionId, attempt, token, record]);

  // Refresco cada 5 s mientras hay actividad (inscripción o votación abierta).
  useEffect(() => {
    if (election?.status !== "registration" && election?.status !== "open") return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setAttempt((a) => a + 1);
    }, 5000);
    return () => clearInterval(t);
  }, [election?.status]);

  const continuous = election?.votingMode === "continuous";
  const room = useRoomStatus(electionId, { enabled: tokenChecked && election?.status === "registration", hasToken: Boolean(token) });
  const startsAt = room.status?.votingStartsAt ?? election?.votingStartsAt ?? null;
  const startLeft = useCountdown(election?.status === "registration" ? startsAt : null, room.offset, 500);

  const reload = useCallback(() => {
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  function applyToken() {
    const t = tokenInput.trim();
    if (!t) return;
    saveOrgToken(electionId, t);
    consumeTokenReveal(electionId);
    setToken(t);
    setTokenInput("");
  }

  function openSection(s: Section) {
    setMoreOpen(true);
    setOpenSections((x) => ({ ...x, [s]: true }));
    window.setTimeout(() => document.getElementById(`more-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function act() {
    if (!election) return;
    const action = nextOrganizerAction(election.status, { candidates: election.candidates?.length ?? 0 });
    if (!action) return;
    setActing(true);
    setActionError(null);
    try {
      if (action.id === "publish") setElection(await apiV1.publish(electionId));
      else if (action.id === "open") setElection(await apiV1.open(electionId));
      else if (action.id === "close") setElection(await apiV1.close(electionId));
      else await apiV1.draw(electionId);
      setConfirming(false);
      reload();
    } catch (e) {
      setActionError(orgMessage(e));
    } finally {
      setActing(false);
    }
  }

  async function openRoom() {
    setOpeningRoom(true);
    setActionError(null);
    try {
      room.setStatus(await roomApi.open(electionId, { ...PUBLISH_ROOM }));
    } catch (e) {
      setActionError(orgMessage(e));
    } finally {
      setOpeningRoom(false);
    }
  }

  async function sendInvites() {
    setInviteError(null);
    setInviteResults(null);
    setSending(true);
    try {
      const ids = voters?.map((v) => v.id) ?? localVoters.map((v) => v.id);
      const res = await apiV1.sendInvites(electionId, { electionId, voterIds: ids, channel });
      setInviteResults(res.results);
    } catch (e) {
      setInviteError(orgMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function addFromList() {
    const rows = newList
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, phone] = l.split(/[,;\t]/).map((s) => s?.trim() ?? "");
        return phone ? { displayName: name, phoneE164: phone } : { displayName: name };
      })
      .filter((p) => p.displayName);
    if (rows.length === 0) return;
    setAdding(true);
    setActionError(null);
    try {
      const res = await apiV1.addVoters(electionId, rows);
      appendVoters(electionId, res.voters);
      setLocalVoters(loadVoters(electionId));
      setNewList("");
      reload();
    } catch (e) {
      setActionError(orgMessage(e));
    } finally {
      setAdding(false);
    }
  }

  async function copy(text: string, key: string) {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  if (error) {
    return (
      <div className="q-container py-10">
        <ErrorState title="No se pudo cargar el panel" message={error} onRetry={reload}>
          <Link href="/org/new" className="inline-flex min-h-tap items-center px-2 font-semibold underline underline-offset-4">
            Crear una votación
          </Link>
        </ErrorState>
      </div>
    );
  }
  if (!election) {
    return (
      <div className="q-container py-10">
        <LoadingState label="Cargando…" lines={5} />
      </div>
    );
  }

  const phase = election.status;
  const action = nextOrganizerAction(phase, { candidates: election.candidates?.length ?? 0 });
  const enrolling = phase === "registration" || (continuous && phase === "open");
  const canAddVoters = phase === "draft" || enrolling;
  const pendingReviews = reviews?.filter((r) => r.status === "pending").length ?? 0;
  // "X de Y listos": terminaron la inscripción (identidad en el padrón) de los que entraron.
  const readiness: Readiness | null = counts ? { ready: counts.withIdentity, total: counts.total, pending: pendingReviews } : null;
  const warnings = action?.id === "open" && readiness ? openWarnings(readiness) : [];
  const inviteLinkFor = (id: string) => inviteResults?.find((r) => r.voterId === id)?.link ?? localVoters.find((v) => v.id === id)?.inviteUrl ?? null;
  const showCases = enrolling && reviews !== null && (reviews.length > 0 || election.eligibility?.method === "event-badge");
  const pill = cockpitPhase[phase];
  const status = room.status;
  const roomOpen = Boolean(status?.open && status.joinUrl && status.roomCode);
  const liveUrl = typeof window === "undefined" ? `/e/${encodeURIComponent(electionId)}/live` : `${window.location.origin}/e/${encodeURIComponent(electionId)}/live`;
  const shareUrl = phase === "registration" ? (roomOpen ? status!.joinUrl! : null) : liveUrl;
  const candidatesCount = election.candidates?.length ?? 0;
  // Carta del ganador: las opciones del tally cruzadas por `id` con las de la elección (foto y subtítulo), igual que /live.
  const optionById = new Map(election.options.map((o) => [o.id, o]));
  const closedOptions = tally ? tally.options.map((o) => ({ ...o, subtitle: optionById.get(o.id)?.subtitle, image: optionById.get(o.id)?.image })) : [];

  const phaseAction = (a: OrganizerAction | null, icon?: React.ReactNode) =>
    a ? (
      !confirming ? (
        <Button size="lg" full className="min-h-14" onClick={() => setConfirming(true)} disabled={!token} data-testid="phase-action">
          {icon}
          {a.label}
        </Button>
      ) : (
        <ConfirmInline message={`${a.confirm} ¿Seguimos?`} confirmLabel={`Sí, ${a.label.toLowerCase()}`} onConfirm={act} onCancel={() => setConfirming(false)} loading={acting} warnings={warnings} warningTestId="open-warning" />
      )
    ) : null;

  const secondaries = (
    <div className="grid grid-cols-1 gap-2">
      <Button variant="secondary" className="whitespace-nowrap px-3" onClick={() => shareUrl && copy(shareUrl, "share")} disabled={!shareUrl} data-testid="copy-link">
        <Copy aria-hidden="true" /> {copied === "share" ? "Copiado" : "Copiar enlace"}
      </Button>
    </div>
  );

  return (
    <div className="q-fade-in q-container flex flex-col gap-4 py-6 md:py-10" data-testid="org-cockpit">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Badge tone={pill.tone} className="gap-1.5 whitespace-nowrap px-3.5 py-1.5 text-body" data-testid="org-phase-pill">
            <i aria-hidden="true" className="size-2 rounded-full bg-current" />
            {pill.label}
          </Badge>
          <span className="q-eyebrow text-right">
            <span className="sm:hidden">Panel</span>
            <span className="hidden sm:inline">Panel del organizador</span>
          </span>
        </div>
        <h1 className="line-clamp-2 text-body font-semibold leading-[1.35] text-muted-foreground md:text-heading">{election.title}</h1>
      </header>

      {!token ? (
        <Card>
          <CardHeader>
            <CardTitle>Token de organizador</CardTitle>
            <CardDescription>El que recibiste al crear la votación. Sin él solo ves las cifras públicas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Token" htmlFor="org-token-input">
              <Input id="org-token-input" type="password" autoComplete="off" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} className="q-mono" />
            </Field>
            <Button onClick={applyToken} disabled={!tokenInput.trim()}>
              <KeyRound aria-hidden="true" /> Usar token
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- Cabina según la fase ---------- */}
      {continuous && (phase === "draft" || phase === "open") ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
          {phase === "open" ? <LiveBreakdown tally={tally} options={election.options} /> : null}
          <ContinuousCard election={election} hasToken={Boolean(token)} onChanged={(e) => (e ? (setElection(e), reload()) : reload())} />
        </div>
      ) : phase === "draft" ? (
        <section className="flex flex-col gap-4 rounded-xl bg-card p-5 shadow-elevated md:p-6">
          <p className="text-heading font-semibold">{action?.hint}</p>
          {phaseAction(action, <DoorOpen aria-hidden="true" />)}
          {!token ? <p className="text-small text-muted-foreground">{NEEDS_KEY}</p> : null}
        </section>
      ) : phase === "registration" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-stretch lg:gap-6">
          <section aria-label={roomOpen ? `Sala ${status!.roomCode}` : "Sala"} className="flex flex-col items-center gap-3 rounded-xl bg-card px-4 pb-5 pt-4 text-center shadow-elevated lg:justify-center lg:p-8">
            {roomOpen ? (
              <>
                <QrCode value={status!.joinUrl!} label={`Código QR para entrar a la sala ${status!.roomCode}`} className="w-full max-w-[21rem] lg:max-w-[30rem]" />
                <p className="q-eyebrow">Código de sala</p>
                <p className="q-mono text-[2.5rem] font-bold leading-none tracking-[0.16em] lg:text-[3.5rem]" data-testid="room-code">
                  {status!.roomCode}
                </p>
                <p className="text-small text-muted-foreground" data-testid="room-join-url">
                  {status!.joinUrl}
                </p>
              </>
            ) : !token ? (
              <p className="py-10 text-muted-foreground">Usa tu token para ver el QR de la sala.</p>
            ) : !status ? (
              <LoadingState label="Cargando la sala…" lines={3} className="w-full" />
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <p className="text-body text-muted-foreground">La sala está cerrada: nadie puede entrar ahora.</p>
                <Button onClick={openRoom} loading={openingRoom} data-testid="cockpit-open-room">
                  <DoorOpen aria-hidden="true" /> Abrir la sala ({PUBLISH_ROOM.maxSeats} lugares · {PUBLISH_ROOM.expiresInMin} min)
                </Button>
              </div>
            )}
          </section>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <Tile label={startsAt ? "Empieza en" : "Empieza"}>
                <div data-testid="org-clock" role="timer" aria-label={startsAt && startLeft !== null ? `La votación empieza en ${spokenCountdown(Math.max(0, startLeft))}, a las ${formatStartTime(startsAt)}` : "Sin hora de inicio: la abres tú"}>
                  {startsAt && startLeft !== null ? (
                    <>
                      <span className="q-num block text-[2.25rem] font-bold leading-none tracking-[-0.03em] lg:text-[4rem]" aria-hidden="true">
                        {countdownText(Math.max(0, startLeft))}
                      </span>
                      <span className="sr-only" aria-live="polite">
                        {spokenCountdown(Math.max(0, startLeft))}
                      </span>
                      <span className="mt-1.5 block text-small text-muted-foreground">a las {formatStartTime(startsAt)}</span>
                    </>
                  ) : (
                    <>
                      <span className="block text-heading font-bold leading-tight">Cuando la abras</span>
                      <span className="mt-1.5 block text-small text-muted-foreground">sin hora fija</span>
                    </>
                  )}
                </div>
              </Tile>
              <Tile label="Inscritos">
                <SeatsFigure taken={status?.seatsTaken ?? counts?.total ?? null} max={status?.maxSeats ?? null} />
              </Tile>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-small" data-testid="open-readiness-row">
              {readiness ? (
                <span className="text-muted-foreground" data-testid="open-readiness">
                  {readinessLine(readiness)}
                </span>
              ) : null}
              {pendingReviews > 0 ? (
                <button
                  type="button"
                  onClick={() => openSection("cases")}
                  data-testid="reviews-badge"
                  className="inline-flex min-h-tap items-center gap-1.5 rounded-full border border-warning/40 bg-warning-soft px-3.5 font-bold text-warning-strong hover:brightness-95"
                >
                  <TriangleAlert className="size-4" aria-hidden="true" /> {pendingReviews} por revisar
                </button>
              ) : null}
            </div>
            {phaseAction(action, <Play aria-hidden="true" />)}
            {!token && action ? <p className="text-small text-muted-foreground">{NEEDS_KEY}</p> : null}
            {secondaries}
            {startsAt && startLeft !== null && startLeft > 0 ? <p className="text-center text-small text-muted-foreground">Si no la abres antes, empieza sola a las {formatStartTime(startsAt)}</p> : null}
          </div>
        </div>
      ) : phase === "open" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-5">
          <div className="lg:col-start-2 lg:row-start-1">
            <TimeBoard openedAt={election.votingStartsAt ?? election.startsAt} endsAt={election.endsAt} offset={clock.offset} />
          </div>
          <LiveBreakdown tally={tally} options={election.options} className="lg:col-start-1 lg:row-span-3 lg:row-start-1" />
          <div className="lg:col-start-2 lg:row-start-2">
            <TurnoutCard tally={tally} />
          </div>
          <div className="flex flex-col gap-3 lg:col-start-2 lg:row-start-3">
            {phaseAction(action, <Square aria-hidden="true" />)}
            {!token && action ? <p className="text-small text-muted-foreground">{NEEDS_KEY}</p> : null}
            {secondaries}
            <Link href={`/e/${encodeURIComponent(electionId)}/live`} className="inline-flex min-h-tap items-center justify-center gap-2 self-center font-semibold text-primary-ink underline underline-offset-4" data-testid="org-live-link">
              <ChartNoAxesColumn className="size-4" aria-hidden="true" /> Ver en vivo (público)
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
          {/* Carta del ganador a lo ancho (la misma de /live). Debajo, solo la línea «Ganó X por N votos» (sin repetir el ranking) y la columna de participación y acciones. */}
          {tally ? <WinnerScreen electionId={electionId} status={phase} options={closedOptions} totalVotes={tally.totalVotes} audit={audit} className="lg:col-span-2" /> : null}
          <LiveBreakdown tally={tally} options={election.options} final headlineOnly className="lg:col-start-1" />
          <div className="flex flex-col gap-4 lg:col-start-2">
            <TurnoutCard tally={tally} />
            {action ? (
              <>
                {phaseAction(action, <Gift aria-hidden="true" />)}
                {!token ? <p className="text-small text-muted-foreground">{NEEDS_KEY}</p> : null}
              </>
            ) : (
              <p className="text-small text-muted-foreground">
                {phase === "auditable" && candidatesCount === 0
                  ? "Votación cerrada. El resultado se puede verificar."
                  : phase === "drawn"
                    ? "Sorteo realizado."
                    : phase === "failed"
                      ? "La verificación falló: el resultado se publica con el error."
                      : "Contando los votos…"}
              </p>
            )}
            {hasAuditPackage(phase) ? (
              <div className="flex flex-col gap-2">
                <a href={`/api/elections/${encodeURIComponent(electionId)}/artifacts`} download className={buttonVariants({ variant: "secondary", full: true })}>
                  <Download aria-hidden="true" /> Exportar paquete de auditoría
                </a>
                <Link href={`/e/${encodeURIComponent(electionId)}#verificar`} className={buttonVariants({ variant: "secondary", full: true })}>
                  Verificar en el navegador
                </Link>
              </div>
            ) : null}
            {phase === "drawn" ? (
              <Link href={`/e/${encodeURIComponent(electionId)}/draw`} className="inline-flex min-h-tap items-center text-small underline underline-offset-4">
                Ver sorteo y recomputarlo
              </Link>
            ) : null}
          </div>
        </div>
      )}

      {actionError ? (
        <Alert tone="danger" title="La acción falló">
          {actionError}
        </Alert>
      ) : null}

      {/* ---------- Más ---------- */}
      <details className="group/more mt-2" data-testid="more-sheet" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
        <summary className="mx-auto flex min-h-12 w-fit cursor-pointer list-none items-center justify-center gap-1.5 rounded-full px-5 font-semibold text-muted-foreground hover:bg-muted [&::-webkit-details-marker]:hidden">
          Más <ChevronDown className="size-5 transition-transform group-open/more:rotate-180" aria-hidden="true" />
        </summary>
        <div className="mt-2 grid gap-2 lg:grid-cols-2 lg:items-start">
          {showCases ? (
            <MoreSection
              id="cases"
              icon={<TriangleAlert className="size-4" aria-hidden="true" />}
              title="Casos por revisar"
              meta={
                pendingReviews > 0 ? (
                  <Badge tone="warning" className="gap-1">
                    <TriangleAlert className="size-3.5" aria-hidden="true" /> {pendingReviews}
                  </Badge>
                ) : (
                  "ninguno"
                )
              }
              open={openSections.cases}
              onToggle={(o) => setOpenSections((s) => ({ ...s, cases: o }))}
            >
              <ReviewsCard electionId={electionId} reviews={reviews ?? []} hasToken={Boolean(token)} onDecided={reload} className="border-0 shadow-none [&>div]:px-0 [&>div:first-child]:pt-0" />
            </MoreSection>
          ) : null}

          {phase === "registration" ? (
            <MoreSection
              id="room"
              icon={<DoorOpen className="size-4" aria-hidden="true" />}
              title="Sala"
              meta={status?.open ? `${status.maxSeats !== null ? `${formatInt(status.maxSeats)} lugares` : "sin tope"}${status.expiresAt ? ` · ${remaining(status.expiresAt, now) ?? ""}` : ""}` : "cerrada"}
              open={openSections.room}
              onToggle={(o) => setOpenSections((s) => ({ ...s, room: o }))}
            >
              <RoomCard electionId={electionId} hasToken={Boolean(token)} eligibility={election.eligibility} onElectionChange={setElection} feed={room} embedded />
            </MoreSection>
          ) : null}

          <MoreSection
            id="voters"
            icon={<Users className="size-4" aria-hidden="true" />}
            title="Participantes e invitaciones"
            meta={counts ? formatInt(counts.total) : voters ? formatInt(voters.length) : "—"}
            open={openSections.voters}
            onToggle={(o) => setOpenSections((s) => ({ ...s, voters: o }))}
          >
            <div className="flex flex-col gap-4">
              <p className="text-small text-muted-foreground">Sólo tú ves esta lista.</p>
              {counts ? (
                <dl className="grid grid-cols-3 gap-2 text-center">
                  {(
                    [
                      ["invited", "Invitados"],
                      ["registered", "Inscritos"],
                      ["voted", "Votaron"],
                    ] as const
                  ).map(([k, label]) => (
                    <div key={k} className="rounded-md bg-muted px-2 py-2">
                      <dt className="text-small text-muted-foreground">{label}</dt>
                      <dd className="q-num text-heading font-bold">{formatInt(counts[k])}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {votersError && token ? (
                <Alert tone="warning" title="No se pudo cargar la lista de participantes">
                  {votersError}
                </Alert>
              ) : null}
              {!token ? <p className="text-small text-muted-foreground">{NEEDS_KEY}</p> : null}
              {voters && voters.length === 0 ? <EmptyState title="Aún no hay participantes">Entran por la sala o agrégalos abajo, uno por línea.</EmptyState> : null}
              {voters && voters.length > 0 ? (
                <>
                  <div className="flex flex-col gap-3">
                    <ChoiceChips
                      name="channel"
                      legend="Invitaciones"
                      choices={[
                        { value: "dry-run", label: "Solo generar enlaces" },
                        { value: "wame", label: "Enlaces de WhatsApp" },
                      ]}
                      value={channel}
                      onChange={setChannel}
                    />
                    <Button variant="secondary" full onClick={sendInvites} loading={sending} disabled={!canAddVoters}>
                      <Send aria-hidden="true" /> Generar enlaces ({voters.length})
                    </Button>
                  </div>
                  {inviteError ? (
                    <Alert tone="danger" title="No se pudieron generar las invitaciones">
                      {inviteError}
                    </Alert>
                  ) : null}
                  <ul className="flex flex-col" data-testid="voters-list">
                    {voters.map((v) => {
                      const link = inviteLinkFor(v.id);
                      return (
                        <li key={v.id} className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{v.displayName}</p>
                            <p className="text-small">
                              <Badge tone={v.state === "voted" ? "success" : v.state === "registered" ? "neutral" : "warning"}>{stateLabel[v.state]}</Badge>
                            </p>
                            {link ? (
                              <p className="q-mono truncate text-small text-muted-foreground" title={link}>
                                {link}
                              </p>
                            ) : null}
                          </div>
                          {link ? (
                            <Button variant="secondary" size="sm" onClick={() => copy(link, v.id)}>
                              <Copy aria-hidden="true" /> {copied === v.id ? "Copiado" : "Copiar enlace"}
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : null}
              {canAddVoters ? (
                <Disclosure title="Agregar participantes" bodyClassName="flex flex-col gap-3">
                  <Field label="Una por línea: Nombre, +58412… (teléfono opcional)" htmlFor="newList">
                    <Textarea id="newList" value={newList} onChange={(e) => setNewList(e.target.value)} />
                  </Field>
                  <Button variant="secondary" size="sm" className="w-fit" onClick={addFromList} loading={adding} disabled={!newList.trim() || !token}>
                    Registrar
                  </Button>
                </Disclosure>
              ) : (
                <p className="text-small text-muted-foreground">El padrón está congelado: no se pueden agregar participantes.</p>
              )}
            </div>
          </MoreSection>

          {candidatesCount > 0 ? (
            <MoreSection
              id="candidates"
              icon={<Gift className="size-4" aria-hidden="true" />}
              title="Proyectos del sorteo"
              meta={formatInt(candidatesCount)}
              open={openSections.candidates}
              onToggle={(o) => setOpenSections((s) => ({ ...s, candidates: o }))}
            >
              <p className="mb-3 text-small text-muted-foreground">{election.winnersCountFromResult ? "La opción ganadora define cuántos; el sorteo, cuáles." : "El sorteo elige los ganadores."}</p>
              <CandidatesList candidates={election.candidates ?? []} />
            </MoreSection>
          ) : null}

          <MoreSection
            id="token"
            icon={<KeyRound className="size-4" aria-hidden="true" />}
            title="Token"
            meta={reveal ? "guárdalo" : token ? "guardado" : "falta"}
            open={openSections.token}
            onToggle={(o) => setOpenSections((s) => ({ ...s, token: o }))}
          >
            {reveal ? (
              <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-soft p-3.5">
                <p className="text-small font-semibold text-warning-strong">Guarda tu token de organizador: se muestra una sola vez. Lo necesitas para abrir, cerrar y sortear desde otro navegador.</p>
                <p className="q-mono break-all rounded-md border border-border bg-card px-3 py-2 text-small text-foreground" data-testid="org-token">
                  {reveal}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => copy(reveal, "token")}>
                    <Copy aria-hidden="true" /> {copied === "token" ? "Copiado" : "Copiar token"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReveal(null)}>
                    Ya lo guardé
                  </Button>
                </div>
              </div>
            ) : token ? (
              <p className="text-small text-muted-foreground">Guardado en esta pestaña. Se borra al cerrarla.</p>
            ) : (
              <p className="text-small text-muted-foreground">Este navegador no tiene el token. Pégalo arriba en «Token de organizador».</p>
            )}
          </MoreSection>

          <MoreSection id="links" icon={<Link2 className="size-4" aria-hidden="true" />} title="Enlaces" meta={hasAuditPackage(phase) ? "5" : "3"} open={openSections.links} onToggle={(o) => setOpenSections((s) => ({ ...s, links: o }))}>
            <nav aria-label="Enlaces de la votación" className="flex flex-col">
              <LinkRow href={`/e/${encodeURIComponent(electionId)}`}>Transparencia</LinkRow>
              <LinkRow href={`/e/${encodeURIComponent(electionId)}/live`}>En vivo</LinkRow>
              {hasAuditPackage(phase) ? (
                <>
                  <a href={`/api/elections/${encodeURIComponent(electionId)}/artifacts`} download className="flex min-h-12 items-center gap-2 border-t border-border font-semibold underline-offset-4 hover:underline">
                    <Download className="size-4" aria-hidden="true" /> Exportar paquete de auditoría
                  </a>
                  <LinkRow href={`/e/${encodeURIComponent(electionId)}#verificar`}>Verificar en el navegador</LinkRow>
                </>
              ) : null}
            </nav>
          </MoreSection>
        </div>
      </details>

      <p className="sr-only" role="status" aria-live="polite">
        {copied ? "Copiado al portapapeles" : ""}
      </p>
    </div>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card px-4 py-3.5 shadow-card lg:px-6 lg:py-5">
      <span className="text-small font-semibold text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SeatsFigure({ taken, max }: { taken: number | null; max: number | null }) {
  const pct = taken !== null && max ? Math.min(100, (taken / max) * 100) : null;
  return (
    <div aria-live="polite">
      <span className="q-num block text-[2.25rem] font-bold leading-none tracking-[-0.03em] lg:text-[4rem]" data-testid="org-seats">
        {taken !== null ? formatInt(taken) : "—"}
        {max !== null ? <small className="ml-1 text-[0.5em] font-semibold tracking-normal text-muted-foreground">de {formatInt(max)}</small> : null}
      </span>
      {pct !== null ? (
        <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Inscritos" aria-valuenow={taken ?? 0} aria-valuemin={0} aria-valuemax={max ?? 0}>
          <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function MoreSection({ id, icon, title, meta, children, open, onToggle }: { id: string; icon: React.ReactNode; title: string; meta?: React.ReactNode; children: React.ReactNode; open?: boolean; onToggle: (open: boolean) => void }) {
  return (
    <details id={`more-${id}`} className="group/sec scroll-mt-20 rounded-lg border border-border/70 bg-card shadow-card" open={open} onToggle={(e) => onToggle(e.currentTarget.open)} data-testid={`more-${id}`}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground">{icon}</span>
        <span className="min-w-0 flex-1">{title}</span>
        {meta !== undefined ? <span className="whitespace-nowrap text-right text-small font-medium text-muted-foreground">{meta}</span> : null}
        <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-open/sec:rotate-180" aria-hidden="true" />
      </summary>
      <div className={cn("border-t border-border p-4")}>{children}</div>
    </details>
  );
}

function LinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-12 items-center font-semibold underline-offset-4 hover:underline [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border">
      {children}
    </Link>
  );
}
