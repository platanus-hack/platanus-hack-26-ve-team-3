import { JoinBadgeInput, JoinRoomResult } from "@quorum/contracts";
import { joinWithBadge } from "@/lib/server/badge";
import { HttpError, json, parseBody, route } from "@/lib/server/errors";
import { failureLimit, rateLimit, VOTER_IP_LIMIT } from "@/lib/server/ratelimit";

const BADGE_UNKNOWN_LIMIT = 30;

/** Igual que `join`: todo el evento comparte la IP del wifi; el control real es una credencial = un lugar. */
function badgeJoinLimitPerMinute(): number {
  const n = Number(process.env.BADGE_JOIN_RATE_PER_MIN ?? process.env.ROOM_JOIN_RATE_PER_MIN ?? VOTER_IP_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : VOTER_IP_LIMIT;
}

/**
 * POST /api/rooms/:roomCode/join-badge `{ badgeUrl }` (D-19) → 201 `{ electionId, voterId, displayName:"Participante",
 * inviteToken, inviteUrl }` (el `inviteToken` se devuelve UNA vez). Errores: 400 `badge_invalid` (no es una credencial
 * del evento) · 400 `invalid_input` (la votación no usa credenciales) · 404 `badge_unknown` · 404 sala inexistente ·
 * 409 `badge_used` · 409 `room_full` · 410 `room_closed` · 429 rate limit (× QUORUM_RATELIMIT_SCALE) · 503 si la
 * consulta en vivo no responde en 3 s.
 */
export const POST = route<{ roomCode: string }>(async (req, { roomCode }) => {
  rateLimit(req, "room:join-badge", badgeJoinLimitPerMinute());
  const guard = failureLimit(req, "room:join-badge-unknown", BADGE_UNKNOWN_LIMIT);
  try {
    const input = await parseBody(req, JoinBadgeInput);
    const res = json(JoinRoomResult.parse(await joinWithBadge(roomCode, input)), { status: 201 });
    guard.ok();
    return res;
  } catch (err) {
    if (!(err instanceof HttpError && err.code === "badge_unknown")) guard.ok();
    throw err;
  }
});
