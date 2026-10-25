/**
 * Guion del hero: 6 actos en un loop de `LOOP` segundos. Beat sheet completo en design/motion/LANDING.md.
 * Los tiempos son segundos dentro del loop; el estado de la escena es función pura de `t`.
 */

export const LOOP = 28;

/**
 * El acto «impostor» se intercala en 8,2 → 12,2 s. La escena de las boletas, la cadena y la verificación está
 * escrita en su tiempo propio `tc` (= t − 4 s después del impostor); `toScene` hace la conversión.
 */
export const IMPOSTOR = { from: 8.2, to: 12.2 } as const;
export const toScene = (t: number) => (t < IMPOSTOR.from ? t : t < IMPOSTOR.to ? IMPOSTOR.from : t - (IMPOSTOR.to - IMPOSTOR.from));

export type ActId = "promesa" | "identidad" | "impostor" | "voto" | "cadena" | "verifica";

export type Act = {
  id: ActId;
  /** Nombre corto para el control de saltar de acto (aria-label) y el resumen. */
  name: string;
  /** Inicio del acto en el loop (para saltar a él). */
  start: number;
  /** Titular cinético (3–7 palabras). `*palabras*` = palabras clave en tinta de marca. */
  title: string;
  /** Ventana del titular en el loop: entra en `titleIn`, se va al llegar a `titleOut` (puede cruzar el cero). */
  titleIn: number;
  titleOut: number;
  /** Texto completo y honesto (D-15) para lectores de pantalla, SEO y el modo quieto. */
  summary: string;
};

export const ACTS: readonly Act[] = [
  {
    id: "promesa",
    name: "Resultados en vivo",
    start: 0,
    title: "Nadie tiene que creerle a *quien cuenta.*",
    titleIn: 26.78,
    titleOut: 3.5,
    summary: "Los resultados se ven en vivo y cualquiera puede recalcularlos desde el paquete público de la votación.",
  },
  {
    id: "identidad",
    name: "Credencial y rostro",
    start: 3.4,
    title: "Una credencial. Un rostro. *Un voto.*",
    titleIn: 3.38,
    titleOut: 8.25,
    summary: "Escaneas tu credencial del evento, que sirve una sola vez por votación, y tu rostro se comprueba en tu teléfono. Al servidor llega una huella cifrada y no se guardan fotos.",
  },
  {
    id: "impostor",
    name: "Intento de suplantación",
    start: 8.2,
    title: "Ni sin credencial, *ni dos veces.*",
    titleIn: 8.13,
    titleOut: 12.25,
    summary: "Un QR que no es una credencial del evento rebota («Ese QR no es una credencial de Platanus Hack»), y una credencial ya usada también. Un rostro que ya está inscrito en la votación no se inscribe otra vez: se rechaza («Este rostro ya está inscrito en esta votación») o, si llega con su propia credencial del evento, lo revisa en persona quien organiza.",
  },
  {
    id: "voto",
    name: "Boleta con prueba",
    start: 12.2,
    title: "Tu voto viaja *con su prueba.*",
    titleIn: 12.13,
    titleOut: 17.0,
    summary: "Tu teléfono arma la boleta con una prueba de que estás en la lista y un código único (nullifier). Un segundo voto con el mismo nullifier se rechaza. La prueba no revela quién emitió cada boleta; el servidor ve el contenido.",
  },
  {
    id: "cadena",
    name: "Cadena y ancla",
    start: 17.0,
    title: "Cada voto, *encadenado* a la vista.",
    titleIn: 16.88,
    titleOut: 23.6,
    summary: "Cada voto guarda el hash (SHA-256) del anterior en un registro público. Al cerrar, quien organiza ancla el hash final en el contrato QuorumRegistry de Base Sepolia (0x64e7…be13): prueba que el registro era así en ese momento.",
  },
  {
    id: "verifica",
    name: "Verificación",
    start: 22.4,
    title: "Altera una copia y *salta la alarma.*",
    titleIn: 23.48,
    titleOut: 26.9,
    summary: "Si alguien altera una copia, el verificador marca «fallo detectado» y dice dónde. Con la copia original, el resultado se recalcula igual en cualquier teléfono. No le creas al organizador: verifica la prueba.",
  },
];

/** Tiempo transcurrido desde `a` hasta `t`, dando la vuelta al loop (0 ≤ x < LOOP). */
export const since = (t: number, a: number) => (((t - a) % LOOP) + LOOP) % LOOP;

/** Acto que se ve en `t` (la verificación cede a la promesa en 26,8 s, cuando la tarjeta ya está recompuesta). */
export function actAt(t: number): number {
  const x = since(t, 0);
  if (x >= 26.8) return 0;
  for (let i = ACTS.length - 1; i >= 0; i--) if (x >= ACTS[i].start) return i;
  return 0;
}

/** Instantes de referencia para capturas: un cuadro sostenido por acto y uno en cada transición. */
export const HOLDS = [1.6, 7.9, 11.8, 16.55, 21.9, 24.6] as const;
export const SEAMS = [4.0, 8.6, 12.7, 17.6, 22.7, 26.4] as const;
