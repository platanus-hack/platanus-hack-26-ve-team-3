import { CreateElectionInput } from "@quorum/contracts";
import { issueOrganizerToken } from "@/lib/server/auth";
import { requireCreateCode } from "@/lib/server/createAccess";
import { createElection } from "@/lib/server/elections";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

/** POST /api/elections → Election (draft) + `organizerToken` (se devuelve UNA sola vez; se guarda solo su hash). */
export const POST = route(async (req) => {
  rateLimit(req, "elections:create", 20);
  requireCreateCode(req); // D-25
  const input = await parseBody(req, CreateElectionInput);
  const election = await createElection(input);
  const organizerToken = await issueOrganizerToken(election.id);
  return json({ ...election, organizerToken }, { status: 201 });
});
