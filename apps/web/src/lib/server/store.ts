/**
 * Store de Quórum: elecciones, votantes, boletas, nonces y plantillas faciales.
 *
 * Invariantes de privacidad (spec maestra, regla dura 3):
 *  - `Ballot` NUNCA contiene `voterId`, wallet ni teléfono. Solo `commitment`, `inclusionId` y,
 *    en modo `integrity-demo`, la opción en claro sin ningún vínculo con el elector.
 *  - `Voter` guarda solo `votedAt` (el hecho de haber votado, nunca qué).
 *  - `FaceTemplate` guarda el descriptor cifrado (AES-256-GCM), nunca imágenes.
 *
 * Implementaciones: `MemoryStore` (tests) y `JsonFileStore` (un JSON por colección bajo `DATA_DIR`).
 * Cuando ADR-001 fije el motor, las boletas pasarán por `packages/protocol-adapter`; este store
 * seguirá siendo el índice local de metadatos.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Election, Voter } from "@quorum/contracts";
import { env } from "./env";
import type { SealedBlob } from "./crypto";

export interface Ballot {
  inclusionId: string;
  electionId: string;
  /** `ballotCommitment` firmado (bytes32 hex). */
  commitment: string;
  /**
   * Solo en modo `integrity-demo`: opción en claro SIN vínculo con el votante.
   * Crypto lo reemplazará por el ciphertext/referencia del motor elegido (ADR-001).
   */
  choice?: string;
  receivedAt: string;
  includedAt: string | null;
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
  // ballots
  listBallots(electionId: string): Promise<Ballot[]>;
  getBallot(electionId: string, inclusionId: string): Promise<Ballot | null>;
  putBallot(ballot: Ballot): Promise<void>;
  // nonces
  getNonce(nonce: string): Promise<VoteNonce | null>;
  putNonce(entry: VoteNonce): Promise<void>;
  // face templates
  getFaceTemplate(voterId: string): Promise<FaceTemplate | null>;
  putFaceTemplate(template: FaceTemplate): Promise<void>;
  /** Borra todo (tests). */
  clear(): Promise<void>;
}

type Collections = {
  elections: Map<string, Election>;
  voters: Map<string, Voter>;
  ballots: Map<string, Ballot>; // key `${electionId}:${inclusionId}`
  nonces: Map<string, VoteNonce>;
  faceTemplates: Map<string, FaceTemplate>; // key voterId
};

type CollectionName = keyof Collections;

export class MemoryStore implements Store {
  protected readonly data: Collections = {
    elections: new Map(),
    voters: new Map(),
    ballots: new Map(),
    nonces: new Map(),
    faceTemplates: new Map(),
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

  async listBallots(electionId: string) {
    return [...this.data.ballots.values()].filter((b) => b.electionId === electionId).map((b) => structuredClone(b));
  }
  async getBallot(electionId: string, inclusionId: string) {
    const b = this.data.ballots.get(`${electionId}:${inclusionId}`);
    return b ? structuredClone(b) : null;
  }
  async putBallot(ballot: Ballot) {
    this.data.ballots.set(`${ballot.electionId}:${ballot.inclusionId}`, structuredClone(ballot));
    await this.persist("ballots");
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
