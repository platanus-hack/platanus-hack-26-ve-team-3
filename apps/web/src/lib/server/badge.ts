/**
 * Credencial del evento (D-19). En Platanus Hack 26 cada participante lleva una credencial con un QR que codifica
 * `https://hack.platan.us/26-ve/id/<usuario-github>`; esa URL responde 200 si el participante existe y 404 si no.
 *
 * `POST /api/rooms/:code/join-badge { badgeUrl }`:
 *  1. Patrón EXACTO `^<badgeUrlPrefix>([A-Za-z0-9-]{1,39})$` → si no, 400 `badge_invalid`.
 *  2. Existencia según `badgeCheck`: `list` (HMAC en la lista que cargó el organizador), `live` (HEAD/GET a la URL con
 *     tiempo límite de 3 s y caché en memoria) o `none` → si no existe, 404 `badge_unknown`.
 *  3. Una credencial, una vez por votación → 409 `badge_used`.
 *  4. Crea el votante `source:"badge"`, displayName genérico "Participante", por la MISMA admisión de la sala (tope,
 *     expiración, lock). Desde ahí el flujo es el de siempre: rostro obligatorio (dedupe 1:N) → vinculación → listo.
 *
 * Privacidad: se guarda SOLO `HMAC-SHA256(clave, "badge|<electionId>|<usuario en minúsculas>")`, nunca el usuario en
 * claro, y sin voterId: el registro de uso no liga la credencial a ningún votante ni, menos, a una opción.
 *
 * Clave: `BADGE_KEY`; si falta, `HMAC(FACE_KEY, "quorum-badge-key-v1")` (FACE_KEY ya es obligatoria en producción);
 * en desarrollo sin ninguna, una clave derivada de DATA_DIR (insegura, igual que face.ts).
 */
import { DEFAULT_BADGE_URL_PREFIX, parseBadgeUrl, type Election, type EligibilityInput } from "@quorum/contracts";
import { hmacSha256Hex } from "./crypto";
import { requireElection } from "./elections";
import { env } from "./env";
import { HttpError } from "./errors";
import { joinRoom, roomPublicInfo } from "./rooms";
import { getStore } from "./store";

export const BADGE_MESSAGES = {
  invalid: "Ese QR no es una credencial de Platanus Hack.",
  unknown: "No encontramos esta credencial en el evento.",
  used: "Esta credencial ya se usó en esta votación.",
  unavailable: "No pudimos comprobar tu credencial en este momento. Intenta de nuevo en unos segundos.",
  wrongMethod: "Esta votación no usa credenciales del evento.",
} as const;

export const BADGE_DISPLAY_NAME = "Participante";
export const BADGE_LIVE_TIMEOUT_MS = 3000;

function badgeKey(): string {
  const own = env.badgeKey;
  if (own) return own;
  const face = env.faceKey;
  if (face) return hmacSha256Hex(face, "quorum-badge-key-v1");
  if (process.env.NODE_ENV === "production") throw new HttpError("unavailable", "BADGE_KEY/FACE_KEY no configurada");
  // Dev only — inseguro: clave derivada de un valor público.
  return `quorum-dev-badge-key:${env.dataDir}`;
}

/** HMAC del usuario para esta elección. GitHub no distingue mayúsculas: se normaliza a minúsculas. */
export function badgeHash(electionId: string, username: string): string {
  return hmacSha256Hex(badgeKey(), `badge|${electionId}|${username.toLowerCase()}`);
}

export function prefixOf(e: Pick<Election, "eligibility">): string {
  return e.eligibility?.badgeUrlPrefix ?? DEFAULT_BADGE_URL_PREFIX;
}

// ---------------------------------------------------------------------------
// Verificación en vivo (badgeCheck: "live") con caché en memoria
// ---------------------------------------------------------------------------
type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "status">>;
const hooks: { fetch?: FetchLike } = {};
/** Tests: sustituye `fetch` (sin red). */
export function setBadgeFetchForTests(fn: FetchLike | undefined) {
  hooks.fetch = fn;
}

/** Positivos 6 h (el participante no desaparece); negativos 2 min (por si lo registran tarde). */
const POSITIVE_TTL_MS = 6 * 3600_000;
const NEGATIVE_TTL_MS = 2 * 60_000;
const liveCache = new Map<string, { exists: boolean; until: number }>();
const inflight = new Map<string, Promise<boolean>>();
export function clearBadgeCacheForTests() {
  liveCache.clear();
  inflight.clear();
}

async function fetchStatus(url: string, method: "HEAD" | "GET"): Promise<number> {
  const f: FetchLike = hooks.fetch ?? ((u, i) => fetch(u, i));
  const res = await f(url, { method, redirect: "follow", signal: AbortSignal.timeout(BADGE_LIVE_TIMEOUT_MS), headers: { "user-agent": "Quorum-badge-check/1" }, cache: "no-store" });
  return res.status;
}

/** 200 → existe · 404/410 → no existe · cualquier otra cosa o tiempo agotado → 503 (se puede reintentar; nada se cachea). */
export async function checkBadgeLive(url: string): Promise<boolean> {
  const now = Date.now();
  const hit = liveCache.get(url);
  if (hit && hit.until > now) return hit.exists;
  const pending = inflight.get(url);
  if (pending) return pending;
  const p = (async () => {
    let status: number;
    try {
      status = await fetchStatus(url, "HEAD");
      // Algunos servidores no implementan HEAD: se repite con GET.
      if (status === 405 || status === 501) status = await fetchStatus(url, "GET");
    } catch {
      throw new HttpError("unavailable", BADGE_MESSAGES.unavailable, 503);
    }
    let exists: boolean;
    if (status >= 200 && status < 300) exists = true;
    else if (status === 404 || status === 410) exists = false;
    else throw new HttpError("unavailable", BADGE_MESSAGES.unavailable, 503);
    liveCache.set(url, { exists, until: Date.now() + (exists ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS) });
    if (liveCache.size > 20_000) for (const [k, v] of liveCache) if (v.until <= Date.now()) liveCache.delete(k);
    return exists;
  })();
  inflight.set(url, p);
  try {
    return await p;
  } finally {
    inflight.delete(url);
  }
}

// ---------------------------------------------------------------------------
// Configuración por elección (crear o PUT /eligibility)
// ---------------------------------------------------------------------------
/**
 * Normaliza y guarda la configuración: devuelve la forma pública para `Election.eligibility` y guarda la lista como HMAC.
 * `list` (correo/cédula) aún no existe: 400.
 */
export async function applyEligibility(electionId: string, input: EligibilityInput): Promise<NonNullable<Election["eligibility"]>> {
  if (input.method === "list") throw new HttpError("invalid_input", "El método «Lista» todavía no está disponible");
  if (input.method === "open-alias") return { method: "open-alias" };
  const badgeCheck = input.badgeCheck ?? "live";
  const badgeUrlPrefix = input.badgeUrlPrefix ?? DEFAULT_BADGE_URL_PREFIX;
  const store = await getStore();
  if (badgeCheck === "list") {
    const users = [...new Set((input.badgeAllowlist ?? []).map((u) => u.toLowerCase()))];
    if (users.length === 0 && !(await store.getBadgeAllowlist(electionId))) throw new HttpError("invalid_input", "Con «lista» hay que cargar al menos un usuario");
    if (users.length > 0) await store.putBadgeAllowlist(electionId, users.map((u) => badgeHash(electionId, u)));
  }
  const count = badgeCheck === "list" ? ((await store.getBadgeAllowlist(electionId))?.length ?? 0) : undefined;
  return { method: "event-badge", badgeCheck, badgeUrlPrefix, ...(count !== undefined ? { allowlistCount: count } : {}) };
}

/** PUT /api/elections/:id/eligibility — solo antes de que entre nadie por la sala (el método se fija antes). */
export async function updateEligibility(electionId: string, input: EligibilityInput): Promise<Election> {
  const store = await getStore();
  const e = await requireElection(electionId);
  if (e.status !== "draft" && e.status !== "registration") throw new HttpError("closed", "El padrón ya está congelado", 409);
  const joined = (await store.listVoters(electionId)).some((v) => v.source === "room" || v.source === "badge");
  if (joined) throw new HttpError("closed", "Ya entró gente por la sala: el método de elegibilidad no se puede cambiar", 409);
  const eligibility = await applyEligibility(electionId, input);
  const next: Election = { ...e, eligibility };
  await store.putElection(next);
  return next;
}

// ---------------------------------------------------------------------------
// Entrada con credencial
// ---------------------------------------------------------------------------
export async function joinWithBadge(rawCode: string, input: { badgeUrl: string }) {
  // Lectura previa (sin lock) para conocer el método; la admisión se repite dentro del lock de la sala.
  const info = await roomPublicInfo(rawCode);
  const e = await requireElection(info.electionId);
  if (e.eligibility?.method !== "event-badge") throw new HttpError("invalid_input", BADGE_MESSAGES.wrongMethod);
  const prefix = prefixOf(e);
  const username = parseBadgeUrl(input.badgeUrl, prefix);
  if (!username) throw new HttpError("badge_invalid", BADGE_MESSAGES.invalid);
  const hash = badgeHash(e.id, username);
  const check = e.eligibility.badgeCheck ?? "live";
  const store = await getStore();
  // Respuesta rápida si ya se usó (sin gastar la consulta en vivo); la comprobación autoritativa va dentro del lock.
  if (await store.getBadgeUse(e.id, hash)) throw new HttpError("badge_used", BADGE_MESSAGES.used);
  if (check === "live" && !(await checkBadgeLive(`${prefix}${username}`))) throw new HttpError("badge_unknown", BADGE_MESSAGES.unknown);
  return joinRoom(
    rawCode,
    { displayName: BADGE_DISPLAY_NAME },
    {
      source: "badge",
      admit: async (locked) => {
        if (locked.eligibility?.method !== "event-badge") throw new HttpError("invalid_input", BADGE_MESSAGES.wrongMethod);
        if (check === "list") {
          const allow = await store.getBadgeAllowlist(locked.id);
          if (!allow?.includes(hash)) throw new HttpError("badge_unknown", BADGE_MESSAGES.unknown);
        }
        if (await store.getBadgeUse(locked.id, hash)) throw new HttpError("badge_used", BADGE_MESSAGES.used);
        await store.putBadgeUse({ electionId: locked.id, badgeHash: hash, usedAt: new Date().toISOString() });
      },
    },
  );
}
