/**
 * Motor de movimiento de «Cómo funciona por detrás» (método rossark-motion, design/motion/MOTION.md).
 * Todo es función pura del progreso `p` (0→1) de la sección: el mismo estado sale del scroll o de `window.__seek(p)`.
 */

export const BEATS = 6;
const B = 1 / BEATS;

export const clamp = (x: number, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);

/** 0→1 lineal entre `a` y `b`. */
export const seg = (x: number, a: number, b: number) => clamp((x - a) / (b - a));

/** Bezier cúbica (x1, y1, x2, y2) como en CSS, resuelta por Newton + bisección. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) return sy(t);
      t -= e / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) break;
      if (e > 0) hi = t;
      else lo = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/** Recorrido (de A a B): ease-in-out fuerte. */
export const travel = bezier(0.77, 0, 0.175, 1);
/** Llegada o aparición: ease-out. */
export const arrive = bezier(0.23, 1, 0.32, 1);
/** Salida: ease-in suave. */
export const leave = bezier(0.55, 0, 1, 0.45);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Progreso local (0→1) del beat `i` (0-based) dentro de `p`. Fuera del beat queda en 0 o 1. */
export const local = (p: number, i: number) => clamp((p - i * B) / B);

/** Beat activo para el texto: 0..5. */
export const activeBeat = (p: number) => Math.min(BEATS - 1, Math.floor(clamp(p) * BEATS));

/**
 * Opacidad del texto del paso `i`: entra al empezar su beat y sale al terminar (cruce corto con el siguiente).
 * El primero está visible en p=0 y el último en p=1 (cuadros publicables en los extremos).
 */
export function stepOpacity(p: number, i: number) {
  const a = i * B, b = (i + 1) * B, f = 0.035;
  const inn = i === 0 ? 1 : arrive(seg(p, a - f * 0.2, a + f));
  const out = i === BEATS - 1 ? 1 : 1 - leave(seg(p, b - f, b + f * 0.2));
  return Math.min(inn, out);
}

/** Aparece entre `a` y `b` (ease-out) y desaparece entre `c` y `d` (ease-in). Sin `c` no desaparece. */
export function presence(u: number, a: number, b: number, c = Infinity, d = Infinity) {
  const inn = arrive(seg(u, a, b));
  const out = c === Infinity ? 1 : 1 - leave(seg(u, c, d));
  return Math.min(inn, out);
}

/** p central "publicable" de cada beat (para el modo quieto y las capturas). */
export const beatHold = (i: number) => (i + 0.86) * B;

/** Temblor único y amortiguado (solo para «fallo detectado»): ±amp px, 2 ciclos. */
export const shake = (u: number, amp = 4) => (u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI * 4) * amp * (1 - u));
