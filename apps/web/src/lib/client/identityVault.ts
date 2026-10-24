/**
 * Bóveda local de la credencial Semaphore del votante.
 *
 * v3 (flujo simple): la clave privada Semaphore se cifra con AES-GCM (WebCrypto) usando una clave **no extraíble**
 * generada en este navegador y guardada en IndexedDB (`quorum-device` / `keys`). Así la boleta se abre sin pedir nada
 * al votante (no hay que volver a firmar con la wallet al votar).
 * - Ligada al dispositivo/navegador: JavaScript puede USAR la clave para descifrar, pero no exportarla. Si se borran los
 *   datos del sitio o se cambia de navegador, la credencial se pierde (igual que antes).
 * - Límite honesto: protege la credencial frente a quien copie el almacenamiento (localStorage) a otro equipo; no protege
 *   frente a código malicioso que corra en esta misma página (XSS), que podría usar la clave sin exportarla.
 * - Al servidor sólo viaja el `commitment` (público). La clave privada Semaphore nunca sale de este dispositivo.
 * - La firma `FaceBinding` de la wallet sigue existiendo (enlaza rostro ↔ wallet en el servidor), pero ya no es la clave
 *   de la bóveda. Los registros v2 (cifrados con una clave derivada de esa firma) se siguen abriendo: la wallet vuelve a
 *   firmar en segundo plano, sin interacción (`legacyUnlock`).
 */
import type { Hex } from "viem";
import type { WalletMode } from "@quorum/wallet";

export type WalletUnlock = { address: string; signature: Hex };

type VaultRecordV2 = { v: 2; address: string; voterId: string; faceBindingHash: Hex; commitment: string; iv: string; ct: string; createdAt: string };
type VaultRecordV3 = { v: 3; address: string; walletMode: WalletMode; voterId: string; faceBindingHash: Hex; commitment: string; iv: string; ct: string; createdAt: string };
type VaultRecord = VaultRecordV2 | VaultRecordV3;

export type VaultInfo = { v: 2 | 3; address: string; walletMode: WalletMode | null; voterId: string; faceBindingHash: Hex; commitment: string; createdAt: string };
export type StoredReceipt = { inclusionId: string; nullifier: string; index?: number; hash?: string; state?: "recibido" | "incluido"; savedAt: string };

const identityKey = (electionId: string) => `quorum.identity.${electionId}`;
const receiptKey = (electionId: string) => `quorum.receipt.${electionId}`;
const deviceKeyId = (electionId: string) => `vault:${electionId}`;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/* ---------- Almacén de claves del dispositivo (IndexedDB; inyectable en tests) ---------- */

export type DeviceKeyStore = { get(id: string): Promise<CryptoKey | null>; put(id: string, key: CryptoKey): Promise<void> };

const DB_NAME = "quorum-device";
const DB_STORE = "keys";

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB"));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Este navegador no permite guardar datos en el teléfono (IndexedDB no disponible)."));
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE);
  };
  return idbRequest(req);
}

export const indexedDbKeyStore: DeviceKeyStore = {
  async get(id) {
    const db = await openDb();
    try {
      const v = await idbRequest(db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(id));
      return (v as CryptoKey | undefined) ?? null;
    } finally {
      db.close();
    }
  },
  async put(id, key) {
    const db = await openDb();
    try {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(key, id);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB"));
        tx.onabort = () => reject(tx.error ?? new Error("IndexedDB"));
      });
    } finally {
      db.close();
    }
  },
};

/** Para tests (jsdom no trae IndexedDB): almacén en memoria con la misma semántica (CryptoKey no extraíble). */
export function memoryKeyStore(): DeviceKeyStore {
  const m = new Map<string, CryptoKey>();
  return { get: async (id) => m.get(id) ?? null, put: async (id, k) => void m.set(id, k) };
}

let keyStore: DeviceKeyStore = indexedDbKeyStore;
export function setDeviceKeyStore(s: DeviceKeyStore) {
  keyStore = s;
}

async function newDeviceKey(): Promise<CryptoKey> {
  // extractable = false: la clave se puede usar, nunca leer ni exportar.
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/* ---------- v2 (legado): clave derivada de la firma FaceBinding ---------- */

async function deriveLegacyKey(electionId: string, unlock: WalletUnlock): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`quorum:vault:v1|${electionId}|${unlock.signature.toLowerCase()}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/* ---------- API ---------- */

/** Cifra y guarda la credencial con la clave del dispositivo. No pide nada al votante. */
export async function sealIdentity(
  electionId: string,
  meta: { voterId: string; faceBindingHash: Hex; address: string; walletMode: WalletMode },
  identity: { privateKey: string; commitment: string },
): Promise<void> {
  const s = storage();
  if (!s) throw new Error("Este navegador no permite guardar datos en el teléfono. Sal del modo privado e inténtalo de nuevo.");
  const key = await newDeviceKey();
  await keyStore.put(deviceKeyId(electionId), key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(identity.privateKey)));
  const rec: VaultRecordV3 = {
    v: 3,
    address: meta.address.toLowerCase(),
    walletMode: meta.walletMode,
    voterId: meta.voterId,
    faceBindingHash: meta.faceBindingHash,
    commitment: identity.commitment,
    iv: b64(iv),
    ct: b64(ct),
    createdAt: new Date().toISOString(),
  };
  s.setItem(identityKey(electionId), JSON.stringify(rec));
}

function readRecord(electionId: string): VaultRecord | null {
  const raw = storage()?.getItem(identityKey(electionId));
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as VaultRecord;
    return rec.v === 2 || rec.v === 3 ? rec : null;
  } catch {
    return null;
  }
}

/** Lo público de la bóveda (sin abrirla). */
export function peekIdentity(electionId: string): VaultInfo | null {
  const rec = readRecord(electionId);
  if (!rec) return null;
  return { v: rec.v, address: rec.address, walletMode: rec.v === 3 ? rec.walletMode : null, voterId: rec.voterId, faceBindingHash: rec.faceBindingHash, commitment: rec.commitment, createdAt: rec.createdAt };
}

/**
 * Abre la credencial SIN interacción: v3 con la clave del dispositivo; v2 (legado) con `legacyUnlock`, que vuelve a
 * firmar `FaceBinding` con la wallet de este navegador en segundo plano.
 */
export async function openIdentity(electionId: string, opts: { legacyUnlock?: (info: VaultInfo) => Promise<WalletUnlock> } = {}): Promise<{ privateKey: string; commitment: string }> {
  const rec = readRecord(electionId);
  if (!rec) throw new Error("Este teléfono no está vinculado a esta votación. Debes votar desde el teléfono donde te inscribiste.");
  let key: CryptoKey | null;
  if (rec.v === 3) {
    key = await keyStore.get(deviceKeyId(electionId));
    if (!key) throw new Error("Este navegador perdió la clave de vinculación (¿se borraron los datos del sitio?). No se puede votar desde aquí.");
  } else {
    if (!opts.legacyUnlock) throw new Error("Esta inscripción es de una versión anterior y necesita la clave guardada en este navegador.");
    const unlock = await opts.legacyUnlock(peekIdentity(electionId)!);
    if (rec.address !== unlock.address.toLowerCase()) throw new Error("La inscripción de este navegador se hizo con otra clave.");
    key = await deriveLegacyKey(electionId, unlock);
  }
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(rec.iv) }, key, unb64(rec.ct));
    return { privateKey: new TextDecoder().decode(pt), commitment: rec.commitment };
  } catch {
    throw new Error("No se pudo abrir la inscripción guardada en este teléfono (datos dañados o de otro navegador).");
  }
}

/** Sólo para pruebas del legado v2: guarda un registro cifrado con la firma de la wallet, como hacía la versión anterior. */
export async function sealIdentityLegacyV2(electionId: string, meta: { voterId: string; faceBindingHash: Hex }, unlock: WalletUnlock, identity: { privateKey: string; commitment: string }) {
  const key = await deriveLegacyKey(electionId, unlock);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(identity.privateKey)));
  const rec: VaultRecordV2 = { v: 2, address: unlock.address.toLowerCase(), voterId: meta.voterId, faceBindingHash: meta.faceBindingHash, commitment: identity.commitment, iv: b64(iv), ct: b64(ct), createdAt: new Date().toISOString() };
  storage()?.setItem(identityKey(electionId), JSON.stringify(rec));
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

/* ---------- Rostro comprobado pero teléfono aún sin vincular (sobrevive a una recarga) ---------- */

const faceKey = (voterId: string) => `quorum.face.${voterId}`;

export function savePendingFace(voterId: string, faceBindingHash: Hex) {
  try {
    storage()?.setItem(faceKey(voterId), faceBindingHash);
  } catch {
    /* sin almacenamiento: se vincula en esta misma carga */
  }
}

export function loadPendingFace(voterId: string): Hex | null {
  const v = storage()?.getItem(faceKey(voterId)) ?? null;
  return v && /^0x[0-9a-f]{64}$/i.test(v) ? (v as Hex) : null;
}

/* ---------- Inscripción completa (commitment aceptado por el servidor) ---------- */

const registeredKey = (electionId: string) => `quorum.registered.${electionId}`;

export function markRegistered(electionId: string, commitment: string) {
  try {
    storage()?.setItem(registeredKey(electionId), commitment);
  } catch {
    /* ignorar */
  }
}

/** ¿Este teléfono terminó la inscripción? Los registros v2 (versión anterior) sólo existían tras inscribirse. */
export function isRegistered(electionId: string): boolean {
  const info = peekIdentity(electionId);
  if (!info) return false;
  if (info.v === 2) return true;
  return storage()?.getItem(registeredKey(electionId)) === info.commitment;
}

export function clearPendingFace(voterId: string) {
  try {
    storage()?.removeItem(`quorum.face.${voterId}`);
  } catch {
    /* ignorar */
  }
}
