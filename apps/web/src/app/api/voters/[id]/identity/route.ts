import { IdentityInput } from "@quorum/contracts";
import { registerIdentity } from "@/lib/server/engine";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { syncScheduleForVoter } from "@/lib/server/schedule";

/** POST /api/voters/:id/identity { inviteToken, commitment } → { ok, registeredCount }. Solo el commitment Semaphore; nunca la clave. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "identity", 20);
  const input = await parseBody(req, IdentityInput);
  await syncScheduleForVoter(id);
  return json(await registerIdentity(id, input), { status: 201 });
});
