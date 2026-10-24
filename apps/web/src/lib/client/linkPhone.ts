/**
 * "Vincular este teléfono": todo lo que antes eran las pantallas Wallet y Credencial, ahora en segundo plano y sin
 * pedir nada al votante. Mismo protocolo y mismos endpoints (contrato v1):
 *  1. wallet del votante (Kernel gasless con NEXT_PUBLIC_ZERODEV_PROJECT_ID; si no, `eoa-demo`, etiquetada demo);
 *  2. firma EIP-712 `FaceBinding` (rostro ↔ wallet) → `POST /api/voters/:id/wallet` (el servidor la verifica);
 *  3. identidad Semaphore generada en el navegador, cifrada con la clave del dispositivo (identityVault v3);
 *  4. `POST /api/voters/:id/identity { commitment }` (al servidor sólo va el commitment).
 * Nada se envía on-chain (C2).
 */
import type { Address, Hex } from "viem";
import type { WalletMode } from "@quorum/wallet";
import { apiV1 } from "./apiV1";
import { clientLog, shortError } from "./clientLog";
import { markRegistered, peekIdentity, sealIdentity, type VaultInfo, type WalletUnlock } from "./identityVault";
import { createBrowserIdentity } from "./zk";

// Next sólo inyecta variables NEXT_PUBLIC_* referenciadas literalmente.
const ZERODEV_PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID?.trim() || null;

export type LinkProgress = { step: 1 | 2 | 3 | 4; of: 4 };
export type LinkResult = { address: Address; mode: WalletMode; commitment: string; registeredCount: number; fellBack: boolean; persisted: boolean };

async function loadWallet() {
  const { getOrCreateWallet } = await import("@quorum/wallet");
  let fellBack = false;
  const wallet = await getOrCreateWallet({
    projectId: ZERODEV_PROJECT_ID,
    onFallback: (e) => {
      fellBack = true;
      console.warn("[vincular] Kernel no disponible, se usa eoa-demo:", e instanceof Error ? e.message : String(e));
    },
  });
  return { wallet, fellBack };
}

export async function linkThisPhone(args: {
  electionId: string;
  voterId: string;
  inviteToken: string;
  faceBindingHash: Hex;
  linkedAddress: string | null;
  onProgress?: (p: LinkProgress) => void;
}): Promise<LinkResult> {
  const { electionId, voterId, inviteToken, faceBindingHash, linkedAddress, onProgress } = args;
  // Diagnóstico (sin datos personales): etapa + ms desde el inicio, para ver dónde se traba en teléfonos reales.
  const t0 = Date.now();
  let stage = "link:start";
  const log = (s: string, extra: Record<string, string | number | boolean | undefined> = {}) => {
    stage = s;
    clientLog(s, { ms: Date.now() - t0, ...extra });
  };
  try {
    log("link:start");
    onProgress?.({ step: 1, of: 4 });
    const { wallet, fellBack } = await loadWallet();
    const { signature } = await wallet.signFaceBinding({ electionId, voterId, faceBindingHash });
    log("link:wallet", { kind: wallet.mode, source: fellBack ? "fallback" : "primary" });

    onProgress?.({ step: 2, of: 4 });
    const alreadyLinked = Boolean(linkedAddress && linkedAddress.toLowerCase() === wallet.address.toLowerCase());
    if (!alreadyLinked) await apiV1.linkWallet(voterId, { inviteToken, walletAddress: wallet.address, kind: wallet.mode, bindingSignature: signature });
    log("link:binding", { got: alreadyLinked });

    onProgress?.({ step: 3, of: 4 });
    const existing = peekIdentity(electionId);
    let commitment = existing && existing.voterId === voterId && existing.v === 3 ? existing.commitment : null;
    if (!commitment) {
      const id = await createBrowserIdentity();
      await sealIdentity(electionId, { voterId, faceBindingHash, address: wallet.address, walletMode: wallet.mode }, id);
      commitment = id.commitment;
    }
    log("link:identity");

    onProgress?.({ step: 4, of: 4 });
    const res = await apiV1.registerIdentity(voterId, { inviteToken, commitment });
    if (!res.ok) throw new Error("El servidor no aceptó la inscripción.");
    markRegistered(electionId, commitment);
    log("link:done");
    return { address: wallet.address, mode: wallet.mode, commitment, registeredCount: res.registeredCount, fellBack, persisted: wallet.persisted };
  } catch (e) {
    // `step` = última etapa completada; `error` = mensaje corto sin direcciones ni tokens.
    clientLog("link:error", { ms: Date.now() - t0, step: stage, error: shortError(e) });
    throw e;
  }
}

/** Abre una inscripción v2 (legado) volviendo a firmar FaceBinding con la wallet de este navegador, sin interacción. */
export async function legacyUnlock(info: VaultInfo, electionId: string): Promise<WalletUnlock> {
  const { wallet } = await loadWallet();
  const { signature } = await wallet.signFaceBinding({ electionId, voterId: info.voterId, faceBindingHash: info.faceBindingHash });
  return { address: wallet.address, signature };
}
