/**
 * Motor del hero animado (método rossark-motion, design/motion/MOTION.md): curvas, ventanas y pistas.
 * Todo es función pura del tiempo `t` del loop: el mismo estado sale del reloj o de `window.__seek(t)`.
 */

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

/** Aparece entre `a` y `b` (ease-out) y desaparece entre `c` y `d` (ease-in). Sin `c` no desaparece. */
export function presence(u: number, a: number, b: number, c = Infinity, d = Infinity) {
  const inn = arrive(seg(u, a, b));
  const out = c === Infinity ? 1 : 1 - leave(seg(u, c, d));
  return Math.min(inn, out);
}

/** Temblor único y amortiguado (solo para golpes: «rechazado», «fallo detectado»): ±amp px, 2 ciclos. */
export const shake = (u: number, amp = 4) => (u <= 0 || u >= 1 ? 0 : Math.sin(u * Math.PI * 4) * amp * (1 - u));

/** Rebote sobrio: sube a 1 y se asienta con una sola oscilación pequeña (física de contacto, sin muelles infinitos). */
export const settle = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.cos(u * Math.PI * 1.5) * Math.pow(1 - u, 2.2));

/**
 * Pista de keyframes `[t, valor]` con recorrido ease-in-out entre claves (se detiene en cada una: un movimiento por tramo).
 * Antes de la primera clave vale la primera; después de la última, la última.
 */
export function keys(t: number, k: ReadonlyArray<readonly [number, number]>, ease: (x: number) => number = travel) {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    const [t1, v1] = k[i];
    if (t <= t1) {
      const [t0, v0] = k[i - 1];
      return lerp(v0, v1, ease(seg(t, t0, t1)));
    }
  }
  return k[k.length - 1][1];
}
