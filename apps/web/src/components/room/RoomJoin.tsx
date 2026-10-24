"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { RoomPublicInfo } from "@quorum/contracts";
import { ErrorState, LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input } from "@/components/ui/input";
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

const POLL_MS = 5000;

/** Texto del consentimiento: corto y honesto. Exportado para el test de componentes. */
export const CONSENT_POINTS = [
  "Entras con un alias. No pedimos tu nombre real, teléfono ni documento.",
  "Para evitar que una misma persona entre dos veces, tu teléfono calcula un descriptor facial (números, no la foto). Se guarda cifrado en el servidor solo durante la inscripción y se borra al abrir la votación. Es modo demo: no verifica tu identidad.",
  "Tu boleta lleva una prueba de que estás en el padrón. Esa prueba no revela cuál inscrito emitió cada boleta.",
  "El servidor sí ve el contenido de cada boleta (la opción) para contarla, y quien lo opera ve la hora en que llega.",
] as const;

/**
 * `/j/<roomCode>`: entrada a la sala abierta desde el QR del proyector. Móvil primero (360 px).
 * Muestra título y "X de N lugares"; pide alias (misma validación que el backend) y consentimiento; al unirse guarda el
 * token en este teléfono y redirige a `/v/<token>`. Sala llena / cerrada / expirada / votación ya abierta → modo observador.
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
  const [consent, setConsent] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState(false);
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
    setConsentError(!consent);
    if (!v.ok || !consent) return;
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
      <header className="flex flex-col gap-2">
        <p className="text-small font-semibold uppercase tracking-wide text-muted-foreground">
          Sala <span className="q-mono">{roomCode}</span>
        </p>
        <h1 className="text-title font-bold tracking-tight">{info.title}</h1>
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
        <form onSubmit={submit} noValidate>
          <Card>
            <CardHeader>
              <CardTitle as="h2">Entra a la votación</CardTitle>
              <CardDescription>Elige un alias. Después harás la inscripción con tu rostro (modo demo) desde este teléfono.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Field label="Alias" htmlFor="alias" hint="De 1 a 32 caracteres. Sin teléfono ni número de documento." error={aliasError}>
                <Input
                  id="alias"
                  name="alias"
                  autoComplete="nickname"
                  autoCapitalize="words"
                  enterKeyHint="go"
                  value={alias}
                  maxLength={40}
                  onChange={(e) => {
                    setAlias(e.target.value);
                    if (aliasError) setAliasError(null);
                  }}
                  aria-invalid={Boolean(aliasError)}
                  aria-describedby={aliasError ? "alias-error" : "alias-hint"}
                />
              </Field>
              <div className="rounded-md border border-border bg-muted p-3">
                <p className="mb-2 text-small font-semibold">Qué se guarda y qué no</p>
                <ul className="mb-3 list-disc space-y-1 pl-5 text-small text-muted-foreground" data-testid="room-consent">
                  {CONSENT_POINTS.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
                <Checkbox
                  id="room-consent"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (e.target.checked) setConsentError(false);
                  }}
                  label="Entiendo y acepto la inscripción en modo demo."
                />
                {consentError ? (
                  <p role="alert" className="mt-2 text-small font-semibold text-danger-strong">
                    Error: necesitamos tu consentimiento para continuar.
                  </p>
                ) : null}
              </div>
              {joinError && joinError.kind !== "full" && joinError.kind !== "closed" ? (
                <Alert tone={joinError.kind === "rate" ? "warning" : "danger"} title={joinError.kind === "rate" ? "Espera un momento" : "No se pudo entrar"}>
                  {joinError.message}
                </Alert>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button type="submit" full size="lg" loading={joining || redirecting}>
                {redirecting ? "Abriendo tu inscripción…" : "Entrar a la sala"}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="q-container q-narrow flex flex-col gap-5 py-6 md:py-10">{children}</div>;
}
