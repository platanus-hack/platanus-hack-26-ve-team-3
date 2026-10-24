import type { InviteResponse } from "@/lib/client/api";
import type { VoteSigner } from "@/lib/client/vote";
import type { Receipt } from "@/lib/client/types";

export type VoterStepId = "invite" | "identity" | "liveness" | "wallet" | "ballot" | "receipt";

export const VOTER_STEPS: { id: VoterStepId; label: string }[] = [
  { id: "invite", label: "Invitación" },
  { id: "identity", label: "Tus datos" },
  { id: "liveness", label: "Prueba de vida" },
  { id: "wallet", label: "Wallet" },
  { id: "ballot", label: "Boleta" },
  { id: "receipt", label: "Comprobante" },
];

export type LivenessOutcome =
  | { mode: "enrolled"; voteNonce: string }
  | { mode: "skipped"; voteNonce: string; reason: string };

export type VoterFlowState = {
  token: string;
  invite: InviteResponse;
  displayName: string;
  consent: boolean;
  liveness: LivenessOutcome | null;
  signer: VoteSigner | null;
  receipt: Receipt | null;
};
