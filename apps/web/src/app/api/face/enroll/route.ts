import { FaceEnrollInput } from "@quorum/contracts";
import { json, parseBody, route } from "@/lib/server/errors";
import { enrollFace } from "@/lib/server/face";
import { rateLimit } from "@/lib/server/ratelimit";
import { syncScheduleForVoter } from "@/lib/server/schedule";

/** POST /api/face/enroll → { ok, voteNonce }. Descriptor cifrado ligado a voterId; nunca imágenes. */
export const POST = route(async (req) => {
  rateLimit(req, "face:enroll", 20);
  const input = await parseBody(req, FaceEnrollInput);
  await syncScheduleForVoter(input.voterId);
  return json(await enrollFace(input), { status: 201 });
});
