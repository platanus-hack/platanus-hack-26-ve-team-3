/**
 * Wallet `eoa-demo` del STUB local (etiquetado): cuenta viem con clave generada y guardada en este navegador.
 * No es smart wallet, no es gasless ni recuperable en otro dispositivo. La clave nunca sale del navegador.
 */
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { faceBindingTypedData } from "@/lib/client/faceBinding";

export const EOA_DEMO_LABEL = "Wallet demo local (eoa-demo, sin smart wallet)";
const storageKey = (electionId: string) => `quorum.eoaDemo.pk.${electionId}`;

export type EoaDemoWallet = {
  mode: "eoa-demo";
  address: Address;
  signFaceBinding: (input: { electionId: string; voterId: string; faceBindingHash: Hex }) => Promise<Hex>;
};

export function createEoaDemoWallet(electionId: string, pkOverride?: Hex): EoaDemoWallet {
  let pk = pkOverride ?? null;
  if (!pk) {
    try {
      const stored = localStorage.getItem(storageKey(electionId));
      if (stored && /^0x[0-9a-fA-F]{64}$/.test(stored)) pk = stored as Hex;
    } catch {
      /* sin almacenamiento */
    }
  }
  if (!pk) {
    pk = generatePrivateKey();
    try {
      localStorage.setItem(storageKey(electionId), pk);
    } catch {
      /* modo privado: la clave vive sólo en memoria */
    }
  }
  const account = privateKeyToAccount(pk);
  return {
    mode: "eoa-demo",
    address: account.address,
    signFaceBinding: (input) => account.signTypedData(faceBindingTypedData({ ...input, wallet: account.address }) as Parameters<typeof account.signTypedData>[0]),
  };
}
