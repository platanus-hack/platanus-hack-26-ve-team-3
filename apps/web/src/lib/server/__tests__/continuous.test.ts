/**
 * D-22 modo continuo contra los route handlers reales, con pruebas Semaphore REALES (Groth16):
 * crear (sin votingMode → continuo) → publicar = abrir (draft → open) → sala abierta DURANTE la votación → la gente entra,
 * se inscribe (member_added) y vota en el momento → K mínimo → raíces históricas dentro de la ventana → doble voto
 * rechazado → concurrencia bajo el lock → cerrar (sala + votación) → paquete verificado con root_history y anonymity_set_min.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { FaceBindingTypes } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts } from "@quorum/protocol-adapter";
import { POST as createElection } from "@/app/api/elections/route";
import { GET as getElection } from "@/app/api/elections/[id]/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { DELETE as closeRoomRoute, GET as getRoom, POST as openRoomRoute } from "@/app/api/elections/[id]/room/route";
import { POST as join } from "@/app/api/rooms/[roomCode]/join/route";
import { GET as invite } from "@/app/api/invite/[token]/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as linkWallet } from "@/app/api/voters/[id]/wallet/route";
import { POST as identity } from "@/app/api/voters/[id]/identity/route";
import { POST as openRoute } from "@/app/api/elections/[id]/open/route";
import { GET as roll } from "@/app/api/elections/[id]/roll/route";
import { GET as group } from "@/app/api/elections/[id]/group/route";
import { POST as vote } from "@/app/api/elections/[id]/vote/route";
import { GET as tally } from "@/app/api/elections/[id]/tally/route";
import { GET as ledger } from "@/app/api/elections/[id]/ledger/route";
import { POST as close } from "@/app/api/elections/[id]/close/route";
import { GET as artifacts } from "@/app/api/elections/[id]/artifacts/route";
import { GET as audit } from "@/app/api/elections/[id]/audit/route";
import { faceBindingDomain, setWalletRpcVerifierForTests } from "../wallet";
import { setEngineHooksForTests } from "../engine";
import { call, descriptor, freshStore, sampleElection } from "./helpers";
import type { MemoryStore } from "../store";

const artifactsPaths = defaultArtifacts();
let store: MemoryStore;
beforeEach(() => {
  store = freshStore();
  setEngineHooksForTests({});
  setWalletRpcVerifierForTests(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

type Org = { id: string; auth: Record<string, string> };

/** Votación nueva SIN votingMode (el predeterminado es continuo), publicada: queda `open` de inmediato. */
async function setupContinuous(extra: Record<string, unknown> = {}): Promise<Org> {
  const { votingMode: _phased, ...base } = sampleElection({ minAnonymitySet: 5, ...extra });
  void _phased;
  const created = await call(createElection, { body: base });
  expect(created.status).toBe(201);
  expect(created.json).toMatchObject({ status: "draft", votingMode: "continuous" });
  const id = created.json.id as string;
  const auth = { authorization: `Bearer ${created.json.organizerToken}` };
  const pub = await call(publish, { params: { id }, headers: auth });
  expect(pub.status).toBe(200);
  expect(pub.json.status).toBe("open");
  return { id, auth };
}

async function openRoom(org: Org, maxSeats = 50) {
  const r = await call(openRoomRoute, { params: { id: org.id }, headers: org.auth, body: { maxSeats, expiresInMin: 180 } });
  expect(r.status).toBeLessThan(300);
  return r.json.roomCode as string;
}

let ipSeq = 1;
/** Entra por la sala → rostro → wallet → identidad. Devuelve la clave Semaphore (vive solo en "el teléfono" del test). */
async function enter(roomCode: string, org: Org, seed: number) {
  const j = await call(join, { params: { roomCode }, body: { displayName: `Persona ${seed}` }, headers: { "x-forwarded-for": `10.0.${Math.floor(ipSeq / 200)}.${ipSeq++ % 200}` } });
  expect(j.status).toBe(201);
  const v = j.json as { voterId: string; inviteToken: string };
  const en = await call(enroll, { body: { voterId: v.voterId, inviteToken: v.inviteToken, descriptor: descriptor(seed), consent: true } });
  expect(en.status).toBe(201);
  const account = privateKeyToAccount(generatePrivateKey());
  const bindingSignature = await account.signTypedData({ domain: faceBindingDomain(), types: FaceBindingTypes, primaryType: "FaceBinding", message: { electionId: org.id, voterId: v.voterId, faceBindingHash: en.json.faceBindingHash, wallet: account.address } });
  const w = await call(linkWallet, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature } });
  expect(w.status).toBe(200);
  const idn = createVoterIdentity();
  const idr = await call(identity, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, commitment: idn.commitment } });
  expect(idr.status).toBe(201);
  return { ...v, identity: idn };
}

async function proofFor(org: Org, privateKey: string, option: number) {
  const r = await call(group, { params: { id: org.id } });
  return castBallot(privateKey, r.json.commitments, org.id, option, artifactsPaths);
}

describe("modo continuo (D-22): se inscriben y votan en el mismo momento", () => {
  it("publicar abre la votación; la sala sigue abierta; K=5; raíz vieja dentro de la ventana; doble voto; cerrar → paquete verificado", async () => {
    const org = await setupContinuous();
    const el = await call(getElection, { params: { id: org.id } });
    expect(el.json).toMatchObject({ status: "open", votingMode: "continuous", minAnonymitySet: 5 });

    // POST /open sobre una votación continua ya abierta → 409 con motivo claro
    const reopen = await call(openRoute, { params: { id: org.id }, headers: org.auth });
    expect(reopen.status).toBe(409);
    expect(reopen.json.error).toMatch(/ya está abierta/);

    const code = await openRoom(org);
    const people = [];
    for (let i = 0; i < 3; i++) people.push(await enter(code, org, 300 + i));

    const g = await call(group, { params: { id: org.id } });
    expect(g.json).toMatchObject({ votingMode: "continuous", size: 3, minAnonymitySet: 5, rootWindow: 32, frozen: false });
    const r = await call(roll, { params: { id: org.id } });
    expect(r.json.groupRoot).toBe(g.json.groupRoot);

    // La invitación expone el modo y K para la pantalla del votante
    const inv = await call(invite, { params: { token: people[0].inviteToken } });
    expect(inv.json.election).toMatchObject({ status: "open", votingMode: "continuous", minAnonymitySet: 5 });

    // K no alcanzado: 3 inscritos → 409 anonymity_pending con el mensaje para el votante
    const early = await call(vote, { params: { id: org.id }, body: { proof: await proofFor(org, people[0].identity.privateKey, 0) } });
    expect(early.status).toBe(409);
    expect(early.json).toMatchObject({ code: "anonymity_pending", error: "Tu voto se habilita cuando haya 5 personas inscritas (ahora 3)" });

    // Dedupe facial 1:N sigue activo mientras se vota (las plantillas no se borran al abrir)
    const dupJoin = await call(join, { params: { roomCode: code }, body: { displayName: "Gemelo" }, headers: { "x-forwarded-for": "10.9.9.9" } });
    const dupFace = await call(enroll, { body: { voterId: dupJoin.json.voterId, inviteToken: dupJoin.json.inviteToken, descriptor: descriptor(300), consent: true } });
    expect(dupFace.status).toBe(409);
    expect(dupFace.json.code).toBe("duplicate_identity");

    for (let i = 3; i < 5; i++) people.push(await enter(code, org, 300 + i));
    const v0 = await call(vote, { params: { id: org.id }, body: { proof: await proofFor(org, people[0].identity.privateKey, 0) } });
    expect(v0.status).toBe(201);

    // #1 prepara su voto con la raíz de 5; mientras tanto entran 2 más; al enviar sigue valiendo (ventana de 32)
    const staleButOk = await proofFor(org, people[1].identity.privateKey, 1);
    for (let i = 5; i < 7; i++) people.push(await enter(code, org, 300 + i));
    const v1 = await call(vote, { params: { id: org.id }, body: { proof: staleButOk } });
    expect(v1.status).toBe(201);
    const v6 = await call(vote, { params: { id: org.id }, body: { proof: await proofFor(org, people[6].identity.privateKey, 2) } });
    expect(v6.status).toBe(201);

    // Doble voto
    const again = await call(vote, { params: { id: org.id }, body: { proof: await proofFor(org, people[0].identity.privateKey, 2) } });
    expect(again.status).toBe(409);
    expect(again.json.code).toBe("already_voted");

    // Contadores en vivo: inscritos / votaron
    const t = await call(tally, { params: { id: org.id } });
    expect(t.json).toMatchObject({ eligible: 7, totalVotes: 3, status: "open" });
    const l = await call(ledger, { params: { id: org.id } });
    expect(l.json).toMatchObject({ count: 3, proofsPublished: false, entries: [] });
    expect((await call(getRoom, { params: { id: org.id } })).json.open).toBe(true);
    expect(await store.listFaceTemplates(org.id)).not.toHaveLength(0);

    // Cerrar = cerrar sala + votación
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.status).toBe(200);
    expect(closed.json.status).toBe("auditable");
    expect(closed.json.groupRoot).toBe((await call(group, { params: { id: org.id } })).json.groupRoot);
    expect((await call(getRoom, { params: { id: org.id } })).json).toMatchObject({ open: false, closedReason: "election-closed" });
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);
    const late = await call(join, { params: { roomCode: code }, body: { displayName: "Tarde" }, headers: { "x-forwarded-for": "10.8.8.8" } });
    expect(late.status).toBe(410);

    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.auditResult.valid).toBe(true);
    const names = au.json.auditResult.checks.map((c: { name: string }) => c.name);
    expect(names).toEqual(expect.arrayContaining(["root_history", "anonymity_set_min"]));
    const anon = au.json.auditResult.checks.find((c: { name: string }) => c.name === "anonymity_set_min");
    expect(anon.reason).toMatch(/mínimo 5, mediana 5/);
    expect(au.json.auditResult.unsupportedGuarantees.join("\n")).toMatch(/correlacion-temporal-en-modo-continuo/);

    const pkg = (await call(artifacts, { params: { id: org.id } })).json;
    expect(pkg.manifest.enrollment).toEqual({ mode: "continuous", minAnonymitySet: 5, rootWindow: 32 });
    const kinds = pkg.ledger.map((e: { kind: string }) => e.kind);
    expect(kinds.filter((k: string) => k === "member_added")).toHaveLength(7);
    expect(kinds.filter((k: string) => k === "ballot")).toHaveLength(3);
    expect(pkg.ledger.filter((e: { kind: string }) => e.kind === "ballot").map((e: { groupSize: number }) => e.groupSize)).toEqual([5, 5, 7]);
    expect(pkg.rollPolicy).toMatchObject({ kind: "open-room", joined: 8, enrolled: 7 });
    // Sin PII en el paquete: ni voterIds ni alias
    const text = JSON.stringify(pkg);
    for (const p of people) expect(text).not.toContain(p.voterId);
    expect(text).not.toContain("Persona 30");
  }, 120_000);

  it("concurrencia: inscripciones y votos simultáneos bajo el lock → ledger coherente y verificado", async () => {
    const org = await setupContinuous({ minAnonymitySet: 2 });
    const code = await openRoom(org);
    const first = await Promise.all([0, 1, 2].map((i) => enter(code, org, 400 + i)));
    // Pruebas preparadas con la raíz de 3; luego llegan 4 inscripciones y 3 votos A LA VEZ
    const proofs = await Promise.all(first.map((p, i) => proofFor(org, p.identity.privateKey, i % 3)));
    const results = await Promise.all([
      ...[3, 4, 5, 6].map((i) => enter(code, org, 400 + i)),
      ...proofs.map((proof) => call(vote, { params: { id: org.id }, body: { proof } })),
    ]);
    const votes = results.slice(4) as { status: number }[];
    expect(votes.map((v) => v.status)).toEqual([201, 201, 201]);
    const g = await call(group, { params: { id: org.id } });
    expect(g.json.size).toBe(7);
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.json.status).toBe("auditable");
    const pkg = (await call(artifacts, { params: { id: org.id } })).json;
    expect(pkg.manifest.enrollment.minAnonymitySet).toBe(2);
    // índices de member_added consecutivos y únicos pese a la concurrencia
    expect(pkg.ledger.filter((e: { kind: string }) => e.kind === "member_added").map((e: { member: { index: number } }) => e.member.index)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(pkg.tally.total).toBe(3);
  }, 120_000);

  it("«Abrir» en borrador (POST /open) publica y abre a la vez; con fases sigue igual (registration → open)", async () => {
    const { votingMode: _p, ...base } = sampleElection();
    void _p;
    const created = await call(createElection, { body: base });
    const auth = { authorization: `Bearer ${created.json.organizerToken}` };
    const o = await call(openRoute, { params: { id: created.json.id }, headers: auth });
    expect(o.status).toBe(200);
    expect(o.json.status).toBe("open");

    const phased = await call(createElection, { body: sampleElection() });
    expect(phased.json.votingMode).toBe("phased");
    const pub = await call(publish, { params: { id: phased.json.id }, headers: { authorization: `Bearer ${phased.json.organizerToken}` } });
    expect(pub.json.status).toBe("registration");
  });

  it("cerrar sin votos ni inscritos produce un paquete honesto (0 boletas) y la sala se cierra", async () => {
    const org = await setupContinuous();
    await openRoom(org);
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.status).toBe(200);
    expect(closed.json.status).toBe("auditable");
    expect((await call(closeRoomRoute, { params: { id: org.id }, headers: org.auth })).json.closedReason).toBe("election-closed");
  });
});
