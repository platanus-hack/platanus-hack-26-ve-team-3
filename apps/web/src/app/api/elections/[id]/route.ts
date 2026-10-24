import { requireElection } from "@/lib/server/elections";
import { json, route } from "@/lib/server/errors";

/** GET /api/elections/:id → Election (campos públicos; no hay secretos en Election) */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const election = await requireElection(id);
  return json(election);
});
