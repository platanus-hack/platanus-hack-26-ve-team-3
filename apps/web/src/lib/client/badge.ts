/**
 * Credencial del evento (D-19) en el navegador: lectura del QR y errores de `POST /api/rooms/:code/join-badge`.
 *
 * Lector: `BarcodeDetector` nativo si existe y sabe leer `qr_code` (Chrome Android: 0 bytes extra); si no (iPhone,
 * Firefox), `jsqr@1.4.0` cargado bajo demanda SOLO al abrir la cámara, sobre un recorte cuadrado central reducido a
 * ≤ 720 px para que un Android de gama baja lo procese en pocos ms por cuadro.
 */
import { DEFAULT_BADGE_URL_PREFIX, JoinRoomResult, parseBadgeUrl } from "@quorum/contracts";
import { ApiClientError, request } from "./api";

export const badgeApi = {
  join: (roomCode: string, badgeUrl: string) =>
    request(`/api/rooms/${encodeURIComponent(roomCode)}/join-badge`, { method: "POST", body: JSON.stringify({ badgeUrl }) }, JoinRoomResult),
};

export const BADGE_COPY = {
  invalid: "Ese QR no es una credencial de Platanus Hack.",
  unknown: "No encontramos esta credencial en el evento.",
  used: "Esta credencial ya se usó en esta votación.",
  typedInvalid: "Escribe tu usuario tal como aparece en tu credencial (letras, números y guiones).",
} as const;

/** Del texto escrito a la URL de la credencial: acepta el usuario solo, con @, o la URL completa. */
export function badgeUrlFromTyped(raw: string, prefix: string = DEFAULT_BADGE_URL_PREFIX): string | null {
  const t = raw.trim();
  if (parseBadgeUrl(t, prefix)) return t;
  const user = t.replace(/^@/, "");
  return /^[A-Za-z0-9-]{1,39}$/.test(user) ? `${prefix}${user}` : null;
}

export type BadgeFailure = { kind: "invalid" | "unknown" | "used" | "full" | "closed" | "rate" | "other"; message: string };

export function classifyBadgeError(err: unknown): BadgeFailure {
  if (err instanceof ApiClientError) {
    if (err.status === 429) return { kind: "rate", message: "Muchas personas están entrando a la vez desde esta red. Espera un minuto y vuelve a intentarlo." };
    if (err.code === "badge_used") return { kind: "used", message: BADGE_COPY.used };
    if (err.code === "badge_unknown") return { kind: "unknown", message: BADGE_COPY.unknown };
    if (err.code === "badge_invalid") return { kind: "invalid", message: BADGE_COPY.invalid };
    if (err.code === "room_full") return { kind: "full", message: err.message };
    if (err.code === "room_closed" || err.status === 410) return { kind: "closed", message: err.message };
    if (err.code === "network") return { kind: "other", message: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo." };
    return { kind: "other", message: err.message };
  }
  return { kind: "other", message: err instanceof Error ? err.message : "Error desconocido" };
}

/* ---------- Lectura del QR ---------- */

type JsQr = typeof import("jsqr").default;
let jsQrPromise: Promise<JsQr> | null = null;
function loadJsQr(): Promise<JsQr> {
  jsQrPromise ??= import("jsqr").then((m) => m.default);
  return jsQrPromise;
}

/** Decodifica un QR de un cuadro RGBA (con `jsqr`). Exportado para los tests (imagen QR generada). */
export async function decodeQrRgba(data: Uint8ClampedArray, width: number, height: number): Promise<string | null> {
  const jsQR = await loadJsQr();
  return jsQR(data, width, height, { inversionAttempts: "dontInvert" })?.data ?? null;
}

export type QrDetector = { kind: "native" | "jsqr"; detect: (video: HTMLVideoElement) => Promise<string | null> };

type NativeDetector = { detect(src: unknown): Promise<{ rawValue: string }[]> };
type NativeDetectorCtor = { new (opts: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> };

const MAX_SIDE = 720;

/** `BarcodeDetector` nativo si soporta QR; si no, `jsqr` sobre un canvas (recorte central). */
export async function createQrDetector(): Promise<QrDetector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const formats = (await Native.getSupportedFormats?.()) ?? ["qr_code"];
      if (formats.includes("qr_code")) {
        const d = new Native({ formats: ["qr_code"] });
        return { kind: "native", detect: async (v) => (await d.detect(v))[0]?.rawValue ?? null };
      }
    } catch {
      /* cae a jsqr */
    }
  }
  const jsQR = await loadJsQr();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return {
    kind: "jsqr",
    detect: async (v) => {
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!ctx || !w || !h) return null;
      const side = Math.min(w, h);
      const out = Math.min(side, MAX_SIDE);
      if (canvas.width !== out) {
        canvas.width = out;
        canvas.height = out;
      }
      ctx.drawImage(v, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
      const img = ctx.getImageData(0, 0, out, out);
      return jsQR(img.data, out, out, { inversionAttempts: "dontInvert" })?.data ?? null;
    },
  };
}

export type CameraFailure = "denied" | "no-camera" | "other";
export function classifyCameraError(e: unknown): CameraFailure {
  const name = e instanceof DOMException || (e && typeof e === "object" && "name" in e) ? String((e as { name: unknown }).name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") return "no-camera";
  return "other";
}
