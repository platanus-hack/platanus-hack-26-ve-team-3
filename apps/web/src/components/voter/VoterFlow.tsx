"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock } from "lucide-react";
import type { InviteResponse as InviteV1, Receipt } from "@quorum/contracts";
import type { z } from "zod";
import { ObserverPanel } from "@/components/room/ObserverPanel";
import { ErrorState, LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { formatDate } from "@/lib/client/format";
import { clearPendingFace, isRegistered, loadPendingFace, loadReceipt, peekIdentity, savePendingFace, type StoredReceipt, type VaultInfo } from "@/lib/client/identityVault";
import { linkThisPhone, type LinkProgress, type LinkResult } from "@/lib/client/linkPhone";
import { prefetchHeavyAssets, roomJoinForToken } from "@/lib/client/room";
import { BallotScreen } from "./BallotScreen";
import { Consent } from "./Consent";
import { LinkModeBadge, VoteReceiptCard, type ReceiptView } from "./VoteReceiptCard";
import { StepIndicator, TechDetails, TechRow, VoterShell } from "./VoterUi";

type ReceiptV1 = z.infer<typeof Receipt>;

/* Human toca window/WebGL: sólo en cliente. */
const FaceCapture = dynamic(() => import("./FaceCapture"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black text-title font-bold text-white">
      <span className="q-spinner mr-2" aria-hidden="true" /> Preparando la cámara…
    </div>
  ),
});

const POLL_MS = 5000;

export type View = "intro" | "face" | "linking" | "waiting" | "ballot" | "receipt" | "voted" | "closed" | "not-linked" | "other-device" | "observer" | "draft";
type Local = { identity: VaultInfo | null; registered: boolean; receipt: StoredReceipt | null; pendingFace: `0x${string}` | null };

function readLocal(electionId: string, voterId: string): Local {
  const identity = peekIdentity(electionId);
  const mine = identity && identity.voterId === voterId ? identity : null;
  return { identity: mine, registered: mine ? isRegistered(electionId) : false, receipt: loadReceipt(electionId), pendingFace: loadPendingFace(voterId) };
}

/** Qué pantalla corresponde según la fase y lo guardado en este teléfono. Exportado para tests. */
export function autoView(invite: InviteV1, local: Local, roomConsent: boolean): View {
  const phase = invite.election.status;
  // `votedAt` (autodeclarado, granularidad de día) también cuenta: otro navegador no ofrece votar de nuevo.
  if (local.receipt || invite.voter.votedAt) return "voted";
  if (phase === "registration") {
    if (local.identity && local.registered && invite.voter.walletAddress) return "waiting";
    const face = local.pendingFace ?? local.identity?.faceBindingHash ?? null;
    if (invite.voter.livenessPassedAt) return face ? "linking" : "other-device";
    return roomConsent ? "face" : "intro";
  }
  if (phase === "open") return local.identity ? "ballot" : "not-linked";
  if (phase === "draft") return "draft";
  return "closed";
}

/** Pantallas que se actualizan solas cuando cambia la fase (polling). Las demás son acciones en curso del votante. */
const FOLLOWS_PHASE = new Set<View>(["intro", "waiting", "draft", "not-linked", "other-device"]);

/** Avisa que la votación empezó: vibra y suena si el navegador lo permite. */
function notifyOpen() {
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* sin vibración */
  }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    /* sin audio */
  }
}

/**
 * Flujo del votante (`/v/[token]`). Inscripción en 2 pasos y voto en 1 pantalla:
 *  1. Datos y consentimiento (si llegó por la sala `/j`, ya lo hizo allí y salta al paso 2).
 *  2. Rostro a pantalla completa → "Vinculando este teléfono…" (wallet + FaceBinding + identidad, en segundo plano)
 *     → "¡Listo!" y espera: la página consulta la fase y pasa sola a la boleta.
 *  Voto: boleta → "Votar: <opción>" → comprobante. Nada de esto pide firmar ni abrir nada.
 */
export function VoterFlow({ token }: { token: string }) {
  const [invite, setInvite] = useState<InviteV1 | null>(null);
  const [local, setLocal] = useState<Local | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<View | null>(null);
  const [faceHash, setFaceHash] = useState<`0x${string}` | null>(null);
  const [linked, setLinked] = useState<LinkResult | null>(null);
  const [receipt, setReceipt] = useState<ReceiptV1 | null>(null);
  const viewRef = useRef<View | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    apiV1
      .getInvite(token)
      .then((data) => {
        if (cancelled) return;
        const l = readLocal(data.election.id, data.voter.id);
        const auto = autoView(data, l, Boolean(roomJoinForToken(token)?.consentAt));
        setInvite(data);
        setLocal(l);
        setLoadError(null);
        const prev = viewRef.current;
        if (prev === null || (FOLLOWS_PHASE.has(prev) && auto !== prev)) {
          if (prev === "waiting" && auto === "ballot") {
            notifyOpen();
            document.title = "¡La votación empezó! · Quórum";
          }
          setView(auto);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled && viewRef.current === null) setLoadError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  // Esperando (inscrito, borrador, o leyendo la invitación): consultar la fase cada 5 s mientras la pestaña esté visible.
  const polling = view !== null && FOLLOWS_PHASE.has(view);
  useEffect(() => {
    if (!polling) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setAttempt((a) => a + 1);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [polling]);

  // Mantener la pantalla encendida mientras espera la apertura (si el navegador lo permite).
  useEffect(() => {
    if (view !== "waiting") return;
    let lock: { release(): Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [view]);

  // Precarga (sin bloquear) de los modelos de la cámara y los artefactos del voto mientras la persona lee.
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const warm = () => void prefetchHeavyAssets().catch(() => undefined);
    const t = idle ? idle(warm) : window.setTimeout(warm, 1500);
    return () => {
      if (!idle) clearTimeout(t);
    };
  }, []);

  const retry = useCallback(() => {
    setLoadError(null);
    setAttempt((a) => a + 1);
  }, []);

  if (loadError && !invite) {
    return (
      <VoterShell>
        <ErrorState title="No se pudo abrir la invitación" message={loadError} onRetry={retry}>
          <Link href="/" className="inline-flex min-h-tap items-center px-2 font-semibold underline underline-offset-4">
            Ir al inicio
          </Link>
        </ErrorState>
      </VoterShell>
    );
  }
  if (!invite || !local || !view) {
    return (
      <VoterShell>
        <LoadingState label="Abriendo tu invitación…" lines={4} />
      </VoterShell>
    );
  }

  const electionId = invite.election.id;
  const voterId = invite.voter.id;
  const title = invite.election.title;
  const refreshLocal = () => setLocal(readLocal(electionId, voterId));

  switch (view) {
    case "intro":
      return (
        <VoterShell>
          <StepIndicator current={1} />
          <h1 className="text-title font-bold leading-tight">{title}</h1>
          {invite.voter.displayName ? <p className="text-muted-foreground">Hola, {invite.voter.displayName}.</p> : null}
          <Consent />
          <Button size="lg" full className="min-h-14 text-title" onClick={() => setView("face")}>
            Continuar
          </Button>
        </VoterShell>
      );

    case "face":
      return (
        <VoterShell>
          <StepIndicator current={2} />
          <FaceCapture
            voterId={voterId}
            inviteToken={token}
            onEnrolled={(hash) => {
              savePendingFace(voterId, hash);
              setFaceHash(hash);
              setView("linking");
            }}
            onCancel={() => setView("intro")}
            onObserve={() => setView("observer")}
          />
        </VoterShell>
      );

    case "linking": {
      const hash = faceHash ?? local.pendingFace ?? local.identity?.faceBindingHash ?? null;
      if (!hash) return <OtherDevice />;
      return (
        <Linking
          electionId={electionId}
          voterId={voterId}
          inviteToken={token}
          faceBindingHash={hash}
          linkedAddress={invite.voter.walletAddress}
          onDone={(r) => {
            clearPendingFace(voterId);
            setLinked(r);
            refreshLocal();
            setInvite((i) => (i ? { ...i, voter: { ...i.voter, walletAddress: r.address } } : i));
            setView(invite.election.status === "open" ? "ballot" : "waiting");
          }}
        />
      );
    }

    case "waiting":
      return (
        <VoterShell className="items-center text-center">
          <CheckCircle2 className="size-20 text-success" aria-hidden="true" strokeWidth={1.75} />
          <h1 className="text-display font-bold tracking-tight">¡Listo! Ya estás inscrito.</h1>
          <p className="text-heading">Deja esta página abierta: la votación aparecerá aquí cuando empiece.</p>
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-base text-muted-foreground" data-testid="waiting-status">
            <Clock className="size-5" aria-hidden="true" /> Esperando que empiece la votación…
          </p>
          <TechDetails className="w-full text-left">
            <div>
              <p className="text-muted-foreground">Vinculación del teléfono</p>
              <LinkModeBadge mode={linked?.mode ?? local.identity?.walletMode ?? null} />
            </div>
            <TechRow label="Dirección (wallet)">{linked?.address ?? local.identity?.address ?? "—"}</TechRow>
            <TechRow label="Commitment Semaphore (público)" testId="commitment">
              {linked?.commitment ?? local.identity?.commitment ?? "—"}
            </TechRow>
            {linked ? <TechRow label="Inscritos hasta ahora">{linked.registeredCount}</TechRow> : null}
            <p className="text-muted-foreground">
              Este teléfono firmó EIP-712 FaceBinding (rostro ↔ wallet) y creó una credencial Semaphore. Su clave privada queda cifrada en este navegador con una clave del dispositivo (no extraíble) y nunca se envía. Al servidor sólo fue el commitment. Nada se envió on-chain.
            </p>
            {linked?.fellBack ? <p className="text-warning-strong">ZeroDev no respondió: se usó la wallet demo (eoa-demo).</p> : null}
            {linked && !linked.persisted ? <p className="text-warning-strong">Este navegador no guardó la clave de la wallet (¿modo privado?).</p> : null}
          </TechDetails>
        </VoterShell>
      );

    case "ballot":
      return (
        <VoterShell>
          <BallotScreen
            electionId={electionId}
            electionTitle={title}
            options={invite.election.options}
            voterId={voterId}
            inviteToken={token}
            onDone={(r) => {
              setReceipt(r);
              refreshLocal();
              setView("receipt");
            }}
            onAlreadyVoted={() => {
              refreshLocal();
              setView("voted");
            }}
          />
        </VoterShell>
      );

    case "receipt":
    case "voted": {
      const r: ReceiptView | null = receipt
        ? { inclusionId: receipt.inclusionId, nullifier: receipt.nullifier ?? receipt.inclusionId, index: receipt.index, hash: receipt.hash, state: receipt.state === "incluido" ? "incluido" : "recibido" }
        : local.receipt
          ? { inclusionId: local.receipt.inclusionId, nullifier: local.receipt.nullifier, index: local.receipt.index, hash: local.receipt.hash, state: local.receipt.state ?? "recibido" }
          : null;
      return (
        <VoterShell>
          <VoteReceiptCard electionId={electionId} receipt={r} walletMode={local.identity?.walletMode ?? null} votedAt={invite.voter.votedAt ? formatDate(invite.voter.votedAt) : null} />
        </VoterShell>
      );
    }

    case "closed":
      return (
        <VoterShell>
          <h1 className="text-title font-bold leading-tight">La votación terminó</h1>
          <p className="text-muted-foreground">{title}</p>
          <Link href={`/e/${encodeURIComponent(electionId)}/live`} className="inline-flex min-h-14 items-center justify-center rounded-md bg-primary px-4 text-title font-semibold text-primary-foreground hover:bg-primary-hover">
            Ver resultados
          </Link>
          <Link href={`/e/${encodeURIComponent(electionId)}`} className="inline-flex min-h-tap items-center justify-center font-semibold underline underline-offset-4">
            Comprobar el resultado
          </Link>
        </VoterShell>
      );

    case "not-linked":
      return (
        <Watch title="La votación ya empezó" body="Este teléfono no quedó inscrito en esta votación, así que no puede votar aquí. Puedes seguirla sin votar." electionId={electionId} />
      );

    case "other-device":
      return <OtherDevice electionId={electionId} />;

    case "observer":
      return <Watch title="Sigue la votación" body="No necesitas inscribirte para ver los resultados y comprobarlos." electionId={electionId} />;

    case "draft":
      return (
        <VoterShell>
          <h1 className="text-title font-bold leading-tight">{title}</h1>
          <Alert tone="info" title="La inscripción aún no abre">
            Deja esta página abierta: se actualizará sola cuando el organizador abra la inscripción.
          </Alert>
        </VoterShell>
      );
  }
}

function Watch({ title, body, electionId }: { title: string; body: string; electionId: string }) {
  return (
    <VoterShell>
      <h1 className="text-title font-bold leading-tight">{title}</h1>
      <p>{body}</p>
      <ObserverPanel electionId={electionId} />
    </VoterShell>
  );
}

function OtherDevice({ electionId }: { electionId?: string }) {
  return (
    <VoterShell>
      <h1 className="text-title font-bold leading-tight">Ya empezaste en otro teléfono</h1>
      <p>Tu rostro ya se comprobó desde otro teléfono o navegador. Abre este mismo enlace en ese teléfono para terminar.</p>
      {electionId ? <ObserverPanel electionId={electionId} /> : null}
    </VoterShell>
  );
}

const LINK_STEPS = ["Preparando este teléfono", "Guardando la vinculación", "Creando tu clave de voto", "Terminando la inscripción"] as const;

/** "Vinculando este teléfono…": wallet + FaceBinding + identidad Semaphore + commitment, sin pedir nada. */
function Linking({ electionId, voterId, inviteToken, faceBindingHash, linkedAddress, onDone }: { electionId: string; voterId: string; inviteToken: string; faceBindingHash: `0x${string}`; linkedAddress: string | null; onDone: (r: LinkResult) => void }) {
  const [progress, setProgress] = useState<LinkProgress>({ step: 1, of: 4 });
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === run) return; // StrictMode monta dos veces: una sola vinculación por intento.
    started.current = run;
    linkThisPhone({ electionId, voterId, inviteToken, faceBindingHash, linkedAddress, onProgress: setProgress })
      .then(onDone)
      .catch((e: unknown) => setError(describeError(e)));
  }, [run, electionId, voterId, inviteToken, faceBindingHash, linkedAddress, onDone]);

  const pct = Math.round(((progress.step - (error ? 1 : 0.5)) / progress.of) * 100);
  return (
    <VoterShell>
      <StepIndicator current={2} />
      {!error ? (
        <div className="flex flex-col gap-4" role="status" aria-live="polite" data-testid="linking">
          <h1 className="text-title font-bold">Vinculando este teléfono…</h1>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progreso">
            <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-muted-foreground">{LINK_STEPS[progress.step - 1]}…</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <h1 className="text-title font-bold">No pudimos vincular este teléfono</h1>
          <Alert tone="danger" title="Algo falló">
            {error}
          </Alert>
          <Button
            size="lg"
            full
            className="min-h-14"
            onClick={() => {
              setError(null);
              setProgress({ step: 1, of: 4 });
              setRun((r) => r + 1);
            }}
          >
            Intentar de nuevo
          </Button>
        </div>
      )}
    </VoterShell>
  );
}
