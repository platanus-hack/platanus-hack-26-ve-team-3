import { createHash } from "node:crypto";
import { verifyUploaded } from "@/lib/server/engine";
import { HttpError, json, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/audit/verify { package } → AuditResult del verificador independiente (`@quorum/verifier`).
 * Devuelve el resultado íntegro (checks con causa + unsupportedGuarantees); un paquete mal formado
 * da `valid:false` con `package_schema`, nunca un éxito por defecto.
 */
export const POST = route(async (req) => {
  rateLimit(req, "audit:verify", 30);
  const raw = await req.text();
  if (raw.length > MAX_BYTES) throw new HttpError("invalid_input", "Paquete demasiado grande");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError("invalid_input", "Body JSON inválido");
  }
  if (!body || typeof body !== "object" || !("package" in body)) throw new HttpError("invalid_input", "Falta `package`");
  const digest = createHash("sha256").update(raw).digest("hex");
  return json(await verifyUploaded((body as { package: unknown }).package, digest));
});
