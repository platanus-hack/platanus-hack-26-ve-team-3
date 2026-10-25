import { JoinBadgeInput, JoinRoomResult } from "@quorum/contracts";
import { joinWithBadge } from "@/lib/server/badge";
import { HttpError, json, parseBody, route } from "@/lib/server/errors";
import { failureLimit, rateLimit, VOTER_IP_LIMIT } from "@/lib/server/ratelimit";

const BADGE_FAIL_LIMIT = 10;
const BADGE_FAILURES = new Set<string>(["badge_invalid", "badge_unknown", "badge_used"]);

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
  const fail = failureLimit(req, "room:join-badge-fail", BADGE_FAIL_LIMIT);
  const input = await parseBody(req, JoinBadgeInput);
  try {
    return json(JoinRoomResult.parse(await joinWithBadge(roomCode, input)), { status: 201 });
  } catch (err) {
    if (err instanceof HttpError && BADGE_FAILURES.has(err.code)) fail();
    throw err;
  }
});
