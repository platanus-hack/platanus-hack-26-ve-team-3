import { FaceVerifyInput } from "@quorum/contracts";
import { json, parseBody, route } from "@/lib/server/errors";
import { verifyFace } from "@/lib/server/face";
import { rateLimit } from "@/lib/server/ratelimit";

/** POST /api/face/verify → FaceVerifyResult (similitud coseno vs FACE_THRESHOLD; emite voteNonce 2 min) */
export const POST = route(async (req) => {
  rateLimit(req, "face:verify", 30);
  const input = await parseBody(req, FaceVerifyInput);
  return json(await verifyFace(input));
});
