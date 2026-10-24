/**
 * Dominio EIP-712 de Quórum (`{ name: "Quorum", version: "1" }` de `@quorum/contracts`) + chainId + verifyingContract 0x0.
 * En v1 el voto ya no se firma con EIP-712 (lo sustituye la prueba Semaphore); el dominio se usa para `FaceBinding`.
 */
import { VoteTypedDataDomain } from "@quorum/contracts";
import { zeroAddress, type TypedDataDomain } from "viem";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "84532");

export const voteDomain: TypedDataDomain = {
  ...VoteTypedDataDomain,
  chainId: CHAIN_ID,
  verifyingContract: zeroAddress,
};
