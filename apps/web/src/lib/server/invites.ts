/**
 * Invitaciones por WhatsApp vía @quorum/notify. Nunca se envía un mensaje real sin
 * `INVITE_SEND_APPROVED=true` + credenciales (D-07); si no, dry-run y se informa en la respuesta.
 */
import { InviteRequest, type Voter } from "@quorum/contracts";
import { createProvider, type InviteChannel, type NotifyProvider } from "@quorum/notify";
import { z } from "zod";
import { acceptsVoters, inviteUrlFor, requireElection } from "./elections";
import { env } from "./env";
import { HttpError } from "./errors";
import { getStore } from "./store";

export interface InviteResult {
  voterId: string;
  status: Voter["inviteStatus"];
  link?: string;
  error?: string;
}

export function selectProvider(requested?: InviteChannel) {
  return createProvider(env.notify, requested);
}

export async function sendInvites(electionId: string, input: z.infer<typeof InviteRequest>) {
  if (input.electionId !== electionId) throw new HttpError("invalid_input", "electionId del body no coincide con la ruta");
  const store = await getStore();
  const election = await requireElection(electionId);
  if (!acceptsVoters(election)) throw new HttpError("closed", "La elección ya cerró");

  const { provider, channel, note } = selectProvider(input.channel);
  const results: InviteResult[] = [];
  for (const voterId of input.voterIds) {
    const voter = await store.getVoter(voterId);
    if (!voter || voter.electionId !== electionId) {
      results.push({ voterId, status: "failed", error: "voter_not_found" });
      continue;
    }
    results.push(await inviteVoter(provider, voter));
  }
  return { results, channel, note };
}

/** Envía la invitación a un votante y actualiza `inviteStatus`. Nunca devuelve el teléfono. */
export async function inviteVoter(provider: NotifyProvider, voter: Voter): Promise<InviteResult> {
  const store = await getStore();
  if (!voter.phoneE164) {
    const r: InviteResult = { voterId: voter.id, status: "failed", error: "no_phone" };
    if (provider.channel === "dry-run") {
      // Sin teléfono igual podemos registrar el enlace en dry-run para la demo.
      await provider.send("+000000000", voter.displayName, inviteUrlFor(voter.inviteToken));
      return { voterId: voter.id, status: "sent", link: inviteUrlFor(voter.inviteToken) };
    }
    await store.putVoter({ ...voter, inviteStatus: "failed" });
    return r;
  }
  const sent = await provider.send(voter.phoneE164, voter.displayName, inviteUrlFor(voter.inviteToken));
  const status: Voter["inviteStatus"] = sent.status;
  await store.putVoter({ ...voter, inviteStatus: status });
  const out: InviteResult = { voterId: voter.id, status };
  if (sent.link) out.link = sent.link;
  if (sent.error) out.error = sent.error;
  return out;
}
