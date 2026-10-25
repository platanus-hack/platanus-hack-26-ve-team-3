/**
 * QA del modo continuo (D-22) para el evento en vivo: casos límite de concurrencia y de estados contra los route
 * handlers reales, con pruebas Semaphore REALES (Groth16).
 *  - K exacto: la 5.ª inscripción habilita el voto (4 → 409 anonymity_pending).
 *  - Reintento de /identity con el mismo commitment (respuesta perdida en el wifi) → éxito idempotente, sin duplicar.
 *  - Cierre con gente a medio inscribir → 409 con mensaje claro en rostro, vinculación e identidad.
 *  - Carrera rostro ↔ cierre: un enrolamiento que pasó el chequeo justo antes del cierre no deja plantilla.
 *  - Voto en vuelo durante el cierre → 409; dos votos simultáneos del mismo votante → 201 + 409.
 *  - Credencial reusada → 409 badge_used; gemelo en revisión: aprobado vota, pendiente al cerrar queda rechazado.
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
import { GET as invite } from "@/app/api/invite/[token]/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as linkWallet } from "@/app/api/voters/[id]/wallet/route";
import { POST as identity } from "@/app/api/voters/[id]/identity/route";
import { GET as group } from "@/app/api/elections/[id]/group/route";
import { GET as roll } from "@/app/api/elections/[id]/roll/route";
import { POST as vote } from "@/app/api/elections/[id]/vote/route";
import { GET as tally } from "@/app/api/elections/[id]/tally/route";
import { POST as close } from "@/app/api/elections/[id]/close/route";
import { GET as artifacts } from "@/app/api/elections/[id]/artifacts/route";
import { GET as audit } from "@/app/api/elections/[id]/audit/route";
import { GET as listReviews } from "@/app/api/elections/[id]/reviews/route";
import { POST as decide } from "@/app/api/elections/[id]/reviews/[reviewId]/route";
import { faceBindingDomain, setWalletRpcVerifierForTests } from "../wallet";
import { setEngineHooksForTests } from "../engine";
import { withLock } from "../lock";
import { clearBadgeCacheForTests, setBadgeFetchForTests } from "../badge";
import { call, descriptor, freshStore, sampleElection } from "./helpers";
import type { MemoryStore } from "../store";

const artifactsPaths = defaultArtifacts();
const P = DEFAULT_BADGE_URL_PREFIX;
const CLOSED_MSG = "La votación terminó: ya no se puede inscribir.";
let store: MemoryStore;
beforeEach(() => {
  store = freshStore();
  setEngineHooksForTests({});
  setWalletRpcVerifierForTests(undefined);
  setBadgeFetchForTests(undefined);
  clearBadgeCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  setBadgeFetchForTests(undefined);
});

type Org = { id: string; auth: Record<string, string>; code: string };
type Seat = { voterId: string; inviteToken: string };

async function setup(extra: Record<string, unknown> = {}): Promise<Org> {
  const { votingMode: _phased, ...base } = sampleElection({ minAnonymitySet: 5, ...extra });
  void _phased;
  const created = await call(createElection, { body: base });
  expect(created.status).toBe(201);
  const id = created.json.id as string;
  const auth = { authorization: `Bearer ${created.json.organizerToken}` };
  expect((await call(publish, { params: { id }, headers: auth })).json.status).toBe("open");
  const room = await call(openRoomRoute, { params: { id }, headers: auth, body: { maxSeats: 60, expiresInMin: 180 } });
  return { id, auth, code: room.json.roomCode as string };
}

let ip = 1;
const xff = () => ({ "x-forwarded-for": `10.20.${Math.floor(ip / 200)}.${ip++ % 200}` });

async function seat(org: Org, name = "Persona"): Promise<Seat> {
  const j = await call(join, { params: { roomCode: org.code }, body: { displayName: name }, headers: xff() });
  expect(j.status).toBe(201);
  return j.json as Seat;
}
const face = (v: Seat, seed: number) => call(enroll, { body: { voterId: v.voterId, inviteToken: v.inviteToken, descriptor: descriptor(seed), consent: true } });
async function wallet(org: Org, v: Seat, faceBindingHash: string) {
  const account = privateKeyToAccount(generatePrivateKey());
  const bindingSignature = await account.signTypedData({ domain: faceBindingDomain(), types: FaceBindingTypes, primaryType: "FaceBinding", message: { electionId: org.id, voterId: v.voterId, faceBindingHash: faceBindingHash as `0x${string}`, wallet: account.address } });
  return call(linkWallet, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature } });
}
const register = (v: Seat, commitment: string) => call(identity, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, commitment } });

/** Rostro → vinculación → identidad. Devuelve la clave Semaphore ("vive en el teléfono"). */
async function complete(org: Org, v: Seat, seed: number) {
  const f = await face(v, seed);
  expect(f.status).toBe(201);
  expect((await wallet(org, v, f.json.faceBindingHash)).status).toBe(200);
  const idn = createVoterIdentity();
  expect((await register(v, idn.commitment)).status).toBe(201);
  return idn;
}
async function enter(org: Org, seed: number) {
  const v = await seat(org);
  return { ...v, identity: await complete(org, v, seed) };
}
async function proofFor(org: Org, privateKey: string, option: number) {
  const r = await call(group, { params: { id: org.id } });
  return castBallot(privateKey, r.json.commitments, org.id, option, artifactsPaths);
}
const ballot = (org: Org, proof: unknown) => call(vote, { params: { id: org.id }, body: { proof } });

describe("modo continuo · casos límite (QA evento en vivo)", () => {
  it("K exacto: con 4 inscritos el voto espera; la 5.ª inscripción lo habilita y la boleta registra groupSize 5", async () => {
    const org = await setup();
    const people = [];
    for (let i = 0; i < 4; i++) people.push(await enter(org, 500 + i));
    const at4 = await ballot(org, await proofFor(org, people[0].identity.privateKey, 0));
    expect(at4.status).toBe(409);
    expect(at4.json).toMatchObject({ code: "anonymity_pending", error: "Tu voto se habilita cuando haya 5 personas inscritas (ahora 4)" });
    people.push(await enter(org, 504));
    expect((await call(group, { params: { id: org.id } })).json.size).toBe(5);
    expect((await ballot(org, await proofFor(org, people[0].identity.privateKey, 0))).status).toBe(201);
    // GET /group y GET /roll devuelven el mismo grupo vigente
    const g = (await call(group, { params: { id: org.id } })).json;
    const r = (await call(roll, { params: { id: org.id } })).json;
    expect(r).toEqual(g);
    expect((await call(close, { params: { id: org.id }, headers: org.auth })).json.status).toBe("auditable");
    const pkg = (await call(artifacts, { params: { id: org.id } })).json;
    expect(pkg.ledger.filter((e: { kind: string }) => e.kind === "ballot").map((e: { groupSize: number }) => e.groupSize)).toEqual([5]);
  }, 120_000);

  it("/identity reintentado con el mismo commitment (respuesta perdida) → 201 otra vez, sin duplicar; con otro commitment → 409", async () => {
    const org = await setup();
    const v = await seat(org);
    const f = await face(v, 600);
    expect((await wallet(org, v, f.json.faceBindingHash)).status).toBe(200);
    const idn = createVoterIdentity();
    expect((await register(v, idn.commitment)).status).toBe(201);
    const again = await register(v, idn.commitment);
    expect(again.status).toBe(201);
    expect(again.json).toEqual({ ok: true, registeredCount: 1 });
    expect((await call(group, { params: { id: org.id } })).json.size).toBe(1);
    const other = await register(v, createVoterIdentity().commitment);
    expect(other.status).toBe(409);
    expect(other.json.code).toBe("already_voted");
    expect((await call(group, { params: { id: org.id } })).json.size).toBe(1);
  }, 60_000);

  it("cerrar con gente a medio inscribir: rostro, vinculación e identidad responden 409 con mensaje claro; sin plantillas", async () => {
    const org = await setup({ minAnonymitySet: 2 });
    const onlySeat = await seat(org);
    const afterFace = await seat(org);
    const fa = await face(afterFace, 701);
    const afterWallet = await seat(org);
    const fw = await face(afterWallet, 702);
    expect((await wallet(org, afterWallet, fw.json.faceBindingHash)).status).toBe(200);

    expect((await call(close, { params: { id: org.id }, headers: org.auth })).json.status).toBe("auditable");
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);

    const r1 = await face(onlySeat, 703);
    const r2 = await wallet(org, afterFace, fa.json.faceBindingHash);
    const r3 = await register(afterWallet, createVoterIdentity().commitment);
    for (const r of [r1, r2, r3]) expect(r.json).toEqual({ code: "closed", error: CLOSED_MSG });
    expect([r1.status, r2.status, r3.status]).toEqual([409, 409, 409]);
    // Y la invitación ya dice "closed" (la pantalla del votante pasa a "La votación terminó")
    expect((await call(invite, { params: { token: onlySeat.inviteToken } })).json.election.status).toBe("auditable");
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);
  }, 60_000);

  it("carrera: un rostro que pasó el chequeo justo antes del cierre no deja plantilla después del borrado", async () => {
    const org = await setup({ minAnonymitySet: 2 });
    const v = await seat(org);
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    // Alguien tiene el lock de inscripción (p. ej. otro enrolamiento en curso)…
    const holder = withLock(`enroll:${org.id}`, () => held);
    // …el organizador cierra (queda esperando ese lock) y entonces llega este rostro (pasa el chequeo: sigue `open`).
    const closing = call(close, { params: { id: org.id }, headers: org.auth });
    await new Promise((r) => setTimeout(r, 20));
    const enrolling = face(v, 801);
    await new Promise((r) => setTimeout(r, 20));
    release();
    await holder;
    const [c, f] = await Promise.all([closing, enrolling]);
    expect(c.json.status).toBe("auditable");
    expect(f.status).toBe(409);
    expect(f.json).toEqual({ code: "closed", error: CLOSED_MSG });
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);
  }, 60_000);

  it("voto en vuelo durante el cierre → 409 closed y no entra al recuento; dos votos simultáneos del mismo votante → 201 + 409", async () => {
    const org = await setup({ minAnonymitySet: 2 });
    const a = await enter(org, 901);
    const b = await enter(org, 902);
    const c = await enter(org, 903);
    // Mismo votante, dos pestañas, dos opciones distintas, a la vez → una entra, la otra es doble voto.
    const [p0, p1] = await Promise.all([proofFor(org, a.identity.privateKey, 0), proofFor(org, a.identity.privateKey, 1)]);
    const both = await Promise.all([ballot(org, p0), ballot(org, p1)]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(both.find((r) => r.status === 409)!.json.code).toBe("already_voted");
    expect((await ballot(org, await proofFor(org, b.identity.privateKey, 2))).status).toBe(201);
    // c prepara su voto; el organizador cierra justo cuando c lo envía.
    const late = await proofFor(org, c.identity.privateKey, 2);
    const [closed, inflight] = await Promise.all([call(close, { params: { id: org.id }, headers: org.auth }), ballot(org, late)]);
    expect(closed.json.status).toBe("auditable");
    expect(inflight.status).toBe(409);
    expect(inflight.json.code).toBe("closed");
    const t = (await call(tally, { params: { id: org.id } })).json;
    expect(t).toMatchObject({ totalVotes: 2, eligible: 3 });
    expect((await call(audit, { params: { id: org.id } })).json.auditResult.valid).toBe(true);
  }, 120_000);

  it("C3 en continuo: mientras se vota el desglose sale por lotes de 2 boletas (el 5.º voto no lo mueve, el 6.º sí); al cerrar, exacto", async () => {
    const org = await setup({ minAnonymitySet: 2 });
    const people = [];
    for (let i = 0; i < 6; i++) people.push(await enter(org, 950 + i));
    const choices = [0, 0, 1, 2, 1, 2];
    for (let i = 0; i < 5; i++) expect((await ballot(org, await proofFor(org, people[i].identity.privateKey, choices[i]))).status).toBe(201);
    const five = (await call(tally, { params: { id: org.id } })).json;
    expect(five.options.map((o: { count: number }) => o.count)).toEqual([2, 1, 1]); // 4 del lote completo; el 5.º espera
    expect((await ballot(org, await proofFor(org, people[5].identity.privateKey, choices[5]))).status).toBe(201);
    const six = (await call(tally, { params: { id: org.id } })).json;
    expect(six).toMatchObject({ totalVotes: 6, eligible: 6, status: "open" });
    expect(six.options.map((o: { count: number }) => o.count)).toEqual([2, 2, 2]); // el 6.º completa el lote
    await call(close, { params: { id: org.id }, headers: org.auth });
    const final = (await call(tally, { params: { id: org.id } })).json;
    expect(final.options.map((o: { count: number }) => o.count)).toEqual([2, 2, 2]);
  }, 120_000);

  it("credencial reusada → 409 badge_used; gemelo en revisión: aprobado vota, pendiente al cerrar queda rechazado", async () => {
    const org = await setup({ minAnonymitySet: 2, eligibility: { method: "event-badge", badgeCheck: "none" } });
    const scan = (u: string) => call(joinBadge, { params: { roomCode: org.code }, body: { badgeUrl: `${P}${u}` }, headers: xff() });
    const ana = (await scan("ana-qa")).json as Seat;
    const reused = await scan("ana-qa");
    expect(reused.status).toBe(409);
    expect(reused.json.code).toBe("badge_used");
    const beto = (await scan("beto-qa")).json as Seat;
    const anaKey = await complete(org, ana, 1001);
    await complete(org, beto, 1002);
    // Gemela de Ana (misma cara, credencial propia) → revisión; el organizador la aprueba en persona.
    const gemela = (await scan("ana-gemela")).json as Seat;
    const g1 = await face(gemela, 1001);
    expect(g1.status).toBe(202);
    const list = await call(listReviews, { params: { id: org.id }, headers: org.auth });
    const reviewId = list.json.reviews[0].reviewId as string;
    expect((await call(decide, { params: { id: org.id, reviewId }, headers: org.auth, body: { decision: "approve" } })).status).toBe(200);
    const inv = (await call(invite, { params: { token: gemela.inviteToken } })).json;
    expect(inv.voter.review).toBeNull();
    const voterRow = await store.getVoter(gemela.voterId);
    expect((await wallet(org, gemela, voterRow!.faceBindingHash!)).status).toBe(200);
    const gemelaKey = createVoterIdentity();
    expect((await register(gemela, gemelaKey.commitment)).status).toBe(201);
    expect((await ballot(org, await proofFor(org, gemelaKey.privateKey, 1))).status).toBe(201);
    expect((await ballot(org, await proofFor(org, anaKey.privateKey, 0))).status).toBe(201);

    // Un tercer "gemelo" queda pendiente y el organizador cierra sin decidir.
    const tercero = (await scan("ana-tercero")).json as Seat;
    expect((await face(tercero, 1001)).status).toBe(202);
    expect((await call(invite, { params: { token: tercero.inviteToken } })).json.voter.review).toBe("pending");
    expect((await call(close, { params: { id: org.id }, headers: org.auth })).json.status).toBe("auditable");
    expect((await call(invite, { params: { token: tercero.inviteToken } })).json.voter.review).toBe("rejected");
    const after = await call(listReviews, { params: { id: org.id }, headers: org.auth });
    expect(after.json).toMatchObject({ pending: 0, approved: 1 });
    const pendingId = after.json.reviews.find((r: { status: string; decidedBy: string }) => r.status === "rejected").reviewId as string;
    expect((await call(decide, { params: { id: org.id, reviewId: pendingId }, headers: org.auth, body: { decision: "approve" } })).status).toBe(409);
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);
    const pkg = (await call(artifacts, { params: { id: org.id } })).json;
    expect(pkg.manualApprovals).toMatchObject({ count: 1, method: "organizer-in-person" });
    expect(pkg.rollPolicy).toMatchObject({ kind: "event-badge", enrolled: 3 });
    expect((await call(audit, { params: { id: org.id } })).json.auditResult.valid).toBe(true);
  }, 120_000);
});
