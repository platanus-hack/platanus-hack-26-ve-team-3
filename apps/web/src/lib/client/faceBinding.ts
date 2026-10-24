/**
 * EIP-712 `FaceBinding{ electionId, voterId, faceBindingHash, wallet }` (contrato v1, inscripción paso 3).
 * Dominio `{ name: "Quorum", version: "1", chainId: 84532, verifyingContract: 0x0 }`, el mismo que usan el backend
 * (feat/phase2-engine) y `@quorum/wallet`. Al integrar, sustituir por `FaceBindingTypes` de `@quorum/contracts`.
 */
import type { Address, Hex, TypedDataDomain } from "viem";
import { voteDomain } from "./vote";

export const FaceBindingTypes = {
  FaceBinding: [
    { name: "electionId", type: "string" },
    { name: "voterId", type: "string" },
    { name: "faceBindingHash", type: "bytes32" },
    { name: "wallet", type: "address" },
  ],
} as const;

export type TypedDataRequest = { domain: TypedDataDomain; types: Record<string, readonly { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> };

export type FaceBindingMessage = { electionId: string; voterId: string; faceBindingHash: Hex; wallet: Address };

export function faceBindingTypedData(message: FaceBindingMessage): TypedDataRequest {
  return { domain: voteDomain, types: FaceBindingTypes, primaryType: "FaceBinding", message };
}
