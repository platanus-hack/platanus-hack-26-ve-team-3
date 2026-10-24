/**
 * D-21 — revisión manual de duplicados faciales. Caso real: gemelo idéntico con su propia credencial del evento.
 * pending (202) vs 409, idempotencia, tope por elección, approve/reject, auto-rechazo al abrir (manual y programado),
 * open-alias sigue rechazando, y `manualApprovals` en el paquete + verificador (pruebas Semaphore REALES).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { DEFAULT_BADGE_URL_PREFIX, FaceBindingTypes } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts } from "@quorum/protocol-adapter";
import { POST as createElection } from "@/app/api/elections/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { POST as openRoomRoute } from "@/app/api/elections/[id]/room/route";
import { POST as join } from "@/app/api/rooms/[roomCode]/join/route";
import { POST as joinBadge } from "@/app/api/rooms/[roomCode]/join-badge/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as reviewStatus } from "@/app/api/face/review/route";
import { GET as listReviews } from "@/app/api/elections/[id]/reviews/route";
import { POST as decide } from "@/app/api/elections/[id]/reviews/[reviewId]/route";
import { GET as invite } from "@/app/api/invite/[token]/route";
import { POST as linkWallet } from "@/app/api/voters/[id]/wallet/route";
import { POST as identity } from "@/app/api/voters/[id]/identity/route";
import { POST as openRoute } from "@/app/api/elections/[id]/open/route";
import { POST as scheduleRoute } from "@/app/api/elections/[id]/schedule/route";
import { GET as getElection } from "@/app/api/elections/[id]/route";
import { GET as roll } from "@/app/api/elections/[id]/roll/route";
import { POST as vote } from "@/app/api/elections/[id]/vote/route";
import { POST as close } from "@/app/api/elections/[id]/close/route";
import { GET as artifacts } from "@/app/api/elections/[id]/artifacts/route";
import { GET as audit } from "@/app/api/elections/[id]/audit/route";
import { clearBadgeCacheForTests, setBadgeFetchForTests } from "../badge";
import { faceBindingDomain, setWalletRpcVerifierForTests } from "../wallet";
import { setEngineHooksForTests } from "../engine";
import { call, descriptor, freshStore } from "./helpers";
import { sampleElection } from "./helpers";
import type { MemoryStore } from "../store";

const P = DEFAULT_BADGE_URL_PREFIX;
let store: MemoryStore;
beforeEach(() => {
  store = freshStore();
  setEngineHooksForTests({});
  setWalletRpcVerifierForTests(undefined);
  setBadgeFetchForTests(undefined);
  clearBadgeCacheForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type Org = { id: string; auth: Record<string, string>; code: string };
type V = { voterId: string; inviteToken: string };

async function setup(eligibility: unknown = { method: "event-badge", badgeCheck: "none" }): Promise<Org> {
  const created = await call(createElection, { body: sampleElection({ eligibility }) });
  expect(created.status).toBe(201);
  const id = created.json.id as string;
  const auth = { authorization: `Bearer ${created.json.organizerToken}` };
  expect((await call(publish, { params: { id }, headers: auth })).status).toBe(200);
  const room = await call(openRoomRoute, { params: { id }, headers: auth, body: { maxSeats: 60, expiresInMin: 15, votingStartsAt: null } });
  return { id, auth, code: room.json.roomCode as string };
}

let ip = 0;
const nextIp = () => `10.21.${Math.floor(++ip / 250)}.${ip % 250}`;
async function badge(org: Org, user: string): Promise<V> {
  const r = await call(joinBadge, { params: { roomCode: org.code }, body: { badgeUrl: `${P}${user}` }, headers: { "x-forwarded-for": nextIp() } });
  expect(r.status).toBe(201);
  return r.json;
}
const face = (v: V, seed: number, headers: Record<string, string> = { "x-forwarded-for": nextIp() }) =>
  call(enroll, { body: { voterId: v.voterId, inviteToken: v.inviteToken, descriptor: descriptor(seed), consent: true }, headers });
const status = (v: V) => call(reviewStatus, { body: { voterId: v.voterId, inviteToken: v.inviteToken } });
const reviews = (org: Org) => call(listReviews, { params: { id: org.id }, headers: org.auth });
const decideAs = (org: Org, reviewId: string, decision: string) => call(decide, { params: { id: org.id, reviewId }, headers: org.auth, body: { decision } });

/** Vinculación + identidad (lo que el teléfono hace solo tras el rostro). */
async function link(org: Org, v: V, faceBindingHash: string) {
  const account = privateKeyToAccount(generatePrivateKey());
  const bindingSignature = await account.signTypedData({
    domain: faceBindingDomain(),
    types: FaceBindingTypes,
    primaryType: "FaceBinding",
    message: { electionId: org.id, voterId: v.voterId, faceBindingHash: faceBindingHash as `0x${string}`, wallet: account.address },
  });
  expect((await call(linkWallet, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature } })).status).toBe(200);
  const id = createVoterIdentity();
  expect((await call(identity, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, commitment: id.commitment } })).status).toBe(201);
  return id;
}

describe("POST /api/face/enroll — coincidencia facial con credencial propia", () => {
  it("gemelo con credencial distinta → 202 pending_review; no se inscribe ni recibe faceBindingHash", async () => {
    const org = await setup();
    const a = await badge(org, "gemelo-a");
    const b = await badge(org, "gemelo-b");
    expect((await face(a, 7)).status).toBe(201);
    const r = await face(b, 7);
    expect(r.status).toBe(202);
    expect(r.json).toEqual({ status: "pending_review" });
    const voter = await store.getVoter(b.voterId);
    expect(voter?.livenessPassedAt).toBeNull();
    expect(voter?.faceBindingHash ?? null).toBeNull();
    // La plantilla del pendiente se guarda CIFRADA, como las demás (sin el descriptor en claro).
    const tpl = await store.getFaceTemplate(b.voterId);
    expect(tpl?.pending).toBe(true);
    expect(JSON.stringify(tpl)).not.toContain(String(descriptor(7)[0]));
    // La revisión no guarda con quién coincidió ni la similitud (A3).
    const [rev] = await store.listReviews(org.id);
    expect(Object.keys(rev).sort()).toEqual(["createdAt", "decidedAt", "decidedBy", "electionId", "reason", "reviewId", "status", "voterId"]);
    expect(JSON.stringify(rev)).not.toContain(a.voterId);
    expect(rev.reason).toBe("face_match");
    // El votante pendiente no puede vincular el teléfono.
    expect((await status(b)).json).toEqual({ status: "pending_review" });
    expect((await call(invite, { params: { token: b.inviteToken } })).json.voter.review).toBe("pending");
  });

  it("idempotente: el pendiente reintenta → mismo pending_review y no se crea otra revisión", async () => {
    const org = await setup();
    const a = await badge(org, "a");
    const b = await badge(org, "b");
    await face(a, 7);
    expect((await face(b, 7)).status).toBe(202);
    expect((await face(b, 7)).status).toBe(202);
    expect((await face(b, 99)).json).toEqual({ status: "pending_review" });
    expect(await store.listReviews(org.id)).toHaveLength(1);
  });

  it("reintentos del mismo votante ya inscrito siguen rechazados; un tercero igual a un pendiente también queda en revisión", async () => {
    const org = await setup();
    const a = await badge(org, "a");
    const b = await badge(org, "b");
    const c = await badge(org, "c");
    expect((await face(a, 7)).status).toBe(201);
    expect((await face(a, 7)).status).toBe(403); // ya tiene prueba de vida: nunca una revisión
    expect((await face(b, 7)).status).toBe(202);
    expect((await face(c, 7)).status).toBe(202);
    expect(await store.listReviews(org.id)).toHaveLength(2);
  });

  it("open-alias NO aplica: sigue el 409 duplicate_identity y no se guarda nada", async () => {
    const org = await setup({ method: "open-alias" });
    const j1 = (await call(join, { params: { roomCode: org.code }, body: { displayName: "Ana" }, headers: { "x-forwarded-for": nextIp() } })).json as V;
    const j2 = (await call(join, { params: { roomCode: org.code }, body: { displayName: "Bea" }, headers: { "x-forwarded-for": nextIp() } })).json as V;
    const f1 = await face(j1, 7);
    expect(f1.status, JSON.stringify([j1, f1.json])).toBe(201);
    const r = await face(j2, 7);
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("duplicate_identity");
    expect(await store.getFaceTemplate(j2.voterId)).toBeNull();
    expect(await store.listReviews(org.id)).toHaveLength(0);
    expect((await face(j2, 7)).status).toBe(409);
  });

  it("tope por elección (QUORUM_MAX_PENDING_REVIEWS) → 409 al pasarlo; al decidir uno se libera un cupo", async () => {
    vi.stubEnv("QUORUM_MAX_PENDING_REVIEWS", "2");
    const org = await setup();
    const a = await badge(org, "a");
    await face(a, 7);
    const vs = [await badge(org, "b"), await badge(org, "c"), await badge(org, "d")];
    expect((await face(vs[0], 7)).status).toBe(202);
    expect((await face(vs[1], 7)).status).toBe(202);
    const over = await face(vs[2], 7);
    expect(over.status).toBe(409);
    expect(over.json.code).toBe("duplicate_identity");
    expect(await store.getFaceTemplate(vs[2].voterId)).toBeNull();
    const list = await reviews(org);
    expect(list.json).toMatchObject({ pending: 2, approved: 0, maxPending: 2 });
    expect((await decideAs(org, list.json.reviews[0].reviewId, "reject")).status).toBe(200);
    expect((await face(vs[2], 7)).status).toBe(202);
  });

  it("rate limit por IP para crear revisiones (3 cada 10 min)", async () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    const org = await setup();
    const a = await badge(org, "a");
    await face(a, 7);
    const same = { "x-forwarded-for": "10.99.0.1" };
    const vs = [];
    for (const u of ["b", "c", "d", "e"]) vs.push(await badge(org, u));
    for (const v of vs.slice(0, 3)) expect((await face(v, 7, same)).status).toBe(202);
    const r = await face(vs[3], 7, same);
    expect(r.status).toBe(429);
    expect(await store.getFaceTemplate(vs[3].voterId)).toBeNull();
    expect(await store.listReviews(org.id)).toHaveLength(3);
  });
});

describe("Organizador: GET/POST /api/elections/:id/reviews", () => {
  it("lista sin datos biométricos; sin token → 401; otro organizador → 401", async () => {
    const org = await setup();
    const other = await setup();
    const a = await badge(org, "a");
    const b = await badge(org, "b");
    await face(a, 7);
    await face(b, 7);
    expect((await call(listReviews, { params: { id: org.id } })).status).toBe(401);
    expect((await call(listReviews, { params: { id: org.id }, headers: other.auth })).status).toBe(401);
    const r = await reviews(org);
    expect(r.status).toBe(200);
    expect(r.json.pending).toBe(1);
    expect(r.json.reviews).toHaveLength(1);
    expect(Object.keys(r.json.reviews[0]).sort()).toEqual(["createdAt", "decidedAt", "decidedBy", "displayName", "method", "reason", "reviewId", "status"]);
    expect(r.json.reviews[0]).toMatchObject({ displayName: "Participante", method: "event-badge", reason: "face_match", status: "pending" });
    const raw = JSON.stringify(r.json);
    for (const s of [a.voterId, b.voterId, "similar", "sealed", "descriptor"]) expect(raw).not.toContain(s);
    expect((await decideAs(org, r.json.reviews[0].reviewId, "maybe")).status).toBe(400);
    expect((await call(decide, { params: { id: org.id, reviewId: r.json.reviews[0].reviewId }, body: { decision: "approve" } })).status).toBe(401);
    expect((await decideAs(org, "rv_noexiste", "approve")).status).toBe(404);
  });

  it("approve → el votante sigue solo (faceBindingHash) y su plantilla entra al dedupe; decidir dos veces → 409", async () => {
    const org = await setup();
    const a = await badge(org, "a");
    const b = await badge(org, "b");
    await face(a, 7);
    await face(b, 7);
    const id = (await reviews(org)).json.reviews[0].reviewId as string;
    const ok = await decideAs(org, id, "approve");
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ status: "approved", decidedBy: "organizer" });
    const st = await status(b);
    expect(st.json.status).toBe("approved");
    expect(st.json.faceBindingHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await call(invite, { params: { token: b.inviteToken } })).json.voter).toMatchObject({ review: null });
    expect((await call(invite, { params: { token: b.inviteToken } })).json.voter.livenessPassedAt).not.toBeNull();
    expect((await store.getFaceTemplate(b.voterId))?.pending).toBe(false);
    await link(org, b, st.json.faceBindingHash);
    expect((await decideAs(org, id, "reject")).status).toBe(409);
    // Un tercero con open-alias no existe aquí; un tercero con credencial y el mismo rostro vuelve a revisión.
    const c = await badge(org, "c");
    expect((await face(c, 7)).status).toBe(202);
  });

  it("reject → el votante ve 'rechazada', se borra su plantilla y reintentar da 409 con el mensaje para la persona", async () => {
    const org = await setup();
    const a = await badge(org, "a");
    const b = await badge(org, "b");
    await face(a, 7);
    await face(b, 7);
    const id = (await reviews(org)).json.reviews[0].reviewId as string;
    expect((await decideAs(org, id, "reject")).json.status).toBe("rejected");
    expect((await status(b)).json).toEqual({ status: "rejected" });
    expect((await call(invite, { params: { token: b.inviteToken } })).json.voter.review).toBe("rejected");
    expect(await store.getFaceTemplate(b.voterId)).toBeNull();
    const again = await face(b, 7);
    expect(again.status).toBe(409);
    expect(again.json.error).toBe("No pudimos verificar tu identidad. Habla con el organizador.");
    // inviteToken ajeno → 403.
    expect((await call(reviewStatus, { body: { voterId: b.voterId, inviteToken: a.inviteToken } })).status).toBe(403);
  });
});

describe("Al abrir la votación las pendientes se rechazan solas", () => {
  it("apertura manual: pendiente → rechazada (auto-open), decidir después → 409", async () => {
    const org = await setup();
    const a = await badge(org, "a");
    const b = await badge(org, "b");
    const fa = await face(a, 7);
    await link(org, a, fa.json.faceBindingHash);
    await face(b, 7);
    const id = (await reviews(org)).json.reviews[0].reviewId as string;
    expect((await call(openRoute, { params: { id: org.id }, headers: org.auth })).status).toBe(200);
    const rv = await store.getReview(id);
    expect(rv).toMatchObject({ status: "rejected", decidedBy: "auto-open" });
    expect((await status(b)).json).toEqual({ status: "rejected" });
    expect((await decideAs(org, id, "approve")).status).toBe(409);
  });

  it("apertura programada (perezosa): mismo auto-rechazo", async () => {
    const org = await setup();
    const a = await badge(org, "a");
    const b = await badge(org, "b");
    const fa = await face(a, 7);
    await link(org, a, fa.json.faceBindingHash);
    await face(b, 7);
    expect((await call(scheduleRoute, { params: { id: org.id }, headers: org.auth, body: { inSeconds: 10 } })).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 11_000);
    expect((await call(getElection, { params: { id: org.id } })).json.status).toBe("open");
    expect((await store.listReviews(org.id))[0]).toMatchObject({ status: "rejected", decidedBy: "auto-open" });
    expect((await status(b)).json).toEqual({ status: "rejected" });
  });
});

describe("Transparencia: manualApprovals en el paquete y el verificador", () => {
  it("gemelos con credenciales distintas: el organizador aprueba → ambos votan → count=1 declarado y verificado", async () => {
    const org = await setup();
    const a = await badge(org, "gemelo-a");
    const b = await badge(org, "gemelo-b");
    const fa = await face(a, 7);
    const ia = await link(org, a, fa.json.faceBindingHash);
    expect((await face(b, 7)).status).toBe(202);
    const id = (await reviews(org)).json.reviews[0].reviewId as string;
    expect((await decideAs(org, id, "approve")).status).toBe(200);
    const ib = await link(org, b, (await status(b)).json.faceBindingHash);

    expect((await call(openRoute, { params: { id: org.id }, headers: org.auth })).status).toBe(200);
    const r = await call(roll, { params: { id: org.id } });
    expect(r.json.commitments).toHaveLength(2);
    for (const idn of [ia, ib]) {
      const proof = await castBallot(idn.privateKey, r.json.commitments, org.id, 0, defaultArtifacts());
      expect((await call(vote, { params: { id: org.id }, body: { proof } })).status).toBe(201);
    }
    expect((await call(close, { params: { id: org.id }, headers: org.auth })).json.status).toBe("auditable");
    const art = await call(artifacts, { params: { id: org.id } });
    expect(art.json.manualApprovals).toMatchObject({ count: 1, method: "organizer-in-person" });
    expect(Object.keys(art.json.manualApprovals).sort()).toEqual(["count", "method", "note"]);
    const raw = JSON.stringify(art.json);
    for (const s of [a.voterId, b.voterId, id]) expect(raw).not.toContain(s);
    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.auditResult.valid).toBe(true);
    expect((au.json.auditResult.unsupportedGuarantees as string[]).find((g) => g.startsWith("aprobacion-manual"))).toMatch(
      /1 inscripción aprobada manualmente por el organizador tras coincidencia facial/,
    );
  }, 90_000);

  it("open-alias: el paquete no lleva manualApprovals", async () => {
    const org = await setup({ method: "open-alias" });
    const j = (await call(join, { params: { roomCode: org.code }, body: { displayName: "Ana" }, headers: { "x-forwarded-for": nextIp() } })).json as V;
    const fj = await face(j, 7);
    const idn = await link(org, j, fj.json.faceBindingHash);
    expect((await call(openRoute, { params: { id: org.id }, headers: org.auth })).status).toBe(200);
    const r = await call(roll, { params: { id: org.id } });
    const proof = await castBallot(idn.privateKey, r.json.commitments, org.id, 1, defaultArtifacts());
    expect((await call(vote, { params: { id: org.id }, body: { proof } })).status).toBe(201);
    expect((await call(close, { params: { id: org.id }, headers: org.auth })).json.status).toBe("auditable");
    expect((await call(artifacts, { params: { id: org.id } })).json.manualApprovals).toBeUndefined();
  }, 60_000);
});
