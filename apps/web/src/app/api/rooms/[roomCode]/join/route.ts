import { JoinRoomInput, JoinRoomResult } from "@quorum/contracts";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit, VOTER_IP_LIMIT } from "@/lib/server/ratelimit";
import { joinRoom } from "@/lib/server/rooms";
import { syncScheduleForRoom } from "@/lib/server/schedule";

/** Muchas personas de la sala comparten la IP del wifi del evento: el tope por IP es generoso; el control real es `maxSeats`. */
function joinLimitPerMinute(): number {
  const n = Number(process.env.ROOM_JOIN_RATE_PER_MIN ?? VOTER_IP_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : VOTER_IP_LIMIT;
}

/**
 * POST /api/rooms/:roomCode/join `{ displayName }` (alias libre, sin PII) → 201 `{ electionId, voterId, displayName,
 * inviteToken, inviteUrl }`. El `inviteToken` se devuelve UNA sola vez. Errores: 400 alias inválido, 404 sala inexistente,
 * 409 `room_full`, 410 `room_closed` (cerrada, expirada o votación ya abierta), 429 rate limit por IP.
 */
export const POST = route<{ roomCode: string }>(async (req, { roomCode }) => {
  rateLimit(req, "room:join", joinLimitPerMinute());
  const input = await parseBody(req, JoinRoomInput);
  await syncScheduleForRoom(roomCode);
  return json(JoinRoomResult.parse(await joinRoom(roomCode, input)), { status: 201 });
});
