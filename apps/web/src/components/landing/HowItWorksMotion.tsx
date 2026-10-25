"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/client/cn";
import { BEATS, activeBeat, beatHold, lerp, stepOpacity } from "./how-it-works/motion";
import { Stage } from "./how-it-works/Stage";

/**
 * «Cómo funciona por detrás»: seis pasos atados al scroll (estado = función pura del progreso `p`).
 * Concepto, beat sheet y auditoría en design/motion/LANDING.md. Movimiento reducido → cuadro quieto con los 6 pasos.
 */

export const HOW_STEPS = [
  {
    id: "credencial",
    title: "Escaneas la sala y tu credencial",
    body: "Con la cámara del teléfono escaneas el QR de la sala y luego el de tu credencial del evento. Cada credencial entra una sola vez.",
  },
  {
    id: "rostro",
    title: "Tu rostro se comprueba en tu teléfono",
    body: "Giras un poco la cabeza y listo. Al servidor solo llega una huella cifrada, para que nadie se inscriba dos veces. No se guardan fotos y las huellas se borran al cerrar.",
  },
  {
    id: "prueba",
    title: "Tu teléfono arma tu voto con una prueba",
    body: "La prueba demuestra que estás en la lista sin decir cuál de los inscritos eres. Un código único (nullifier) hace que un segundo voto se rechace. La prueba no revela quién emitió cada boleta; el servidor ve el contenido.",
  },
  {
    id: "cadena",
    title: "Cada voto se encadena en un registro público",
    body: "Cada inscripción y cada voto guarda el hash (SHA-256) del anterior. Si alguien cambia o borra uno, los hashes siguientes dejan de cuadrar.",
  },
  {
    id: "ancla",
    title: "Al cerrar, el hash final se ancla en Base Sepolia",
    body: "Quien organiza publica el hash final en un contrato público (QuorumRegistry). Es un sello con fecha: prueba que el registro era así en ese momento.",
  },
  {
    id: "verifica",
    title: "Cualquiera lo recomputa",
    body: "El verificador recalcula pruebas, cadena, recuento y ancla desde el paquete público. Si alguien altera una copia, marca «fallo detectado» y dice dónde. Con la copia original, el sorteo sale igual en cualquier teléfono.",
  },
] as const;

const REDUCED = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

declare global {
  interface Window {
    /** Fija el progreso de «Cómo funciona por detrás» (0→1) para renders deterministas; `null` vuelve al scroll. */
    __seek?: (p: number | null) => void;
  }
}

/**
 * Progreso de la sección: solo escucha el scroll mientras la sección está en pantalla y la pestaña visible.
 * Nada corre fuera de pantalla: sin loops; un rAF por evento de scroll como mucho.
 */
function useSectionProgress(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [forced, setForced] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    window.__seek = (v) => setForced(v === null ? null : Math.min(Math.max(v, 0), 1));
    return () => {
      delete window.__seek;
    };
  }, [enabled]);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let frame = 0;
    let inView = false;
    const measure = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const v = span > 0 ? Math.min(Math.max(-rect.top / span, 0), 1) : 0;
      setP(Math.round(v * 2000) / 2000);
    };
    const onScroll = () => {
      if (!frame && inView && !document.hidden) frame = requestAnimationFrame(measure);
    };
    const attach = () => {
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    };
    const detach = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (inView) {
        attach();
        onScroll();
      } else detach();
    });
    io.observe(el);
    const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : onScroll());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      detach();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  return { ref, p: forced ?? p };
}

export function HowItWorksMotion() {
  const reduced = useReducedMotion();
  return reduced ? <HowItWorksStill /> : <HowItWorksScroll />;
}

function Heading({ lead }: { lead: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="q-eyebrow">Cómo funciona por detrás</p>
      <h2 id="como-funciona-por-detras" className="font-display text-title font-bold leading-tight tracking-tight md:text-[2.25rem]">
        Confía en la prueba, <span className="text-primary-ink">no en quien organiza.</span>
      </h2>
      <p className="max-w-[44ch] text-body text-muted-foreground">{lead}</p>
    </div>
  );
}

/** Raíl de los 6 pasos; la línea naranja (el hilo) avanza con `p`. */
function Rail({ p }: { p: number }) {
  const active = activeBeat(p);
  return (
    <div aria-hidden="true" className="relative flex justify-between">
      <span className="absolute left-3.5 right-3.5 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-border" />
      <span className="absolute left-3.5 right-3.5 top-1/2 h-0.5 origin-left -translate-y-1/2 rounded-full bg-primary" style={{ transform: `translateY(-50%) scaleX(${Math.min(p * 1.0, 1).toFixed(4)})` }} />
      {HOW_STEPS.map((s, i) => (
        <span
          key={s.id}
          className={cn(
            "q-num relative grid size-7 place-items-center rounded-full border-2 text-[0.75rem] font-semibold transition-colors duration-300",
            i === active ? "border-primary bg-primary text-primary-foreground" : i < active ? "border-primary bg-card text-primary-ink" : "border-border bg-card text-muted-foreground",
          )}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}

function HowItWorksScroll() {
  const { ref, p } = useSectionProgress(true);
  const active = activeBeat(p);
  return (
    <section aria-labelledby="como-funciona-por-detras" data-testid="how-it-works" data-mode="scroll" className="relative flex flex-col gap-6">
      <Heading lead="Seis pasos, del QR al verificador. Desliza para verlos." />
      <div ref={ref} data-track className="relative" style={{ height: `${BEATS * 85 + 100}svh` }}>
        <div className="sticky top-14 flex h-[calc(100svh-3.5rem)] flex-col justify-center gap-4 py-4 sm:top-16 sm:h-[calc(100svh-4rem)] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,32rem)] lg:items-center lg:gap-16">
          <div className="flex flex-col gap-4 lg:gap-8">
            <Rail p={p} />
            <ol className="grid min-h-[11rem] lg:min-h-[13rem]">
              {HOW_STEPS.map((s, i) => {
                const o = stepOpacity(p, i);
                return (
                  <li
                    key={s.id}
                    aria-current={i === active ? "step" : undefined}
                    className="col-start-1 row-start-1 flex flex-col gap-1.5 lg:gap-3"
                    style={{ opacity: o, transform: `translate3d(0, ${lerp(8, 0, o).toFixed(2)}px, 0)`, pointerEvents: o > 0.5 ? undefined : "none" }}
                  >
                    <h3 className="font-display text-heading font-semibold leading-snug lg:text-[1.75rem] lg:leading-tight">
                      <span className="q-num mr-2 text-primary-ink">{i + 1}.</span>
                      {s.title}
                    </h3>
                    <p className="text-small text-muted-foreground lg:max-w-[46ch] lg:text-heading">{s.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="flex justify-center">
            <div className="relative h-[330px] w-[320px] [--s:1] lg:h-[528px] lg:w-[512px] lg:[--s:1.6] lg:[@media(max-height:800px)]:h-[429px] lg:[@media(max-height:800px)]:w-[416px] lg:[@media(max-height:800px)]:[--s:1.3] max-lg:[@media(max-height:720px)]:h-[281px] max-lg:[@media(max-height:720px)]:w-[272px] max-lg:[@media(max-height:720px)]:[--s:0.85] max-lg:[@media(max-height:620px)]:h-[231px] max-lg:[@media(max-height:620px)]:w-[224px] max-lg:[@media(max-height:620px)]:[--s:0.7] [@media(max-width:351px)]:h-[297px] [@media(max-width:351px)]:w-[288px] [@media(max-width:351px)]:[--s:0.9]">
              <div className="absolute left-0 top-0 origin-top-left" style={{ transform: "scale(var(--s))" }}>
                <Stage p={p} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Movimiento reducido: todo quieto. Cada paso con su escena en el cuadro final de su beat, y todo el texto legible. */
function HowItWorksStill() {
  return (
    <section aria-labelledby="como-funciona-por-detras" data-testid="how-it-works" data-mode="still" className="flex flex-col gap-8">
      <Heading lead="Seis pasos, del QR al verificador." />
      <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {HOW_STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
            <div className="relative mx-auto h-[198px] w-[192px] overflow-hidden">
              <div className="absolute left-0 top-0 origin-top-left" style={{ transform: "scale(0.6)" }}>
                <Stage p={beatHold(i)} />
              </div>
            </div>
            <h3 className="font-display text-heading font-semibold">
              <span className="q-num mr-2 text-primary-ink">{i + 1}.</span>
              {s.title}
            </h3>
            <p className="text-small text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
