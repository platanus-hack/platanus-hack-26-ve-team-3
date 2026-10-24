import { publishElection } from "@/lib/server/elections";
import { requireOrganizer } from "@/lib/server/auth";
import { json, route } from "@/lib/server/errors";

/** POST /api/elections/:id/publish → Election (open, manifestHash, layout) */
export const POST = route<{ id: string }>(async (req, { id }) => {
  await requireOrganizer(req, id);
  return json(await publishElection(id));
});
