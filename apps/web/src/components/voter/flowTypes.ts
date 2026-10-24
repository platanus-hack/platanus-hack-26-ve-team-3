import type { Hex } from "viem";

/**
 * Resultado del paso de rostro (contrato v1). `faceBindingHash` lo emite el servidor tras comprobar que el rostro no esté
 * ya inscrito en esta votación (modo demo). No hay ruta "sin rostro" (threat model B3).
 */
export type LivenessOutcome = { mode: "enrolled"; faceBindingHash: Hex };

export type RegistrationStepId = "invite" | "identity" | "liveness" | "wallet" | "credential" | "registered";
export type VotingStepId = "invite" | "wallet" | "ballot" | "receipt";

export const REGISTRATION_STEPS: { id: RegistrationStepId; label: string }[] = [
  { id: "invite", label: "Invitación" },
  { id: "identity", label: "Tus datos" },
  { id: "liveness", label: "Rostro" },
  { id: "wallet", label: "Wallet" },
  { id: "credential", label: "Credencial" },
  { id: "registered", label: "Inscrito" },
];

export const VOTING_STEPS: { id: VotingStepId; label: string }[] = [
  { id: "invite", label: "Invitación" },
  { id: "wallet", label: "Wallet" },
  { id: "ballot", label: "Boleta" },
  { id: "receipt", label: "Comprobante" },
];
