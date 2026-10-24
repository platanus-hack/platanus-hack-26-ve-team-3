import { getRoll } from "@/lib/server/engine";
import { json, route } from "@/lib/server/errors";

/** GET /api/elections/:id/roll → { frozen, groupRoot, scope, merkleTreeDepth, commitments[] }. Público, sin nombres. */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  return json(await getRoll(id));
});
