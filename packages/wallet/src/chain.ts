import { baseSepolia } from "viem/chains";

/** Base Sepolia (testnet de Base). Fuente: https://docs.base.org/chain/network-information (consultado 2026-10-24). */
export const BASE_SEPOLIA_CHAIN_ID = 84532 as const;
export const chain = baseSepolia;
/** RPC público de Base Sepolia (con límites de tasa). Para producción usar uno propio vía opción `publicRpcUrl`. */
export const DEFAULT_BASE_SEPOLIA_RPC = "https://sepolia.base.org";

export type WalletMode = "kernel" | "eoa-demo";

/**
 * C2: el envío on-chain de `cast` desde la wallet del votante permite asociar wallet ↔ boleta
 * (momento de la tx + orden del ledger). Desactivado por defecto: solo se habilita con el valor
 * literal "true" (p. ej. `process.env.NEXT_PUBLIC_QUORUM_ONCHAIN_CAST`). Ver docs/WALLETS.md.
 */
export function onchainCastEnabled(flag: string | boolean | null | undefined): boolean {
  return flag === true || (typeof flag === "string" && flag.trim().toLowerCase() === "true");
}

/** Endpoint bundler+paymaster de ZeroDev v3 para Base Sepolia (https://docs.zerodev.app, formato verificado en el dashboard). */
export function zerodevRpcUrl(projectId: string, chainId: number = BASE_SEPOLIA_CHAIN_ID): string {
  const id = projectId.trim();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) throw new Error("NEXT_PUBLIC_ZERODEV_PROJECT_ID con formato inválido");
  return `https://rpc.zerodev.app/api/v3/${id}/chain/${chainId}`;
}

/** `kernel` si hay project id de ZeroDev; si no, `eoa-demo` (clave efímera, etiquetada demo). */
export function resolveWalletMode(projectId: string | null | undefined): WalletMode {
  return projectId && projectId.trim() ? "kernel" : "eoa-demo";
}

export const MODE_LABEL: Record<WalletMode, string> = {
  kernel: "Smart wallet Kernel (ZeroDev) · demo: clave guardada solo en este navegador · Base Sepolia · sin gas",
  "eoa-demo": "Wallet demo (clave guardada solo en este navegador, sin smart wallet)",
};
