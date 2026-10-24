/**
 * Prueba de vida — modo demo, no certificada.
 * Carga @vladmandic/human sólo en el navegador (import dinámico), modelos desde /models.
 * Nunca se envía ni se guarda la imagen: sólo un descriptor (embedding) promediado.
 */
import type { Config, FaceResult, Human as HumanType } from "@vladmandic/human";

export type HumanInstance = HumanType;

const config: Partial<Config> = {
  modelBasePath: "/models",
  backend: "webgl",
  cacheSensitivity: 0,
  warmup: "face",
  filter: { enabled: true, equalization: false },
  face: {
    enabled: true,
    detector: { rotation: true, maxDetected: 1, minConfidence: 0.5 },
    mesh: { enabled: true },
    iris: { enabled: true },
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

let instance: HumanType | null = null;
let loading: Promise<HumanType> | null = null;

export async function loadHuman(): Promise<HumanType> {
  if (instance) return instance;
  if (!loading) {
    loading = (async () => {
      const mod = await import("@vladmandic/human");
      const Human = mod.Human ?? mod.default;
      const h = new Human(config);
      await h.load();
      await h.warmup();
      instance = h;
      return h;
    })();
  }
  return loading;
}

/** Acción pedida al votante para la prueba de vida activa. */
export type LivenessAction = "blink" | "turn";

export function pickAction(): LivenessAction {
  return Math.random() < 0.5 ? "blink" : "turn";
}

export const actionLabel: Record<LivenessAction, string> = {
  blink: "Parpadea dos veces",
  turn: "Gira la cabeza un poco a un lado",
};

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

export function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "No se otorgó permiso para usar la cámara.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No encontramos una cámara en este dispositivo.";
    case "NotReadableError":
      return "La cámara está en uso por otra aplicación.";
    default:
      return err instanceof Error ? err.message : "No se pudo iniciar la cámara.";
  }
}
