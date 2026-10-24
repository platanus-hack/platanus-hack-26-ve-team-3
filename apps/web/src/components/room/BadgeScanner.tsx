"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";
import { classifyCameraError, createQrDetector, type CameraFailure, type QrDetector } from "@/lib/client/badge";

const TICK_MS = 120;

/**
 * Cámara trasera DENTRO de la página y lectura continua de QR. Llama `onText` con cada texto nuevo leído (el padre
 * decide si es una credencial); se apaga al desmontarse. Sin fotos: los cuadros nunca salen del teléfono.
 */
export function BadgeScanner({ onText, onCameraError }: { onText: (text: string) => void; onCameraError: (kind: CameraFailure) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onTextRef = useRef(onText);
  const onErrorRef = useRef(onCameraError);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onTextRef.current = onText;
    onErrorRef.current = onCameraError;
  }, [onText, onCameraError]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let last = "";
    let lastAt = 0;
    const t0 = performance.now();
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("sin cámara"), { name: "NotFoundError" });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        if (!stopped) {
          setFailed(true);
          onErrorRef.current(classifyCameraError(e));
        }
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      video.muted = true;
      video.setAttribute("playsinline", "");
      void video.play()?.catch(() => undefined);
      let detector: QrDetector;
      try {
        detector = await createQrDetector();
      } catch {
        if (!stopped) {
          setFailed(true);
          onErrorRef.current("other");
        }
        return;
      }
      document.documentElement.setAttribute("data-qr-detector", detector.kind);
      setReady(true);
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2 || detector.kind === "native") {
          try {
            const text = await detector.detect(video);
            const now = performance.now();
            // El mismo QR no se repite más de una vez cada 2 s (si el padre lo rechazó, no inunda de avisos).
            if (text && !stopped && (text !== last || now - lastAt > 2000)) {
              last = text;
              lastAt = now;
              document.documentElement.setAttribute("data-qr-ms", String(Math.round(now - t0)));
              onTextRef.current(text);
            }
          } catch {
            /* cuadro ilegible: siguiente */
          }
        }
        if (!stopped) timer = window.setTimeout(tick, TICK_MS);
      };
      void tick();
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl bg-black" data-testid="badge-scanner">
      {failed ? (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-white">
          <CameraOff className="size-10" aria-hidden="true" />
          <p className="text-heading font-semibold">No se pudo abrir la cámara</p>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="size-full object-cover" playsInline muted aria-label="Vista de la cámara para leer el QR de tu credencial" />
          <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" aria-hidden="true" />
          {!ready ? (
            <p className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 text-base font-semibold text-white">
              <span className="q-spinner" aria-hidden="true" /> Abriendo la cámara…
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
