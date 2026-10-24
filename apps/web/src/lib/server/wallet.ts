/**
 * Enlace rostro ↔ wallet (D-10, Contrato v1). La wallet firma EIP-712 `FaceBinding{electionId, voterId,
 * faceBindingHash, wallet}` y el servidor la verifica:
 *  - con `BASE_SEPOLIA_RPC`: `publicClient.verifyTypedData` (EOA, ERC-1271 desplegada y ERC-6492: las firmas Kernel
 *    previas al primer despliegue llegan envueltas en 6492);
 *  - sin RPC: solo `eoa-demo` con `verifyTypedData` puro (ecrecover, offline). `kernel` sin RPC → 503 honesto.
 * Solo después de una firma válida el votante queda `registered`.
 */
import { FaceBindingDomain, FaceBindingTypes, LinkWalletInput, Voter } from "@quorum/contracts";
import { createPublicClient, http, isAddressEqual, verifyTypedData, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { z } from "zod";
import { enrollmentOpen, publicVoter, requireElection, requireVoter } from "./elections";
import { env } from "./env";
import { HttpError } from "./errors";
import { withLock } from "./lock";
import { getStore } from "./store";

export function faceBindingDomain() {
  return { ...FaceBindingDomain, chainId: env.chainId } as const;
}

export type FaceBindingMessage = { electionId: string; voterId: string; faceBindingHash: Hex; wallet: Address };

/** Verificador de firma inyectable para tests de smart wallets (ERC-1271/6492) sin red. */
type RpcVerifier = (args: { address: Address; message: FaceBindingMessage; signature: Hex }) => Promise<boolean>;
const hooks: { rpcVerifier?: RpcVerifier } = {};
export function setWalletRpcVerifierForTests(fn: RpcVerifier | undefined) {
  hooks.rpcVerifier = fn;
}

export async function verifyFaceBinding(kind: "kernel" | "eoa-demo", message: FaceBindingMessage, signature: Hex): Promise<boolean> {
  const typed = { domain: faceBindingDomain(), types: FaceBindingTypes, primaryType: "FaceBinding" as const, message, signature };
  if (hooks.rpcVerifier) return hooks.rpcVerifier({ address: message.wallet, message, signature });
  const rpc = env.rpcUrl;
  if (!rpc) {
    if (kind === "kernel") throw new HttpError("unavailable", "Verificar la firma de una smart wallet (ERC-1271/6492) requiere BASE_SEPOLIA_RPC");
    try {
      return await verifyTypedData({ address: message.wallet, ...typed });
    } catch {
      return false;
    }
  }
  try {
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
    return await client.verifyTypedData({ address: message.wallet, ...typed });
  } catch (err) {
    console.warn("[wallet] verificación RPC falló:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

export async function linkWallet(voterId: string, input: z.infer<typeof LinkWalletInput>) {
  const voter = await requireVoter(voterId);
  if (voter.inviteToken !== input.inviteToken) throw new HttpError("forbidden", "inviteToken inválido");
  const election = await requireElection(voter.electionId);
  if (!enrollmentOpen(election)) throw new HttpError("closed", "La elección no está en fase de inscripción");
  if (!voter.faceBindingHash) throw new HttpError("not_eligible", "Primero hay que completar la prueba de vida (faceBindingHash)");
  const wallet = input.walletAddress as Address;
  if (voter.walletAddress) {
    if (isAddressEqual(voter.walletAddress as Address, wallet) && voter.registeredAt) return publicVoter(voter);
    if (!isAddressEqual(voter.walletAddress as Address, wallet)) throw new HttpError("forbidden", "Este votante ya enlazó otra wallet");
  }
  const message: FaceBindingMessage = { electionId: election.id, voterId: voter.id, faceBindingHash: voter.faceBindingHash as Hex, wallet };
  const ok = await verifyFaceBinding(input.kind, message, input.bindingSignature as Hex);
  if (!ok) throw new HttpError("forbidden", "Firma FaceBinding inválida");
  return withLock(`wallet:${election.id}`, async () => {
    const store = await getStore();
    const taken = (await store.listVoters(election.id)).some(
      (v) => v.id !== voter.id && v.walletAddress && isAddressEqual(v.walletAddress as Address, wallet),
    );
    if (taken) throw new HttpError("not_eligible", "Esa wallet ya está enlazada a otro votante de esta elección");
    const updated = Voter.parse({ ...voter, walletAddress: input.walletAddress, walletKind: input.kind, inviteStatus: "claimed", registeredAt: new Date().toISOString() });
    await store.putVoter(updated);
    return publicVoter(updated);
  });
}
