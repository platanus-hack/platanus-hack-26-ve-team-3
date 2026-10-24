/**
 * RED (no corre en `pnpm test`): `pnpm --filter @quorum/web test:net`.
 * Crea una cuenta Kernel REAL con @quorum/wallet (ZeroDev, Base Sepolia, sin desplegar), firma FaceBinding
 * (sale envuelta en ERC-6492) y la verifica con la MISMA ruta del servidor (`verifyFaceBinding` de lib/server/wallet,
 * que usa `publicClient.verifyTypedData` contra BASE_SEPOLIA_RPC). No envía transacciones ni gasta gas.
 */
import { describe, expect, it } from "vitest";
import { createPublicClient, http, keccak256, stringToBytes, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { createKernelWallet } from "@quorum/wallet";
import { verifyFaceBinding } from "../wallet";

const projectId = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
const rpc = process.env.BASE_SEPOLIA_RPC;
/** Sufijo mágico de ERC-6492 (https://eips.ethereum.org/EIPS/eip-6492). */
const ERC6492_MAGIC = "6492649264926492649264926492649264926492649264926492649264926492";

describe.skipIf(!projectId || !rpc)("RED · FaceBinding firmado por Kernel real (ERC-6492) y verificado por el servidor", () => {
  it("cuenta no desplegada → firma 6492 → verifyFaceBinding('kernel') = true; mensaje alterado = false", async () => {
    const wallet = await createKernelWallet({ projectId: projectId!, privateKey: generatePrivateKey(), publicRpcUrl: rpc });
    expect(wallet.mode).toBe("kernel");
    const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
    const code = await client.getCode({ address: wallet.address });
    const deployed = !!code && code !== "0x";
    console.log(`[net] Kernel ${wallet.address} · desplegada=${deployed} · chainId=${await client.getChainId()}`);
    expect(deployed).toBe(false);

    const faceBindingHash = keccak256(stringToBytes(`net-test|${Date.now()}`));
    const { message, signature } = await wallet.signFaceBinding({ electionId: "el_net_test", voterId: "vt_net_test", faceBindingHash });
    const is6492 = signature.toLowerCase().endsWith(ERC6492_MAGIC);
    console.log(`[net] firma ${signature.length / 2 - 1} bytes · envoltura ERC-6492=${is6492}`);
    expect(is6492).toBe(true);

    const ok = await verifyFaceBinding("kernel", message, signature);
    console.log(`[net] verifyFaceBinding(kernel) servidor → ${ok}`);
    expect(ok).toBe(true);

    const tampered = await verifyFaceBinding("kernel", { ...message, voterId: "vt_otro" }, signature);
    console.log(`[net] mensaje alterado (voterId) → ${tampered}`);
    expect(tampered).toBe(false);

    const otherWallet = await verifyFaceBinding("kernel", { ...message, wallet: "0x000000000000000000000000000000000000dEaD" }, signature as Hex);
    console.log(`[net] otra wallet → ${otherWallet}`);
    expect(otherWallet).toBe(false);
  });
});
