"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { api, describeError } from "@/lib/client/api";
import { actionLabel, actionSatisfied, averageDescriptors, cameraErrorMessage, loadHuman, pickAction, type HumanInstance, type LivenessAction } from "@/lib/client/human";
import { localFallbackNonce } from "@/lib/client/vote";
import type { LivenessOutcome } from "./flowTypes";

type Phase = "idle" | "loading-models" | "starting-camera" | "detecting" | "action" | "capturing" | "enrolling" | "done" | "error";

const phaseText: Record<Phase, string> = {
  idle: "Listo para empezar.",
  "loading-models": "Cargando modelos en tu navegador (sólo la primera vez)…",
  "starting-camera": "Iniciando la cámara…",
  detecting: "Buscando tu rostro. Mira a la cámara con buena luz.",
  action: "Rostro detectado.",
  capturing: "Capturando descriptores…",
  enrolling: "Registrando el descriptor (sin imagen)…",
  done: "Prueba de vida completada.",
  error: "No se pudo completar la prueba de vida.",
};

/**
 * Prueba de vida activa en el navegador con @vladmandic/human.
 * Pipeline: cámara → detectar rostro → pedir acción (parpadeo/giro) → capturar 3 descriptores → promedio → POST /api/face/enroll.
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
        if (face && face.score > 0.5) {
          setFaceOk(true);
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
      const res = await api.faceEnroll({ voterId, inviteToken, descriptor, consent: true });
      if (!res.ok) throw new Error("El servidor no aceptó el descriptor.");
      setPhase("done");
      onNext({ mode: "enrolled", voteNonce: res.voteNonce });
    } catch (e) {
      setError(describeError(e));
      setPhase("error");
    }
  }

  function skip() {
    stopAll();
    onNext({ mode: "skipped", voteNonce: localFallbackNonce(), reason: error ?? "Sin cámara o sin permisos" });
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
        <CardDescription>Todo ocurre en tu navegador. No guardamos tu imagen; sólo un descriptor numérico promediado de 3 capturas.</CardDescription>
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

        <ol className="grid grid-cols-3 gap-2 text-small" aria-label="Pasos de la prueba">
          {[
            { label: "Rostro", done: faceOk || actionDone || captured > 0 },
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
          <Alert tone="danger" title="No se pudo completar la prueba de vida">
            {error}
            {cameraUnavailable ? " Puedes reintentar o continuar sin prueba de vida (demo)." : ""}
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
        {phase === "error" ? (
          <Button variant="ghost" onClick={skip} className="w-full md:w-auto">
            Continuar sin prueba de vida (demo)
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
