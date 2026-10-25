import { LinkWalletInput } from "@quorum/contracts";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit, rateLimitBy, VOTER_IP_LIMIT, VOTER_STEP_LIMIT } from "@/lib/server/ratelimit";
import { linkWallet } from "@/lib/server/wallet";
import { syncScheduleForVoter } from "@/lib/server/schedule";

/**
 * POST /api/voters/:id/wallet { inviteToken, walletAddress, kind, bindingSignature } → Voter (sin teléfono).
 * Verifica la firma EIP-712 `FaceBinding` (ecrecover o ERC-1271/6492) y marca al votante `registered`.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "wallet:link", VOTER_IP_LIMIT);
  const input = await parseBody(req, LinkWalletInput);
  rateLimitBy("wallet:link", id, input.inviteToken, VOTER_STEP_LIMIT);
  await syncScheduleForVoter(id);
  return json(await linkWallet(id, input));
});
