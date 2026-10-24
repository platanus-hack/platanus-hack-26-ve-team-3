import { closeElection } from "@/lib/server/elections";
import { json, route } from "@/lib/server/errors";

/** POST /api/elections/:id/close → Election (closed → tallying → auditable; tally stub hasta ADR-001) */
export const POST = route<{ id: string }>(async (_req, { id }) => {
  return json(await closeElection(id));
});
