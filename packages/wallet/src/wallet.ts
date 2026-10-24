import { createPublicClient, http, type Address, type Hex, type TypedDataDefinition } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_SEPOLIA_CHAIN_ID, DEFAULT_BASE_SEPOLIA_RPC, MODE_LABEL, chain, resolveWalletMode, zerodevRpcUrl, type WalletMode } from "./chain";
import { faceBindingTypedData, type FaceBindingMessage } from "./faceBinding";
import { encodeCast } from "./registry";
import { SIGNER_KEY_STORAGE, loadOrCreateSignerKey, type KeyStorage } from "./storage";

export type CastParams = { registryAddress: Address; electionId: string; commitment: string | bigint };
export type CastResult = { mode: "kernel"; userOpHash: Hex; txHash: Hex; sponsored: true };
export type SponsoredCall = { to: Address; data: Hex };

export type QuorumWallet = {
  mode: WalletMode;
  address: Address;
  /** Texto visible para la UI. En `eoa-demo` siempre dice "demo". */
  label: string;
  isDemo: boolean;
  /** true si la clave del signer se creó en esta llamada (false = cuenta recuperada). */
  created: boolean;
  /** false si el navegador no permitió guardar la clave: la cuenta no se podrá recuperar. */
  persisted: boolean;
  signTypedData(td: TypedDataDefinition): Promise<Hex>;
  /** Firma EIP-712 `FaceBinding` con `wallet = address`. */
  signFaceBinding(input: Omit<FaceBindingMessage, "wallet">): Promise<{ message: FaceBindingMessage; signature: Hex }>;
  /** true solo si se creó con `onchainCast: true` (flag `NEXT_PUBLIC_QUORUM_ONCHAIN_CAST`). */
  onchainCast: boolean;
  /**
   * Envía `cast` al QuorumRegistry con UserOp patrocinada. Solo `kernel` y solo con `onchainCast: true`
   * (si no, lanza `OnchainCastDisabledError`); en `eoa-demo` lanza `CastUnavailableError`.
   * Riesgo C2: enlaza públicamente wallet ↔ boleta. Ver docs/WALLETS.md.
   */
  sendCast(params: CastParams): Promise<CastResult>;
  /** UserOp patrocinada genérica (`{to, data}`), con la misma compuerta que `sendCast`. */
  sendSponsored(call: SponsoredCall): Promise<CastResult>;
};

export class CastUnavailableError extends Error {
  constructor(message = "La wallet demo no tiene gas ni paymaster: el compromiso queda solo off-chain (etiquetado).") {
    super(message);
    this.name = "CastUnavailableError";
  }
}

export class OnchainCastDisabledError extends Error {
  constructor(
    message = "Envío on-chain desde la wallet del votante desactivado (NEXT_PUBLIC_QUORUM_ONCHAIN_CAST!=true): enlazaría la wallet con su boleta.",
  ) {
    super(message);
    this.name = "OnchainCastDisabledError";
  }
}

function withBinding(
  base: Pick<QuorumWallet, "address" | "signTypedData">,
  chainId: number,
): QuorumWallet["signFaceBinding"] {
  return async (input) => {
    const message: FaceBindingMessage = { ...input, wallet: base.address };
    const signature = await base.signTypedData(faceBindingTypedData(message, chainId) as TypedDataDefinition);
    return { message, signature };
  };
}

/** EOA local de viem con clave efímera. Solo para demo: sin smart account, sin paymaster, sin `cast`. */
export function createEoaDemoWallet(opts: { privateKey: Hex; created?: boolean; persisted?: boolean; chainId?: number }): QuorumWallet {
  const account = privateKeyToAccount(opts.privateKey);
  const chainId = opts.chainId ?? BASE_SEPOLIA_CHAIN_ID;
  const signTypedData = (td: TypedDataDefinition) => account.signTypedData(td);
  return {
    mode: "eoa-demo",
    address: account.address,
    label: MODE_LABEL["eoa-demo"],
    isDemo: true,
    created: opts.created ?? false,
    persisted: opts.persisted ?? false,
    signTypedData,
    signFaceBinding: withBinding({ address: account.address, signTypedData }, chainId),
    onchainCast: false,
    sendCast: async () => {
      throw new CastUnavailableError();
    },
    sendSponsored: async () => {
      throw new CastUnavailableError();
    },
  };
}

export type KernelWalletOptions = {
  projectId: string;
  privateKey: Hex;
  /** RPC de lectura (no el bundler). Por defecto el público de Base Sepolia. */
  publicRpcUrl?: string;
  created?: boolean;
  persisted?: boolean;
  /** C2: habilita `sendCast`/`sendSponsored`. Default false. */
  onchainCast?: boolean;
};

/**
 * Smart account Kernel v3.1 (EntryPoint 0.7) con validador ECDSA cuyo signer es la clave local.
 * Bundler y paymaster: ZeroDev (`NEXT_PUBLIC_ZERODEV_PROJECT_ID`); el votante no paga gas.
 * La dirección es contrafactual: la cuenta se despliega en su primera UserOp. Las firmas antes del
 * despliegue salen envueltas en ERC-6492 y se verifican con `publicClient.verifyTypedData`.
 * El SDK de ZeroDev se carga con import dinámico para no inflar el bundle del modo demo.
 */
export async function createKernelWallet(opts: KernelWalletOptions): Promise<QuorumWallet> {
  const [sdk, constants, ecdsa] = await Promise.all([
    import("@zerodev/sdk"),
    import("@zerodev/sdk/constants"),
    import("@zerodev/ecdsa-validator"),
  ]);
  const zerodevRpc = zerodevRpcUrl(opts.projectId, BASE_SEPOLIA_CHAIN_ID);
  const publicClient = createPublicClient({ chain, transport: http(opts.publicRpcUrl ?? DEFAULT_BASE_SEPOLIA_RPC) });
  const signer = privateKeyToAccount(opts.privateKey);
  const entryPoint = constants.getEntryPoint("0.7");
  const kernelVersion = constants.KERNEL_V3_1;

  const sudo = await ecdsa.signerToEcdsaValidator(publicClient, { signer, entryPoint, kernelVersion });
  const account = await sdk.createKernelAccount(publicClient, { plugins: { sudo }, entryPoint, kernelVersion });
  const paymasterClient = sdk.createZeroDevPaymasterClient({ chain, transport: http(zerodevRpc) });
  const kernelClient = sdk.createKernelAccountClient({
    account,
    chain,
    client: publicClient,
    bundlerTransport: http(zerodevRpc),
    paymaster: {
      getPaymasterData: (userOperation) => paymasterClient.sponsorUserOperation({ userOperation }),
    },
  });

  const signTypedData = (td: TypedDataDefinition) => account.signTypedData(td);
  const onchainCast = opts.onchainCast === true;
  const sendSponsored = async ({ to, data }: SponsoredCall): Promise<CastResult> => {
    if (!onchainCast) throw new OnchainCastDisabledError();
    const callData = await account.encodeCalls([{ to, value: BigInt(0), data }]);
    const userOpHash = await kernelClient.sendUserOperation({ callData });
    const receipt = await kernelClient.waitForUserOperationReceipt({ hash: userOpHash });
    if (!receipt.success) throw new Error(`UserOp revertida (${userOpHash})`);
    return { mode: "kernel", userOpHash, txHash: receipt.receipt.transactionHash, sponsored: true };
  };
  return {
    mode: "kernel",
    address: account.address,
    label: MODE_LABEL.kernel,
    // M8: la clave del signer vive en localStorage; es una wallet de demostración, no de producción.
    isDemo: true,
    created: opts.created ?? false,
    persisted: opts.persisted ?? false,
    signTypedData,
    signFaceBinding: withBinding({ address: account.address, signTypedData }, BASE_SEPOLIA_CHAIN_ID),
    onchainCast,
    sendCast: ({ registryAddress, electionId, commitment }) => sendSponsored({ to: registryAddress, data: encodeCast(electionId, commitment) }),
    sendSponsored,
  };
}

export type GetOrCreateWalletOptions = {
  /** `process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID` (leído por la app para que Next lo inyecte). */
  projectId?: string | null;
  /** Storage persistente para el signer de Kernel (por defecto `localStorage`). */
  kernelStorage?: KeyStorage | null;
  /** Storage del modo demo (por defecto `sessionStorage`: se borra al cerrar la pestaña). */
  demoStorage?: KeyStorage | null;
  publicRpcUrl?: string;
  /** Si Kernel falla al inicializar (red, project id inválido), cae a `eoa-demo` en vez de lanzar. Default true. */
  fallbackToDemo?: boolean;
  onFallback?: (error: unknown) => void;
  /** C2: `onchainCastEnabled(process.env.NEXT_PUBLIC_QUORUM_ONCHAIN_CAST)`. Default false. */
  onchainCast?: boolean;
};

function browserStorage(kind: "localStorage" | "sessionStorage"): KeyStorage | null {
  try {
    return typeof globalThis !== "undefined" && kind in globalThis ? (globalThis as unknown as Record<string, KeyStorage>)[kind] : null;
  } catch {
    return null;
  }
}

/** Crea o recupera la wallet del votante en este navegador según la configuración disponible. */
export async function getOrCreateWallet(opts: GetOrCreateWalletOptions = {}): Promise<QuorumWallet> {
  const mode = resolveWalletMode(opts.projectId);
  const demo = () => {
    const storage = opts.demoStorage === undefined ? browserStorage("sessionStorage") : opts.demoStorage;
    const key = loadOrCreateSignerKey(storage, SIGNER_KEY_STORAGE["eoa-demo"]);
    return createEoaDemoWallet({ privateKey: key.privateKey, created: key.created, persisted: key.persisted });
  };
  if (mode === "eoa-demo") return demo();
  const storage = opts.kernelStorage === undefined ? browserStorage("localStorage") : opts.kernelStorage;
  const key = loadOrCreateSignerKey(storage, SIGNER_KEY_STORAGE.kernel);
  try {
    return await createKernelWallet({
      projectId: opts.projectId as string,
      privateKey: key.privateKey,
      publicRpcUrl: opts.publicRpcUrl,
      created: key.created,
      persisted: key.persisted,
      onchainCast: opts.onchainCast === true,
    });
  } catch (err) {
    if (opts.fallbackToDemo === false) throw err;
    opts.onFallback?.(err);
    return demo();
  }
}
