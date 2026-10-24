import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page, Route } from "@playwright/test";
import { drawWinners } from "@quorum/protocol-adapter";

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

export class MockV1 {
  phase: Phase;
  packageFile: "valid.json" | "tampered_total.json" = "valid.json";
  commitment: string | null = null;
  wallet: { walletAddress: string; kind: string; bindingSignature: string } | null = null;
  voteBodies: unknown[] = [];
  nullifier: string | null = null;
  votedMarked = false;
  authSeen: string[] = [];

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
      anchor: null,
      registryAddress: null,
      layout: null,
    };
  }

  tally() {
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
    const r = drawWinners(E2E.candidates, 2, E2E.finalHash as `0x${string}`);
    return { seed: r.seed, n: 2, winners: r.winners, candidates: E2E.candidates, finalHash: E2E.finalHash, method: "keccak256(finalHash)|fisher-yates", tieBreak: "lowest" };
  }

  async install(page: Page) {
    await page.route("**/api/**", (route) => this.handle(route));
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

    if (p === `/api/invite/${E2E.token}`)
      return this.json(route, {
        election: { id: E2E.electionId, title: E2E.title, kind: "multiple", options: E2E.options, status: this.phase, endsAt: "2026-10-24T22:00:00.000Z" },
        voter: { id: E2E.voterId, displayName: "Vecina Ana (ficticia)", walletAddress: this.wallet?.walletAddress ?? null, livenessPassedAt: null, votedAt: null },
      });
    if (p.startsWith("/api/invite/")) return this.json(route, { error: "invitación no existe", code: "not_found" }, 404);
    if (p === "/api/face/enroll" && m === "POST") return this.json(route, { ok: true, faceBindingHash: `0x${"5a".repeat(32)}`, voteNonce: `0x${"01".repeat(32)}` });
    if (p === `/api/voters/${E2E.voterId}/wallet` && m === "POST") {
      this.wallet = body as never;
      return this.json(route, { id: E2E.voterId, walletAddress: body.walletAddress });
    }
    if (p === `/api/voters/${E2E.voterId}/identity` && m === "POST") {
      this.commitment = String(body.commitment);
      return this.json(route, { ok: true, registeredCount: 4 }, 201);
    }
    if (p === `/api/voters/${E2E.voterId}/voted` && m === "POST") {
      this.votedMarked = true;
      return this.json(route, { ok: true, votedAt: "2026-10-24T04:00:00.000Z" });
    }

    if (p === "/api/elections" && m === "POST") return this.json(route, { ...this.election(), status: "draft", organizerToken: E2E.orgToken }, 201);
    if (p === E) return this.json(route, this.election());
    if (p === `${E}/tally`) return this.json(route, this.tally());
    if (p === `${E}/layout`) return this.json(route, { error: "sin layout", code: "not_found" }, 404);
    if (p === `${E}/roll`)
      return this.json(route, { electionId: E2E.electionId, status: this.phase, frozen: true, groupRoot: "0", scope: "0", merkleTreeDepth: 10, commitments: [validPkg.commitments[0], ...(this.commitment ? [this.commitment] : []), validPkg.commitments[1]] });
    if (p === `${E}/vote` && m === "POST") {
      this.voteBodies.push(body);
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
    if (p === `${E}/audit`) return this.json(route, { error: "sin auditoría en el mock", code: "not_found" }, 404);
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
      const [from, to] = transitions[action];
      if (this.phase !== from) return this.json(route, { error: `fase ${this.phase}`, code: "closed" }, 409);
      this.phase = to;
      return this.json(route, this.election());
    }
    return this.json(route, { error: `mock sin ruta ${m} ${p}`, code: "not_found" }, 404);
  }
}
