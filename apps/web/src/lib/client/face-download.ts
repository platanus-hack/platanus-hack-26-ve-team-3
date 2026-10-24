/**
 * Descarga de lo que necesita la prueba de vida (modelos de Human + WASM de TF.js), con progreso real, y selección del
 * backend. Sin dependencias de @vladmandic/human: lo importan también /j y /v (precarga) sin arrastrar Human al SSR.
 */
import { FACE_MODEL_FILES } from "./face-models";

/* ---------- Backend de TF.js: wasm (por defecto) | humangl | webgl ---------- */

export type FaceBackend = "wasm" | "humangl" | "webgl";
const BACKENDS: readonly FaceBackend[] = ["wasm", "humangl", "webgl"];
const FB_KEY = "quorum.fb";

/**
 * Criterio por defecto: `wasm` en TODAS las plataformas (iPhone incluido).
 *  - WebGL (`humangl`/`webgl`) compila shaders la primera vez: en un iPhone real la primera detección tardó 26 s.
 *    WASM no compila nada en la GPU: arranca en décimas de segundo (medido: calentamiento 0,08–0,2 s en WebKit y
 *    Chromium; 0,45 s con la CPU 6× más lenta) y detecta en 25–65 ms por cuadro con los modelos actuales.
 *  - Con modelos pequeños (detector + antispoof + liveness + insightface 112×112) la GPU no compensa.
 * `?fb=wasm|humangl|webgl` en /j o /v lo cambia para el A/B (se recuerda en la pestaña); `?fb=auto` vuelve al defecto.
 * Si WASM no existe o falla al iniciar, cae a `humangl`.
 */
export function resolveBackend(search = typeof location !== "undefined" ? location.search : ""): { backend: FaceBackend; source: "query" | "session" | "default" } {
  let fromQuery: string | null = null;
  try {
    fromQuery = new URLSearchParams(search).get("fb");
  } catch {
    /* sin query */
  }
  try {
    if (fromQuery === "auto") sessionStorage.removeItem(FB_KEY);
    else if (fromQuery && (BACKENDS as readonly string[]).includes(fromQuery)) {
      sessionStorage.setItem(FB_KEY, fromQuery);
      return { backend: fromQuery as FaceBackend, source: "query" };
    }
    const saved = sessionStorage.getItem(FB_KEY);
    if (saved && (BACKENDS as readonly string[]).includes(saved)) return { backend: saved as FaceBackend, source: "session" };
  } catch {
    if (fromQuery && (BACKENDS as readonly string[]).includes(fromQuery)) return { backend: fromQuery as FaceBackend, source: "query" };
  }
  return { backend: typeof WebAssembly === "object" ? "wasm" : "humangl", source: "default" };
}

/** ¿El navegador ejecuta WASM SIMD? (mismo módulo mínimo que usa wasm-feature-detect). Decide qué binario se descarga. */
export function wasmSimdSupported(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

/* ---------- Descarga con progreso real (una sola vez por teléfono) ---------- */

export type DownloadProgress = { loaded: number; total: number; done: boolean };
/** Cache Storage de lo pesado: el mismo nombre que `CACHE` en public/sw.js (súbelo en ambos si cambia /models o /tfjs). */
export const HEAVY_CACHE = "quorum-heavy-v2";
type FaceFile = (typeof FACE_MODEL_FILES)[number];

/** Lo que baja el teléfono para el backend elegido: modelos + (si es wasm) el binario WASM que corresponda. */
export function faceFilesFor(backend: FaceBackend, simd = wasmSimdSupported()): FaceFile[] {
  return FACE_MODEL_FILES.filter((f) => f.kind === "model" || (backend === "wasm" && f.kind === (simd ? "wasm-simd" : "wasm")));
}

/** «1,2» (MB con coma decimal, es-VE). */
export function formatMB(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1).replace(".", ",");
}

const buffers = new Map<string, ArrayBuffer>();
const received = new Map<string, number>();
const listeners = new Set<(p: DownloadProgress) => void>();
let downloading: Promise<void> | null = null;
let lastProgress: DownloadProgress | null = null;

/** Bytes por la red de la última descarga (diagnóstico). */
export const lastDownloadTotal = (): number => lastProgress?.total ?? 0;
/** Libera la memoria de lo descargado (Human ya lo cargó; lo demás sale de la caché). */
export function releaseDownloadedFiles(): void {
  buffers.clear();
}

/** Suscribirse al progreso de la descarga (bytes por la red, estimados desde los descomprimidos). */
export function onDownloadProgress(cb: (p: DownloadProgress) => void): () => void {
  listeners.add(cb);
  if (lastProgress) cb(lastProgress);
  return () => listeners.delete(cb);
}

function emit(files: FaceFile[], done = false) {
  let loaded = 0;
  let total = 0;
  for (const f of files) {
    total += f.wire;
    loaded += buffers.has(f.path) ? f.wire : Math.min(1, (received.get(f.path) ?? 0) / f.bytes) * f.wire;
  }
  lastProgress = { loaded: Math.round(loaded), total, done };
  for (const l of listeners) l(lastProgress);
}

/** Sin bytes nuevos durante este tiempo ⇒ se corta y se ofrece reintentar (nunca se corta mientras lleguen bytes). */
export const STALL_MS = 30_000;

/**
 * Descarga (una sola vez, compartida entre la precarga de /j y /v y la cámara) todos los archivos de la prueba de vida
 * leyendo el cuerpo por partes para informar el progreso. Lo ya descargado se conserva si hay que reintentar.
 */
export function downloadFaceModels(backend: FaceBackend = resolveBackend().backend): Promise<void> {
  if (downloading) return downloading;
  const files = faceFilesFor(backend);
  const ctrl = new AbortController();
  let lastByteAt = Date.now();
  let stalled = false;
  const watchdog = setInterval(() => {
    if (Date.now() - lastByteAt > STALL_MS) {
      stalled = true;
      ctrl.abort();
    }
  }, 2_000);
  const one = async (f: FaceFile) => {
    if (buffers.has(f.path)) return;
    const res = await fetch(f.path, { cache: "default", signal: ctrl.signal });
    if (!res.ok) throw new Error(`${f.path}: HTTP ${res.status}`);
    let buf: ArrayBuffer;
    if (res.body) {
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        n += value.byteLength;
        lastByteAt = Date.now();
        received.set(f.path, n);
        emit(files);
      }
      const all = new Uint8Array(n);
      let o = 0;
      for (const p of parts) {
        all.set(p, o);
        o += p.byteLength;
      }
      buf = all.buffer;
    } else {
      buf = await res.arrayBuffer();
    }
    buffers.set(f.path, buf);
    lastByteAt = Date.now();
    emit(files);
  };
  emit(files);
  downloading = Promise.all(files.map(one))
    .then(async () => {
      emit(files, true);
      // Primera visita: la página aún no pasa por el service worker; se guarda a mano para las siguientes.
      if (typeof caches !== "undefined" && typeof window !== "undefined" && window.isSecureContext) {
        await caches
          .open(HEAVY_CACHE)
          .then(storeDownloadedFiles)
          .catch(() => undefined);
      }
    })
    .catch((e: unknown) => {
      downloading = null; // permite reintentar (lo ya descargado se conserva)
      if (stalled) throw new Error("La descarga del reconocimiento facial se detuvo. Revisa tu conexión e intenta de nuevo.");
      throw e;
    })
    .finally(() => clearInterval(watchdog));
  return downloading;
}

const contentType = (p: string) => (p.endsWith(".wasm") ? "application/wasm" : p.endsWith(".json") ? "application/json" : "application/octet-stream");

/** Mientras corre `fn`, los fetch de Human/TF.js a archivos ya descargados se sirven desde memoria (sin volver a la red). */
export async function withDownloadedFiles<T>(fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, location.href);
      const buf = url.origin === location.origin ? buffers.get(url.pathname) : undefined;
      if (buf) return Promise.resolve(new Response(buf.slice(0), { status: 200, headers: { "content-type": contentType(url.pathname) } }));
    } catch {
      /* cae al fetch normal */
    }
    return orig(input, init);
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

/**
 * Guarda en Cache Storage (el del service worker) lo descargado que aún no esté: la primera visita la página todavía no
 * está controlada por el service worker, así que sus fetch no pasan por él.
 */
async function storeDownloadedFiles(cache: Cache): Promise<void> {
  for (const [p, buf] of buffers) {
    if (await cache.match(p)) continue;
    await cache.put(p, new Response(buf.slice(0), { status: 200, headers: { "content-type": contentType(p) } }));
  }
}

