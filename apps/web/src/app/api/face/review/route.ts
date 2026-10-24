import { FaceReviewStatusInput } from "@quorum/contracts";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { reviewStatusForVoter } from "@/lib/server/reviews";
import { syncScheduleForVoter } from "@/lib/server/schedule";

/**
 * POST /api/face/review { voterId, inviteToken } → { status: "none" | "pending_review" | "approved" | "rejected", faceBindingHash? }
 * (D-21). Polling del votante mientras el organizador revisa su caso. POST para no poner el token en la URL.
 */
export const POST = route(async (req) => {
  rateLimit(req, "face:review", 60);
  const input = await parseBody(req, FaceReviewStatusInput);
  await syncScheduleForVoter(input.voterId);
  return json(await reviewStatusForVoter(input));
});
