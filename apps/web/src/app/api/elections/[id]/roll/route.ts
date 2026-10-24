import { getRoll } from "@/lib/server/engine";
import { json, route } from "@/lib/server/errors";
import { syncSchedule } from "@/lib/server/schedule";

/** GET /api/elections/:id/roll → { frozen, groupRoot, scope, merkleTreeDepth, commitments[] }. Público, sin nombres. */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  await syncSchedule(id);
  return json(await getRoll(id));
});
