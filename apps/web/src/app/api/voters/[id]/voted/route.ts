import { z } from "zod";
import { markVoted } from "@/lib/server/engine";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Input = z.object({ inviteToken: z.string().min(1) });

/**
 * POST /api/voters/:id/voted { inviteToken } → { ok, votedAt }. Autodeclaración para el estado "voted" del inscrito.
 * Va en una petición SEPARADA del voto para no ligar persona ↔ boleta; el servidor no puede comprobarla.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "voted", 20);
  const { inviteToken } = await parseBody(req, Input);
  return json(await markVoted(id, inviteToken));
});
