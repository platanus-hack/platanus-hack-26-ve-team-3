import { CreateElectionInput } from "@quorum/contracts";
import { createElection } from "@/lib/server/elections";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

/** POST /api/elections → Election (draft) */
export const POST = route(async (req) => {
  rateLimit(req, "elections:create", 20);
  const input = await parseBody(req, CreateElectionInput);
  const election = await createElection(input);
  return json(election, { status: 201 });
});
