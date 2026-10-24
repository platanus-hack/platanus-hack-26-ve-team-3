/**
 * Voto firmado (EIP-712). Flujo:
 *  1. elección `open`; 2. nonce vigente (emitido por face/enroll o face/verify, 2 min) y del mismo
 *  votante/elección; 3. wallet enlazada === `message.voter`; 4. no ha votado; 5. firma válida;
 *  6. se consume el nonce, se marca `votedAt` y se guarda la boleta SIN `voterId`.
 *
 * Verificación de firma: primero `verifyTypedData` puro de viem (ecrecover; cubre EOAs y no
 * necesita red). Si falla y hay RPC configurado, fallback a `publicClient.verifyTypedData`
 * (ERC-1271 para smart wallets desplegadas y ERC-6492 para no desplegadas).
 *
 * Motor pendiente (ADR-001): la boleta guarda `commitment` y, solo si el request trae
 * `plainChoice` (modo `integrity-demo`), la opción en claro sin vínculo al elector.
 * Crypto reemplazará esto por el adaptador del motor (`packages/protocol-adapter`).
 */
import { Receipt, SignedVote, VoteTypedDataDomain, VoteTypes } from "@quorum/contracts";
import { z } from "zod";
import { createPublicClient, http, isAddress, isAddressEqual, isHex, verifyTypedData, zeroAddress, type Address, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { sha256Hex } from "./crypto";
import { env } from "./env";
import { HttpError } from "./errors";
import { receiptOf, requireElection } from "./elections";
import { getStore, type Ballot } from "./store";

export const VoteInput = SignedVote.extend({
  /** Solo modo `integrity-demo`: id de la opción. Nunca se registra en logs. */
  plainChoice: z.string().min(1).max(40).optional(),
});
export type VoteInput = z.infer<typeof VoteInput>;

export function voteDomain() {
  return { ...VoteTypedDataDomain, chainId: env.chainId, verifyingContract: zeroAddress } as const;
}

const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "bytes32 hex esperado");

export async function verifyVoteSignature(input: { message: SignedVote["message"]; signature: string }): Promise<boolean> {
  const { message, signature } = input;
  if (!isAddress(message.voter) || !isHex(signature)) return false;
  const typed = {
    domain: voteDomain(),
    types: VoteTypes,
    primaryType: "Vote" as const,
    message: {
      electionId: message.electionId,
      ballotCommitment: message.ballotCommitment as Hex,
      voter: message.voter as Address,
      nonce: message.nonce as Hex,
      expires: BigInt(message.expires),
    },
    signature: signature as Hex,
  };
  // Camino rápido: EOA (puro, sin red).
  try {
    if (await verifyTypedData({ address: message.voter as Address, ...typed })) return true;
  } catch {
    /* firma malformada → seguimos al fallback */
  }
  // Fallback: smart wallets (ERC-1271 / ERC-6492) requieren RPC.
  const rpc = env.rpcUrl;
  if (!rpc) return false;
  try {
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
    return await client.verifyTypedData({ address: message.voter as Address, ...typed });
  } catch (err) {
    console.warn("[vote] verificación RPC falló:", err instanceof Error ? err.message : String(err));
    return false;
  }
}

type SignedVote = z.infer<typeof SignedVote>;
type ReceiptT = z.infer<typeof Receipt>;

/** `inclusionId` = sha256(commitment + electionId + índice de la boleta en la urna). Determinista y sin PII. */
export function inclusionIdFor(commitment: string, electionId: string, index: number): string {
  return sha256Hex(`${commitment.toLowerCase()}${electionId}${index}`);
}

export async function castVote(electionId: string, input: VoteInput): Promise<ReceiptT> {
  const store = await getStore();
  const election = await requireElection(electionId);
  if (election.status !== "open") throw new HttpError("closed", "La elección no está abierta para votar");
  if (input.message.electionId !== electionId) throw new HttpError("invalid_input", "electionId del mensaje no coincide");
  if (!bytes32.safeParse(input.message.ballotCommitment).success) throw new HttpError("invalid_input", "ballotCommitment debe ser bytes32");
  if (!bytes32.safeParse(input.message.nonce).success) throw new HttpError("invalid_input", "nonce debe ser bytes32");
  if (!/^\d+$/.test(input.message.expires)) throw new HttpError("invalid_input", "expires debe ser entero (segundos unix)");
  if (!isAddress(input.message.voter)) throw new HttpError("invalid_input", "voter debe ser una dirección");
  if (input.plainChoice !== undefined && !election.options.some((o) => o.id === input.plainChoice)) {
    throw new HttpError("invalid_input", "plainChoice no es una opción válida");
  }

  const nowMs = Date.now();
  if (BigInt(input.message.expires) * BigInt(1000) <= BigInt(nowMs)) throw new HttpError("forbidden", "La firma expiró");

  const nonce = await store.getNonce(input.message.nonce);
  if (!nonce || nonce.electionId !== electionId) throw new HttpError("not_eligible", "Nonce desconocido para esta elección");
  if (nonce.usedAt) throw new HttpError("already_voted", "Nonce ya consumido");
  if (Date.parse(nonce.expiresAt) <= nowMs) throw new HttpError("forbidden", "Nonce vencido; repite la prueba de vida");

  const voter = await store.getVoter(nonce.voterId);
  if (!voter || voter.electionId !== electionId) throw new HttpError("not_eligible", "Votante no elegible");
  if (!voter.walletAddress || !isAddressEqual(voter.walletAddress as Address, input.message.voter as Address)) {
    throw new HttpError("not_eligible", "La wallet no está enlazada a este votante");
  }
  if (voter.votedAt) throw new HttpError("already_voted", "Este votante ya votó");

  const valid = await verifyVoteSignature(input);
  if (!valid) throw new HttpError("forbidden", "Firma EIP-712 inválida");

  // Consumir nonce y marcar votedAt ANTES de guardar la boleta (evita doble voto en carrera simple).
  const receivedAt = new Date(nowMs).toISOString();
  await store.putNonce({ ...nonce, usedAt: receivedAt });
  await store.putVoter({ ...voter, votedAt: receivedAt, credentialIssuedAt: voter.credentialIssuedAt ?? receivedAt });

  const index = (await store.listBallots(electionId)).length;
  const ballot: Ballot = {
    inclusionId: inclusionIdFor(input.message.ballotCommitment, electionId, index),
    electionId,
    commitment: input.message.ballotCommitment.toLowerCase(),
    ...(input.plainChoice !== undefined ? { choice: input.plainChoice } : {}),
    receivedAt,
    includedAt: null,
  };
  await store.putBallot(ballot);
  return receiptOf(ballot);
}
