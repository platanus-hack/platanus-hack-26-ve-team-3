import { IdentityInput } from "@quorum/contracts";
import { registerIdentity } from "@/lib/server/engine";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit, rateLimitBy, VOTER_IP_LIMIT, VOTER_STEP_LIMIT } from "@/lib/server/ratelimit";
import { syncScheduleForVoter } from "@/lib/server/schedule";

/** POST /api/voters/:id/identity { inviteToken, commitment } → { ok, registeredCount }. Solo el commitment Semaphore; nunca la clave. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "identity", VOTER_IP_LIMIT);
  const input = await parseBody(req, IdentityInput);
  rateLimitBy("identity", id, input.inviteToken, VOTER_STEP_LIMIT);
  await syncScheduleForVoter(id);
  return json(await registerIdentity(id, input), { status: 201 });
});
