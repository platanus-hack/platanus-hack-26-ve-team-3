import { FaceEnrollInput } from "@quorum/contracts";
import { json, parseBody, route } from "@/lib/server/errors";
import { enrollFace } from "@/lib/server/face";
import { rateLimit, rateLimitBy, VOTER_IP_LIMIT, VOTER_STEP_LIMIT } from "@/lib/server/ratelimit";
import { syncScheduleForVoter } from "@/lib/server/schedule";

/**
 * POST /api/face/enroll → 201 { ok, faceBindingHash, voteNonce } | 202 { status: "pending_review" } (D-21).
 * Descriptor cifrado ligado a voterId; nunca imágenes. El 202 solo aplica a quien entró con credencial del evento.
 */
export const POST = route(async (req) => {
  rateLimit(req, "face:enroll", VOTER_IP_LIMIT);
  const input = await parseBody(req, FaceEnrollInput);
  rateLimitBy("face:enroll", input.voterId, VOTER_STEP_LIMIT);
  await syncScheduleForVoter(input.voterId);
  // D-21: crear revisiones manuales tiene su propio tope por IP (3 cada 10 min), además del tope por elección.
  const res = await enrollFace(input, { onNewReview: () => rateLimit(req, "face:review-new", 3, 10 * 60_000) });
  return json(res, { status: "status" in res ? 202 : 201 });
});
