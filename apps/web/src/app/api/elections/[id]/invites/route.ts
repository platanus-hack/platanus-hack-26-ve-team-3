import { InviteRequest } from "@quorum/contracts";
import { json, parseBody, route } from "@/lib/server/errors";
import { sendInvites } from "@/lib/server/invites";
import { rateLimit } from "@/lib/server/ratelimit";

/**
 * POST /api/elections/:id/invites → { results: [{ voterId, status, link?, error? }], channel, note }
 * `channel` es el canal efectivo; `note` explica si se degradó a dry-run.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "invites:send", 10);
  const input = await parseBody(req, InviteRequest);
  return json(await sendInvites(id, input));
});
