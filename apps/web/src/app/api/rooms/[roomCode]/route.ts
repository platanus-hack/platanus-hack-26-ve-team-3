import { json, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { roomPublicInfo } from "@/lib/server/rooms";
import { syncScheduleForRoom } from "@/lib/server/schedule";

/** GET /api/rooms/:roomCode — público: `{ electionId, title, open, seatsTaken, maxSeats, expiresAt, closedReason, eligibility?, options }` (`options`: vista previa de la boleta). 404 si no existe. */
export const GET = route<{ roomCode: string }>(async (req, { roomCode }) => {
  rateLimit(req, "room:info", 120);
  await syncScheduleForRoom(roomCode);
  return json(await roomPublicInfo(roomCode));
});
