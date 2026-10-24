import { json, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { roomPublicInfo } from "@/lib/server/rooms";

/** GET /api/rooms/:roomCode — público: `{ electionId, title, open, seatsTaken, maxSeats, expiresAt, closedReason }`. 404 si no existe. */
export const GET = route<{ roomCode: string }>(async (req, { roomCode }) => {
  rateLimit(req, "room:info", 120);
  return json(await roomPublicInfo(roomCode));
});
