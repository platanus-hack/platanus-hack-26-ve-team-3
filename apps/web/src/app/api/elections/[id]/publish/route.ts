import { publishElection } from "@/lib/server/elections";
import { json, route } from "@/lib/server/errors";

/** POST /api/elections/:id/publish → Election (open, manifestHash, layout) */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  return json(await publishElection(id));
});
