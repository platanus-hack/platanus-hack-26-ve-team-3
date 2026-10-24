import { AddVotersInput, addVoters } from "@/lib/server/elections";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

/** POST /api/elections/:id/voters → { voters: [{ id, displayName, inviteToken, inviteUrl }] } */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "voters:add", 30);
  const input = await parseBody(req, AddVotersInput);
  return json(await addVoters(id, input), { status: 201 });
});
