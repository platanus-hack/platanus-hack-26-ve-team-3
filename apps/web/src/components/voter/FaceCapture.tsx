"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { actionSatisfied, averageDescriptors, clientLog, humanSelfTest, loadHuman, pickAction, type HumanInstance, type LivenessAction } from "@/lib/client/human";
import { cn } from "@/lib/client/cn";

/** Umbrales mínimos de antispoof (`face.real`) y liveness (`face.live`) de Human (threat model M5). Siguen siendo demo. */
const REAL_MIN = 0.5;
const LIVE_MIN = 0.5;
const CAPTURES = 3;

/**
 * Sólo pruebas automatizadas (Playwright no tiene cámara). Se fija al compilar; en producción es `false` y el código muere.
 * Con el flag, el rostro simulado se envía SOLO, sin botón visible. `sessionStorage["quorum.e2e.realFace"]="1"` fuerza el
 * pipeline real (para medir la carga de Human) y deja `window.__quorumFakeFace()` para terminar.
 */
const E2E_FAKE_FACE = process.env.NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE === "1";

type Phase = "loading" | "slow" | "look" | "spoof" | "action" | "hold" | "checking" | "error";
type ErrorKind = "camera-denied" | "no-camera" | "duplicate" | "other";

const actionText: Record<LivenessAction, string> = { blink: "Parpadea", turn: "Gira un poco la cabeza" };

function instruction(phase: Phase, action: LivenessAction): string {
  switch (phase) {
    case "loading":
      return "Preparando la cámara…";
    case "slow":
      return "Cargando el reconocimiento facial… con datos móviles puede tardar un poco";
    case "look":
      return "Mira a la cámara";
    case "spoof":
      return "Mira a la cámara, con buena luz";
    case "action":
      return actionText[action];
    case "hold":
      return "Quédate quieto…";
    case "checking":
      return "Comprobando…";
    default:
      return "";
  }
}

function classifyCameraError(e: unknown): ErrorKind {
  const name = e instanceof DOMException ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "camera-denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") return "no-camera";
  return "other";
}

function platform(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Pseudoaleatorio sembrado con el voterId: votantes distintos ⇒ vectores casi ortogonales; mismo votante ⇒ mismo vector. */
function syntheticDescriptor(voterId: string): number[] {
  let seed = 2166136261;
  for (const ch of voterId) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  return Array.from({ length: 128 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Number((seed / 2 ** 31 - 1).toFixed(6));
  });
}

/**
 * Paso 2 de la inscripción: cámara a pantalla completa, óvalo guía y UNA instrucción a la vez.
 * Pipeline (Human, en el navegador): rostro → presencia (`face.real`/`face.live` ≥ umbral) → acción (parpadeo o giro)
 * → 3 descriptores → promedio → `POST /api/face/enroll` (dedupe 1:N en el servidor). Todo automático: sin botón de captura.
 * Nunca se envían ni guardan imágenes: sólo el descriptor numérico.
 */
export default function FaceCapture({ voterId, inviteToken, onEnrolled, onObserve, onCancel }: { voterId: string; inviteToken: string; onEnrolled: (faceBindingHash: `0x${string}`) => void; onObserve: () => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const humanRef = useRef<HumanInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const runRef = useRef(0);
  const enrollingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("loading");
  const [action, setAction] = useState<LivenessAction>("blink");
  const [captured, setCaptured] = useState(0);
  const [faceOk, setFaceOk] = useState(false);
  const [error, setError] = useState<{ kind: ErrorKind; message: string } | null>(null);

  const stopAll = useCallback(() => {
    runRef.current += 1;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const enroll = useCallback(
    async (descriptor: number[]) => {
      if (enrollingRef.current) return;
      enrollingRef.current = true;
      try {
        setPhase("checking");
        const res = await apiV1.faceEnroll({ voterId, inviteToken, descriptor, consent: true });
        if (!res.ok) throw new Error("El servidor no aceptó la comprobación.");
        try {
          navigator.vibrate?.(60);
        } catch {
          /* sin vibración */
        }
        onEnrolled(res.faceBindingHash as `0x${string}`);
      } catch (e) {
        enrollingRef.current = false;
        const duplicate = e instanceof ApiClientError && e.code === "duplicate_identity";
        setError({ kind: duplicate ? "duplicate" : "other", message: duplicate ? "Este rostro ya está inscrito en esta votación." : describeError(e) });
        setPhase("error");
      }
    },
    [voterId, inviteToken, onEnrolled],
  );

  const fakeFace = useCallback(async () => {
    stopAll();
    await enroll(syntheticDescriptor(voterId));
  }, [enroll, stopAll, voterId]);

  const start = useCallback(async () => {
    stopAll();
    const run = runRef.current;
    const stale = () => run !== runRef.current;
    setError(null);
    setCaptured(0);
    setFaceOk(false);
    setPhase("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("getUserMedia no disponible", "NotFoundError");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      if (stale()) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Sin elemento de video");
      video.srcObject = stream;
      // En iOS `play()` puede no resolver nunca aunque el video ya se vea (autoPlay + muted): no lo esperamos.
      void video.play().catch(() => undefined);
      clientLog("camera:ready");
      // Primero la cámara (el permiso se pide de inmediato), luego los modelos mientras la persona se ve en pantalla.
      const t0 = performance.now();
      const slowTimer = window.setTimeout(() => !stale() && setPhase("slow"), 6000);
      let human: HumanInstance;
      try {
        human = await Promise.race([
          loadHuman(),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("El reconocimiento facial tardó demasiado en cargar. Revisa tu conexión e intenta de nuevo.")), 90_000)),
        ]);
      } finally {
        clearTimeout(slowTimer);
      }
      if (stale()) return;
      clientLog("camera:models-ready", { ms: Math.round(performance.now() - t0) });
      humanRef.current = human;
      if (E2E_FAKE_FACE) (window as unknown as { __quorumHumanSelfTest?: unknown }).__quorumHumanSelfTest = humanSelfTest();

      const chosen = pickAction();
      setAction(chosen);
      setPhase("look");
      const descriptors: number[][] = [];
      let actionSeen = false;
      let lastCaptureAt = 0;

      let firstDetect = true;
      const loop = async () => {
        if (stale() || !humanRef.current || !videoRef.current) return;
        if (firstDetect) {
          firstDetect = false;
          const td = performance.now();
          const r0 = await humanRef.current.detect(videoRef.current);
          clientLog("camera:first-detect", { ms: Math.round(performance.now() - td), faces: r0.face.length });
        }
        const result = await humanRef.current.detect(videoRef.current);
        if (stale()) return;
        const face = result.face[0];
        const gestures = result.gesture.map((g) => String(g.gesture));
        const present = Boolean(face && (face.real ?? 0) >= REAL_MIN && (face.live ?? 0) >= LIVE_MIN);
        if (face && face.score > 0.5 && !present) {
          // Antispoof/liveness por debajo del umbral: no avanzamos ni capturamos (M5).
          setFaceOk(false);
          if (!actionSeen) setPhase("spoof");
        } else if (face && face.score > 0.5) {
          setFaceOk(true);
          if (!actionSeen) {
            setPhase("action");
            if (actionSatisfied(chosen, face, gestures)) {
              actionSeen = true;
              setPhase("hold");
            }
          } else if (face.embedding && face.embedding.length >= 64) {
            const now = performance.now();
            if (now - lastCaptureAt > 350) {
              descriptors.push(Array.from(face.embedding));
              lastCaptureAt = now;
              setCaptured(descriptors.length);
            }
          }
        } else {
          setFaceOk(false);
          if (!actionSeen) setPhase("look");
        }
        if (descriptors.length >= CAPTURES) {
          stopAll();
          await enroll(averageDescriptors(descriptors));
          return;
        }
        rafRef.current = requestAnimationFrame(() => void loop());
      };
      rafRef.current = requestAnimationFrame(() => void loop());
    } catch (e) {
      if (stale()) return;
      stopAll();
      const kind = e instanceof DOMException ? classifyCameraError(e) : "other";
      clientLog("camera:error", { kind, error: e instanceof Error ? e.message.slice(0, 200) : "?" });
      setError({ kind, message: e instanceof Error ? e.message : "Error desconocido" });
      setPhase("error");
    }
  }, [enroll, stopAll]);

  useEffect(() => {
    let hold = false;
    try {
      hold = sessionStorage.getItem("quorum.e2e.realFace") === "1";
    } catch {
      /* ignorar */
    }
    if (E2E_FAKE_FACE) (window as unknown as { __quorumFakeFace?: () => Promise<void> }).__quorumFakeFace = fakeFace;
    const t = window.setTimeout(() => void (E2E_FAKE_FACE && !hold ? fakeFace() : start()), 0);
    return () => {
      clearTimeout(t);
      stopAll();
    };
    // Arranca una sola vez al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const text = instruction(phase, action);
  const ovalTone = phase === "checking" || phase === "hold" ? "border-success" : faceOk ? "border-white" : "border-white/60";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" data-testid="face-capture" role="dialog" aria-modal="true" aria-label="Comprobación con la cámara">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 size-full object-cover [transform:scaleX(-1)]" aria-label="Vista de la cámara (no se graba)" />
      {/* Óvalo guía: oscurece todo lo de fuera. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={cn("aspect-[3/4] w-[68vw] max-w-[320px] rounded-[50%] border-4 shadow-[0_0_0_200vmax_rgba(0,0,0,0.55)] transition-colors", ovalTone)} />
      </div>

      <div className="relative flex items-center justify-between gap-2 px-4 pt-4">
        <p className="text-base font-semibold text-white/90">Paso 2 de 2</p>
        {phase !== "checking" ? (
          <button
            type="button"
            onClick={() => {
              stopAll();
              onCancel();
            }}
            className="min-h-tap rounded-md px-3 text-base font-semibold text-white/90 underline underline-offset-4"
          >
            Cancelar
          </button>
        ) : null}
      </div>

      <div className="relative mt-auto flex flex-col items-center gap-3 px-4 pb-8 text-center">
        {phase !== "error" ? (
          <>
            <p role="status" aria-live="assertive" className="rounded-lg bg-black/60 px-4 py-2 text-title font-bold" data-testid="face-instruction">
              {phase === "loading" || phase === "slow" || phase === "checking" ? <span className="q-spinner mr-2 align-middle" aria-hidden="true" /> : null}
              {text}
            </p>
            {phase === "hold" ? (
              <div className="flex gap-2" aria-hidden="true">
                {Array.from({ length: CAPTURES }, (_, i) => (
                  <span key={i} className={cn("size-3 rounded-full", i < captured ? "bg-success" : "bg-white/40")} />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {phase === "error" && error ? <FaceError error={error} onRetry={() => (E2E_FAKE_FACE && error.kind !== "duplicate" && error.kind !== "camera-denied" ? void fakeFace() : void start())} onObserve={onObserve} /> : null}
    </div>
  );
}

function FaceError({ error, onRetry, onObserve }: { error: { kind: ErrorKind; message: string }; onRetry: () => void; onObserve: () => void }) {
  const os = platform();
  return (
    <div className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto rounded-t-2xl bg-card p-5 text-card-foreground" role="alert" data-testid="face-error">
      <div className="flex items-center gap-2 [&_svg]:size-6 [&_svg]:shrink-0">
        {error.kind === "duplicate" ? <UserX aria-hidden="true" className="text-danger" /> : <CameraOff aria-hidden="true" className="text-danger" />}
        <h2 className="text-title font-bold">
          {error.kind === "duplicate" ? "Este rostro ya está inscrito en esta votación." : error.kind === "camera-denied" ? "No pudimos usar la cámara" : error.kind === "no-camera" ? "No encontramos una cámara" : "No se pudo completar"}
        </h2>
      </div>
      <div className="mt-3 text-heading">
        {error.kind === "duplicate" ? <p>Cada persona se inscribe una sola vez. Puedes seguir la votación sin votar.</p> : null}
        {error.kind === "camera-denied" ? (
          <>
            <p>Para inscribirte hay que permitir la cámara:</p>
            <ul className="mt-2 list-disc space-y-2 pl-5" data-testid="camera-help">
              {os !== "android" ? <li>iPhone: toca «aA» en la barra de dirección › Ajustes del sitio web › Cámara › Permitir. O en Ajustes › Safari › Cámara › Permitir.</li> : null}
              {os !== "ios" ? <li>Android: toca el candado junto a la dirección › Permisos › Cámara › Permitir.</li> : null}
            </ul>
          </>
        ) : null}
        {error.kind === "no-camera" ? <p>Cierra otras apps que usen la cámara o usa un teléfono con cámara frontal.</p> : null}
        {error.kind === "other" ? <p>{error.message}</p> : null}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        {error.kind !== "duplicate" ? (
          <Button size="lg" full className="min-h-14" onClick={onRetry}>
            Intentar de nuevo
          </Button>
        ) : null}
        <Button size="lg" full variant={error.kind === "duplicate" ? "primary" : "secondary"} className="min-h-14" onClick={onObserve}>
          Solo quiero mirar
        </Button>
      </div>
    </div>
  );
}
