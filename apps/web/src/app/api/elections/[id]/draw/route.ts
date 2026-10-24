import { drawElection, getDraw } from "@/lib/server/engine";
import { requireOrganizer } from "@/lib/server/auth";
import { json, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

/** POST /api/elections/:id/draw → Election (`auditable` → `drawn`). seed = keccak256(finalHash); el verificador lo recomputa (`draw_matches`). */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "draw", 10);
  await requireOrganizer(req, id);
  return json(await drawElection(id));
});

/** GET /api/elections/:id/draw → { seed, n, winners, method, finalHash, candidates, tieBreak } */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  return json(await getDraw(id));
});
