/**
 * Wallet demo local (sin Privy): clave efímera de viem guardada en sessionStorage.
 * Se usa cuando no existe NEXT_PUBLIC_PRIVY_APP_ID. Etiquetar siempre "Wallet demo local (sin Privy)".
 * La clave nunca sale del navegador ni se envía al servidor.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { typedDataFor, type VoteSigner } from "./vote";

const KEY = "quorum.demoWallet.pk";

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || null;
export const walletMode: "privy" | "demo-local" = privyAppId ? "privy" : "demo-local";

export function getOrCreateDemoSigner(): VoteSigner {
  let pk: Hex | null = null;
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored && /^0x[0-9a-fA-F]{64}$/.test(stored)) pk = stored as Hex;
  } catch {
    /* sessionStorage no disponible (modo privado): seguimos con clave en memoria */
  }
  if (!pk) {
    pk = generatePrivateKey();
    try {
      sessionStorage.setItem(KEY, pk);
    } catch {
      /* ignorar */
    }
  }
  const account = privateKeyToAccount(pk);
  return {
    address: account.address,
    kind: "demo-local",
    label: "Wallet demo local (sin Privy)",
    signTypedData: (message) => account.signTypedData(typedDataFor(message)),
  };
}

export function forgetDemoSigner() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignorar */
  }
}
