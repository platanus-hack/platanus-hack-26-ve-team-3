"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { RoomPublicInfo } from "@quorum/contracts";
import { ErrorState, LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Consent } from "@/components/voter/Consent";
import { StepIndicator } from "@/components/voter/VoterUi";
import { ApiClientError, describeError } from "@/lib/client/api";
import { formatInt } from "@/lib/client/format";
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
import { ObserverPanel } from "./ObserverPanel";
import { remaining, useNow } from "./useNow";

/* Precarga y compila los modelos de la cámara mientras la persona escribe su nombre (solo cliente). */
const HumanPreloader = dynamic(() => import("@/components/voter/HumanPreloader"), { ssr: false });

const POLL_MS = 5000;

/** Lo propio de la sala, antes del texto común del consentimiento (components/voter/Consent.tsx). */
export const ROOM_CONSENT_EXTRA = ["Entras con un nombre o apodo. No pedimos tu nombre real, teléfono ni documento."] as const;

/**
 * `/j/<roomCode>`: entrada a la sala abierta desde el QR del proyector. Móvil primero (360 px).
 * Paso 1 de 2 de la inscripción en UNA pantalla: título, "Tu nombre o apodo" (misma validación que el backend), una línea
 * de consentimiento con "Más detalles" y "Continuar" (tocarlo es aceptar). Al unirse guarda el token en este teléfono y
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
        setLoadError({ notFound, message: notFound ? "No existe una sala con ese código. Revisa el código que aparece en la pantalla." : describeError(e) });
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

  // Precarga de modelos de Human y artefactos ZK mientras escribe el alias (caché HTTP inmutable).
  useEffect(() => {
    const warm = () => {
      void prefetchHeavyAssets().then((mode) => document.documentElement.setAttribute("data-heavy-prefetch", mode));
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const t = idle ? idle(warm) : window.setTimeout(warm, 1500);
    return () => {
      if (!idle) clearTimeout(t);
    };
  }, []);

  const go = useCallback(
    (path: string) => {
      setRedirecting(true);
      router.push(path);
    },
    [router],
  );

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setJoinError(null);
    const v = validateAlias(alias);
    setAliasError(v.ok ? null : v.error);
    if (!v.ok) return;
    setJoining(true);
    try {
      const r = await roomApi.join(roomCode, v.value);
      const invitePath = invitePathFrom(r.inviteUrl, r.inviteToken);
      const now = new Date().toISOString();
      saveRoomJoin({ roomCode, electionId: r.electionId, voterId: r.voterId, displayName: r.displayName, inviteToken: r.inviteToken, invitePath, joinedAt: now, consentAt: now });
      go(invitePath);
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
      <Shell>
        <Card data-testid="room-resume">
          <CardHeader>
            <Badge tone="success" className="w-fit">
              Ya entraste desde este teléfono
            </Badge>
            <CardTitle as="h1" className="text-title">
              Hola, {stored.displayName}
            </CardTitle>
            <CardDescription>Tu lugar quedó guardado en este teléfono. Sigue con tu inscripción o tu voto.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button full size="lg" onClick={() => go(stored.invitePath)} loading={redirecting}>
              Continuar
            </Button>
          </CardFooter>
          <CardContent>
            <button
              type="button"
              className="min-h-tap text-small text-muted-foreground underline underline-offset-4"
              onClick={() => {
                forgetRoomJoin(roomCode);
                setStored(null);
              }}
            >
              No soy yo: usar este teléfono para otra persona
            </button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (loadError) {
    return (
      <Shell>
        <ErrorState title={loadError.notFound ? "Sala no encontrada" : "No se pudo abrir la sala"} message={loadError.message} onRetry={() => setAttempt((a) => a + 1)}>
          <Link href="/" className="inline-flex min-h-tap items-center px-2 font-semibold underline underline-offset-4">
            Ir al inicio
          </Link>
        </ErrorState>
      </Shell>
    );
  }

  if (!info) {
    return (
      <Shell>
        <LoadingState label="Abriendo la sala…" lines={4} />
      </Shell>
    );
  }

  const gate = joinError?.kind === "full" ? "full" : joinError?.kind === "closed" && roomGate(info, now ?? undefined) === "open" ? "manual" : roomGate(info, now ?? undefined);
  const left = remaining(info.expiresAt, now);
  const seats = info.maxSeats !== null ? `${formatInt(info.seatsTaken)} de ${formatInt(info.maxSeats)} lugares` : `${formatInt(info.seatsTaken)} lugares ocupados`;

  return (
    <Shell>
      {gate === "open" ? <StepIndicator current={1} /> : null}
      {gate === "open" ? <HumanPreloader /> : null}
      <header className="flex flex-col gap-2">
        <h1 className="text-title font-bold leading-tight tracking-tight">{info.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-body" aria-live="polite" data-testid="room-seats">
          <Badge tone={gate === "open" ? "success" : "warning"}>{seats}</Badge>
          {gate === "open" && left ? <span className="text-small text-muted-foreground">La entrada cierra en {left}</span> : null}
        </p>
      </header>

      {gate !== "open" ? (
        <>
          <Alert tone="warning" title={gateCopy[gate].title}>
            {joinError?.kind === "closed" && joinError.message ? `${joinError.message}. ` : ""}
            {gateCopy[gate].body}
          </Alert>
          <ObserverPanel electionId={info.electionId} />
        </>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5 text-heading">
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
          <Consent extra={ROOM_CONSENT_EXTRA} />
          {joinError && joinError.kind !== "full" && joinError.kind !== "closed" ? (
            <Alert tone={joinError.kind === "rate" ? "warning" : "danger"} title={joinError.kind === "rate" ? "Espera un momento" : "No se pudo entrar"}>
              {joinError.message}
            </Alert>
          ) : null}
          <Button type="submit" full size="lg" className="min-h-14 text-title" loading={joining || redirecting}>
            {redirecting ? "Abriendo la cámara…" : "Continuar"}
          </Button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="q-container q-narrow flex flex-col gap-5 py-5 text-heading md:py-10">{children}</div>;
}
