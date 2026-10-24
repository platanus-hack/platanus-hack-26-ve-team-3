import { json, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const ALLOWED = /^[a-z0-9:-]{1,40}$/;

/**
 * POST /api/client-log — diagnóstico de la cámara en teléfonos reales (etapa + tiempos + navegador). Solo va a los logs
 * del servidor; no se guarda. Se descarta cualquier campo que no sea un escalar corto: nunca imágenes, descriptores,
 * nombres ni tokens.
 */
export const POST = route(async (req) => {
  rateLimit(req, "client-log", 60);
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false });
  }
  const stage = typeof body.stage === "string" && ALLOWED.test(body.stage) ? body.stage : "unknown";
  const safe: Record<string, string | number | boolean> = {};
  for (const k of ["ms", "faces", "backend", "kind", "error", "ua", "source", "downloadMs", "initMs", "warmupMs", "simd", "wireKB", "step", "total", "wanted", "got", "loadedKB"]) {
    const v = body[k];
    if (typeof v === "number" || typeof v === "boolean") safe[k] = v;
    else if (typeof v === "string") safe[k] = v.slice(0, 200);
  }
  console.log(`[client-log] ${stage} ${JSON.stringify(safe)}`);
  return json({ ok: true });
});
