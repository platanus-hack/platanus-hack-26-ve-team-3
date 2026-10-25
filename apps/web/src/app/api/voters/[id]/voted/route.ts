import { z } from "zod";
import { markVoted } from "@/lib/server/engine";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit, rateLimitBy, VOTER_IP_LIMIT, VOTER_STEP_LIMIT } from "@/lib/server/ratelimit";
import { syncScheduleForVoter } from "@/lib/server/schedule";

const Input = z.object({ inviteToken: z.string().min(1) });

/**
 * POST /api/voters/:id/voted { inviteToken } → { ok, votedAt }. Autodeclaración para el estado "voted" del inscrito.
 * Va en una petición SEPARADA del voto para no ligar persona ↔ boleta; el servidor no puede comprobarla.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "voted", VOTER_IP_LIMIT);
  const { inviteToken } = await parseBody(req, Input);
  rateLimitBy("voted", id, inviteToken, VOTER_STEP_LIMIT);
  await syncScheduleForVoter(id);
  return json(await markVoted(id, inviteToken));
});
