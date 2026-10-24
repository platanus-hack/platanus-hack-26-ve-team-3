import { Voter } from "@quorum/contracts";
import { z } from "zod";
import { isAddressEqual, type Address } from "viem";
import { publicVoter, requireVoter } from "@/lib/server/elections";
import { HttpError, json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";
import { getStore } from "@/lib/server/store";

const LinkWalletInput = z.object({
  inviteToken: z.string().min(1),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Dirección inválida"),
});

/** POST /api/voters/:id/wallet → Voter (sin teléfono). Enlaza la wallet una sola vez. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  rateLimit(req, "wallet:link", 20);
  const input = await parseBody(req, LinkWalletInput);
  const store = await getStore();
  const voter = await requireVoter(id);
  if (voter.inviteToken !== input.inviteToken) throw new HttpError("forbidden", "inviteToken inválido");
  if (voter.walletAddress) {
    if (isAddressEqual(voter.walletAddress as Address, input.walletAddress as Address)) return json(publicVoter(voter));
    throw new HttpError("forbidden", "Este votante ya enlazó otra wallet");
  }
  const taken = (await store.listVoters(voter.electionId)).some(
    (v) => v.id !== voter.id && v.walletAddress && isAddressEqual(v.walletAddress as Address, input.walletAddress as Address),
  );
  if (taken) throw new HttpError("not_eligible", "Esa wallet ya está enlazada a otro votante de esta elección");
  const updated = Voter.parse({ ...voter, walletAddress: input.walletAddress, inviteStatus: "claimed" });
  await store.putVoter(updated);
  return json(publicVoter(updated));
});
