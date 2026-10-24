import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { BASE_SEPOLIA_CHAIN_ID, chain } from "./chain";
import { registryAbi, registryBytecode } from "./registry-artifact";

export type DeployEnv = { ORGANIZER_PRIVATE_KEY?: string; BASE_SEPOLIA_RPC?: string };

export type DeployCheck =
  | { ok: true; privateKey: Hex; rpcUrl: string }
  | { ok: false; message: string };

/** Valida el entorno del deploy SIN tocar la red. Nunca imprime la clave. */
export function checkDeployEnv(env: DeployEnv): DeployCheck {
  const pk = env.ORGANIZER_PRIVATE_KEY?.trim();
  const rpcUrl = env.BASE_SEPOLIA_RPC?.trim();
  if (!pk)
    return {
      ok: false,
      message:
        "Falta ORGANIZER_PRIVATE_KEY. Defínela en tu .env local (nunca en git) con una clave de testnet que tenga ETH de Base Sepolia (ver docs/WALLETS.md, faucet). No se desplegó nada.",
    };
  if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) return { ok: false, message: "ORGANIZER_PRIVATE_KEY debe ser hex de 32 bytes con prefijo 0x. No se desplegó nada." };
  if (!rpcUrl) return { ok: false, message: "Falta BASE_SEPOLIA_RPC (p. ej. https://sepolia.base.org o un RPC de Alchemy). No se desplegó nada." };
  return { ok: true, privateKey: pk as Hex, rpcUrl };
}

/** Despliega QuorumRegistry en Base Sepolia. Gasta ETH de testnet de la clave del organizador. */
export async function deployRegistry(privateKey: Hex, rpcUrl: string): Promise<{ address: Address; txHash: Hex; organizer: Address }> {
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const remoteChainId = await publicClient.getChainId();
  if (remoteChainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error(`El RPC apunta a chainId ${remoteChainId}; se esperaba Base Sepolia (${BASE_SEPOLIA_CHAIN_ID}).`);
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const txHash = await walletClient.deployContract({ abi: registryAbi, bytecode: registryBytecode, args: [] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (!receipt.contractAddress || receipt.status !== "success") throw new Error(`Deploy fallido (tx ${txHash})`);
  return { address: receipt.contractAddress, txHash, organizer: account.address };
}
