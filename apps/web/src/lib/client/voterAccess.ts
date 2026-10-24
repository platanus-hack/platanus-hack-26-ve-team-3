import type { InviteResponse } from "@quorum/contracts";
import { isRegistered, loadPendingFace, loadReceipt, peekIdentity, type StoredReceipt, type VaultInfo } from "./identityVault";

export type Local = { identity: VaultInfo | null; registered: boolean; receipt: StoredReceipt | null; pendingFace: `0x${string}` | null };

export function readLocal(electionId: string, voterId: string): Local {
  const identity = peekIdentity(electionId);
  const mine = identity && identity.voterId === voterId ? identity : null;
  return { identity: mine, registered: mine ? isRegistered(electionId) : false, receipt: loadReceipt(electionId), pendingFace: loadPendingFace(voterId) };
}

export function ownsInvite(invite: InviteResponse, local: Local): boolean {
  if (local.receipt || local.identity) return true;
  const phase = invite.election.status;
  if (phase === "draft") return true;
  // D-23: en modo continuo la inscripción sigue abierta mientras se vota.
  if (phase === "registration" || (phase === "open" && invite.election.votingMode === "continuous")) return !invite.voter.livenessPassedAt || Boolean(local.pendingFace);
  return false;
}
