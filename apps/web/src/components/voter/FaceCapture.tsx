"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraOff, Check, ChevronLeft, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { CAPTURES, clientLog, DESCRIPTOR_DIMS, formatMB, humanSelfTest, humanTimings, LivenessTracker, loadHuman, onDownloadProgress, TURN_DELTA, yawProxy, type DownloadProgress, type HumanInstance } from "@/lib/client/human";
import { cn } from "@/lib/client/cn";

/** Umbrales mínimos de antispoof (`face.real`) y liveness (`face.live`) de Human (threat model M5). Siguen siendo demo. */
const REAL_MIN = 0.5;
const LIVE_MIN = 0.5;

/**
 * Sólo pruebas automatizadas (Playwright no tiene cámara). Se fija al compilar; en producción es `false` y el código muere.
 * Con el flag, el rostro simulado se envía SOLO, sin botón visible. `sessionStorage["quorum.e2e.realFace"]="1"` fuerza el
 * pipeline real (para medir la carga de Human) y deja `window.__quorumFakeFace()` para terminar.
 */
const E2E_FAKE_FACE = process.env.NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE === "1";

type Phase = "loading" | "slow" | "look" | "spoof" | "action" | "back" | "checking" | "error";
type ErrorKind = "camera-denied" | "no-camera" | "duplicate" | "other";

/** Instrucción principal + pista corta. El giro pedido es a la izquierda (el tracker acepta ambos lados). */
function instruction(phase: Phase, faceOk: boolean): { title: string; hint?: string } {
  switch (phase) {
    case "loading":
      return { title: "Preparando la cámara…" };
    case "slow":
      return { title: "Cargando reconocimiento facial…", hint: "Con datos móviles puede tardar" };
    case "look":
      return { title: "Mira a la cámara", hint: faceOk ? "Mantente dentro del círculo" : "Centra tu rostro en el círculo" };
    case "spoof":
      return { title: "Busca mejor luz", hint: "Mira de frente a la cámara" };
    case "action":
      return { title: "Gira la cabeza a la izquierda", hint: "Despacio, hasta que el círculo avance" };
    case "back":
      return { title: "Vuelve al centro", hint: "Mira de frente otra vez" };
    case "checking":
      return { title: "Comprobando…" };
    default:
      return { title: "" };
  }
}

/** Avance del anillo (0..1): capturas de frente → giro → regreso → comprobación. */
function ringProgress(phase: Phase, captured: number, turn: number): number {
  if (phase === "look" || phase === "spoof") return (captured / CAPTURES) * 0.5;
  if (phase === "action") return 0.5 + turn * 0.35;
  if (phase === "back") return 0.85;
  if (phase === "checking") return 1;
  return 0;
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
  return Array.from({ length: DESCRIPTOR_DIMS }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Number((seed / 2 ** 31 - 1).toFixed(6));
  });
}

/**
 * Paso 2 de la inscripción: cámara a pantalla completa, óvalo guía y UNA instrucción a la vez.
 * Pipeline (Human, en el navegador; ver LivenessTracker): de frente con presencia (`face.real`/`face.live` ≥ umbral)
 * → 3 descriptores → «gira un poco la cabeza» → «vuelve a mirar» (4.º descriptor, debe coincidir) → promedio →
 * `POST /api/face/enroll` (dedupe 1:N en el servidor). Todo automático: sin botón de captura.
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
  const [captured, setCaptured] = useState(0);
  const [download, setDownload] = useState<DownloadProgress | null>(null);
  const [faceOk, setFaceOk] = useState(false);
  const [turn, setTurn] = useState(0);
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
    setTurn(0);
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
      // Normalmente ya vienen descargados desde el paso 1 (precarga en /j y /v). Sin tiempo límite fijo: la descarga
      // solo se corta si deja de llegar bytes (STALL_MS) y se muestra el progreso real en MB.
      const t0 = performance.now();
      const slowTimer = window.setTimeout(() => !stale() && setPhase("slow"), 6000);
      let lastLogAt = performance.now();
      const unsub = onDownloadProgress((p) => {
        if (stale()) return;
        setDownload(p);
        // Diagnóstico con red lenta: cuánto lleva cada 10 s (solo bytes, nada personal).
        if (!p.done && performance.now() - lastLogAt > 10_000) {
          lastLogAt = performance.now();
          clientLog("camera:downloading", { loadedKB: Math.round(p.loaded / 1000), total: Math.round(p.total / 1000), ms: Math.round(performance.now() - t0) });
        }
      });
      let human: HumanInstance;
      try {
        human = await loadHuman();
      } finally {
        clearTimeout(slowTimer);
        unsub();
      }
      if (stale()) return;
      clientLog("camera:models-ready", { ms: Math.round(performance.now() - t0), ...humanTimings });
      humanRef.current = human;
      if (E2E_FAKE_FACE) (window as unknown as { __quorumHumanSelfTest?: unknown }).__quorumHumanSelfTest = humanSelfTest();

      setPhase("look");
      const tracker = new LivenessTracker();
      const tLook = performance.now();
      let firstDetect = true;
      const logged = new Set<string>(["look"]);
      const loop = async () => {
        if (stale() || !humanRef.current || !videoRef.current) return;
        const td = performance.now();
        const result = await humanRef.current.detect(videoRef.current);
        if (stale()) return;
        if (firstDetect) {
          firstDetect = false;
          clientLog("camera:first-detect", { ms: Math.round(performance.now() - td), faces: result.face.length, backend: humanTimings.backend });
        }
        const face = result.face[0];
        const seen = Boolean(face && face.score > 0.5);
        // Antispoof/liveness por debajo del umbral: no se avanza ni se captura (M5).
        const present = Boolean(seen && (face!.real ?? 0) >= REAL_MIN && (face!.live ?? 0) >= LIVE_MIN);
        const yaw = face ? yawProxy(face) : null;
        const stage = tracker.feed({ t: performance.now(), face: seen, present, yaw, embedding: face?.embedding && face.embedding.length >= 64 ? Array.from(face.embedding) : null });
        setFaceOk(present);
        if (stage === "turn" && yaw !== null) setTurn(Math.min(1, Math.abs(yaw - tracker.baselineYaw) / TURN_DELTA));
        setCaptured(tracker.captures.length);
        setPhase(stage === "turn" ? "action" : stage === "back" ? "back" : stage === "spoof" ? "spoof" : "look");
        // Primera vez en cada etapa (sin inundar el log si oscila entre «look» y «spoof»).
        if (!logged.has(stage)) {
          logged.add(stage);
          clientLog("camera:stage", { step: stage, ms: Math.round(performance.now() - tLook) });
        }
        if (stage === "done" && tracker.result) {
          stopAll();
          clientLog("camera:liveness-done", { ms: Math.round(performance.now() - tLook), total: Math.round(performance.now() - t0) });
          await enroll(tracker.result);
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

  const { title, hint } = instruction(phase, faceOk);
  const progress = ringProgress(phase, captured, turn);
  const done = phase === "checking";
  const busy = phase === "loading" || phase === "slow" || phase === "checking";
  const downloading = (phase === "loading" || phase === "slow") && download && !download.done && download.loaded < download.total;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#06182a] text-white" data-testid="face-capture" role="dialog" aria-modal="true" aria-label="Comprobación con la cámara">
      <div className="flex items-center justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <p className="rounded-full bg-white/10 px-3 py-1 text-small font-semibold text-white/80">Paso 2 de 2</p>
        {phase !== "checking" ? (
          <button
            type="button"
            onClick={() => {
              stopAll();
              onCancel();
            }}
            className="min-h-tap rounded-full px-4 text-base font-semibold text-white/80 hover:bg-white/10"
          >
            Cancelar
          </button>
        ) : null}
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="relative size-[min(80vw,340px)]">
          <FaceRing progress={progress} done={done} />
          <div className={cn("absolute inset-[9%] overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10 transition-transform duration-300", done && "scale-95")}>
            <video ref={videoRef} playsInline muted autoPlay className="size-full object-cover [transform:scaleX(-1)]" aria-label="Vista de la cámara (no se graba)" />
            {done ? (
              <div className="absolute inset-0 grid place-items-center bg-black/45" aria-hidden="true">
                <span className="q-pop grid size-20 place-items-center rounded-full bg-[#4fb58a] text-[#06182a]">
                  <Check className="size-11" strokeWidth={3} />
                </span>
              </div>
            ) : null}
          </div>
          {phase === "action" ? <TurnCue /> : null}
          {phase === "back" ? <span aria-hidden="true" className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-white/80" /> : null}
        </div>
      </div>

      <div className="flex min-h-40 flex-col items-center gap-2 px-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
        {phase !== "error" ? (
          <>
            <p role="status" aria-live="assertive" className="text-title font-semibold tracking-tight" data-testid="face-instruction">
              {busy && !done ? <span className="q-spinner mr-2 align-middle" aria-hidden="true" /> : null}
              {title}
            </p>
            {hint ? <p className="text-body text-white/65">{hint}</p> : null}
            {downloading ? (
              <div className="mt-2 w-full max-w-60" data-testid="face-download">
                <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${(download.loaded / download.total) * 100}%` }} />
                </div>
                <p className="q-num mt-2 text-small text-white/65">
                  {formatMB(download.loaded)} / {formatMB(download.total)} MB
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {phase === "error" && error ? <FaceError error={error} onRetry={() => (E2E_FAKE_FACE && error.kind !== "duplicate" && error.kind !== "camera-denied" ? void fakeFace() : void start())} onObserve={onObserve} /> : null}
    </div>
  );
}

const TICKS = 72;

/** Anillo de marcas tipo Face ID: se encienden en sentido horario según el avance; verde al terminar. */
function FaceRing({ progress, done }: { progress: number; done: boolean }) {
  const lit = Math.round(progress * TICKS);
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden="true">
      {Array.from({ length: TICKS }, (_, i) => {
        const a = (i / TICKS) * 2 * Math.PI - Math.PI / 2;
        const on = i < lit;
        return (
          <line
            key={i}
            x1={50 + 44 * Math.cos(a)}
            y1={50 + 44 * Math.sin(a)}
            x2={50 + (on ? 49 : 47.5) * Math.cos(a)}
            y2={50 + (on ? 49 : 47.5) * Math.sin(a)}
            strokeWidth={1.4}
            strokeLinecap="round"
            className={cn("transition-colors duration-200", on ? (done ? "stroke-[#4fb58a]" : "stroke-[#f34723]") : "stroke-white/20")}
          />
        );
      })}
    </svg>
  );
}

/** Flechas animadas en el borde izquierdo (la vista está en espejo: izquierda del votante = izquierda de la pantalla). */
function TurnCue() {
  return (
    <div aria-hidden="true" className="absolute left-[11%] top-1/2 flex -translate-y-1/2 items-center text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
      {[0, 1, 2].map((i) => (
        <ChevronLeft key={i} className="q-nudge -mx-2.5 size-9" strokeWidth={2.5} style={{ animationDelay: `${(2 - i) * 160}ms` }} />
      ))}
    </div>
  );
}

function FaceError({ error, onRetry, onObserve }: { error: { kind: ErrorKind; message: string }; onRetry: () => void; onObserve: () => void }) {
  const os = platform();
  return (
    <div className="absolute inset-x-0 bottom-0 max-h-full overflow-y-auto rounded-t-[1.75rem] bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-card-foreground" role="alert" data-testid="face-error">
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
