"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { actionLabel, actionSatisfied, averageDescriptors, cameraErrorMessage, humanSelfTest, loadHuman, pickAction, type HumanInstance, type LivenessAction } from "@/lib/client/human";
import type { LivenessOutcome } from "./flowTypes";

/** Umbrales mínimos de antispoof (`face.real`) y liveness (`face.live`) de Human (threat model M5). Siguen siendo demo. */
const REAL_MIN = 0.5;
const LIVE_MIN = 0.5;

/** Sólo para pruebas automatizadas (Playwright no tiene cámara). Se fija en build; en producción es `false` y el código muere. */
const E2E_FAKE_FACE = process.env.NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE === "1";

type Phase = "idle" | "loading-models" | "starting-camera" | "detecting" | "spoof" | "action" | "capturing" | "enrolling" | "done" | "error";

const phaseText: Record<Phase, string> = {
  idle: "Listo para empezar.",
  "loading-models": "Cargando modelos en tu navegador (sólo la primera vez)…",
  "starting-camera": "Iniciando la cámara…",
  detecting: "Buscando tu rostro. Mira a la cámara con buena luz.",
  spoof: "No parece una persona presente (posible foto o pantalla). Mira directo a la cámara.",
  action: "Rostro detectado.",
  capturing: "Capturando descriptores…",
  enrolling: "Comprobando que no estés inscrito ya (1:N) y registrando el descriptor, sin imagen…",
  done: "Prueba de vida completada.",
  error: "No se pudo completar la prueba de vida.",
};

/**
 * Prueba de vida activa en el navegador con @vladmandic/human.
 * Pipeline: cámara → detectar rostro → pedir acción (parpadeo/giro) → capturar 3 descriptores → promedio → POST /api/face/enroll.
 * Contrato v1: el servidor compara 1:N contra los inscritos de la misma votación (409 `duplicate_identity`) y devuelve
 * `faceBindingHash`, que luego firma la wallet. Nunca se envían ni guardan imágenes: sólo el descriptor numérico.
 * Se carga con dynamic(..., { ssr: false }) desde VoterFlow.
 */
export default function LivenessStep({ voterId, inviteToken, onBack, onNext }: { voterId: string; inviteToken: string; onBack: () => void; onNext: (o: LivenessOutcome) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const humanRef = useRef<HumanInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [action, setAction] = useState<LivenessAction>("blink");
  const [actionDone, setActionDone] = useState(false);
  const [captured, setCaptured] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cameraUnavailable, setCameraUnavailable] = useState(false);
  const [faceOk, setFaceOk] = useState(false);
  const [presenceOk, setPresenceOk] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const stopAll = useCallback(() => {
    stopRef.current = true;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  async function start() {
    setError(null);
    setCaptured(0);
    setActionDone(false);
    setFaceOk(false);
    stopRef.current = false;
    try {
      setPhase("loading-models");
      const human = await loadHuman();
      humanRef.current = human;
      if (E2E_FAKE_FACE) (window as unknown as { __quorumHumanSelfTest?: unknown }).__quorumHumanSelfTest = humanSelfTest();

      setPhase("starting-camera");
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("getUserMedia no disponible", "NotFoundError");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Sin elemento de video");
      video.srcObject = stream;
      await video.play();

      const chosen = pickAction();
      setAction(chosen);
      setPhase("detecting");

      const descriptors: number[][] = [];
      let actionSeen = false;
      let lastCaptureAt = 0;

      const loop = async () => {
        if (stopRef.current || !humanRef.current || !videoRef.current) return;
        const result = await humanRef.current.detect(videoRef.current);
        const face = result.face[0];
        const gestures = result.gesture.map((g) => String(g.gesture));
        const present = Boolean(face && (face.real ?? 0) >= REAL_MIN && (face.live ?? 0) >= LIVE_MIN);
        if (face && face.score > 0.5 && !present) {
          // Antispoof/liveness de Human por debajo del umbral: no avanzamos ni capturamos (M5).
          setFaceOk(true);
          setPresenceOk(false);
          if (!actionSeen) setPhase("spoof");
        } else if (face && face.score > 0.5) {
          setFaceOk(true);
          setPresenceOk(true);
          if (!actionSeen) {
            setPhase("action");
            if (actionSatisfied(chosen, face, gestures)) {
              actionSeen = true;
              setActionDone(true);
              setPhase("capturing");
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
          if (!actionSeen) setPhase("detecting");
        }
        if (descriptors.length >= 3) {
          stopAll();
          await enroll(averageDescriptors(descriptors));
          return;
        }
        rafRef.current = requestAnimationFrame(() => void loop());
      };
      rafRef.current = requestAnimationFrame(() => void loop());
    } catch (e) {
      stopAll();
      const msg = e instanceof DOMException ? cameraErrorMessage(e) : e instanceof Error ? e.message : "Error desconocido";
      setCameraUnavailable(e instanceof DOMException || /modelo|model|fetch/i.test(msg));
      setError(msg);
      setPhase("error");
    }
  }

  async function enroll(descriptor: number[]) {
    try {
      setPhase("enrolling");
      const res = await apiV1.faceEnroll({ voterId, inviteToken, descriptor, consent: true });
      if (!res.ok) throw new Error("El servidor no aceptó el descriptor.");
      setPhase("done");
      onNext({ mode: "enrolled", faceBindingHash: res.faceBindingHash as `0x${string}` });
    } catch (e) {
      if (e instanceof ApiClientError && e.code === "duplicate_identity") setDuplicate(true);
      setCameraUnavailable(false);
      setError(describeError(e));
      setPhase("error");
    }
  }

  /** Sólo E2E (NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE=1): envía un descriptor sintético al endpoint real/mock. Nunca en producción. */
  async function e2eFakeFace() {
    stopAll();
    // Pseudoaleatorio sembrado con el voterId: dos votantes distintos dan vectores casi ortogonales (el dedupe 1:N real
    // del servidor no los confunde) y el mismo votante siempre produce el mismo descriptor.
    let seed = 2166136261;
    for (const ch of voterId) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    const descriptor = Array.from({ length: 128 }, () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return Number((seed / 2 ** 31 - 1).toFixed(6));
    });
    await enroll(descriptor);
  }

  const busy = phase !== "idle" && phase !== "error" && phase !== "done";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h1" className="text-title">
            Prueba de vida
          </CardTitle>
          <Badge tone="warning">modo demo · no certificada</Badge>
        </div>
        <CardDescription>
          Tu cámara se procesa en tu navegador. Enviamos un vector numérico cifrado (no tu foto) para evitar inscripciones duplicadas; se borra al abrir la votación. Comprobamos que tu rostro no esté ya inscrito en esta votación (modo demo).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-muted">
          <video ref={videoRef} playsInline muted className="size-full object-cover [transform:scaleX(-1)]" aria-label="Vista previa de la cámara (no se graba)" />
          {phase === "idle" || phase === "error" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              {phase === "error" ? <CameraOff className="size-8" aria-hidden="true" /> : <Camera className="size-8" aria-hidden="true" />}
              <p className="text-small">{phase === "error" ? "Cámara no disponible" : "La cámara se activa al pulsar «Iniciar»"}</p>
            </div>
          ) : null}
          {busy ? (
            <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-primary/85 px-3 py-2 text-small text-primary-foreground">
              <span className={faceOk ? "inline-block size-2.5 rounded-full bg-success" : "inline-block size-2.5 rounded-full bg-warning"} aria-hidden="true" />
              {faceOk ? "Rostro detectado" : "Buscando rostro"}
            </div>
          ) : null}
        </div>

        <p role="status" aria-live="polite" className="text-body font-semibold">
          {phaseText[phase]}
          {phase === "action" && !actionDone ? ` ${actionLabel[action]}.` : ""}
          {phase === "capturing" ? ` ${captured} de 3.` : ""}
        </p>

        <ol className="grid grid-cols-2 gap-2 text-small sm:grid-cols-4" aria-label="Pasos de la prueba">
          {[
            { label: "Rostro", done: faceOk || actionDone || captured > 0 },
            { label: "Presencia", done: presenceOk || actionDone },
            { label: action === "blink" ? "Parpadeo" : "Giro", done: actionDone },
            { label: "3 capturas", done: captured >= 3 },
          ].map((s) => (
            <li key={s.label} className={`rounded-md border p-2 text-center ${s.done ? "border-success bg-success-soft text-success-strong" : "border-border text-muted-foreground"}`}>
              {s.label}
              {s.done ? <span className="sr-only"> (completado)</span> : null}
            </li>
          ))}
        </ol>

        {error ? (
          <Alert tone="danger" title={duplicate ? "Rostro ya inscrito en esta votación" : "No se pudo completar la prueba de vida"}>
            {error}
            {cameraUnavailable ? " Sin cámara no puedes inscribirte en esta votación: reintenta desde un dispositivo con cámara." : ""}
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap">
        <Button variant="secondary" onClick={() => { stopAll(); onBack(); }} disabled={busy}>
          Atrás
        </Button>
        {phase === "idle" || phase === "error" ? (
          <Button onClick={start} className="md:flex-1" full>
            <Camera aria-hidden="true" /> {phase === "error" ? "Reintentar" : "Iniciar prueba de vida"}
          </Button>
        ) : (
          <Button loading className="md:flex-1" full disabled>
            {phase === "enrolling" ? "Registrando…" : "En curso…"}
          </Button>
        )}
        {E2E_FAKE_FACE && (phase === "idle" || phase === "error") ? (
          <Button variant="ghost" onClick={e2eFakeFace} className="w-full md:w-auto" data-testid="e2e-fake-face">
            Simular rostro (solo pruebas automatizadas)
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
