import { computeAggregates, requireElection } from "@/lib/server/elections";
import { json, route } from "@/lib/server/errors";
import { syncSchedule } from "@/lib/server/schedule";

/** GET /api/elections/:id/tally → Aggregates (solo agregados; `count: null` si < 5 votos) */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  await syncSchedule(id);
  const election = await requireElection(id);
  const aggregates = await computeAggregates(election);
  return json(aggregates, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=5" } });
});
