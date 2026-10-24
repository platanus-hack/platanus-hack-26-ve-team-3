/**
 * Prueba de vida — modo demo, no certificada.
 * Carga @vladmandic/human sólo en el navegador (import dinámico), modelos desde /models y WASM desde /tfjs.
 * Nunca se envía ni se guarda la imagen: sólo un descriptor (embedding) promediado.
 */
import type { Config, FaceResult, Human as HumanType } from "@vladmandic/human";
import { downloadFaceModels, lastDownloadTotal, releaseDownloadedFiles, resolveBackend, wasmSimdSupported, withDownloadedFiles, type FaceBackend } from "./face-download";
import { TFJS_VERSION } from "./face-models";
import { clientLog } from "./clientLog";

export * from "./face-download";

export type HumanInstance = HumanType;

/**
 * Solo lo necesario para la inscripción (≈60 teléfonos, red lenta). Medido en docs/TEST_RESULTS.md («rostro rápido»):
 *  - detector blazeface (float16), antispoof (`face.real`) y liveness (`face.live`) en uint8;
 *  - descriptor insightface-mobilenet-emore en uint8 (256 dimensiones) en lugar de faceres (6,98 MB): mejor separación
 *    en promedio con la mitad de bytes (dedupe 1:N; el servidor usa el umbral calibrado para 256 dimensiones);
 *  - SIN facemesh (1,5 MB): la acción de vida es «gira la cabeza», medida con los ojos y la nariz del detector.
 * Apagados: malla, iris, emoción, edad/género, cuerpo, manos, objetos, segmentación y gestos. Todo lo que se active
 * aquí tiene que existir en /models (lo genera scripts/build-face-models.mjs) y en FACE_MODEL_FILES.
 */
export const HUMAN_CONFIG: Partial<Config> = {
  modelBasePath: "/models",
  wasmPath: `/tfjs/${TFJS_VERSION}/`,
  backend: "wasm",
  // Los archivos ya quedan en Cache Storage (service worker) o en la caché HTTP inmutable: no duplicar en IndexedDB.
  cacheModels: false,
  cacheSensitivity: 0,
  // Con WASM el calentamiento cuesta décimas de segundo y sirve de autoprueba (ver humanSelfTest).
  warmup: "face",
  filter: { enabled: true, equalization: false },
  face: {
    enabled: true,
    detector: { modelPath: "blazeface-f16.json", rotation: true, maxDetected: 1, minConfidence: 0.5 },
    mesh: { enabled: false },
    iris: { enabled: false },
    attention: { enabled: false },
    // faceres apagado: el descriptor lo da insightface (abajo).
    description: { enabled: false },
    emotion: { enabled: false },
    antispoof: { enabled: true, modelPath: "antispoof-u8.json" },
    liveness: { enabled: true, modelPath: "liveness-u8.json" },
    // Clave que Human lee pero no declara en sus tipos.
    ...({ insightface: { enabled: true, modelPath: "insightface-u8.json" } } as object),
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
};

/** Dimensiones del descriptor que produce HUMAN_CONFIG (el servidor elige el umbral de dedupe según esto). */
export const DESCRIPTOR_DIMS = 256;

/* ---------- Carga de Human ---------- */

/**
 * Autoprueba con la imagen de calentamiento que trae Human (no es una persona nuestra ni una captura): confirma que
 * con la config recortada siguen saliendo `face.real` (antispoof), `face.live` (liveness), el descriptor (dedupe) y los
 * puntos del detector (giro). Solo se expone en `window` con NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE=1 (pruebas automatizadas).
 */
export type HumanSelfTest = { faces: number; real: number | null; live: number | null; embedding: number[]; landmarks: number; backend: string };
let selfTest: HumanSelfTest | null = null;
export const humanSelfTest = (): HumanSelfTest | null => selfTest;

let instance: HumanType | null = null;
let loading: Promise<HumanType> | null = null;
/** Tiempos de la última carga (para el diagnóstico de la cámara). */
export const humanTimings: { backend?: string; source?: string; downloadMs?: number; initMs?: number; warmupMs?: number } = {};

/** Tras la descarga, iniciar el backend y calentar no debería pasar de esto (WASM: décimas de segundo). */
const INIT_TIMEOUT_MS = 60_000;

export async function loadHuman(): Promise<HumanType> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const { backend, source } = resolveBackend();
      const t0 = performance.now();
      await downloadFaceModels(backend);
      const tDl = performance.now();
      const mod = await import("@vladmandic/human");
      const Human = mod.Human ?? mod.default;
      const init = async (b: FaceBackend) => {
        const h = new Human({ ...HUMAN_CONFIG, backend: b });
        if (b === "wasm") {
          // Sin hilos (no hay aislamiento entre orígenes) y SIMD según el binario que se descargó.
          const env = h.tf?.env?.();
          env?.set?.("WASM_HAS_MULTITHREAD_SUPPORT", false);
          env?.set?.("WASM_HAS_SIMD_SUPPORT", wasmSimdSupported());
        }
        await withDownloadedFiles(() => h.load());
        return h;
      };
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("El reconocimiento facial tardó demasiado en iniciar. Intenta de nuevo.")), INIT_TIMEOUT_MS));
      let h = await Promise.race([init(backend), timeout]);
      let actual = String(h.tf?.getBackend?.() ?? "");
      if (backend === "wasm" && actual !== "wasm") {
        clientLog("human:fallback", { wanted: backend, got: actual });
        h = await Promise.race([init("humangl"), timeout]);
        actual = String(h.tf?.getBackend?.() ?? "");
      }
      const tInit = performance.now();
      const warm = await Promise.race([h.warmup(), timeout]);
      const tWarm = performance.now();
      const f = warm?.face?.[0];
      selfTest = {
        faces: warm?.face?.length ?? 0,
        real: typeof f?.real === "number" ? f.real : null,
        live: typeof f?.live === "number" ? f.live : null,
        embedding: f?.embedding ? Array.from(f.embedding) : [],
        landmarks: f?.mesh?.length ?? 0,
        backend: actual,
      };
      Object.assign(humanTimings, { backend: actual, source, downloadMs: Math.round(tDl - t0), initMs: Math.round(tInit - tDl), warmupMs: Math.round(tWarm - tInit) });
      clientLog("human:loaded", { ...humanTimings, simd: wasmSimdSupported(), wireKB: Math.round(lastDownloadTotal() / 1000) });
      releaseDownloadedFiles(); // ya están en Human; la próxima vez salen de la caché
      instance = h;
      return h;
    })().catch((e) => {
      loading = null; // permite reintentar
      clientLog("human:error", { error: e instanceof Error ? e.message.slice(0, 200) : String(e) });
      throw e;
    });
  }
  return loading;
}

/** Diagnóstico a los logs del servidor (vive en `clientLog.ts`, también lo usa la vinculación del teléfono). */
export { clientLog };

/* ---------- Prueba de vida activa: mirar → girar la cabeza → volver a mirar ---------- */

/**
 * Giro horizontal aproximado con los puntos del detector (ojo izq., ojo der., nariz): desplazamiento de la nariz
 * respecto del centro de los ojos, en unidades de distancia entre ojos. Correlación −0,93 con el yaw de la malla
 * (800 rostros); 0,3 rad de yaw ≈ 0,34 aquí. `null` si no hay puntos.
 */
export function yawProxy(face: Pick<FaceResult, "mesh">): number | null {
  const [le, re, nose] = face.mesh ?? [];
  if (!le || !re || !nose) return null;
  const d = Math.hypot(re[0] - le[0], re[1] - le[1]);
  if (!(d > 0)) return null;
  return (nose[0] - (le[0] + re[0]) / 2) / d;
}

/** Umbrales de la prueba activa (unidades de `yawProxy`). */
export const FRONTAL_MAX = 0.2;
export const TURN_DELTA = 0.3;
/** Coseno mínimo entre el descriptor de «vuelve a mirar» y el promedio inicial (misma persona en la misma sesión). */
export const CONFIRM_MIN = 0.55;
export const CAPTURES = 3;
export const CAPTURE_GAP_MS = 250;

export type LivenessStage = "look" | "spoof" | "turn" | "back" | "done";
export type LivenessFrame = { t: number; face: boolean; present: boolean; yaw: number | null; embedding: number[] | null };

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Máquina de estados de la prueba de vida (pura, probada en unit tests):
 *  1. «Mira a la cámara»: de frente, con antispoof y liveness ≥ umbral → 3 descriptores (≥250 ms entre sí).
 *  2. «Gira un poco la cabeza»: el giro respecto de la postura inicial supera TURN_DELTA.
 *  3. «Vuelve a mirar a la cámara»: de frente otra vez, presente, y su descriptor coincide con el inicial (misma
 *     persona; si no, vuelve a empezar). El resultado es el promedio de los 4 descriptores.
 */
export class LivenessTracker {
  stage: LivenessStage = "look";
  captures: number[][] = [];
  private baseline: number[] = [];
  private lastCaptureAt = -Infinity;
  result: number[] | null = null;

  get baselineYaw(): number {
    return this.baseline.length ? this.baseline.reduce((a, b) => a + b, 0) / this.baseline.length : 0;
  }

  feed(fr: LivenessFrame): LivenessStage {
    if (this.stage === "done") return this.stage;
    const frontal = (ref: number) => fr.yaw !== null && Math.abs(fr.yaw - ref) <= FRONTAL_MAX;
    if (this.stage === "look" || this.stage === "spoof") {
      if (fr.face && !fr.present) return (this.stage = "spoof");
      this.stage = "look";
      if (!fr.present || !fr.embedding || !frontal(0)) return this.stage;
      if (fr.t - this.lastCaptureAt >= CAPTURE_GAP_MS) {
        this.captures.push(fr.embedding);
        this.baseline.push(fr.yaw!);
        this.lastCaptureAt = fr.t;
      }
      if (this.captures.length >= CAPTURES) this.stage = "turn";
      return this.stage;
    }
    if (this.stage === "turn") {
      if (fr.face && fr.yaw !== null && Math.abs(fr.yaw - this.baselineYaw) >= TURN_DELTA) this.stage = "back";
      return this.stage;
    }
    // back
    if (!fr.present || !fr.embedding || !frontal(this.baselineYaw)) return this.stage;
    const avg = averageDescriptors(this.captures);
    if (cosine(avg, fr.embedding) < CONFIRM_MIN) {
      this.reset();
      return this.stage;
    }
    this.result = averageDescriptors([...this.captures, fr.embedding]);
    return (this.stage = "done");
  }

  reset() {
    this.stage = "look";
    this.captures = [];
    this.baseline = [];
    this.lastCaptureAt = -Infinity;
    this.result = null;
  }
}

/** Promedio elemento a elemento de N descriptores de igual longitud. */
export function averageDescriptors(descs: number[][]): number[] {
  if (descs.length === 0) return [];
  const len = descs[0].length;
  const out = new Array<number>(len).fill(0);
  for (const d of descs) for (let i = 0; i < len; i++) out[i] += d[i] ?? 0;
  return out.map((v) => Number((v / descs.length).toFixed(6)));
}
