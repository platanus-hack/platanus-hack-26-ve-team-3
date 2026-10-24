/**
 * Construcción y firma del voto (EIP-712) según packages/contracts.
 * Modo `integrity-demo`: mientras no hay motor (ADR-001), el commitment es keccak256 de `electionId|optionId|nonce`
 * y se envía también `plainChoice`. Esto NO es cifrado ni privacidad criptográfica; la UI lo dice.
 */
import { VoteTypedDataDomain, VoteTypes } from "@quorum/contracts";
import { keccak256, stringToHex, zeroAddress, type Address, type Hex, type TypedDataDomain } from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");

export const voteDomain: TypedDataDomain = {
  ...VoteTypedDataDomain,
  chainId: CHAIN_ID,
  verifyingContract: zeroAddress,
};

export type VoteMessage = {
  electionId: string;
  ballotCommitment: Hex;
  voter: Address;
  nonce: Hex;
  expires: bigint;
};

export const isBytes32 = (s: string): s is Hex => /^0x[0-9a-fA-F]{64}$/.test(s);

/** El nonce del servidor debería ser bytes32 hex. Si no lo es, lo normalizamos con keccak256 (y se informa al backend). */
export function nonceToBytes32(nonce: string): { value: Hex; normalized: boolean } {
  if (isBytes32(nonce)) return { value: nonce, normalized: false };
  return { value: keccak256(stringToHex(nonce)), normalized: true };
}

export function ballotCommitment(electionId: string, optionId: string, nonce: string): Hex {
  return keccak256(stringToHex(`${electionId}|${optionId}|${nonce}`));
}

export function buildVoteMessage(args: { electionId: string; optionId: string; voter: Address; nonce: string; ttlSeconds?: number }): VoteMessage {
  const { value: nonceHex } = nonceToBytes32(args.nonce);
  const expires = BigInt(Math.floor(Date.now() / 1000) + (args.ttlSeconds ?? 120));
  return {
    electionId: args.electionId,
    ballotCommitment: ballotCommitment(args.electionId, args.optionId, args.nonce),
    voter: args.voter,
    nonce: nonceHex,
    expires,
  };
}

/** Parámetros exactos para `signTypedData` (viem o Privy smart wallet). */
export function typedDataFor(message: VoteMessage) {
  return { domain: voteDomain, types: VoteTypes, primaryType: "Vote" as const, message };
}

/** Cuerpo que viaja a POST /api/elections/:id/vote: `SignedVote` + `plainChoice` (modo integrity-demo). */
export function toSignedVoteBody(message: VoteMessage, signature: Hex, plainChoice: string) {
  return {
    message: { ...message, expires: message.expires.toString() },
    signature,
    plainChoice,
  };
}

/** Firmante abstracto: smart wallet de Privy o cuenta demo local (viem). */
export type VoteSigner = {
  address: Address;
  kind: "privy-smart-wallet" | "demo-local";
  label: string;
  signTypedData: (message: VoteMessage) => Promise<Hex>;
};

/** Genera un nonce local sólo para la ruta "continuar sin prueba de vida (demo)". El servidor puede rechazarlo. */
export function localFallbackNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
}
