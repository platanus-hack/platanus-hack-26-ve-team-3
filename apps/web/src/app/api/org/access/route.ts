import { z } from "zod";
import { createCodeMatches, createCodeRequired } from "@/lib/server/createAccess";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

/** GET /api/org/access → `{ required }`: si crear votaciones pide código (D-25). */
export const GET = route(async () => json({ required: createCodeRequired() }));

/** POST /api/org/access `{ code }` → `{ ok: true }` o 403 `forbidden`. Limitado por IP. */
export const POST = route(async (req) => {
  rateLimit(req, "org:access", 10);
  const { code } = await parseBody(req, z.object({ code: z.string().min(1).max(200) }));
  if (!createCodeMatches(code)) return json({ error: "Código de acceso incorrecto", code: "forbidden" }, { status: 403 });
  return json({ ok: true });
});
