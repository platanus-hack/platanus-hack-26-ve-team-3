import { encodeFunctionData, keccak256, toBytes, type Hex } from "viem";
import { registryAbi } from "./registry-artifact";

export { registryAbi, registryBytecode, registrySourceSha256 } from "./registry-artifact";

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
// Sin literales bigint (`0n`): apps/web compila con target ES2017.
const ZERO = BigInt(0);
const MAX = BigInt(2) ** BigInt(256);

/** Los ids de elección de la app son strings; on-chain se usa keccak256(utf8(id)). */
export function electionIdToBytes32(electionId: string): Hex {
  if (!electionId) throw new Error("electionId vacío");
  return keccak256(toBytes(electionId));
}

/** Normaliza un compromiso (hex bytes32 o string decimal, p. ej. un nullifier Semaphore) a bytes32. */
export function toBytes32(value: string | bigint): Hex {
  if (typeof value === "string" && BYTES32.test(value)) return value.toLowerCase() as Hex;
  const n = typeof value === "bigint" ? value : /^[0-9]+$/.test(value) ? BigInt(value) : null;
  if (n === null || n < ZERO || n >= MAX) throw new Error("valor no representable como bytes32");
  if (n === ZERO) throw new Error("el contrato rechaza bytes32 cero");
  return `0x${n.toString(16).padStart(64, "0")}`;
}

/** Calldata de `cast(electionId, commitment)`: registra un compromiso opaco, nunca la opción en claro. */
export function encodeCast(electionId: string, commitment: string | bigint): Hex {
  return encodeFunctionData({ abi: registryAbi, functionName: "cast", args: [electionIdToBytes32(electionId), toBytes32(commitment)] });
}

/** Calldata de `anchor(electionId, finalHash)` (solo el organizador puede enviarla). */
export function encodeAnchor(electionId: string, finalHash: string): Hex {
  return encodeFunctionData({ abi: registryAbi, functionName: "anchor", args: [electionIdToBytes32(electionId), toBytes32(finalHash)] });
}
