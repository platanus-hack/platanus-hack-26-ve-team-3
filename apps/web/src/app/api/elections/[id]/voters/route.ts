import { isOrganizer, requireOrganizer } from "@/lib/server/auth";
import { AddVotersInput, addVoters, listVoterSummaries, voterCounts } from "@/lib/server/elections";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

/** POST /api/elections/:id/voters (organizador) → { voters: [{ id, displayName, inviteToken, inviteUrl }] } */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "voters:add", 30);
  await requireOrganizer(req, id);
  const input = await parseBody(req, AddVotersInput);
  return json(await addVoters(id, input), { status: 201 });
});

/**
 * GET /api/elections/:id/voters
 *  - organizador (Bearer): `{ voters: [{ id, displayName, state, walletAddress, hasIdentity }], counts }` (sin teléfono ni commitment);
 *  - público: solo `{ counts: { invited, registered, withIdentity, voted, total } }`. Nunca una lista nominal (regla dura 3).
 */
export const GET = route<{ id: string }>(async (req, { id }) => {
  if (await isOrganizer(req, id)) return json(await listVoterSummaries(id));
  return json({ counts: await voterCounts(id) }, { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=5" } });
});
