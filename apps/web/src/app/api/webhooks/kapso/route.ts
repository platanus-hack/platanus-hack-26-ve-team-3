/**
 * POST /api/webhooks/kapso — recibe eventos de Kapso (plan B4 opt-in). Lógica en `lib/server/kapso.ts`.
 * Valida `X-Webhook-Signature`, dedupe por `X-Idempotency-Key`, soporta batch y responde 200 rápido.
 */
import { env } from "@/lib/server/env";
import { json, route } from "@/lib/server/errors";
import { extractIncoming, handleOptIn, seenIdempotencyKey, unwrapBatch, verifyKapsoSignature } from "@/lib/server/kapso";

export const POST = route(async (req) => {
  const secret = env.kapsoWebhookSecret;
  if (!secret) return json({ error: "KAPSO_WEBHOOK_SECRET no configurado", code: "unavailable" }, { status: 503 });

  const raw = await req.text();
  if (!verifyKapsoSignature(secret, raw, req.headers.get("x-webhook-signature"))) {
    return json({ error: "Firma inválida", code: "forbidden" }, { status: 401 });
  }
  if (seenIdempotencyKey(req.headers.get("x-idempotency-key"))) return json({ ok: true, duplicate: true });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "JSON inválido", code: "invalid_input" }, { status: 400 });
  }

  const summary = { received: 0, sent: 0, ignored: 0, failed: 0 };
  for (const ev of unwrapBatch(body)) {
    for (const msg of extractIncoming(ev)) {
      summary.received += 1;
      try {
        summary[await handleOptIn(msg)] += 1;
      } catch (err) {
        summary.failed += 1;
        console.warn("[webhook:kapso] error procesando mensaje:", err instanceof Error ? err.message : String(err));
      }
    }
  }
  return json({ ok: true, ...summary });
});
