import { LinkWalletInput } from "@quorum/contracts";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { linkWallet } from "@/lib/server/wallet";

/**
 * POST /api/voters/:id/wallet { inviteToken, walletAddress, kind, bindingSignature } → Voter (sin teléfono).
 * Verifica la firma EIP-712 `FaceBinding` (ecrecover o ERC-1271/6492) y marca al votante `registered`.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "wallet:link", 20);
  const input = await parseBody(req, LinkWalletInput);
  return json(await linkWallet(id, input));
});
