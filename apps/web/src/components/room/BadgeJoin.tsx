"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { QrCode } from "lucide-react";
import { DEFAULT_BADGE_URL_PREFIX, parseBadgeUrl } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Consent } from "@/components/voter/Consent";
import { badgeApi, BADGE_COPY, classifyBadgeError, type BadgeFailure } from "@/lib/client/badge";
import type { CameraFailure } from "@/lib/client/badge";
import type { JoinRoomResult } from "@quorum/contracts";
import { BadgeScanner } from "./BadgeScanner";

/** Lo propio de la credencial, antes del texto común del consentimiento. */
export const BADGE_CONSENT_EXTRA = [
  "Lees el QR de tu credencial del evento: solo comprobamos que eres participante y que tu credencial no se haya usado ya en esta votación. Guardamos una huella cifrada de tu credencial, nunca tu usuario, y no se liga a tu voto.",
] as const;

const SCAN_LABEL = "Escanear mi credencial";
const RESCAN_LABEL = "Escanear otra vez";

/** Sin cámara no hay alternativa tecleada: se pide permitir la cámara y volver a escanear. */
export const CAMERA_COPY: Record<CameraFailure, string> = {
  denied: `No pudimos usar la cámara. Permite el acceso a la cámara en tu navegador y toca «${RESCAN_LABEL}».`,
  "no-camera": `Este teléfono no tiene una cámara disponible. Revisa que otra app no la esté usando y toca «${RESCAN_LABEL}», o pide ayuda al organizador.`,
  other: `No se pudo abrir la cámara. Permite el acceso a la cámara en tu navegador y toca «${RESCAN_LABEL}».`,
};

/**
 * Entrada con credencial del evento (D-19), dentro de `/j/<código>`. Un botón grande abre la cámara trasera en la página;
 * al leer un QR válido entra sola (sin más toques) y sigue al paso 2 (rostro). Si la cámara falla, se explica cómo
 * permitirla y se ofrece "Escanear otra vez"; no hay usuario tecleado. `preview` (la vista previa de la boleta) va antes
 * del botón y se oculta mientras la cámara está abierta, para que el visor quede a la vista en 360 px.
 */
export function BadgeJoin({ roomCode, badgeUrlPrefix, onJoined, onRoomFailure, redirecting, preview }: {
  roomCode: string;
  badgeUrlPrefix?: string;
  onJoined: (r: JoinRoomResult) => void;
  onRoomFailure: (f: BadgeFailure) => void;
  redirecting: boolean;
  preview?: ReactNode;
}) {
  const prefix = badgeUrlPrefix ?? DEFAULT_BADGE_URL_PREFIX;
  const [scanning, setScanning] = useState(false);
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
    setNotice({ tone: "warning", title: "No se pudo abrir la cámara", text: CAMERA_COPY[kind] });
  }, []);

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

      {!scanning ? preview : null}

      {!scanning ? (
        <Button full size="lg" className="min-h-14" onClick={() => (setNotice(null), setScanning(true))} loading={working} data-testid="badge-scan">
          {!working ? <QrCode className="size-6" aria-hidden="true" /> : null}
          {working ? (redirecting ? "Abriendo la cámara…" : "Comprobando…") : notice ? RESCAN_LABEL : SCAN_LABEL}
        </Button>
      ) : null}

      {!scanning ? <Consent compact extra={BADGE_CONSENT_EXTRA} actionLabel={SCAN_LABEL} /> : null}
    </div>
  );
}
