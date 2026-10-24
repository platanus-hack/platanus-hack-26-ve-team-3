import { requireElection } from "@/lib/server/elections";
import { json, route } from "@/lib/server/errors";
import { syncSchedule } from "@/lib/server/schedule";

/** GET /api/elections/:id → Election (campos públicos; no hay secretos en Election) */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  await syncSchedule(id);
  const election = await requireElection(id);
  return json({ ...election, serverNow: new Date().toISOString() });
});
