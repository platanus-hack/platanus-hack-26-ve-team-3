import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { VoteInput, castVote } from "@/lib/server/vote";

/**
 * POST /api/elections/:id/vote → Receipt
 * Body: SignedVote (+ `plainChoice` opcional en modo integrity-demo). Nunca se registra el body.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "vote", 20);
  const input = await parseBody(req, VoteInput);
  return json(await castVote(id, input), { status: 201 });
});
