import { ReviewDecisionInput } from "@quorum/contracts";
import { requireOrganizer } from "@/lib/server/auth";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { decideReview } from "@/lib/server/reviews";
import { syncSchedule } from "@/lib/server/schedule";

/**
 * POST /api/elections/:id/reviews/:reviewId (Bearer) { decision: "approve" | "reject" } → ReviewSummary (D-21).
 * Solo en `registration`; 409 si ya se decidió o la votación ya abrió.
 */
export const POST = route<{ id: string; reviewId: string }>(async (req, { id, reviewId }) => {
  rateLimit(req, "reviews:decide", 30);
  await requireOrganizer(req, id);
  const input = await parseBody(req, ReviewDecisionInput);
  await syncSchedule(id);
  return json(await decideReview(id, reviewId, input));
});
