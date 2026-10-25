/** Rate limit básico en memoria por clave (IP + ruta). Suficiente para la demo; no es distribuido. */
import { HttpError } from "./errors";

const buckets = new Map<string, { count: number; resetAt: number }>();

/**
 * IP del cliente para el rate limit. Render pasa el tráfico por Cloudflare, que fija `cf-connecting-ip` (el cliente no
 * puede falsificarla). Sin ella se usa la ÚLTIMA entrada de `x-forwarded-for` (la agrega nuestro proxy); la primera la
 * controla el cliente y permitía saltarse el límite (docs/LOAD_TEST.md, hallazgo 2).
 */
export function clientKey(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for");
  const last = fwd?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return last || req.headers.get("x-real-ip") || "local";
}

/**
 * Multiplicador de todos los topes por IP (`QUORUM_RATELIMIT_SCALE`, default 1). En una sala abierta los ~60 teléfonos
 * suelen salir por la misma IP del wifi del evento: con los topes base (20/min en enroll/wallet/identity/vote) la mitad
 * recibiría 429 (docs/LOAD_TEST.md). Subirlo para el evento no quita controles: el tope real es `maxSeats`, el voto
 * doble lo bloquea el nullifier y cada paso exige `inviteToken`.
 */
export const VOTER_IP_LIMIT = 200;
export const VOTE_IP_LIMIT = 600;
export const VOTER_STEP_LIMIT = 10;

export function rateLimitScale(): number {
  const n = Number(process.env.QUORUM_RATELIMIT_SCALE ?? "1");
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function rateLimit(req: Request, scope: string, baseLimit = 30, windowMs = 60_000): void {
  hit(`${scope}:${clientKey(req)}`, Math.floor(baseLimit * rateLimitScale()), windowMs);
}

/**
 * Tope por credencial (voterId) en vez de por IP: en una sala todos salen por el wifi del evento, así que el tope por IP
 * juntaría a todos como una sola persona. Cada paso del votante exige su `inviteToken`; la IP queda como freno alto.
 */
export function rateLimitBy(scope: string, id: string, limit: number, windowMs = 60_000): void {
  hit(`${scope}:id:${id}`, limit, windowMs);
}

function hit(key: string, limit: number, windowMs: number): void {
  if (process.env.QUORUM_RATELIMIT === "off") return;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  b.count += 1;
  if (b.count > limit) throw new HttpError("forbidden", "Demasiadas solicitudes; intenta en un minuto", 429);
}
