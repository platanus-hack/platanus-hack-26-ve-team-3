import { requireOrganizer } from "@/lib/server/auth";
import { json, route } from "@/lib/server/errors";
import { listReviews } from "@/lib/server/reviews";
import { syncSchedule } from "@/lib/server/schedule";

/**
 * GET /api/elections/:id/reviews (Bearer) → { reviews: [{ reviewId, createdAt, displayName, method, reason, status, decidedAt, decidedBy }], pending, approved, maxPending }
 * D-21: casos de coincidencia facial por revisar. Sin datos biométricos, sin con quién coincidió ni la similitud.
 */
export const GET = route<{ id: string }>(async (req, { id }) => {
  await requireOrganizer(req, id);
  await syncSchedule(id);
  return json(await listReviews(id));
});
