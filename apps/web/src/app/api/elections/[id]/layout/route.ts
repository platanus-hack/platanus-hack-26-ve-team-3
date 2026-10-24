import { requireElection } from "@/lib/server/elections";
import { json, route } from "@/lib/server/errors";
import { layoutOf } from "@/lib/server/layout";

/** GET /api/elections/:id/layout → LiveLayout (guardado al publicar; default por `kind` si no hay) */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const election = await requireElection(id);
  return json(layoutOf(election), { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=60" } });
});
