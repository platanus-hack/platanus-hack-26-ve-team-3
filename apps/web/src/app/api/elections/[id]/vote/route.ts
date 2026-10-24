import { CastVoteInput } from "@quorum/contracts";
import { castVote } from "@/lib/server/engine";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

/**
 * POST /api/elections/:id/vote { proof: SemaphoreProof, onchain?: { txHash } } → Receipt (inclusionId = nullifier).
 * Sin identidad del votante en la petición. Nunca se registra el body (lleva la opción en `message`).
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "vote", 20);
  const input = await parseBody(req, CastVoteInput);
  return json(await castVote(id, input), { status: 201 });
});
