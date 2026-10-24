/**
 * Store de Quórum: elecciones, votantes, estado del motor (padrón + ledger Semaphore), nonces y plantillas faciales.
 *
 * Invariantes de privacidad (spec maestra, regla dura 3):
 *  - Las boletas viven SOLO en `EngineState.ledger` (pruebas Semaphore): nunca `voterId`, wallet ni teléfono.
 *  - `EngineState.roll` liga voterId → commitment solo durante `registration`; `POST /open` congela la lista
 *    de commitments (sin ids) y vacía `roll`. El commitment no permite ligar una boleta (nullifier) a nadie.
 *  - `Voter` guarda solo `votedAt` (el hecho de haber votado, autodeclarado; nunca qué).
 *  - `FaceTemplate` guarda el descriptor cifrado (AES-256-GCM), nunca imágenes.
 *
 * Implementaciones: `MemoryStore` (tests) y `JsonFileStore` (un JSON por colección bajo `DATA_DIR`).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AuditResult, Election, Voter } from "@quorum/contracts";
import type { ElectionManifest, Ledger, Tally } from "@quorum/protocol-adapter";
import { env } from "./env";
import type { SealedBlob } from "./crypto";

/** Estado del motor `semaphore-ledger` por elección. */
export interface EngineState {
  electionId: string;
  /** Manifiesto fijado en `publish` (su hash es `Election.manifestHash`). */
  manifest: ElectionManifest;
  /** Solo durante `registration`: orden de inscripción. Se vacía al abrir. */
  roll: { voterId: string; commitment: string }[];
  /** Padrón congelado en `open` (orden = orden de inscripción). Sin ids. */
  commitments: string[];
  ledger: Ledger | null;
  /** Por nullifier: hora de inclusión y, si el cliente lo declaró, tx on-chain. Nunca la opción ni el votante. */
  receipts: Record<string, { includedAt: string; txHash?: string; onchainStatus?: "verificado" | "no verificable" | "fallo detectado" }>;
  tally: Tally | null;
  /** Bytes exactos del paquete de auditoría publicado (JSON canónico) y su sha256. */
  packageJson: string | null;
  packageDigest: string | null;
  auditResult: AuditResult | null;
  anchorStatus: { mode: "disabled" | "anchored" | "error"; reason: string } | null;
  /**
   * Política del censo fijada al congelar el padrón (`open`). Solo existe si hubo sala abierta: se publica en el
   * paquete de auditoría para declarar honestamente que la elegibilidad dependió de la deduplicación facial demo.
   */
  rollPolicy?: RollPolicy | null;
}

/** Declaración del censo abierto en sala (va al paquete de auditoría; sin ids ni alias). */
export type RollPolicy = OpenRoomRollPolicy | EventBadgeRollPolicy;

export interface OpenRoomRollPolicy {
  kind: "open-room";
  /** Tope de asientos de la última sala abierta. */
  maxSeats: number;
  /** Votantes creados por sala (asientos ocupados). */
  joined: number;
  /** De ellos, cuántos llegaron al padrón congelado (identidad Semaphore inscrita). */
  enrolled: number;
  eligibility: "face-dedupe-demo";
}

/** D-19: sala con credencial del evento (QR) + rostro obligatorio. Sin usuarios ni HMAC: solo conteos y el método. */
export interface EventBadgeRollPolicy {
  kind: "event-badge";
  maxSeats: number;
  /** Cómo se comprobó que la credencial existe. */
  check: "list" | "live" | "none";
  /** El rostro (dedupe 1:N) es obligatorio siempre. */
  face: "full";
  joined: number;
  enrolled: number;
  eligibility: "badge-once+face-dedupe-demo";
}

/**
 * D-19: credencial ya usada en una elección. Solo el HMAC del usuario (clave del servidor), nunca el usuario en claro,
 * y SIN voterId: no liga la credencial a nadie del padrón ni, menos, a una opción.
 */
export interface BadgeUse {
  electionId: string;
  badgeHash: string;
  usedAt: string;
}

/** Sala abierta (asamblea abierta) de una elección en `registration`. Indexada por `code`. */
export interface Room {
  code: string;
  electionId: string;
  maxSeats: number;
  openedAt: string;
  expiresAt: string;
  closedAt: string | null;
  closedReason: "manual" | "election-opened" | null;
}

export interface VoteNonce {
  nonce: string; // bytes32 hex
  voterId: string;
  electionId: string;
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface FaceTemplate {
  voterId: string;
  electionId: string;
  dims: number;
  sealed: SealedBlob;
  createdAt: string;
}

export interface Store {
  // elections
  getElection(id: string): Promise<Election | null>;
  putElection(election: Election): Promise<void>;
  listElections(): Promise<Election[]>;
  // voters
  getVoter(id: string): Promise<Voter | null>;
  getVoterByToken(inviteToken: string): Promise<Voter | null>;
  getVoterByPhone(electionId: string, phoneE164: string): Promise<Voter | null>;
  listVoters(electionId: string): Promise<Voter[]>;
  putVoter(voter: Voter): Promise<void>;
  // motor (padrón + ledger)
  getEngine(electionId: string): Promise<EngineState | null>;
  putEngine(state: EngineState): Promise<void>;
  // nonces
  getNonce(nonce: string): Promise<VoteNonce | null>;
  putNonce(entry: VoteNonce): Promise<void>;
  // face templates
  getFaceTemplate(voterId: string): Promise<FaceTemplate | null>;
  putFaceTemplate(template: FaceTemplate): Promise<void>;
  listFaceTemplates(electionId: string): Promise<FaceTemplate[]>;
  /** A2: al congelar el padrón se borran todas las plantillas faciales de la elección. Devuelve cuántas. */
  deleteFaceTemplates(electionId: string): Promise<number>;
  // token del organizador (solo su sha256)
  getOrganizerTokenHash(electionId: string): Promise<string | null>;
  putOrganizerTokenHash(electionId: string, tokenHash: string): Promise<void>;
  // salas abiertas
  getRoom(code: string): Promise<Room | null>;
  /** La sala más reciente de la elección (abierta o no). */
  getLatestRoom(electionId: string): Promise<Room | null>;
  putRoom(room: Room): Promise<void>;
  // credencial del evento (D-19): usos y lista permitida, solo HMAC
  getBadgeUse(electionId: string, badgeHash: string): Promise<BadgeUse | null>;
  putBadgeUse(use: BadgeUse): Promise<void>;
  getBadgeAllowlist(electionId: string): Promise<string[] | null>;
  putBadgeAllowlist(electionId: string, hashes: string[]): Promise<void>;
  /** Borra todo lo de una elección (script de demo `--reset`). */
  deleteElectionData(electionId: string): Promise<void>;
  /** Borra todo (tests). */
  clear(): Promise<void>;
}

type Collections = {
  elections: Map<string, Election>;
  voters: Map<string, Voter>;
  engine: Map<string, EngineState>; // key electionId
  nonces: Map<string, VoteNonce>;
  faceTemplates: Map<string, FaceTemplate>; // key voterId
  organizerTokens: Map<string, { tokenHash: string }>; // key electionId
  rooms: Map<string, Room>; // key code
  badgeUses: Map<string, BadgeUse>; // key `${electionId}:${badgeHash}`
  badgeAllowlists: Map<string, { hashes: string[] }>; // key electionId
};

type CollectionName = keyof Collections;

export class MemoryStore implements Store {
  protected readonly data: Collections = {
    elections: new Map(),
    voters: new Map(),
    engine: new Map(),
    nonces: new Map(),
    faceTemplates: new Map(),
    organizerTokens: new Map(),
    rooms: new Map(),
    badgeUses: new Map(),
    badgeAllowlists: new Map(),
  };

  /** Hook para persistir una colección tras una mutación (no-op en memoria). */
  protected async persist(_name: CollectionName): Promise<void> {
    void _name;
  }

  async getElection(id: string) {
    return this.data.elections.get(id) ?? null;
  }
  async putElection(election: Election) {
    this.data.elections.set(election.id, structuredClone(election));
    await this.persist("elections");
  }
  async listElections() {
    return [...this.data.elections.values()].map((e) => structuredClone(e));
  }

  async getVoter(id: string) {
    const v = this.data.voters.get(id);
    return v ? structuredClone(v) : null;
  }
  async getVoterByToken(inviteToken: string) {
    for (const v of this.data.voters.values()) if (v.inviteToken === inviteToken) return structuredClone(v);
    return null;
  }
  async getVoterByPhone(electionId: string, phoneE164: string) {
    for (const v of this.data.voters.values()) {
      if (v.electionId === electionId && v.phoneE164 === phoneE164) return structuredClone(v);
    }
    return null;
  }
  async listVoters(electionId: string) {
    return [...this.data.voters.values()].filter((v) => v.electionId === electionId).map((v) => structuredClone(v));
  }
  async putVoter(voter: Voter) {
    this.data.voters.set(voter.id, structuredClone(voter));
    await this.persist("voters");
  }

  async getEngine(electionId: string) {
    const s = this.data.engine.get(electionId);
    return s ? structuredClone(s) : null;
  }
  async putEngine(state: EngineState) {
    this.data.engine.set(state.electionId, structuredClone(state));
    await this.persist("engine");
  }

  async getNonce(nonce: string) {
    const n = this.data.nonces.get(nonce.toLowerCase());
    return n ? structuredClone(n) : null;
  }
  async putNonce(entry: VoteNonce) {
    this.data.nonces.set(entry.nonce.toLowerCase(), structuredClone(entry));
    await this.persist("nonces");
  }

  async getFaceTemplate(voterId: string) {
    const t = this.data.faceTemplates.get(voterId);
    return t ? structuredClone(t) : null;
  }
  async putFaceTemplate(template: FaceTemplate) {
    this.data.faceTemplates.set(template.voterId, structuredClone(template));
    await this.persist("faceTemplates");
  }
  async deleteFaceTemplates(electionId: string) {
    let n = 0;
    for (const [k, t] of this.data.faceTemplates) {
      if (t.electionId === electionId) {
        this.data.faceTemplates.delete(k);
        n += 1;
      }
    }
    await this.persist("faceTemplates");
    return n;
  }
  async getOrganizerTokenHash(electionId: string) {
    return this.data.organizerTokens.get(electionId)?.tokenHash ?? null;
  }
  async putOrganizerTokenHash(electionId: string, tokenHash: string) {
    this.data.organizerTokens.set(electionId, { tokenHash });
    await this.persist("organizerTokens");
  }
  async listFaceTemplates(electionId: string) {
    return [...this.data.faceTemplates.values()].filter((t) => t.electionId === electionId).map((t) => structuredClone(t));
  }

  async getRoom(code: string) {
    const r = this.data.rooms.get(code);
    return r ? structuredClone(r) : null;
  }
  async getLatestRoom(electionId: string) {
    let latest: Room | null = null;
    for (const r of this.data.rooms.values()) {
      if (r.electionId === electionId && (!latest || r.openedAt >= latest.openedAt)) latest = r;
    }
    return latest ? structuredClone(latest) : null;
  }
  async putRoom(room: Room) {
    this.data.rooms.set(room.code, structuredClone(room));
    await this.persist("rooms");
  }

  async getBadgeUse(electionId: string, badgeHash: string) {
    const u = this.data.badgeUses.get(`${electionId}:${badgeHash}`);
    return u ? structuredClone(u) : null;
  }
  async putBadgeUse(use: BadgeUse) {
    this.data.badgeUses.set(`${use.electionId}:${use.badgeHash}`, structuredClone(use));
    await this.persist("badgeUses");
  }
  async getBadgeAllowlist(electionId: string) {
    const a = this.data.badgeAllowlists.get(electionId);
    return a ? [...a.hashes] : null;
  }
  async putBadgeAllowlist(electionId: string, hashes: string[]) {
    this.data.badgeAllowlists.set(electionId, { hashes: [...hashes] });
    await this.persist("badgeAllowlists");
  }

  async deleteElectionData(electionId: string) {
    this.data.elections.delete(electionId);
    this.data.engine.delete(electionId);
    this.data.organizerTokens.delete(electionId);
    for (const [k, v] of this.data.voters) if (v.electionId === electionId) this.data.voters.delete(k);
    for (const [k, v] of this.data.faceTemplates) if (v.electionId === electionId) this.data.faceTemplates.delete(k);
    for (const [k, v] of this.data.nonces) if (v.electionId === electionId) this.data.nonces.delete(k);
    for (const [k, v] of this.data.rooms) if (v.electionId === electionId) this.data.rooms.delete(k);
    for (const [k, v] of this.data.badgeUses) if (v.electionId === electionId) this.data.badgeUses.delete(k);
    this.data.badgeAllowlists.delete(electionId);
    for (const name of Object.keys(this.data) as CollectionName[]) await this.persist(name);
  }

  async clear() {
    for (const name of Object.keys(this.data) as CollectionName[]) {
      this.data[name].clear();
      await this.persist(name);
    }
  }
}

/**
 * Persistencia simple: `DATA_DIR/<colección>.json`, escritura atómica (tmp + rename) y cola
 * por colección para no intercalar escrituras. Suficiente para la demo; no es multi-proceso.
 */
export class JsonFileStore extends MemoryStore {
  private loaded: Promise<void> | null = null;
  private queues = new Map<CollectionName, Promise<void>>();

  constructor(private readonly dir: string) {
    super();
  }

  async init(): Promise<void> {
    if (!this.loaded) this.loaded = this.load();
    await this.loaded;
  }

  private file(name: CollectionName) {
    return path.join(this.dir, `${name}.json`);
  }

  private async load() {
    await mkdir(this.dir, { recursive: true });
    for (const name of Object.keys(this.data) as CollectionName[]) {
      const f = this.file(name);
      if (!existsSync(f)) continue;
      try {
        const raw = JSON.parse(await readFile(f, "utf8")) as Record<string, unknown>;
        const map = this.data[name] as Map<string, unknown>;
        for (const [k, v] of Object.entries(raw)) map.set(k, v);
      } catch (err) {
        console.error(`[store] no se pudo leer ${f}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  protected override async persist(name: CollectionName): Promise<void> {
    const snapshot = JSON.stringify(Object.fromEntries(this.data[name]), null, 2);
    const prev = this.queues.get(name) ?? Promise.resolve();
    const next = prev.then(async () => {
      const f = this.file(name);
      const tmp = `${f}.${process.pid}.tmp`;
      await mkdir(this.dir, { recursive: true });
      await writeFile(tmp, snapshot, "utf8");
      await rename(tmp, f);
    });
    this.queues.set(name, next.catch(() => undefined));
    await next;
  }
}

// ---------------------------------------------------------------------------
// Singleton por proceso. `QUORUM_STORE=memory` → memoria (tests); si no, JSON en `DATA_DIR`.
// ---------------------------------------------------------------------------
const globalRef = globalThis as unknown as { __quorumStore?: Promise<Store> };

export function getStore(): Promise<Store> {
  if (!globalRef.__quorumStore) {
    globalRef.__quorumStore = (async () => {
      if (env.storeKind === "memory") return new MemoryStore();
      // turbopackIgnore: la ruta viene de env; no debe trazar todo el proyecto en el bundle.
      const store = new JsonFileStore(path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.dataDir));
      await store.init();
      return store;
    })();
  }
  return globalRef.__quorumStore;
}

/** Solo para tests: reemplaza el singleton. */
export function setStoreForTests(store: Store | null): void {
  globalRef.__quorumStore = store ? Promise.resolve(store) : undefined;
}
