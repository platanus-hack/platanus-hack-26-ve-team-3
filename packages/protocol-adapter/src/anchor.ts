import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  decodeEventLog,
  decodeFunctionData,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import type { Hex32 } from "./ledger";

/** Base Sepolia (testnet de Base). Fuente: https://docs.base.org/chain/network-information (consultado 2026-10-24). */
export const BASE_SEPOLIA_CHAIN_ID = 84532;
/** EAS en Base Sepolia (predeploy OP Stack). Fuente: https://github.com/ethereum-attestation-service/eas-contracts#base-sepolia (2026-10-24). */
export const EAS_BASE_SEPOLIA: Address = "0x4200000000000000000000000000000000000021";
export const EAS_SCHEMA_REGISTRY_BASE_SEPOLIA: Address = "0x4200000000000000000000000000000000000020";
/** Esquema EAS del acta de Quórum. Hay que registrarlo una vez en SchemaRegistry (ver docs/ADR-001). */
export const ANCHOR_EAS_SCHEMA = "bytes32 finalHash,bytes32 groupRoot,bytes32 tallyHash,string electionId";

export type AnchorPayload = {
  finalHash: Hex32;
  /** Raíz del padrón como string decimal (se codifica como bytes32). */
  groupRoot: string;
  tallyHash: Hex32;
  electionId: string;
};

const ANCHOR_ABI_PARAMS = [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "string" }] as const;

/** Calldata ABI-encoded `(bytes32 finalHash, bytes32 groupRoot, bytes32 tallyHash, string electionId)`. */
export function encodeAnchorCalldata(p: AnchorPayload): Hex {
  return encodeAbiParameters(ANCHOR_ABI_PARAMS, [p.finalHash, toHex(BigInt(p.groupRoot), { size: 32 }), p.tallyHash, p.electionId]);
}

export function decodeAnchorCalldata(data: Hex): AnchorPayload {
  const [finalHash, groupRootHex, tallyHash, electionId] = decodeAbiParameters(ANCHOR_ABI_PARAMS, data);
  return { finalHash, groupRoot: BigInt(groupRootHex).toString(), tallyHash, electionId };
}

/** Transporte mínimo para poder probar sin red (mock) y ejecutar con viem en producción. */
export type AnchorTransport = {
  chainId(): Promise<number>;
  sender(): Address;
  /** Envía una tx con `data` a `to` (value 0) y devuelve el hash. */
  send(to: Address, data: Hex): Promise<Hex>;
  getTransaction(txHash: Hex): Promise<{ from: Address; to: Address | null; input: Hex; chainId?: number }>;
  getReceiptLogs(txHash: Hex): Promise<{ address: Address; data: Hex; topics: Hex[] }[]>;
  call(to: Address, data: Hex): Promise<Hex>;
};

/** Transporte real con viem sobre Base Sepolia. `privateKey` solo es necesaria para enviar. */
export function viemTransport(rpcUrl: string, privateKey?: Hex): AnchorTransport {
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
  const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
  const wallet = account ? createWalletClient({ account, chain: baseSepolia, transport: http(rpcUrl) }) : undefined;
  return {
    chainId: () => publicClient.getChainId(),
    sender: () => {
      if (!account) throw new Error("no private key configured");
      return account.address;
    },
    send: async (to, data) => {
      if (!wallet || !account) throw new Error("no private key configured");
      return wallet.sendTransaction({ account, chain: baseSepolia, to, data, value: 0n });
    },
    getTransaction: async (hash) => {
      const tx = await publicClient.getTransaction({ hash });
      return { from: tx.from, to: tx.to ?? null, input: tx.input, chainId: "chainId" in tx && typeof tx.chainId === "number" ? tx.chainId : undefined };
    },
    getReceiptLogs: async (hash) => {
      const r = await publicClient.waitForTransactionReceipt({ hash });
      return r.logs.map((l) => ({ address: l.address, data: l.data, topics: [...l.topics] as Hex[] }));
    },
    call: async (to, data) => (await publicClient.call({ to, data })).data ?? "0x",
  };
}

export type AnchorResult = { chainId: number; txHash: Hex32; from: Address; calldata: Hex };

/**
 * Ancla `(finalHash, groupRoot, tallyHash, electionId)` en Base Sepolia con una tx a la propia cuenta
 * cuyo calldata es el ABI-encoding del acta. Lo que garantiza: que ese hash existía en ese bloque y no se
 * puede cambiar después sin que el verificador lo note. Lo que NO garantiza: que el ledger sea correcto
 * (eso lo decide el verificador recomputando todo).
 * No se ejecuta en tests ni en CI: requiere una clave con ETH de Base Sepolia (faucet CDP).
 */
export async function anchorOnBaseSepolia(
  payload: AnchorPayload,
  privateKey: Hex,
  rpcUrl: string,
  opts: { transport?: AnchorTransport } = {},
): Promise<AnchorResult> {
  const t = opts.transport ?? viemTransport(rpcUrl, privateKey);
  const chainId = await t.chainId();
  if (chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error(`expected chainId ${BASE_SEPOLIA_CHAIN_ID} (Base Sepolia), got ${chainId}`);
  const from = t.sender();
  const calldata = encodeAnchorCalldata(payload);
  const txHash = (await t.send(from, calldata)) as Hex32;
  return { chainId, txHash, from, calldata };
}

export type ReadAnchorResult = { chainId: number; from: Address; to: Address | null; selfTransfer: boolean; payload: AnchorPayload };

/** Lee una tx de ancla y decodifica su calldata. Lanza si el calldata no tiene la forma esperada. */
export async function readAnchor(txHash: Hex, rpcUrl: string, opts: { transport?: AnchorTransport } = {}): Promise<ReadAnchorResult> {
  const t = opts.transport ?? viemTransport(rpcUrl);
  const chainId = await t.chainId();
  const tx = await t.getTransaction(txHash);
  return { chainId, from: tx.from, to: tx.to, selfTransfer: tx.to?.toLowerCase() === tx.from.toLowerCase(), payload: decodeAnchorCalldata(tx.input) };
}

// ---------------------------------------------------------------------------
// EAS (Ethereum Attestation Service) — detrás de bandera. Usa el contrato EAS directamente vía viem
// (misma ABI que @ethereum-attestation-service/eas-sdk, sin arrastrar ethers 6).
// ---------------------------------------------------------------------------

export const EAS_ABI = parseAbi([
  "struct AttestationRequestData { address recipient; uint64 expirationTime; bool revocable; bytes32 refUID; bytes data; uint256 value; }",
  "struct AttestationRequest { bytes32 schema; AttestationRequestData data; }",
  "struct Attestation { bytes32 uid; bytes32 schema; uint64 time; uint64 expirationTime; uint64 revocationTime; bytes32 refUID; address recipient; address attester; bool revocable; bytes data; }",
  "function attest(AttestationRequest request) payable returns (bytes32)",
  "function getAttestation(bytes32 uid) view returns (Attestation)",
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
]);

export const SCHEMA_REGISTRY_ABI = parseAbi(["function register(string schema, address resolver, bool revocable) returns (bytes32)"]);

/** Calldata para registrar el esquema del acta en SchemaRegistry (una sola vez por red). */
export function encodeRegisterAnchorSchemaCalldata(): Hex {
  return encodeFunctionData({ abi: SCHEMA_REGISTRY_ABI, functionName: "register", args: [ANCHOR_EAS_SCHEMA, "0x0000000000000000000000000000000000000000", false] });
}

/** Datos del esquema (mismo ABI-encoding que el ancla por calldata). */
export function encodeEasAttestCalldata(schemaUid: Hex32, p: AnchorPayload, recipient: Address): Hex {
  return encodeFunctionData({
    abi: EAS_ABI,
    functionName: "attest",
    args: [{ schema: schemaUid, data: { recipient, expirationTime: 0n, revocable: false, refUID: `0x${"0".repeat(64)}`, data: encodeAnchorCalldata(p), value: 0n } }],
  });
}

export function decodeEasAttestCalldata(data: Hex): { schemaUid: Hex32; payload: AnchorPayload; recipient: Address } {
  const { args } = decodeFunctionData({ abi: EAS_ABI, data });
  const req = args[0] as { schema: Hex32; data: { recipient: Address; data: Hex } };
  return { schemaUid: req.schema, payload: decodeAnchorCalldata(req.data.data), recipient: req.data.recipient };
}

export type EasAttestResult = { chainId: number; txHash: Hex32; attestationUid: Hex32; attester: Address };

/**
 * Atestación EAS del acta. Requiere `opts.enabled === true` (bandera explícita) y un `schemaUid` registrado.
 * Sin ejecutar en este repo: no hay clave con fondos. El camino está probado con transporte simulado.
 */
export async function attestAnchorOnEas(
  payload: AnchorPayload,
  schemaUid: Hex32,
  privateKey: Hex,
  rpcUrl: string,
  opts: { enabled?: boolean; transport?: AnchorTransport } = {},
): Promise<EasAttestResult> {
  if (!opts.enabled) throw new Error("EAS_DISABLED: pass { enabled: true } (env QUORUM_EAS_ENABLED=true) to attest on EAS");
  const t = opts.transport ?? viemTransport(rpcUrl, privateKey);
  const chainId = await t.chainId();
  if (chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error(`expected chainId ${BASE_SEPOLIA_CHAIN_ID}, got ${chainId}`);
  const attester = t.sender();
  const txHash = (await t.send(EAS_BASE_SEPOLIA, encodeEasAttestCalldata(schemaUid, payload, attester))) as Hex32;
  const logs = await t.getReceiptLogs(txHash);
  for (const log of logs) {
    if (log.address.toLowerCase() !== EAS_BASE_SEPOLIA.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: EAS_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "Attested") return { chainId, txHash, attestationUid: ev.args.uid as Hex32, attester };
    } catch {
      /* otro evento */
    }
  }
  throw new Error("EAS Attested event not found in receipt");
}

/** Lee una atestación EAS y decodifica el acta. */
export async function readEasAttestation(uid: Hex32, rpcUrl: string, opts: { transport?: AnchorTransport } = {}): Promise<{ chainId: number; attester: Address; schemaUid: Hex32; revoked: boolean; payload: AnchorPayload }> {
  const t = opts.transport ?? viemTransport(rpcUrl);
  const chainId = await t.chainId();
  const raw = await t.call(EAS_BASE_SEPOLIA, encodeFunctionData({ abi: EAS_ABI, functionName: "getAttestation", args: [uid] }));
  const att = decodeFunctionResult({ abi: EAS_ABI, functionName: "getAttestation", data: raw });
  return { chainId, attester: att.attester, schemaUid: att.schema as Hex32, revoked: att.revocationTime !== 0n, payload: decodeAnchorCalldata(att.data) };
}
