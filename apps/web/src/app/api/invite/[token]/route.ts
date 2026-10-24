import { HttpError, json, route } from "@/lib/server/errors";
import { getStore } from "@/lib/server/store";

/**
 * GET /api/invite/:token → { election: {id,title,kind,options,status,endsAt}, voter: {id,displayName,walletAddress,livenessPassedAt,votedAt} }
 * 404 si no existe. Nunca devuelve el teléfono.
 */
export const GET = route<{ token: string }>(async (_req, { token }) => {
  const store = await getStore();
  const voter = await store.getVoterByToken(token);
  if (!voter) throw new HttpError("not_found", "Invitación no encontrada");
  const election = await store.getElection(voter.electionId);
  if (!election) throw new HttpError("not_found", "Elección no encontrada");
  return json({
    election: { id: election.id, title: election.title, kind: election.kind, options: election.options, status: election.status, endsAt: election.endsAt },
    voter: { id: voter.id, displayName: voter.displayName, walletAddress: voter.walletAddress, livenessPassedAt: voter.livenessPassedAt, votedAt: voter.votedAt },
  });
});
