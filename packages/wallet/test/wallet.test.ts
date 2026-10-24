/**
 * @quorum/wallet sin red: `fetch` queda bloqueado y el SDK de ZeroDev se simula con vi.mock.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, keccak256, toBytes, type Hex } from "viem";

const sdk = vi.hoisted(() => {
  const KERNEL_ADDRESS = "0x1111111111111111111111111111111111111111" as const;
  const state = {
    fail: false,
    clientConfig: null as null | Record<string, unknown>,
    sent: [] as unknown[],
    signTypedData: vi.fn(async (_td: unknown) => ("0x" + "ab".repeat(65)) as `0x${string}`),
    encodeCalls: vi.fn(async (calls: { to: string; data: string }[]) => calls[0]!.data as `0x${string}`),
    sponsor: vi.fn(async () => ({ paymaster: "0x2222222222222222222222222222222222222222", paymasterData: "0x" })),
  };
  return { KERNEL_ADDRESS, state };
});

vi.mock("@zerodev/ecdsa-validator", () => ({
  signerToEcdsaValidator: vi.fn(async (_client: unknown, p: { signer: { address: string } }) => ({ validator: "ecdsa", signer: p.signer.address })),
}));

vi.mock("@zerodev/sdk", () => ({
  createKernelAccount: vi.fn(async () => {
    if (sdk.state.fail) throw new Error("ZeroDev no responde (simulado)");
    return { address: sdk.KERNEL_ADDRESS, signTypedData: sdk.state.signTypedData, encodeCalls: sdk.state.encodeCalls };
  }),
  createZeroDevPaymasterClient: vi.fn(() => ({ sponsorUserOperation: sdk.state.sponsor })),
  createKernelAccountClient: vi.fn((config: Record<string, unknown>) => {
    sdk.state.clientConfig = config;
    return {
      sendUserOperation: vi.fn(async (op: unknown) => {
        sdk.state.sent.push(op);
        return ("0x" + "11".repeat(32)) as `0x${string}`;
      }),
      waitForUserOperationReceipt: vi.fn(async () => ({ success: true, receipt: { transactionHash: "0x" + "22".repeat(32) } })),
    };
  }),
}));

import {
  CastUnavailableError,
  FaceBindingTypes,
  MODE_LABEL,
  SIGNER_KEY_STORAGE,
  createEoaDemoWallet,
  electionIdToBytes32,
  faceBindingTypedData,
  getOrCreateWallet,
  loadOrCreateSignerKey,
  memoryStorage,
  registryAbi,
  resolveWalletMode,
  toBytes32,
  verifyFaceBinding,
  zerodevRpcUrl,
} from "../src/index";
import { checkDeployEnv } from "../src/deploy";

const PROJECT_ID = "00000000-aaaa-bbbb-cccc-000000000000";
const FACE_HASH = keccak256(toBytes("electionId|voterId|sha256(descriptor)"));
const binding = { electionId: "demo-condominio-01", voterId: "v_123", faceBindingHash: FACE_HASH };

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = vi.fn(async () => {
    throw new Error("red prohibida en tests");
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  sdk.state.fail = false;
  sdk.state.sent = [];
  sdk.state.clientConfig = null;
});

describe("configuración", () => {
  it("resolveWalletMode: kernel solo con project id", () => {
    expect(resolveWalletMode(PROJECT_ID)).toBe("kernel");
    expect(resolveWalletMode("")).toBe("eoa-demo");
    expect(resolveWalletMode("  ")).toBe("eoa-demo");
    expect(resolveWalletMode(undefined)).toBe("eoa-demo");
  });
  it("zerodevRpcUrl apunta a Base Sepolia y rechaza ids raros", () => {
    expect(zerodevRpcUrl(PROJECT_ID)).toBe(`https://rpc.zerodev.app/api/v3/${PROJECT_ID}/chain/84532`);
    expect(() => zerodevRpcUrl("../../evil")).toThrow();
  });
  it("la etiqueta del modo demo dice demo", () => {
    expect(MODE_LABEL["eoa-demo"].toLowerCase()).toContain("demo");
  });
});

describe("almacenamiento del signer", () => {
  it("crea y luego recupera la misma clave", () => {
    const s = memoryStorage();
    const a = loadOrCreateSignerKey(s, "k");
    const b = loadOrCreateSignerKey(s, "k");
    expect(a.created).toBe(true);
    expect(a.persisted).toBe(true);
    expect(b.created).toBe(false);
    expect(b.privateKey).toBe(a.privateKey);
  });
  it("si el storage falla, la clave queda en memoria y persisted=false", () => {
    const broken = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => {} };
    const r = loadOrCreateSignerKey(broken, "k");
    expect(r.persisted).toBe(false);
    expect(r.privateKey).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("eoa-demo", () => {
  it("sin project id crea una wallet demo y la recupera del mismo storage", async () => {
    const demoStorage = memoryStorage();
    const w1 = await getOrCreateWallet({ projectId: null, demoStorage });
    const w2 = await getOrCreateWallet({ projectId: null, demoStorage });
    expect(w1.mode).toBe("eoa-demo");
    expect(w1.isDemo).toBe(true);
    expect(w1.created).toBe(true);
    expect(w2.created).toBe(false);
    expect(w2.address).toBe(w1.address);
    expect(demoStorage.getItem(SIGNER_KEY_STORAGE["eoa-demo"])).toMatch(/^0x/);
  });

  it("firma FaceBinding verificable offline; alterar cualquier campo invalida la firma", async () => {
    const w = await getOrCreateWallet({ projectId: null, demoStorage: memoryStorage() });
    const { message, signature } = await w.signFaceBinding(binding);
    expect(message.wallet).toBe(w.address);
    expect(await verifyFaceBinding({ message, signature })).toBe(true);
    expect(await verifyFaceBinding({ message: { ...message, voterId: "v_otro" }, signature })).toBe(false);
    expect(await verifyFaceBinding({ message: { ...message, faceBindingHash: keccak256(toBytes("otro")) }, signature })).toBe(false);
    expect(await verifyFaceBinding({ message, signature, chainId: 1 })).toBe(false);
    const other = createEoaDemoWallet({ privateKey: ("0x" + "01".repeat(32)) as Hex });
    expect(await verifyFaceBinding({ message: { ...message, wallet: other.address }, signature })).toBe(false);
  });

  it("sendCast no está disponible (sin gas): lanza CastUnavailableError", async () => {
    const w = await getOrCreateWallet({ projectId: null, demoStorage: memoryStorage() });
    await expect(w.sendCast({ registryAddress: "0x3333333333333333333333333333333333333333", electionId: "e", commitment: FACE_HASH })).rejects.toBeInstanceOf(CastUnavailableError);
  });

  it("faceBindingTypedData valida el hash y fija dominio Quorum/1/84532", () => {
    expect(() => faceBindingTypedData({ ...binding, faceBindingHash: "0x1234", wallet: "0x1111111111111111111111111111111111111111" })).toThrow();
    const td = faceBindingTypedData({ ...binding, wallet: "0x1111111111111111111111111111111111111111" });
    expect(td.domain).toMatchObject({ name: "Quorum", version: "1", chainId: 84532 });
    expect(td.types).toBe(FaceBindingTypes);
  });
});

describe("kernel (ZeroDev simulado)", () => {
  it("con project id crea la cuenta Kernel con bundler/paymaster de ZeroDev y persiste el signer", async () => {
    const kernelStorage = memoryStorage();
    const w = await getOrCreateWallet({ projectId: PROJECT_ID, kernelStorage });
    expect(w.mode).toBe("kernel");
    expect(w.isDemo).toBe(false);
    expect(w.address).toBe(sdk.KERNEL_ADDRESS);
    expect(kernelStorage.getItem(SIGNER_KEY_STORAGE.kernel)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sdk.state.clientConfig).toHaveProperty("paymaster.getPaymasterData");
    const again = await getOrCreateWallet({ projectId: PROJECT_ID, kernelStorage });
    expect(again.created).toBe(false);
  });

  it("signFaceBinding delega en la smart account con wallet = dirección Kernel", async () => {
    const w = await getOrCreateWallet({ projectId: PROJECT_ID, kernelStorage: memoryStorage() });
    const { message, signature } = await w.signFaceBinding(binding);
    expect(message.wallet).toBe(sdk.KERNEL_ADDRESS);
    expect(signature).toMatch(/^0x(ab)+$/);
    const td = sdk.state.signTypedData.mock.calls.at(-1)![0] as { primaryType: string; message: unknown };
    expect(td.primaryType).toBe("FaceBinding");
    expect(td.message).toEqual(message);
  });

  it("verifyFaceBinding usa el publicClient (ERC-1271/6492) cuando ecrecover no aplica", async () => {
    const message = { ...binding, wallet: sdk.KERNEL_ADDRESS };
    const pc = { verifyTypedData: vi.fn(async () => true) };
    expect(await verifyFaceBinding({ message, signature: ("0x" + "ab".repeat(65)) as Hex, publicClient: pc as never })).toBe(true);
    expect(pc.verifyTypedData).toHaveBeenCalledOnce();
    expect(await verifyFaceBinding({ message, signature: ("0x" + "ab".repeat(65)) as Hex })).toBe(false);
  });

  it("sendCast envía una UserOp patrocinada con calldata cast(electionId, commitment)", async () => {
    const w = await getOrCreateWallet({ projectId: PROJECT_ID, kernelStorage: memoryStorage() });
    const nullifier = "98765432109876543210";
    const r = await w.sendCast({ registryAddress: "0x3333333333333333333333333333333333333333", electionId: "demo-condominio-01", commitment: nullifier });
    expect(r).toEqual({ mode: "kernel", userOpHash: "0x" + "11".repeat(32), txHash: "0x" + "22".repeat(32), sponsored: true });
    const calls = sdk.state.encodeCalls.mock.calls.at(-1)![0];
    expect(calls[0]).toMatchObject({ to: "0x3333333333333333333333333333333333333333", value: 0n });
    const decoded = decodeFunctionData({ abi: registryAbi, data: calls[0]!.data as Hex });
    expect(decoded.functionName).toBe("cast");
    expect(decoded.args).toEqual([electionIdToBytes32("demo-condominio-01"), toBytes32(nullifier)]);
  });

  it("si ZeroDev falla cae a eoa-demo (avisando) salvo fallbackToDemo:false", async () => {
    sdk.state.fail = true;
    const onFallback = vi.fn();
    const w = await getOrCreateWallet({ projectId: PROJECT_ID, kernelStorage: memoryStorage(), demoStorage: memoryStorage(), onFallback });
    expect(w.mode).toBe("eoa-demo");
    expect(onFallback).toHaveBeenCalledOnce();
    await expect(getOrCreateWallet({ projectId: PROJECT_ID, kernelStorage: memoryStorage(), fallbackToDemo: false })).rejects.toThrow(/ZeroDev/);
  });

  it("no hubo ninguna llamada de red", () => {
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("utilidades del registro y deploy", () => {
  it("toBytes32 acepta hex y decimal, rechaza cero/negativos/basura", () => {
    expect(toBytes32("1")).toBe("0x" + "0".repeat(63) + "1");
    expect(toBytes32(FACE_HASH.toUpperCase().replace("0X", "0x"))).toBe(FACE_HASH);
    expect(() => toBytes32("0")).toThrow();
    expect(() => toBytes32("-1")).toThrow();
    expect(() => toBytes32("hola")).toThrow();
    expect(() => toBytes32(1n << 256n)).toThrow();
  });
  it("checkDeployEnv sin clave da un mensaje claro y no toca la red", () => {
    const r = checkDeployEnv({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/ORGANIZER_PRIVATE_KEY/);
    expect(checkDeployEnv({ ORGANIZER_PRIVATE_KEY: "0x12" }).ok).toBe(false);
    expect(checkDeployEnv({ ORGANIZER_PRIVATE_KEY: "0x" + "01".repeat(32) }).ok).toBe(false);
    expect(checkDeployEnv({ ORGANIZER_PRIVATE_KEY: "0x" + "01".repeat(32), BASE_SEPOLIA_RPC: "https://sepolia.base.org" }).ok).toBe(true);
  });
});
