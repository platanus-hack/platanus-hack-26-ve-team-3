/**
 * Bóveda local de la credencial Semaphore del votante (contrato v1: "guardada en localStorage cifrada con la wallet").
 *
 * - La clave privada Semaphore se cifra con AES-GCM (WebCrypto). La clave AES = SHA-256("quorum:vault:v1" ‖ elección ‖
 *   firma FaceBinding de la wallet). Esa firma es determinista (ECDSA RFC 6979), así que el `WalletStep` vuelve a
 *   producirla al votar con el `faceBindingHash` guardado aquí; otra wallet no puede.
 * - Límite honesto: el servidor también recibe esa firma (para enlazar la wallet). El cifrado protege la credencial
 *   frente a quien lea el almacenamiento de este navegador sin la wallet; el texto cifrado nunca sale del dispositivo.
 * - Al servidor sólo viaja el `commitment` (público). La clave privada Semaphore nunca sale de este dispositivo.
 * - Si se borran los datos del navegador o se pierde la wallet demo, la credencial se pierde.
 */
import type { Hex } from "viem";

export type WalletUnlock = { address: string; signature: Hex };
type VaultRecord = { v: 2; address: string; voterId: string; faceBindingHash: Hex; commitment: string; iv: string; ct: string; createdAt: string };
export type VaultInfo = Pick<VaultRecord, "address" | "voterId" | "faceBindingHash" | "commitment" | "createdAt">;
export type StoredReceipt = { inclusionId: string; nullifier: string; index?: number; savedAt: string };

const identityKey = (electionId: string) => `quorum.identity.${electionId}`;
const receiptKey = (electionId: string) => `quorum.receipt.${electionId}`;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

async function deriveKey(electionId: string, unlock: WalletUnlock): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`quorum:vault:v1|${electionId}|${unlock.signature.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealIdentity(
  electionId: string,
  meta: { voterId: string; faceBindingHash: Hex },
  unlock: WalletUnlock,
  identity: { privateKey: string; commitment: string },
): Promise<void> {
  const key = await deriveKey(electionId, unlock);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(identity.privateKey)));
  const rec: VaultRecord = { v: 2, address: unlock.address.toLowerCase(), voterId: meta.voterId, faceBindingHash: meta.faceBindingHash, commitment: identity.commitment, iv: b64(iv), ct: b64(ct), createdAt: new Date().toISOString() };
  const s = storage();
  if (!s) throw new Error("Este navegador no permite guardar la credencial (almacenamiento bloqueado). Sin ella no podrás votar desde aquí.");
  s.setItem(identityKey(electionId), JSON.stringify(rec));
}

/** Lo público de la bóveda (sin abrirla). */
export function peekIdentity(electionId: string): VaultInfo | null {
  const raw = storage()?.getItem(identityKey(electionId));
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as VaultRecord;
    return rec.v === 2 ? { address: rec.address, voterId: rec.voterId, faceBindingHash: rec.faceBindingHash, commitment: rec.commitment, createdAt: rec.createdAt } : null;
  } catch {
    return null;
  }
}

export async function openIdentity(electionId: string, unlock: WalletUnlock): Promise<{ privateKey: string; commitment: string }> {
  const raw = storage()?.getItem(identityKey(electionId));
  if (!raw) throw new Error("No hay credencial guardada en este navegador para esta votación. Debes votar desde el dispositivo donde te inscribiste.");
  const rec = JSON.parse(raw) as VaultRecord;
  if (rec.address !== unlock.address.toLowerCase()) throw new Error("La credencial de este navegador se cifró con otra wallet.");
  const key = await deriveKey(electionId, unlock);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, key, unb64(rec.ct));
    return { privateKey: new TextDecoder().decode(pt), commitment: rec.commitment };
  } catch {
    throw new Error("No se pudo abrir la credencial con esta wallet (firma distinta o datos dañados).");
  }
}

export function saveReceipt(electionId: string, r: Omit<StoredReceipt, "savedAt">) {
  storage()?.setItem(receiptKey(electionId), JSON.stringify({ ...r, savedAt: new Date().toISOString() }));
}

export function loadReceipt(electionId: string): StoredReceipt | null {
  const raw = storage()?.getItem(receiptKey(electionId));
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as StoredReceipt;
    return typeof r.nullifier === "string" ? r : null;
  } catch {
    return null;
  }
}
