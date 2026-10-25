"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Option, RoomPublicInfo } from "@quorum/contracts";
import { ErrorState, LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Consent } from "@/components/voter/Consent";
import { StepIndicator } from "@/components/voter/VoterUi";
import { ApiClientError, voterMessage } from "@/lib/client/api";
import { optionInitial } from "@/lib/client/optionImage";
import {
  classifyJoinError,
  forgetRoomJoin,
  gateCopy,
  invitePathFrom,
  loadRoomJoin,
  prefetchHeavyAssets,
  roomApi,
  roomGate,
  saveRoomJoin,
  validateAlias,
  type StoredRoomJoin,
} from "@/lib/client/room";
import type { JoinRoomResult } from "@quorum/contracts";
import type { BadgeFailure } from "@/lib/client/badge";
import { BadgeJoin } from "./BadgeJoin";
import { ObserverPanel } from "./ObserverPanel";
import { remaining, useNow } from "./useNow";
import { VoterShell } from "@/components/voter/VoterUi";

/* Precarga y compila los modelos de la cámara mientras la persona escribe su nombre (solo cliente). */
const HumanPreloader = dynamic(() => import("@/components/voter/HumanPreloader"), { ssr: false });

const POLL_MS = 5000;

/** Lo propio de la sala, antes del texto común del consentimiento (components/voter/Consent.tsx). */
export const ROOM_CONSENT_EXTRA = ["Entras con un nombre o apodo. No pedimos tu nombre real, teléfono ni documento."] as const;

/** Línea corta bajo el título de /j (apodo y credencial). */
export const JOIN_SUBTITLE = "Inscríbete para votar en esta votación desde tu teléfono.";
/** Enlace del desplegable que explica la inscripción (misma pinta que «Cómo usamos tu cámara»). */
export const JOIN_PURPOSE_LABEL = "¿Para qué me inscribo?";
/**
 * Tres viñetas honestas, por forma de entrar: qué pasa al tocar el botón, qué recibes y qué NO hacemos.
 * Sin «anónimo», «voto secreto» ni «identidad verificada»; sí se dice que el servidor ve cada boleta.
 * En modo apodo no se nombra la credencial (en /j con apodo esa palabra es jerga).
 */
export const JOIN_PURPOSE_POINTS: Record<"open-alias" | "event-badge", readonly [string, string, string]> = {
  "event-badge": [
    "Al escanear: tu credencial del evento vale una sola vez en esta votación. Después, la cámara comprueba que eres una persona y que no te inscribes dos veces. No guardamos fotos.",
    "Qué recibes: una boleta en este teléfono y, al votar, un comprobante que no muestra tu opción.",
    "Qué no hacemos: no pedimos tu documento ni comprobamos quién eres. El servidor sí ve cada boleta cuando llega.",
  ],
  "open-alias": [
    "Al tocar Continuar: entras con un nombre o apodo, sin documento ni teléfono. La cámara comprueba que eres una persona y que no te inscribes dos veces. No guardamos fotos.",
    "Qué recibes: una boleta en este teléfono y, al votar, un comprobante que no muestra tu opción.",
    "Qué no hacemos: no pedimos tu documento ni comprobamos quién eres. El servidor sí ve cada boleta cuando llega.",
  ],
};

/** Subtítulo + desplegable «¿Para qué me inscribo?» (plegado por defecto), debajo del título de /j. */
export function JoinPurpose({ method }: { method: keyof typeof JOIN_PURPOSE_POINTS }) {
  return (
    <div className="flex flex-col gap-1" data-testid="join-purpose-block">
      <p className="text-body text-muted-foreground" data-testid="join-subtitle">
        {JOIN_SUBTITLE}
      </p>
      <Disclosure
        variant="link"
        title={JOIN_PURPOSE_LABEL}
        testId="join-purpose"
        className="[&>summary]:text-small [&>summary]:font-normal [&>summary]:text-muted-foreground [&>summary]:decoration-muted-foreground/50 [&>summary>svg]:size-4"
      >
        <ul className="list-disc space-y-2 pl-5 text-small leading-relaxed text-muted-foreground" data-testid="join-purpose-points">
          {JOIN_PURPOSE_POINTS[method].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Disclosure>
    </div>
  );
}

/**
 * «Así es la boleta»: la pregunta y sus opciones como tarjetas pequeñas de solo lectura (foto o inicial, nombre,
 * subtítulo), con el mismo estilo que la boleta real (components/voter/BallotScreen.tsx) pero sin radios ni botón.
 */
export function BallotPreview({ title, options }: { title: string; options: readonly Option[] }) {
  if (options.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="ballot-preview-eyebrow" data-testid="ballot-preview">
      <p className="q-eyebrow" id="ballot-preview-eyebrow">
        Así es la boleta
      </p>
      {/* La pregunta ya es el título de la página: no se repite; queda solo para lectores de pantalla. */}
      <p className="sr-only" data-testid="preview-question">
        {title}
      </p>
      <ul className="flex flex-col gap-1.5" aria-label="Opciones de la boleta">
        {options.map((opt) => (
          <li key={opt.id} className="flex min-h-12 items-center gap-3 rounded-md border-2 border-border bg-card px-3 py-1.5 text-body shadow-card" data-testid="preview-option">
            {/* Avatar de 36 px: la foto de la opción si la hay; si no, su inicial. Decorativo (el nombre va al lado). */}
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-soft text-body font-bold text-primary-soft-foreground" aria-hidden="true" data-testid="preview-avatar">
              {opt.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URI recortado y comprimido en el teléfono del organizador; no hay nada que optimizar.
                <img src={opt.image} alt="" width={36} height={36} className="size-full object-cover" draggable={false} />
              ) : (
                optionInitial(opt.label)
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold leading-tight">{opt.label}</span>
              {opt.subtitle ? (
                <span className="block text-small leading-snug text-muted-foreground" data-testid="preview-subtitle">
                  {opt.subtitle}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-small text-muted-foreground">Solo para que la conozcas: se vota después de inscribirse.</p>
    </section>
  );
}

/**
 * `/j/<roomCode>`: entrada a la sala abierta desde el QR del proyector. Móvil primero (360 px).
 * Paso 1 de 2 de la inscripción en UNA pantalla: título, "La entrada cierra en …" (gris, pequeño), subtítulo y
 * «¿Para qué me inscribo?» (plegado), la vista previa de la boleta («Así es la boleta», solo lectura), "Tu nombre o apodo"
 * (misma validación que el backend), el enlace "Cómo usamos tu cámara" y "Continuar" (tocarlo es aceptar). Sin contador
 * de lugares. Al unirse guarda el token en este teléfono y
 * va a `/v/<token>`, que abre directo la cámara (paso 2). Sala llena / cerrada / expirada / votación abierta → observador.
 */
export function RoomJoin({ roomCode: rawCode }: { roomCode: string }) {
  const roomCode = rawCode.trim().toUpperCase();
  const router = useRouter();
  const now = useNow(1000);
  const [info, setInfo] = useState<RoomPublicInfo | null>(null);
  const [loadError, setLoadError] = useState<{ notFound: boolean; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<StoredRoomJoin | null>(null);
  const [alias, setAlias] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<ReturnType<typeof classifyJoinError> | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  // ¿Ya entré desde este teléfono? → retomar el flujo (no se pide otro lugar).
  useEffect(() => {
    const t = window.setTimeout(() => setStored(loadRoomJoin(roomCode)), 0);
    return () => clearTimeout(t);
  }, [roomCode]);

  useEffect(() => {
    let cancelled = false;
    roomApi
      .info(roomCode)
      .then((r) => {
        if (cancelled) return;
        setInfo(r);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const notFound = e instanceof ApiClientError && e.status === 404;
        setLoadError({ notFound, message: notFound ? "No existe una sala con ese código. Revisa el código que aparece en la pantalla." : voterMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [roomCode, attempt]);

  // Mantener el contador al día mientras la persona escribe.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setAttempt((a) => a + 1);
    }, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Precarga de lo pesado (modelos de la cámara primero, luego ZK) desde que se abre /j: con red lenta cada segundo
  // cuenta, así que no se espera a que el navegador esté ocioso.
  useEffect(() => {
    void prefetchHeavyAssets().then((mode) => document.documentElement.setAttribute("data-heavy-prefetch", mode));
  }, []);

  const go = useCallback(
    (path: string) => {
      setRedirecting(true);
      router.push(path);
    },
    [router],
  );

  /** Entró (apodo o credencial): guarda el token en este teléfono y sigue a /v/<token> (paso 2: rostro). */
  const joined = useCallback(
    (r: JoinRoomResult) => {
      const invitePath = invitePathFrom(r.inviteUrl, r.inviteToken);
      const at = new Date().toISOString();
      saveRoomJoin({ roomCode, electionId: r.electionId, voterId: r.voterId, displayName: r.displayName, inviteToken: r.inviteToken, invitePath, joinedAt: at, consentAt: at });
      go(invitePath);
    },
    [roomCode, go],
  );
  const badgeRoomFailure = useCallback((f: BadgeFailure) => {
    setJoinError({ kind: f.kind === "full" ? "full" : "closed", message: f.message });
    setAttempt((a) => a + 1);
  }, []);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setJoinError(null);
    const v = validateAlias(alias);
    setAliasError(v.ok ? null : v.error);
    if (!v.ok) return;
    setJoining(true);
    try {
      joined(await roomApi.join(roomCode, v.value));
    } catch (e) {
      const f = classifyJoinError(e);
      if (f.kind === "alias") setAliasError(f.message);
      else setJoinError(f);
      if (f.kind === "full" || f.kind === "closed") setAttempt((a) => a + 1);
    } finally {
      setJoining(false);
    }
  }

  if (stored) {
    return (
      <VoterShell>
        <Card data-testid="room-resume">
          <CardHeader>
            <CardTitle as="h1" className="text-title">
              Hola, {stored.displayName}
            </CardTitle>
            <CardDescription>Tu lugar quedó guardado en este teléfono.</CardDescription>
          </CardHeader>
          <CardFooter className="flex-col md:flex-col">
            <Button full size="lg" onClick={() => go(stored.invitePath)} loading={redirecting}>
              Continuar
            </Button>
            <Button
              variant="link"
              className="self-center"
              onClick={() => {
                forgetRoomJoin(roomCode);
                setStored(null);
              }}
            >
              No soy yo
            </Button>
          </CardFooter>
        </Card>
      </VoterShell>
    );
  }

  if (loadError) {
    return (
      <VoterShell>
        <ErrorState title={loadError.notFound ? "Sala no encontrada" : "No se pudo abrir la sala"} message={loadError.message} onRetry={() => setAttempt((a) => a + 1)}>
          <Link href="/" className="inline-flex min-h-tap items-center px-2 font-semibold underline underline-offset-4">
            Ir al inicio
          </Link>
        </ErrorState>
      </VoterShell>
    );
  }

  if (!info) {
    return (
      <VoterShell>
        <LoadingState label="Abriendo la sala…" lines={4} />
      </VoterShell>
    );
  }

  const gate = joinError?.kind === "full" ? "full" : joinError?.kind === "closed" && roomGate(info, now ?? undefined) === "open" ? "manual" : roomGate(info, now ?? undefined);
  const left = remaining(info.expiresAt, now);
  const method = info.eligibility?.method === "event-badge" ? "event-badge" : "open-alias";
  // Servidor viejo sin `options`: no hay vista previa (nunca una tarjeta vacía).
  const preview = info.options && info.options.length > 0 ? <BallotPreview title={info.title} options={info.options} /> : null;

  return (
    <VoterShell>
      {gate === "open" ? <StepIndicator current={1} /> : null}
      {gate === "open" ? <HumanPreloader /> : null}
      <header className="flex flex-col gap-1">
        <h1 className="text-title font-bold leading-tight tracking-tight">{info.title}</h1>
        {gate === "open" && left ? (
          <p className="text-small text-muted-foreground" aria-live="polite" data-testid="room-closes-in">
            La entrada cierra en {left}
          </p>
        ) : null}
        {gate === "open" ? <JoinPurpose method={method} /> : null}
      </header>

      {gate !== "open" ? (
        <>
          <Alert tone="warning" title={gateCopy[gate].title}>
            {joinError?.kind === "closed" && joinError.message ? `${joinError.message}. ` : ""}
            {gateCopy[gate].body}
          </Alert>
          <ObserverPanel electionId={info.electionId} hasDraw bare />
        </>
      ) : method === "event-badge" ? (
        <BadgeJoin roomCode={roomCode} badgeUrlPrefix={info.eligibility?.badgeUrlPrefix} onJoined={joined} onRoomFailure={badgeRoomFailure} redirecting={redirecting} preview={preview} />
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5 text-heading">
          {preview}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="alias" className="text-heading font-semibold">
              Tu nombre o apodo
            </label>
            <Input
              id="alias"
              name="alias"
              autoComplete="nickname"
              autoCapitalize="words"
              enterKeyHint="go"
              value={alias}
              maxLength={40}
              className="min-h-14 text-heading"
              onChange={(e) => {
                setAlias(e.target.value);
                if (aliasError) setAliasError(null);
              }}
              aria-invalid={Boolean(aliasError)}
              aria-describedby={aliasError ? "alias-error" : "alias-hint"}
            />
            {aliasError ? (
              <p id="alias-error" role="alert" className="text-base font-semibold text-danger-strong">
                Error: {aliasError}
              </p>
            ) : (
              <p id="alias-hint" className="text-base text-muted-foreground">
                No pongas tu teléfono ni tu número de documento.
              </p>
            )}
          </div>
          <Consent compact extra={ROOM_CONSENT_EXTRA} />
          {joinError && joinError.kind !== "full" && joinError.kind !== "closed" ? (
            <Alert tone={joinError.kind === "rate" ? "warning" : "danger"} title={joinError.kind === "rate" ? "Espera un momento" : "No se pudo entrar"}>
              {joinError.message}
            </Alert>
          ) : null}
          <Button type="submit" full size="lg" className="min-h-14" loading={joining || redirecting}>
            {redirecting ? "Abriendo la cámara…" : "Continuar"}
          </Button>
        </form>
      )}
    </VoterShell>
  );
}

