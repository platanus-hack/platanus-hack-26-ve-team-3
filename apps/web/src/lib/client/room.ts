/**
 * Sala abierta (docs/API_CONTRACT.md § "Sala abierta") desde el cliente. Esquemas de `@quorum/contracts`; ninguna
 * forma inventada. El organizador usa `Authorization: Bearer` (sessionStorage, ver orgStore).
 */
import { JoinRoomResult, OpenRoomResult, RoomAlias, RoomPublicInfo, RoomStatus, type OpenRoomInput } from "@quorum/contracts";
import { ApiClientError, request } from "./api";
import { orgAuthHeaders } from "./orgStore";

const e = encodeURIComponent;

export const roomApi = {
  /** Público; con el token del organizador (si está en esta pestaña) añade `roomCode` y `joinUrl`. */
  status: (electionId: string) => request(`/api/elections/${e(electionId)}/room`, { headers: orgAuthHeaders(electionId) }, RoomStatus),
  open: (electionId: string, input: OpenRoomInput) =>
    request(`/api/elections/${e(electionId)}/room`, { method: "POST", body: JSON.stringify(input), headers: orgAuthHeaders(electionId) }, OpenRoomResult),
  close: (electionId: string) => request(`/api/elections/${e(electionId)}/room`, { method: "DELETE", headers: orgAuthHeaders(electionId) }, RoomStatus),
  info: (roomCode: string) => request(`/api/rooms/${e(roomCode)}`, undefined, RoomPublicInfo),
  join: (roomCode: string, displayName: string) => request(`/api/rooms/${e(roomCode)}/join`, { method: "POST", body: JSON.stringify({ displayName }) }, JoinRoomResult),
};

/** Misma validación que el backend (`RoomAlias` de @quorum/contracts): devuelve el alias normalizado o el primer error. */
export function validateAlias(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const r = RoomAlias.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues[0]?.message ?? "Alias inválido" };
}

export type JoinFailure = { kind: "full" | "closed" | "rate" | "alias" | "not-found" | "other"; message: string };

/** Traduce los errores del join (409 room_full · 410 room_closed · 429 · 400 · 404) a estados de la página. */
export function classifyJoinError(err: unknown): JoinFailure {
  if (err instanceof ApiClientError) {
    if (err.status === 429) return { kind: "rate", message: "Muchas personas están entrando a la vez desde esta red. Espera un minuto y vuelve a intentarlo." };
    if (err.code === "room_full" || err.status === 409) return { kind: "full", message: err.message };
    if (err.code === "room_closed" || err.status === 410) return { kind: "closed", message: err.message };
    if (err.code === "not_found" || err.status === 404) return { kind: "not-found", message: "No existe una sala con ese código." };
    if (err.code === "invalid_input" || err.status === 400) return { kind: "alias", message: err.message };
    if (err.code === "network") return { kind: "other", message: "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo." };
    return { kind: "other", message: err.message };
  }
  return { kind: "other", message: err instanceof Error ? err.message : "Error desconocido" };
}

/** Estado efectivo de la sala para quien llega por el QR. `full` también si está abierta pero sin lugares. */
export type RoomGate = "open" | "full" | "manual" | "expired" | "election-opened";
export function roomGate(info: { open: boolean; seatsTaken: number; maxSeats: number | null; closedReason: RoomStatus["closedReason"]; expiresAt: string | null }, nowMs = Date.now()): RoomGate {
  if (info.closedReason) return info.closedReason;
  if (!info.open) return "manual";
  if (info.expiresAt && Date.parse(info.expiresAt) <= nowMs) return "expired";
  if (info.maxSeats !== null && info.seatsTaken >= info.maxSeats) return "full";
  return "open";
}

export const gateCopy: Record<Exclude<RoomGate, "open">, { title: string; body: string }> = {
  full: { title: "La sala está llena", body: "Ya se ocuparon todos los lugares que abrió el organizador. Puedes seguir la votación como observador." },
  manual: { title: "La sala está cerrada", body: "El organizador cerró la entrada. Puedes seguir la votación como observador." },
  expired: { title: "La sala expiró", body: "Se acabó el tiempo de entrada que fijó el organizador. Puedes seguir la votación como observador." },
  "election-opened": { title: "La votación ya comenzó", body: "Con la votación abierta el padrón está congelado: ya no se puede entrar. Puedes seguirla como observador." },
};

/* ---------- Memoria del teléfono: si recarga o vuelve a escanear, retoma su flujo ---------- */

export type StoredRoomJoin = { roomCode: string; electionId: string; voterId: string; displayName: string; inviteToken: string; invitePath: string; joinedAt: string; consentAt: string };
const joinKey = (roomCode: string) => `quorum.room.${roomCode.toUpperCase()}`;

export function saveRoomJoin(j: StoredRoomJoin) {
  try {
    localStorage.setItem(joinKey(j.roomCode), JSON.stringify(j));
  } catch {
    /* sin localStorage: el enlace /v/<token> sigue funcionando en esta pestaña */
  }
}

export function loadRoomJoin(roomCode: string): StoredRoomJoin | null {
  try {
    const raw = localStorage.getItem(joinKey(roomCode));
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<StoredRoomJoin>;
    return j && typeof j.inviteToken === "string" && typeof j.invitePath === "string" && j.invitePath.startsWith("/v/") ? (j as StoredRoomJoin) : null;
  } catch {
    return null;
  }
}

/** ¿Esta invitación salió de una sala donde la persona ya aceptó el consentimiento? (para no pedírselo dos veces) */
export function roomJoinForToken(inviteToken: string): StoredRoomJoin | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith("quorum.room.")) continue;
      const j = loadRoomJoin(k.slice("quorum.room.".length));
      if (j && j.inviteToken === inviteToken) return j;
    }
  } catch {
    /* ignorar */
  }
  return null;
}

export function forgetRoomJoin(roomCode: string) {
  try {
    localStorage.removeItem(joinKey(roomCode));
  } catch {
    /* ignorar */
  }
}

/** Ruta local del `inviteUrl` (`APP_URL/v/<token>`): se navega en el MISMO origen aunque `APP_URL` difiera (IP de la red local). */
export function invitePathFrom(inviteUrl: string, inviteToken: string): string {
  try {
    const p = new URL(inviteUrl, "http://local").pathname;
    if (/^\/v\/[^/]+$/.test(p)) return p;
  } catch {
    /* cae al token */
  }
  return `/v/${encodeURIComponent(inviteToken)}`;
}

/* ---------- Precarga de lo pesado (modelos de Human y artefactos ZK) ---------- */

/** Lo que el teléfono descargará sí o sí en la inscripción y el voto (config de `human.ts` + `browserArtifacts`). */
export const HEAVY_ASSETS = [
  "/models/blazeface.json",
  "/models/blazeface.bin",
  "/models/facemesh.json",
  "/models/facemesh.bin",
  "/models/iris.json",
  "/models/iris.bin",
  "/models/faceres.json",
  "/models/faceres.bin",
  "/models/antispoof.json",
  "/models/antispoof.bin",
  "/models/liveness.json",
  "/models/liveness.bin",
  "/zk/semaphore-10.wasm",
  "/zk/semaphore-10.zkey",
] as const;

export const HEAVY_CACHE = "quorum-heavy-v1"; // igual que public/sw.js

/**
 * Precarga lo pesado mientras la persona escribe su alias, sin bloquear nada:
 *  1. Con service worker disponible (HTTPS o localhost): registra `/sw.js` y llena Cache Storage UNO A UNO con lo que
 *     falte; desde ahí Human y snarkjs lo leen del caché (cache-first en el SW), aunque el teléfono tenga poca caché HTTP.
 *  2. Sin service worker (p. ej. http://IP-de-la-red): `<link rel="prefetch">` → caché HTTP del navegador
 *     (servidos con `Cache-Control: public, max-age=31536000, immutable`, ver next.config.ts).
 * Respeta "ahorro de datos". Devuelve el modo usado (para tests y depuración).
 */
export async function prefetchHeavyAssets(doc: Document = document): Promise<"saveData" | "service-worker" | "link-prefetch"> {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return "saveData";
  if ("serviceWorker" in navigator && typeof caches !== "undefined" && window.isSecureContext) {
    try {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const cache = await caches.open(HEAVY_CACHE);
      for (const href of HEAVY_ASSETS) {
        if (await cache.match(href)) continue;
        const res = await fetch(href, { cache: "default" });
        if (res.ok) await cache.put(href, res);
      }
      return "service-worker";
    } catch {
      /* cae a link prefetch */
    }
  }
  for (const href of HEAVY_ASSETS) {
    if (doc.head.querySelector(`link[rel="prefetch"][href="${href}"]`)) continue;
    const l = doc.createElement("link");
    l.rel = "prefetch";
    l.href = href;
    l.setAttribute("data-quorum-prefetch", "");
    doc.head.appendChild(l);
  }
  return "link-prefetch";
}

/** Enlace a la transacción del ancla en Basescan (Base Sepolia 84532 / Base 8453). */
export function basescanTxUrl(chainId: number, txHash: string): string | null {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return null;
  if (chainId === 84532) return `https://sepolia.basescan.org/tx/${txHash}`;
  if (chainId === 8453) return `https://basescan.org/tx/${txHash}`;
  return null;
}
