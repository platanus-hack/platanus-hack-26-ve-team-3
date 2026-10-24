import { isAddressEqual, verifyTypedData, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { BASE_SEPOLIA_CHAIN_ID } from "./chain";

/**
 * EIP-712 `FaceBinding` (Contrato v1, paso 3 de inscripción): la wallet firma que el
 * `faceBindingHash` emitido por el servidor tras el dedupe facial queda enlazado a ella.
 * Mismo dominio que el voto (`VoteTypedDataDomain` en @quorum/contracts) con `verifyingContract` = 0x0.
 * El hash no contiene biometría: es keccak256(electionId | voterId | sha256(descriptorCifrado)).
 */
export const FaceBindingTypes = {
  FaceBinding: [
    { name: "electionId", type: "string" },
    { name: "voterId", type: "string" },
    { name: "faceBindingHash", type: "bytes32" },
    { name: "wallet", type: "address" },
  ],
} as const;

export type FaceBindingMessage = {
  electionId: string;
  voterId: string;
  faceBindingHash: Hex;
  wallet: Address;
};

export function faceBindingDomain(chainId: number = BASE_SEPOLIA_CHAIN_ID) {
  return { name: "Quorum", version: "1", chainId, verifyingContract: zeroAddress } as const;
}

export function faceBindingTypedData(message: FaceBindingMessage, chainId: number = BASE_SEPOLIA_CHAIN_ID) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(message.faceBindingHash)) throw new Error("faceBindingHash debe ser bytes32 hex");
  if (!message.electionId || !message.voterId) throw new Error("electionId y voterId son obligatorios");
  return { domain: faceBindingDomain(chainId), types: FaceBindingTypes, primaryType: "FaceBinding" as const, message };
}

/**
 * Verifica la firma de enlace. Sin `publicClient` solo cubre EOAs (ecrecover, sin red).
 * Con `publicClient` (RPC de Base Sepolia) cubre además smart accounts desplegadas (ERC-1271)
 * y no desplegadas (ERC-6492), que es lo que produce Kernel antes de su primera UserOp.
 */
export async function verifyFaceBinding(input: {
  message: FaceBindingMessage;
  signature: Hex;
  chainId?: number;
  publicClient?: Pick<PublicClient, "verifyTypedData">;
}): Promise<boolean> {
  const td = faceBindingTypedData(input.message, input.chainId);
  try {
    if (await verifyTypedData({ address: input.message.wallet, ...td, signature: input.signature })) return true;
  } catch {
    /* firma no-EOA o malformada: seguimos */
  }
  if (!input.publicClient) return false;
  try {
    return await input.publicClient.verifyTypedData({ address: input.message.wallet, ...td, signature: input.signature });
  } catch {
    return false;
  }
}

export function sameAddress(a: string, b: string): boolean {
  try {
    return isAddressEqual(a as Address, b as Address);
  } catch {
    return false;
  }
}
