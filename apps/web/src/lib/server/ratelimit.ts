/** Rate limit básico en memoria por clave (IP + ruta). Suficiente para la demo; no es distribuido. */
import { HttpError } from "./errors";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : req.headers.get("x-real-ip")) || "local";
}

export function rateLimit(req: Request, scope: string, limit = 30, windowMs = 60_000): void {
  if (process.env.QUORUM_RATELIMIT === "off") return;
  const key = `${scope}:${clientKey(req)}`;
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
