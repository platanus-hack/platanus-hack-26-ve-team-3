"use client";

import { useCallback, useRef, useState } from "react";
import { QrCode } from "lucide-react";
import { DEFAULT_BADGE_URL_PREFIX, parseBadgeUrl } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Consent } from "@/components/voter/Consent";
import { badgeApi, BADGE_COPY, badgeUrlFromTyped, classifyBadgeError, type BadgeFailure } from "@/lib/client/badge";
import type { CameraFailure } from "@/lib/client/badge";
import type { JoinRoomResult } from "@quorum/contracts";
import { BadgeScanner } from "./BadgeScanner";

/** Lo propio de la credencial, antes del texto común del consentimiento. */
export const BADGE_CONSENT_EXTRA = [
  "Lees el QR de tu credencial del evento: solo comprobamos que eres participante y que tu credencial no se haya usado ya en esta votación. Guardamos una huella cifrada de tu credencial, nunca tu usuario, y no se liga a tu voto.",
] as const;

const SCAN_LABEL = "Escanear mi credencial";

const cameraCopy: Record<CameraFailure, string> = {
  denied: "No pudimos usar la cámara. Permite el acceso a la cámara en tu navegador o escribe tu usuario aquí abajo.",
  "no-camera": "Este teléfono no tiene una cámara disponible. Escribe tu usuario aquí abajo.",
  other: "No se pudo abrir la cámara. Escribe tu usuario aquí abajo.",
};

/**
 * Entrada con credencial del evento (D-19), dentro de `/j/<código>`. Un botón grande abre la cámara trasera en la página;
 * al leer un QR válido entra sola (sin más toques) y sigue al paso 2 (rostro). Alternativa sin cámara: "o escribe tu usuario".
 */
export function BadgeJoin({ roomCode, badgeUrlPrefix, onJoined, onRoomFailure, redirecting }: {
  roomCode: string;
  badgeUrlPrefix?: string;
  onJoined: (r: JoinRoomResult) => void;
  onRoomFailure: (f: BadgeFailure) => void;
  redirecting: boolean;
}) {
  const prefix = badgeUrlPrefix ?? DEFAULT_BADGE_URL_PREFIX;
  const [scanning, setScanning] = useState(false);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedError, setTypedError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "warning" | "danger"; title: string; text: string } | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const busy = useRef(false);

  const submit = useCallback(
    async (badgeUrl: string) => {
      if (busy.current) return;
      busy.current = true;
      const user = parseBadgeUrl(badgeUrl, prefix);
      setJoining(user ?? "");
      setNotice(null);
      try {
        const r = await badgeApi.join(roomCode, badgeUrl);
        setScanning(false);
        onJoined(r);
      } catch (e) {
        const f = classifyBadgeError(e);
        setJoining(null);
        if (f.kind === "full" || f.kind === "closed") {
          setScanning(false);
          onRoomFailure(f);
        } else {
          // Credencial usada / desconocida / QR ajeno: se apaga la cámara y se ofrece escanear otra vez.
          setScanning(false);
          setNotice({ tone: f.kind === "rate" ? "warning" : "danger", title: f.kind === "rate" ? "Espera un momento" : "No pudimos dejarte entrar", text: f.message });
        }
      } finally {
        busy.current = false;
      }
    },
    [prefix, roomCode, onJoined, onRoomFailure],
  );

  const onText = useCallback(
    (text: string) => {
      if (busy.current) return;
      if (!parseBadgeUrl(text, prefix)) {
        setNotice({ tone: "warning", title: "Ese QR no sirve", text: BADGE_COPY.invalid });
        return;
      }
      void submit(text.trim());
    },
    [prefix, submit],
  );

  const onCameraError = useCallback((kind: CameraFailure) => {
    setScanning(false);
    setTyping(true);
    setNotice({ tone: "warning", title: "No se pudo abrir la cámara", text: cameraCopy[kind] });
  }, []);

  function submitTyped(ev: React.FormEvent) {
    ev.preventDefault();
    const url = badgeUrlFromTyped(typed, prefix);
    if (!url) return setTypedError(BADGE_COPY.typedInvalid);
    setTypedError(null);
    void submit(url);
  }

  const working = joining !== null || redirecting;

  return (
    <div className="flex flex-col gap-5" data-testid="badge-join">
      {scanning ? (
        <div className="flex flex-col gap-3">
          <BadgeScanner onText={onText} onCameraError={onCameraError} />
          <p className="text-center text-heading font-semibold" role="status" aria-live="polite">
            {working ? (
              <span className="inline-flex items-center gap-2">
                <span className="q-spinner" aria-hidden="true" /> {redirecting ? "Abriendo la cámara frontal…" : "Comprobando tu credencial…"}
              </span>
            ) : (
              "Apunta al QR de tu credencial"
            )}
          </p>
          {!working ? (
            <Button variant="link" className="self-center" onClick={() => setScanning(false)}>
              Cancelar
            </Button>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <Alert tone={notice.tone} title={notice.title}>
          <span data-testid="badge-notice">{notice.text}</span>
        </Alert>
      ) : null}

      {!scanning ? <Consent extra={BADGE_CONSENT_EXTRA} actionLabel={SCAN_LABEL} /> : null}

      {!scanning ? (
        <Button full size="lg" variant={typing ? "secondary" : "primary"} className="min-h-14" onClick={() => (setNotice(null), setScanning(true))} loading={working} data-testid="badge-scan">
          {!working ? <QrCode className="size-6" aria-hidden="true" /> : null}
          {working ? (redirecting ? "Abriendo la cámara…" : "Comprobando…") : notice ? "Escanear otra vez" : SCAN_LABEL}
        </Button>
      ) : null}

      {!scanning ? (
        typing ? (
          <form onSubmit={submitTyped} noValidate className="flex flex-col gap-2">
            <label htmlFor="badge-user" className="text-heading font-semibold">
              o escribe tu usuario
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="badge-user"
                name="badge-user"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="tu-usuario-de-github"
                value={typed}
                maxLength={120}
                className="min-h-14 flex-1 text-heading"
                onChange={(e) => {
                  setTyped(e.target.value);
                  if (typedError) setTypedError(null);
                }}
                aria-invalid={Boolean(typedError)}
                aria-describedby={typedError ? "badge-user-error" : "badge-user-hint"}
              />
              <Button type="submit" size="lg" full className="min-h-14 sm:w-auto" loading={working} disabled={!typed.trim()}>
                Entrar
              </Button>
            </div>
            {typedError ? (
              <p id="badge-user-error" role="alert" className="text-base font-semibold text-danger-strong">
                Error: {typedError}
              </p>
            ) : (
              <p id="badge-user-hint" className="text-base text-muted-foreground">
                Tu usuario de GitHub, el mismo de tu credencial.
              </p>
            )}
          </form>
        ) : (
          <Button variant="link" className="self-center" onClick={() => setTyping(true)}>
            o escribe tu usuario
          </Button>
        )
      ) : null}
    </div>
  );
}
