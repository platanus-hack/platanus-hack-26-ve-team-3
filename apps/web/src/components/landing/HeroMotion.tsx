"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Pause, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/client/cn";
import { arrive, leave, seg } from "./hero/engine";
import { Scene, layoutFor } from "./hero/Scene";
import { ACTS, LOOP, actAt, since } from "./hero/timeline";

/**
 * Hero de la landing: titular y CTAs fijos; al lado, una composición que se transforma sola en 5 actos encadenados
 * (resultados → teléfono → boleta sellada → cadena anclada → copia alterada detectada → resultados), como un video de
 * lanzamiento en loop de 24 s. Estado = función pura de `t` (`window.__seek(t)` para renders). El reloj se pausa fuera
 * de pantalla, con la pestaña oculta y con el botón de pausa (WCAG 2.2.2). Movimiento reducido → cuadro fijo del acto A
 * y el resumen de los 5 actos. Guion y auditoría en design/motion/LANDING.md.
 */

declare global {
  interface Window {
    /** Fija el tiempo del hero (segundos, 0 → 24) para renders deterministas; `null` vuelve al reloj. */
    __seek?: (t: number | null) => void;
    /** Duración del loop del hero en segundos (para los scripts de captura). */
    __heroLoop?: number;
  }
}

const REDUCED = "(prefers-reduced-motion: reduce)";
const COMPACT = "(max-width: 1023px)";

function useMedia(query: string, fallback: boolean) {
  // Sin `matchMedia` (jsdom, navegadores muy viejos): el valor de respaldo y sin suscripción.
  const can = typeof window !== "undefined" && typeof window.matchMedia === "function";
  return useSyncExternalStore(
    (on) => {
      if (!can) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => (can ? window.matchMedia(query).matches : fallback),
    () => fallback,
  );
}

const noopSubscribe = () => () => {};

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Reloj del loop: un rAF solo mientras el hero está en pantalla, la pestaña visible y no está en pausa. */
function useLoopClock(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  const tRef = useRef(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [forced, setForced] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    window.__heroLoop = LOOP;
    window.__seek = (v) => {
      // Al soltar (`null`) el reloj sigue desde el último tiempo fijado.
      if (v !== null) tRef.current = ((v % LOOP) + LOOP) % LOOP;
      setForced(v === null ? null : tRef.current);
    };
    return () => {
      delete window.__seek;
      delete window.__heroLoop;
    };
  }, [enabled]);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !playing || forced !== null || !el) return;
    let raf = 0;
    let last = 0;
    let inView = false;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      tRef.current = (tRef.current + dt) % LOOP;
      setT(tRef.current);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf && inView && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    // Sin IntersectionObserver (jsdom): se asume en pantalla.
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([e]) => {
            inView = e.isIntersecting;
            if (inView) start();
            else stop();
          })
        : null;
    if (io) io.observe(el);
    else {
      inView = true;
      start();
    }
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io?.disconnect();
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, playing, forced]);

  const jump = useCallback((to: number) => {
    tRef.current = to;
    setT(to);
  }, []);

  return { ref, t: forced ?? t, playing, setPlaying, jump };
}

/** Escala fija (no animada) para que el lienzo quepa en su caja; se recalcula solo al cambiar el tamaño. */
function useFit(w: number, h: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(0);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setS(Math.min(w > 400 ? 1.18 : 1, el.clientWidth / w, el.clientHeight / h));
    measure();
    if (typeof ResizeObserver !== "function") return; // jsdom: una sola medida
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);
  return { ref, s };
}

/* ───────────────────────── Texto ───────────────────────── */

function Copy({ title }: { title: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:gap-7">
      <p className="q-eyebrow hidden lg:block">Infraestructura de confianza para decisiones colectivas</p>
      <h1 id="hero-titulo" className={TITLE_CLS}>
        <span className="sr-only">Nadie tiene que creerle a quien cuenta.</span>
        {title}
      </h1>
      <p className="max-w-[40ch] text-body text-muted-foreground sm:text-heading">Cada voto trae su prueba. Cualquiera recalcula el resultado.</p>
      <div className="flex gap-2.5 sm:gap-3">
        <Link href="/org/new" className={cn(buttonVariants({ size: "lg" }), "whitespace-nowrap max-sm:min-h-12 max-sm:flex-1 max-sm:px-3 max-sm:text-body")}>
          Crear votación <ArrowRight aria-hidden="true" className="max-[400px]:hidden" />
        </Link>
        <Link href="/votaciones" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "whitespace-nowrap max-sm:min-h-12 max-sm:flex-1 max-sm:px-3 max-sm:text-body")}>
          Mis votaciones
        </Link>
      </div>
    </div>
  );
}

const TITLE_CLS = "font-display text-[2.25rem] font-bold leading-[0.98] tracking-[-0.045em] sm:text-[3.25rem] lg:text-[4.25rem]";

/** Palabras del titular; `*…*` marca las palabras clave (tinta de marca). */
function words(line: string) {
  let em = false;
  return line.split(" ").map((w) => {
    if (w.startsWith("*")) em = true;
    const word = { text: w.replaceAll("*", ""), em };
    if (/\*[.,]?$/.test(w)) em = false;
    return word;
  });
}

const plain = (line: string) => line.replaceAll("*", "");

/** Titular estático (movimiento reducido y primer render). */
function StillTitle({ line }: { line: string }) {
  return (
    <span aria-hidden="true" className="block">
      {words(line).map((w, k) => (
        <span key={k} className={cn(w.em && "text-primary-ink")}>
          {w.text}{" "}
        </span>
      ))}
    </span>
  );
}

/**
 * Titular cinético: cada palabra sube desde su propia máscara con un leve giro que se endereza (entra una vez, en
 * cascada) y sale hacia arriba, más rápido, cuando su acto cede; el siguiente titular ya está subiendo detrás.
 */
function KineticTitle({ t }: { t: number }) {
  return (
    <span aria-hidden="true" className="grid min-h-[2.94em]">
      {ACTS.map((a) => {
        const dur = since(a.titleOut, a.titleIn);
        const x = since(t, a.titleIn);
        if (x >= dur) return null;
        const ws = words(a.title);
        return (
          <span key={a.id} className="col-start-1 row-start-1 self-start" data-act={a.id}>
            {ws.map((w, k) => {
              const inn = arrive(seg(x, 0.055 * k, 0.055 * k + 0.75));
              const out = leave(seg(x, dur - 0.42 + 0.025 * k, dur - 0.08 + 0.025 * k));
              const y = (1 - inn) * 108 - out * 108;
              const r = (1 - inn) * 5 - out * 3;
              return (
                <span key={k}>
                  <span className="-mb-[0.16em] inline-block overflow-hidden pb-[0.16em] align-top">
                    <span className={cn("inline-block origin-bottom-left", w.em && "text-primary-ink")} style={{ transform: `translate3d(0, ${y.toFixed(2)}%, 0) rotate(${r.toFixed(2)}deg)` }}>
                      {w.text}
                    </span>
                  </span>{" "}
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}

function A11ySummary({ className }: { className?: string }) {
  return (
    <div className={className}>
      <h2 className="q-eyebrow">Cómo funciona por detrás</h2>
      <ol className="mt-3 flex flex-col gap-3">
        {ACTS.map((a) => (
          <li key={a.id} className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.6em] h-0.5 w-3 shrink-0 rounded-full bg-primary" />
            <div>
              <h3 className="text-body font-semibold">
                {a.name}: {plain(a.title)}
              </h3>
              <p className="text-small text-muted-foreground">{a.summary}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ───────────────────────── Sección ───────────────────────── */

const SECTION = "relative before:absolute before:inset-y-0 before:left-1/2 before:-z-10 before:w-screen before:-translate-x-1/2 before:bg-background before:-top-8 md:before:-top-14 lg:before:top-0";

export function HeroMotion() {
  const reduced = useMedia(REDUCED, false);
  return reduced ? <HeroStill /> : <HeroLoop />;
}

function HeroLoop() {
  const compact = useMedia(COMPACT, false);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const { ref, t, playing, setPlaying, jump } = useLoopClock(true);
  const L = layoutFor(compact);
  const { ref: fitRef, s: fitS } = useFit(L.W, L.H);
  const act = actAt(t);

  return (
    <section
      ref={ref}
      aria-labelledby="hero-titulo"
      data-testid="hero"
      data-mode="loop"
      className={cn(SECTION, "flex h-[calc(100svh-3.5rem-1px-2rem)] min-h-[36rem] flex-col gap-4 md:h-[calc(100svh-4rem-1px-3.5rem)] lg:grid lg:h-[calc(100svh-4rem-1px)] lg:max-h-[58rem] lg:min-h-[40rem] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-center lg:gap-10")}
    >
      <Copy title={<KineticTitle t={t} />} />

      <div className="relative min-h-0 flex-1 lg:h-full lg:max-h-[48rem]">
        <div ref={fitRef} className="absolute inset-0 bottom-10 flex items-center justify-center overflow-hidden lg:bottom-12">
          {mounted && fitS > 0 ? (
            <div className="q-fade-in" style={{ width: L.W * fitS, height: L.H * fitS }}>
              <div className="origin-top-left" style={{ transform: `scale(${fitS.toFixed(4)})` }}>
                <Scene t={t} L={L} />
              </div>
            </div>
          ) : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              aria-label={playing ? "Pausar animación" : "Reanudar animación"}
              className="grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-3.5"
            >
              {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <div role="group" aria-label="Ir a una parte de la animación" className="flex">
              {ACTS.map((a, i) => (
                <button key={a.id} type="button" onClick={() => jump(a.start + 0.01)} aria-label={a.name} aria-current={i === act ? "true" : undefined} className="group grid h-9 w-7 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring">
                  <span className={cn("block h-[3px] w-5 origin-center rounded-full transition-[transform,background-color] duration-300", i === act ? "scale-x-100 bg-primary" : "scale-x-[0.35] bg-foreground/25 group-hover:bg-foreground/50")} />
                </button>
              ))}
            </div>
          </div>
          <p className="text-[0.6875rem] text-subtle">Datos de ejemplo</p>
        </div>
      </div>

      <A11ySummary className="sr-only" />
    </section>
  );
}

/** Movimiento reducido: sin loop. El acto A quieto y, legible, lo que cuentan los 5 actos. */
function HeroStill() {
  const compact = useMedia(COMPACT, false);
  const L = layoutFor(compact);
  const { ref: fitRef, s: fitS } = useFit(L.W, L.H);
  return (
    <section aria-labelledby="hero-titulo" data-testid="hero" data-mode="still" className={cn(SECTION, "grid gap-8 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,35rem)] lg:items-center lg:gap-12 lg:py-10")}>
      <div className="flex flex-col gap-8">
        <Copy title={<StillTitle line={ACTS[0].title} />} />
        <A11ySummary />
      </div>
      <div ref={fitRef} className="relative h-[25rem] lg:h-[38rem]">
        {fitS > 0 ? (
          <div className="absolute left-1/2 top-0 -translate-x-1/2" style={{ width: L.W * fitS, height: L.H * fitS }}>
            <div className="origin-top-left" style={{ transform: `scale(${fitS.toFixed(4)})` }}>
              <Scene t={1.6} L={L} />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
