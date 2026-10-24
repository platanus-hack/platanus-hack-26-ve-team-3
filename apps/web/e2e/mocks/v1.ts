import { readFileSync } from "node:fs";
import path from "node:path";
import type { BrowserContext, Page, Route } from "@playwright/test";
// Sólo el módulo del sorteo (el índice del adaptador usa `import.meta`, que el cargador CJS de Playwright no admite):
// es la MISMA función que usa el servidor y que la web llama en "Recomputar aquí".
import { drawWinners } from "../../../../packages/protocol-adapter/src/draw";

/**
 * MOCK del contrato v1 (docs/API_CONTRACT.md → "Contrato v1 — implementado") para E2E y capturas de la UI.
 * Todo es FIXTURE: votación ficticia, nombres ficticios. Lo que SÍ es real: la prueba Semaphore la genera el navegador
 * con los artefactos de /zk, y el verificador corre en el navegador sobre paquetes fixture con pruebas Groth16 reales.
 * No reemplaza los tests del backend ni el E2E real (`phase2.real.spec.ts`): las formas siguen `@quorum/contracts`
 * (las mismas que valida el cliente), así que un mock desalineado rompe el test.
 */
export type Phase = "draft" | "registration" | "open" | "closed" | "tallying" | "auditable" | "drawn" | "failed";

const FIXTURES = path.resolve(__dirname, "../../public/fixtures/protocol");
const validPkg = JSON.parse(readFileSync(path.join(FIXTURES, "valid.json"), "utf8")) as { commitments: string[]; finalHash: string; ledger: { proof: { nullifier: string } }[] };

export const E2E = {
  electionId: "e2e-samanes",
  token: "tok-e2e-ana",
  voterId: "v-ana",
  orgToken: "org-token-e2e-fixture-0001",
  title: "Condominio Los Samanes (ficticio): ¿cuántos proyectos vecinales financiamos?",
  options: ["1", "2", "3", "4", "5"].map((n) => ({ id: `opt-${n}`, label: n })),
  candidates: [
    { id: "p-biblioteca", label: "Biblioteca de intercambio", amount: 300 },
    { id: "p-cancha", label: "Reparación de la cancha", amount: 1500 },
    { id: "p-huerto", label: "Huerto comunitario", amount: 600 },
    { id: "p-luces", label: "Iluminación del estacionamiento", amount: 1200 },
    { id: "p-pintura", label: "Pintura de áreas comunes", amount: 900 },
  ],
  fixtureNullifier: validPkg.ledger[0].proof.nullifier,
  finalHash: validPkg.finalHash,
};

/** Resultado del verificador para el proyector (FIXTURE: forma de `GET /audit`, no una ejecución real). */
export function fixtureAudit(valid = true) {
  const names = ["package_schema", "manifest_hash", "group_root", "chain_integrity", "proofs_valid", "nullifiers_unique", "tally_matches", "anchor_matches"];
  return {
    auditResult: {
      electionId: E2E.electionId,
      verifierVersion: "fixture-0.0.0",
      protocol: "semaphore-ledger",
      inputArtifactDigest: `sha256:${"7e".repeat(32)}`,
      checkedAt: "2026-10-24T22:01:00.000Z",
      valid,
      checks: names.map((name) =>
        name === "anchor_matches"
          ? { name, passed: true, reason: "no evaluado: sin RPC", status: "not-evaluated" }
          : name === "tally_matches" && !valid
            ? { name, passed: false, reason: "el recuento publicado no coincide", status: "fail" }
            : { name, passed: true, status: "pass" },
      ),
      unsupportedGuarantees: ["censo-abierto-en-sala: la elegibilidad depende de la deduplicación facial demo"],
    },
    packageDigest: `sha256:${"7e".repeat(32)}`,
    anchorStatus: { mode: "disabled", reason: "ancla deshabilitada (fixture)" },
  };
}

export class MockV1 {
  phase: Phase;
  packageFile: "valid.json" | "tampered_total.json" = "valid.json";
  commitment: string | null = null;
  wallet: { walletAddress: string; kind: string; bindingSignature: string } | null = null;
  voteBodies: unknown[] = [];
  nullifier: string | null = null;
  votedMarked = false;
  authSeen: string[] = [];
  /** Sala abierta (docs/API_CONTRACT.md § "Sala abierta"). `null` = nunca se abrió. */
  room: { code: string; open: boolean; seatsTaken: number; maxSeats: number; expiresAt: string; closedReason: null | "manual" | "expired" | "election-opened" | "election-closed" } | null = null;
  /** D-22: modo continuo (al instante). `groupSize` = inscritos en el grupo; `votes` = boletas; K = 5. */
  continuous = false;
  groupSize = 0;
  votes = 0;
  minAnonymitySet = 5;
  /** D-22: cuántos `POST /vote` responden 409 `stale_root` antes de aceptar (entró mucha gente mientras se probaba). */
  staleRootReplies = 0;
  joins: string[] = [];
  /** D-19: método de elegibilidad (`null` = apodo libre, como antes). */
  eligibility: { method: "open-alias" | "event-badge"; badgeCheck?: "list" | "live" | "none"; badgeUrlPrefix?: string; allowlistCount?: number } | null = null;
  /** Usuarios que el mock reconoce como credenciales del evento (como la consulta en vivo) y los ya usados. */
  badgeKnown = new Set<string>(["jgalvis414", "ana-hack", "beto-hack"]);
  badgeUsed = new Set<string>();
  badgeJoins: string[] = [];
  eligibilityPuts: unknown[] = [];
  createBodies: unknown[] = [];
  /** Respuesta de GET /audit (para el proyector); `null` → 404. */
  auditBody: unknown = null;
  anchorTx: string | null = null;
  /** `POST /face/enroll` responde 409 `duplicate_identity` (rostro ya inscrito). */
  faceDuplicate = false;
  /** D-21: `POST /face/enroll` responde 202 `pending_review` (coincidencia facial con credencial propia). */
  facePending = false;
  /** D-21: estado de la revisión manual del votante del mock (`null` = sin revisión). */
  review: null | "pending" | "approved" | "rejected" = null;
  reviewDecisions: unknown[] = [];
  /**
   * Inicio programado (`votingStartsAt`). Como el servidor real: la primera petición después de esa hora pasa la
   * fase de `registration` a `open` (y cierra la sala). `null` = la abre el organizador a mano.
   */
  votingStartsAt: string | null = null;
  /** Retiene la apertura automática (para capturar "Abriendo la votación…"). */
  holdSchedule = false;
  schedules: unknown[] = [];
  /** Retrasos artificiales (ms) para capturar estados intermedios ("Vinculando…", "Enviando tu voto…"). */
  delays: Partial<Record<"wallet" | "vote", number>> = {};

  constructor(phase: Phase) {
    this.phase = phase;
  }

  election() {
    return {
      id: E2E.electionId,
      title: E2E.title,
      description: "Votación de demostración (fixture). Condominio y vecinos ficticios.",
      kind: "multiple",
      options: E2E.options,
      status: this.phase,
      protocol: "semaphore-ledger",
      manifestHash: "0x6b1c3e5f0a9d4c2b8e7f6a5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b",
      startsAt: "2026-10-24T14:00:00.000Z",
      endsAt: "2026-10-24T22:00:00.000Z",
      eligibilityIssuerId: "junta-condominio (fixture)",
      organizerId: "org-fixture",
      groupRoot: ["draft", "registration"].includes(this.phase) ? null : "105088850375",
      winnersCountFromResult: true,
      candidates: E2E.candidates,
      draw: this.phase === "drawn" ? this.drawInfo() : null,
      anchor: this.anchorTx ? { chainId: 84532, txHash: this.anchorTx } : null,
      registryAddress: null,
      layout: null,
      ...(this.eligibility ? { eligibility: this.eligibility } : {}),
      votingStartsAt: this.votingStartsAt,
      ...(this.continuous ? { votingMode: "continuous", minAnonymitySet: this.minAnonymitySet } : {}),
      serverNow: new Date().toISOString(),
    };
  }

  /** Transición perezosa del inicio programado (misma regla que `syncSchedule` del servidor). */
  private sync() {
    if (!this.holdSchedule && this.phase === "registration" && this.votingStartsAt && Date.now() >= Date.parse(this.votingStartsAt)) {
      this.phase = "open";
      if (this.room) this.room = { ...this.room, open: false, closedReason: "election-opened" };
    }
  }

  tally() {
    if (this.continuous) {
      const total = this.votes;
      return {
        electionId: E2E.electionId,
        turnout: this.groupSize ? total / this.groupSize : 0,
        totalVotes: total,
        eligible: this.groupSize,
        leadingShare: null,
        closesAt: "2026-10-24T22:00:00.000Z",
        status: this.phase,
        options: E2E.options.map((o) => ({ ...o, count: null })),
      };
    }
    const total = this.phase === "registration" || this.phase === "draft" ? 0 : 7;
    return {
      electionId: E2E.electionId,
      turnout: total / 9,
      totalVotes: total,
      eligible: 9,
      leadingShare: total ? 3 / 7 : null,
      closesAt: "2026-10-24T22:00:00.000Z",
      status: this.phase,
      options: E2E.options.map((o, i) => ({ ...o, count: total >= 5 ? [1, 3, 2, 1, 0][i] : null })),
    };
  }

  drawInfo() {
    // Misma implementación que el servidor real (`drawWinners` del adaptador): "Recomputar aquí" debe coincidir.
    const r = drawWinners(E2E.candidates, 2, E2E.finalHash as `0x${string}`);
    return { seed: r.seed, n: 2, winners: r.winners, candidates: E2E.candidates, finalHash: E2E.finalHash, method: "keccak256(finalHash)|fisher-yates", tieBreak: "lowest" };
  }

  async install(page: Page) {
    await page.route("**/api/**", (route) => this.handle(route));
  }

  /** Para pruebas con varias pestañas (p. ej. "Proyectar" abre una nueva). */
  async installContext(ctx: BrowserContext) {
    await ctx.route("**/api/**", (route) => this.handle(route));
  }

  private json(route: Route, body: unknown, status = 200) {
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  }

  private isOrg(route: Route) {
    const h = route.request().headers()["authorization"] ?? "";
    if (h) this.authSeen.push(h);
    return h === `Bearer ${E2E.orgToken}`;
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    const body = req.postData() ? (JSON.parse(req.postData() as string) as Record<string, unknown>) : {};
    const E = `/api/elections/${E2E.electionId}`;
    this.sync();

    if (p === `/api/invite/${E2E.token}`)
      return this.json(route, {
        election: { id: E2E.electionId, title: E2E.title, kind: "multiple", options: E2E.options, status: this.phase, endsAt: "2026-10-24T22:00:00.000Z", votingStartsAt: this.votingStartsAt, ...(this.continuous ? { votingMode: "continuous", minAnonymitySet: this.minAnonymitySet } : {}) },
        voter: {
          id: E2E.voterId,
          displayName: "Vecina Ana (ficticia)",
          walletAddress: this.wallet?.walletAddress ?? null,
          livenessPassedAt: this.review === "approved" ? "2026-10-24T14:00:00.000Z" : null,
          votedAt: null,
          review: this.review === "pending" || this.review === "rejected" ? this.review : null,
        },
        serverNow: new Date().toISOString(),
      });
    if (p.startsWith("/api/invite/")) return this.json(route, { error: "invitación no existe", code: "not_found" }, 404);
    if (p === "/api/face/enroll" && m === "POST" && this.faceDuplicate) return this.json(route, { error: "Este rostro ya está inscrito en esta votación", code: "duplicate_identity" }, 409);
    if (p === "/api/face/enroll" && m === "POST" && (this.facePending || this.review === "pending")) {
      this.review = "pending";
      return this.json(route, { status: "pending_review" }, 202);
    }
    if (p === "/api/face/review" && m === "POST") {
      const st = this.review === "pending" ? { status: "pending_review" } : this.review === "approved" ? { status: "approved", faceBindingHash: `0x${"5a".repeat(32)}` } : this.review === "rejected" ? { status: "rejected" } : { status: "none" };
      return this.json(route, st);
    }
    if (p === `${E}/reviews` && m === "GET") {
      if (!this.isOrg(route)) return this.json(route, { error: "falta token", code: "forbidden" }, 401);
      const reviews = this.review
        ? [{ reviewId: "rv-fixture-1", createdAt: "2026-10-24T14:05:00.000Z", displayName: "Participante", method: "event-badge", reason: "face_match", status: this.review, decidedAt: this.review === "pending" ? null : "2026-10-24T14:06:00.000Z", decidedBy: this.review === "pending" ? null : "organizer" }]
        : [];
      return this.json(route, { reviews, pending: this.review === "pending" ? 1 : 0, approved: this.review === "approved" ? 1 : 0, maxPending: 10 });
    }
    if (p === `${E}/reviews/rv-fixture-1` && m === "POST") {
      if (!this.isOrg(route)) return this.json(route, { error: "falta token", code: "forbidden" }, 401);
      if (this.review !== "pending") return this.json(route, { error: "Esta revisión ya se decidió", code: "closed" }, 409);
      this.reviewDecisions.push(body);
      this.review = body.decision === "approve" ? "approved" : "rejected";
      return this.json(route, { reviewId: "rv-fixture-1", createdAt: "2026-10-24T14:05:00.000Z", displayName: "Participante", method: "event-badge", reason: "face_match", status: this.review, decidedAt: "2026-10-24T14:06:00.000Z", decidedBy: "organizer" });
    }
    if (p === "/api/face/enroll" && m === "POST") return this.json(route, { ok: true, faceBindingHash: `0x${"5a".repeat(32)}`, voteNonce: `0x${"01".repeat(32)}` });
    if (p === `/api/voters/${E2E.voterId}/wallet` && m === "POST") {
      if (this.delays.wallet) await new Promise((r) => setTimeout(r, this.delays.wallet));
      this.wallet = body as never;
      return this.json(route, { id: E2E.voterId, walletAddress: body.walletAddress });
    }
    if (p === `/api/voters/${E2E.voterId}/identity` && m === "POST") {
      this.commitment = String(body.commitment);
      if (this.continuous) this.groupSize += 1;
      return this.json(route, { ok: true, registeredCount: 4 }, 201);
    }
    if (p === `/api/voters/${E2E.voterId}/voted` && m === "POST") {
      this.votedMarked = true;
      return this.json(route, { ok: true, votedAt: "2026-10-24T04:00:00.000Z" });
    }

    /* ---------- Sala abierta ---------- */
    const clock = { votingStartsAt: this.votingStartsAt, serverNow: new Date().toISOString() };
    const roomStatus = (secret: boolean) =>
      this.room
        ? { open: this.room.open, seatsTaken: this.room.seatsTaken, maxSeats: this.room.maxSeats, expiresAt: this.room.expiresAt, closedReason: this.room.closedReason, ...clock, ...(secret ? { roomCode: this.room.code, joinUrl: `${url.origin}/j/${this.room.code}` } : {}) }
        : { open: false, seatsTaken: 0, maxSeats: null, expiresAt: null, closedReason: null, ...clock };
    if (p === `${E}/room`) {
      const org = this.isOrg(route);
      if (m === "GET") return this.json(route, roomStatus(org));
      if (!org) return this.json(route, { error: "falta token", code: "forbidden" }, 401);
      if (m === "POST") {
        const created = !this.room?.open;
        const expiresAt = new Date(Date.now() + Number(body.expiresInMin) * 60_000).toISOString();
        this.room = { code: this.room?.open ? this.room.code : "K7M3QP", open: true, seatsTaken: this.room?.seatsTaken ?? 0, maxSeats: Number(body.maxSeats), expiresAt, closedReason: null };
        if (this.continuous) return this.json(route, roomStatus(true), created ? 201 : 200);
        this.votingStartsAt = body.votingStartsAt === null ? null : typeof body.votingStartsAt === "string" ? body.votingStartsAt : expiresAt;
        return this.json(route, roomStatus(true), created ? 201 : 200);
      }
      if (m === "DELETE") {
        if (this.room) this.room = { ...this.room, open: false, closedReason: "manual" };
        return this.json(route, roomStatus(false));
      }
    }
    if (p.startsWith("/api/rooms/")) {
      const code = decodeURIComponent(p.split("/")[3] ?? "").toUpperCase();
      if (!this.room || code !== this.room.code) return this.json(route, { error: "Sala no encontrada", code: "not_found" }, 404);
      const { code: _c, ...rest } = { ...this.room };
      void _c;
      if (p.endsWith("/join") && m === "POST") {
        if (!this.room.open) return this.json(route, { error: this.room.closedReason === "election-opened" ? "La votación ya comenzó: la inscripción está cerrada" : "La sala está cerrada", code: "room_closed" }, 410);
        if (this.room.seatsTaken >= this.room.maxSeats) return this.json(route, { error: `La sala está llena (${this.room.seatsTaken} de ${this.room.maxSeats})`, code: "room_full" }, 409);
        this.room.seatsTaken += 1;
        this.joins.push(String(body.displayName));
        return this.json(route, { electionId: E2E.electionId, voterId: E2E.voterId, displayName: body.displayName, inviteToken: E2E.token, inviteUrl: `${url.origin}/v/${E2E.token}` }, 201);
      }
      if (p.endsWith("/join-badge") && m === "POST") {
        if (!this.room.open) return this.json(route, { error: "La sala está cerrada", code: "room_closed" }, 410);
        const prefix = this.eligibility?.badgeUrlPrefix ?? "https://hack.platan.us/26-ve/id/";
        const raw = String(body.badgeUrl ?? "").trim();
        const user = raw.startsWith(prefix) && /^[A-Za-z0-9-]{1,39}$/.test(raw.slice(prefix.length)) ? raw.slice(prefix.length).toLowerCase() : null;
        if (!user) return this.json(route, { error: "Ese QR no es una credencial de Platanus Hack.", code: "badge_invalid" }, 400);
        if (this.badgeUsed.has(user)) return this.json(route, { error: "Esta credencial ya se usó en esta votación.", code: "badge_used" }, 409);
        if (!this.badgeKnown.has(user)) return this.json(route, { error: "No encontramos esta credencial en el evento.", code: "badge_unknown" }, 404);
        if (this.room.seatsTaken >= this.room.maxSeats) return this.json(route, { error: `La sala está llena (${this.room.seatsTaken} de ${this.room.maxSeats})`, code: "room_full" }, 409);
        this.badgeUsed.add(user);
        this.room.seatsTaken += 1;
        this.badgeJoins.push(user);
        return this.json(route, { electionId: E2E.electionId, voterId: E2E.voterId, displayName: "Participante", inviteToken: E2E.token, inviteUrl: `${url.origin}/v/${E2E.token}` }, 201);
      }
      const elig = this.eligibility ? { eligibility: { method: this.eligibility.method, ...(this.eligibility.badgeUrlPrefix ? { badgeUrlPrefix: this.eligibility.badgeUrlPrefix } : {}) } } : {};
      return this.json(route, { electionId: E2E.electionId, title: E2E.title, ...rest, ...elig, ...clock });
    }

    if (p === "/api/elections" && m === "POST") {
      this.createBodies.push(body);
      return this.json(route, { ...this.election(), status: "draft", organizerToken: E2E.orgToken }, 201);
    }
    if (p === `${E}/eligibility` && m === "PUT") {
      this.eligibilityPuts.push(body);
      const b = body as { method: "open-alias" | "event-badge"; badgeCheck?: "list" | "live" | "none"; badgeUrlPrefix?: string; badgeAllowlist?: string[] };
      this.eligibility = b.method === "event-badge" ? { method: b.method, badgeCheck: b.badgeCheck ?? "live", badgeUrlPrefix: b.badgeUrlPrefix, ...(b.badgeCheck === "list" ? { allowlistCount: b.badgeAllowlist?.length ?? 0 } : {}) } : { method: "open-alias" };
      return this.json(route, this.election());
    }
    if (p === E) return this.json(route, this.election());
    if (p === `${E}/schedule` && m === "POST") {
      if (!this.isOrg(route)) return this.json(route, { error: "falta token", code: "forbidden" }, 401);
      this.schedules.push(body);
      const now = Date.now();
      const base = this.votingStartsAt && Date.parse(this.votingStartsAt) > now ? Date.parse(this.votingStartsAt) : now;
      this.votingStartsAt =
        "votingStartsAt" in body ? (body.votingStartsAt as string | null) : "inSeconds" in body ? new Date(now + Number(body.inSeconds) * 1000).toISOString() : new Date(base + Number(body.addSeconds) * 1000).toISOString();
      return this.json(route, { electionId: E2E.electionId, status: this.phase, votingStartsAt: this.votingStartsAt, serverNow: new Date(now).toISOString() });
    }
    if (p === `${E}/tally`) return this.json(route, this.tally());
    if (p === `${E}/layout`) return this.json(route, { error: "sin layout", code: "not_found" }, 404);
    if ((p === `${E}/roll` || p === `${E}/group`) && this.continuous)
      return this.json(route, { electionId: E2E.electionId, status: this.phase, frozen: false, groupRoot: "0", scope: "0", merkleTreeDepth: 10, commitments: [validPkg.commitments[0], ...(this.commitment ? [this.commitment] : []), validPkg.commitments[1]], votingMode: "continuous", size: this.groupSize, minAnonymitySet: this.minAnonymitySet, rootWindow: 32 });
    if (p === `${E}/roll`)
      return this.json(route, { electionId: E2E.electionId, status: this.phase, frozen: true, groupRoot: "0", scope: "0", merkleTreeDepth: 10, commitments: [validPkg.commitments[0], ...(this.commitment ? [this.commitment] : []), validPkg.commitments[1]] });
    if (p === `${E}/vote` && m === "POST") {
      if (this.delays.vote) await new Promise((r) => setTimeout(r, this.delays.vote));
      this.voteBodies.push(body);
      if (this.staleRootReplies > 0) {
        this.staleRootReplies -= 1;
        return this.json(route, { error: "Entró mucha gente mientras preparabas tu voto: vuelve a intentarlo", code: "stale_root" }, 409);
      }
      this.votes += 1;
      const proof = body.proof as { nullifier: string };
      this.nullifier = proof.nullifier;
      return this.json(route, { electionId: E2E.electionId, inclusionId: proof.nullifier, nullifier: proof.nullifier, index: 6, hash: `0x${"3c".repeat(32)}`, receivedAt: "2026-10-24T15:00:00.000Z", includedAt: "2026-10-24T15:00:00.000Z", state: "incluido" }, 201);
    }
    if (p === `${E}/ledger`)
      return this.json(route, { electionId: E2E.electionId, status: this.phase, groupRoot: "0", scope: "0", genesisHash: `0x${"00".repeat(32)}`, finalHash: E2E.finalHash, count: 7, proofsPublished: this.phase !== "open", entries: [] });
    if (p.startsWith(`${E}/receipt/`)) {
      const n = decodeURIComponent(p.split("/").pop() ?? "");
      return n === this.nullifier ? this.json(route, { electionId: E2E.electionId, inclusionId: n, nullifier: n, index: 6, hash: `0x${"3c".repeat(32)}`, receivedAt: "2026-10-24T15:00:00.000Z", includedAt: "2026-10-24T15:00:00.000Z", state: "incluido" }) : this.json(route, { error: "no existe", code: "not_found" }, 404);
    }
    if (p === `${E}/artifacts`) return route.fulfill({ status: 200, contentType: "application/json", body: readFileSync(path.join(FIXTURES, this.packageFile)) });
    if (p === `${E}/audit`) return this.auditBody ? this.json(route, this.auditBody) : this.json(route, { error: "sin auditoría en el mock", code: "not_found" }, 404);
    if (p === `${E}/draw` && m === "GET") return this.phase === "drawn" ? this.json(route, this.drawInfo()) : this.json(route, { error: "sin sorteo", code: "not_found" }, 404);
    if (p === `${E}/voters` && m === "GET") {
      const counts = { total: 9, invited: 4, registered: 3, withIdentity: 3, voted: 2 };
      if (!this.isOrg(route)) return this.json(route, { counts });
      return this.json(route, {
        counts,
        voters: [
          { id: E2E.voterId, displayName: "Vecina Ana (ficticia)", state: "registered", walletAddress: null, hasIdentity: true },
          { id: "v-bruno", displayName: "Vecino Bruno (ficticio)", state: "voted", walletAddress: null, hasIdentity: true },
          { id: "v-carla", displayName: "Vecina Carla (ficticia)", state: "invited", walletAddress: null, hasIdentity: false },
        ],
      });
    }
    const transitions: Record<string, [Phase, Phase]> = { publish: ["draft", "registration"], open: ["registration", "open"], close: ["open", "auditable"], draw: ["auditable", "drawn"] };
    const action = p.startsWith(`${E}/`) ? p.slice(E.length + 1) : "";
    if (m === "POST" && transitions[action]) {
      if (!this.isOrg(route)) return this.json(route, { error: "falta token", code: "forbidden" }, 401);
      if (this.continuous && (action === "publish" || action === "open") && this.phase === "draft") {
        this.phase = "open"; // D-22: publicar = abrir inscripción + votación
        this.votingStartsAt = new Date().toISOString();
        return this.json(route, this.election());
      }
      if (this.continuous && action === "close" && this.phase === "open" && this.room) this.room = { ...this.room, open: false, closedReason: "election-closed" };
      const [from, to] = transitions[action];
      if (this.phase !== from) return this.json(route, { error: `fase ${this.phase}`, code: "closed" }, 409);
      this.phase = to;
      if (to === "open") this.votingStartsAt = new Date().toISOString();
      if (to === "open" && this.review === "pending") this.review = "rejected"; // D-21: se rechaza sola al abrir
      if (to === "open" && this.room) this.room = { ...this.room, open: false, closedReason: this.room.closedReason ?? "election-opened" };
      return this.json(route, this.election());
    }
    return this.json(route, { error: `mock sin ruta ${m} ${p}`, code: "not_found" }, 404);
  }
}
