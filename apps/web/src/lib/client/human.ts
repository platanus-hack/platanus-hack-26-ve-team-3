/**
 * Prueba de vida — modo demo, no certificada.
 * Carga @vladmandic/human sólo en el navegador (import dinámico), modelos desde /models.
 * Nunca se envía ni se guarda la imagen: sólo un descriptor (embedding) promediado.
 */
import type { Config, FaceResult, Human as HumanType } from "@vladmandic/human";

export type HumanInstance = HumanType;

/**
 * Solo lo necesario para la inscripción (≈60 teléfonos en el mismo wifi): detector (blazeface), malla (facemesh: el
 * parpadeo y el giro de la prueba activa salen de sus puntos), descriptor (faceres: dedupe 1:N; edad/género vienen en el
 * mismo modelo y no se usan), antispoof (`face.real`) y liveness (`face.live`). Apagados: iris (2,6 MB; el parpadeo no lo
 * necesita), emoción, cuerpo, manos, objetos y segmentación. Si se activa algo aquí, sumar su modelo a /models y a
 * `HEAVY_ASSETS` (lib/client/room.ts); un test comprueba que coincidan.
 */
export const HUMAN_CONFIG: Partial<Config> = {
  modelBasePath: "/models",
  // `humangl` es el backend WebGL que Human recomienda para navegadores: en WebKit (iPhone) compila los shaders mucho
  // más rápido que `webgl` (medido: calentamiento 0,4 s vs 3,6 s en WebKit de escritorio; en iPhone real `webgl` se
  // quedaba en "Preparando la cámara…").
  backend: "humangl",
  cacheSensitivity: 0,
  // El calentamiento solo hace falta para la autoprueba de E2E; en producción el primer `detect` ya compila.
  warmup: process.env.NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE === "1" ? "face" : "none",
  filter: { enabled: true, equalization: false },
  face: {
    enabled: true,
    detector: { rotation: true, maxDetected: 1, minConfidence: 0.5 },
    mesh: { enabled: true },
    iris: { enabled: false },
    attention: { enabled: false },
    description: { enabled: true },
    emotion: { enabled: false },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: true },
  segmentation: { enabled: false },
};

/**
 * Autoprueba con la imagen de calentamiento que trae Human (no es una persona nuestra ni una captura): confirma que
 * con la config recortada siguen saliendo `face.real` (antispoof), `face.live` (liveness), el descriptor (dedupe) y la
 * malla (parpadeo/giro). Solo se expone en `window` con NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE=1 (pruebas automatizadas).
 */
export type HumanSelfTest = { faces: number; real: number | null; live: number | null; embedding: number[]; meshPoints: number; gestures: string[] };
let selfTest: HumanSelfTest | null = null;
export const humanSelfTest = (): HumanSelfTest | null => selfTest;

let instance: HumanType | null = null;
let loading: Promise<HumanType> | null = null;

export async function loadHuman(): Promise<HumanType> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const mod = await import("@vladmandic/human");
      const Human = mod.Human ?? mod.default;
      const h = new Human(HUMAN_CONFIG);
      const t0 = performance.now();
      await h.load();
      clientLog("human:loaded", { ms: Math.round(performance.now() - t0), backend: String(h.tf?.getBackend?.() ?? "") });
      const warm = await h.warmup();
      const f = warm?.face?.[0];
      selfTest = {
        faces: warm?.face?.length ?? 0,
        real: typeof f?.real === "number" ? f.real : null,
        live: typeof f?.live === "number" ? f.live : null,
        embedding: f?.embedding ? Array.from(f.embedding) : [],
        meshPoints: f?.mesh?.length ?? 0,
        gestures: (warm?.gesture ?? []).map((g) => String(g.gesture)),
      };
      instance = h;
      return h;
    })().catch((e) => {
      loading = null; // permite reintentar
      clientLog("human:error", { error: e instanceof Error ? e.message : String(e) });
      throw e;
    });
  }
  return loading;
}

/**
 * Diagnóstico mínimo para el ensayo con teléfonos reales: en qué paso va la cámara y cuánto tarda. Va a los logs del
 * servidor (`/api/client-log`). Nunca lleva imagen, descriptor, nombre ni token: solo etapa, tiempos y navegador.
 */
export function clientLog(stage: string, data: Record<string, string | number | boolean> = {}): void {
  try {
    const body = JSON.stringify({ stage, ...data, ua: navigator.userAgent.slice(0, 160) });
    if (!navigator.sendBeacon?.("/api/client-log", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-log", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  } catch {
    /* el diagnóstico nunca rompe el flujo */
  }
}

/** Acción pedida al votante para la prueba de vida activa. */
export type LivenessAction = "blink" | "turn";

export function pickAction(): LivenessAction {
  return Math.random() < 0.5 ? "blink" : "turn";
}

/** Detecta la acción a partir de gestos/rotación de Human. */
export function actionSatisfied(action: LivenessAction, face: FaceResult, gestures: string[]): boolean {
  if (action === "blink") return gestures.some((g) => g.startsWith("blink"));
  const yaw = face.rotation?.angle?.yaw ?? 0;
  return Math.abs(yaw) > 0.3 || gestures.some((g) => g === "facing left" || g === "facing right");
}

/** Promedio elemento a elemento de N descriptores de igual longitud. */
export function averageDescriptors(descs: number[][]): number[] {
  if (descs.length === 0) return [];
  const len = descs[0].length;
  const out = new Array<number>(len).fill(0);
  for (const d of descs) for (let i = 0; i < len; i++) out[i] += d[i] ?? 0;
  return out.map((v) => Number((v / descs.length).toFixed(6)));
}
