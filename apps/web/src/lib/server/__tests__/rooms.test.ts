/**
 * Sala abierta (asamblea abierta): tope, expiración, fase, auth, alias, cierre al abrir la votación, rate limit
 * y `rollPolicy: open-room` en el paquete de auditoría verificado (pruebas Semaphore REALES).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { FaceBindingTypes } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts } from "@quorum/protocol-adapter";
import { POST as createElection } from "@/app/api/elections/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { GET as listVoters } from "@/app/api/elections/[id]/voters/route";
import { DELETE as closeRoomRoute, GET as getRoom, POST as openRoomRoute } from "@/app/api/elections/[id]/room/route";
import { GET as roomInfo } from "@/app/api/rooms/[roomCode]/route";
import { POST as join } from "@/app/api/rooms/[roomCode]/join/route";
import { GET as invite } from "@/app/api/invite/[token]/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as linkWallet } from "@/app/api/voters/[id]/wallet/route";
import { POST as identity } from "@/app/api/voters/[id]/identity/route";
import { POST as openRoute } from "@/app/api/elections/[id]/open/route";
import { GET as roll } from "@/app/api/elections/[id]/roll/route";
import { POST as vote } from "@/app/api/elections/[id]/vote/route";
import { POST as close } from "@/app/api/elections/[id]/close/route";
import { GET as artifacts } from "@/app/api/elections/[id]/artifacts/route";
import { GET as audit } from "@/app/api/elections/[id]/audit/route";
import { POST as auditVerify } from "@/app/api/audit/verify/route";
import { faceBindingDomain, setWalletRpcVerifierForTests } from "../wallet";
import { setEngineHooksForTests } from "../engine";
import { call, descriptor, freshStore, sampleElection } from "./helpers";
import type { MemoryStore } from "../store";

let store: MemoryStore;
beforeEach(() => {
  store = freshStore();
  setEngineHooksForTests({});
  setWalletRpcVerifierForTests(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

type Org = { id: string; auth: Record<string, string> };

async function createDraft(): Promise<Org> {
  const created = await call(createElection, { body: sampleElection() });
  expect(created.status).toBe(201);
  return { id: created.json.id as string, auth: { authorization: `Bearer ${created.json.organizerToken}` } };
}

async function setupRegistration(): Promise<Org> {
  const org = await createDraft();
  const pub = await call(publish, { params: { id: org.id }, headers: org.auth });
  expect(pub.json.status).toBe("registration");
  return org;
}

async function openRoom(org: Org, maxSeats = 60, expiresInMin = 15) {
  return call(openRoomRoute, { params: { id: org.id }, headers: org.auth, body: { maxSeats, expiresInMin } });
}

let ipSeq = 0;
async function joinAs(roomCode: string, displayName: unknown, ip = `10.0.0.${++ipSeq}`) {
  return call(join, { params: { roomCode }, body: { displayName }, headers: { "x-forwarded-for": ip } });
}

/** Rostro → wallet (FaceBinding) → identidad Semaphore, con el inviteToken que dio la sala. */
async function registerFromRoom(org: Org, v: { voterId: string; inviteToken: string }, seed: number) {
  const en = await call(enroll, { body: { voterId: v.voterId, inviteToken: v.inviteToken, descriptor: descriptor(seed), consent: true } });
  if (en.status !== 201) return { enroll: en };
  const account = privateKeyToAccount(generatePrivateKey());
  const bindingSignature = await account.signTypedData({
    domain: faceBindingDomain(),
    types: FaceBindingTypes,
    primaryType: "FaceBinding",
    message: { electionId: org.id, voterId: v.voterId, faceBindingHash: en.json.faceBindingHash, wallet: account.address },
  });
  const w = await call(linkWallet, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature } });
  expect(w.status).toBe(200);
  const id = createVoterIdentity();
  const idr = await call(identity, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, commitment: id.commitment } });
  expect(idr.status).toBe(201);
  return { enroll: en, identity: id };
}

describe("Sala abierta — auth y fase", () => {
  it("sin Bearer → 401 en POST y DELETE; GET público no revela el código", async () => {
    const org = await setupRegistration();
    expect((await call(openRoomRoute, { params: { id: org.id }, body: { maxSeats: 10, expiresInMin: 5 } })).status).toBe(401);
    const wrong = { authorization: "Bearer token-de-otro-organizador-xxxxxxxxxxxxxxxxxxxxxxxx" };
    expect((await call(openRoomRoute, { params: { id: org.id }, headers: wrong, body: { maxSeats: 10, expiresInMin: 5 } })).status).toBe(401);
    expect((await call(closeRoomRoute, { method: "DELETE", params: { id: org.id } })).status).toBe(401);

    const opened = await openRoom(org, 10, 5);
    expect(opened.status).toBe(201);
    expect(opened.json.roomCode).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    expect(opened.json.joinUrl).toBe(`http://localhost:3000/j/${opened.json.roomCode}`);

    const pub = await call(getRoom, { params: { id: org.id } });
    expect(pub.status).toBe(200);
    expect(pub.json).toEqual({ open: true, seatsTaken: 0, maxSeats: 10, expiresAt: opened.json.expiresAt, closedReason: null });
    expect(JSON.stringify(pub.json)).not.toContain(opened.json.roomCode);
    const priv = await call(getRoom, { params: { id: org.id }, headers: org.auth });
    expect(priv.json).toMatchObject({ open: true, roomCode: opened.json.roomCode, joinUrl: opened.json.joinUrl });
  });

  it("fase incorrecta: en draft y tras abrir la votación → 409 closed; inputs fuera de rango → 400", async () => {
    const org = await createDraft();
    const d = await openRoom(org);
    expect(d.status).toBe(409);
    expect(d.json.code).toBe("closed");
    await call(publish, { params: { id: org.id }, headers: org.auth });
    expect((await openRoom(org, 0, 5)).status).toBe(400);
    expect((await openRoom(org, 10, 0)).status).toBe(400);
    expect((await openRoom(org, 501, 5)).status).toBe(400);
    expect((await call(getRoom, { params: { id: "el_inexistente" } })).status).toBe(404);
    const none = await call(getRoom, { params: { id: org.id } });
    expect(none.json).toEqual({ open: false, seatsTaken: 0, maxSeats: null, expiresAt: null, closedReason: null });
  });
});

describe("Sala abierta — entrada", () => {
  it("join crea votante source:room sin teléfono, devuelve inviteToken una vez y sigue el flujo /v/<token>", async () => {
    const org = await setupRegistration();
    const { json: room } = await openRoom(org, 60, 15);
    const j = await joinAs(room.roomCode.toLowerCase(), "  José   María  ");
    expect(j.status).toBe(201);
    expect(Object.keys(j.json).sort()).toEqual(["displayName", "electionId", "inviteToken", "inviteUrl", "voterId"]);
    expect(j.json.displayName).toBe("José María");
    expect(j.json.inviteUrl).toBe(`http://localhost:3000/v/${j.json.inviteToken}`);

    const saved = await store.getVoter(j.json.voterId);
    expect(saved).toMatchObject({ source: "room", electionId: org.id, inviteStatus: "claimed" });
    expect(saved?.phoneE164).toBeUndefined();

    const inv = await call(invite, { params: { token: j.json.inviteToken } });
    expect(inv.status).toBe(200);
    expect(inv.json.voter.id).toBe(j.json.voterId);

    const info = await call(roomInfo, { params: { roomCode: room.roomCode } });
    expect(info.json).toMatchObject({ electionId: org.id, open: true, seatsTaken: 1, maxSeats: 60 });
    expect(info.json).not.toHaveProperty("roomCode");
    expect((await call(roomInfo, { params: { roomCode: "ZZZZZZ" } })).status).toBe(404);
    expect((await joinAs("ZZZZZZ", "Ana")).status).toBe(404);
    expect((await joinAs("../../x", "Ana")).status).toBe(404);

    // El organizador ve el origen en su lista (sin teléfono)
    const priv = await call(listVoters, { params: { id: org.id }, headers: org.auth });
    expect(priv.json.voters[0]).toMatchObject({ displayName: "José María", source: "room", state: "invited" });
  });

  it("alias con caracteres raros → 400; nunca algo con forma de teléfono", async () => {
    const org = await setupRegistration();
    const { json: room } = await openRoom(org);
    const bad: unknown[] = [
      "",
      "   ",
      "<script>alert(1)</script>",
      "Ana\u0000",
      "Ana​Beta", // zero-width space
      "Ana\nBeta‮", // salto + override RTL (se colapsa el salto; el RLO no pasa)
      "😀😀",
      "+58 412 1234567",
      "04121234567",
      "V-12.345.678",
      "a".repeat(33),
      "http://evil.example/x",
      42,
      null,
    ];
    for (const displayName of bad) {
      const r = await joinAs(room.roomCode, displayName);
      expect(r.status, JSON.stringify(displayName)).toBe(400);
      expect(r.json.code).toBe("invalid_input");
    }
    for (const ok of ["O'Neil-2", "María_José", "Mesa 3", "Zoë", "李雷"]) expect((await joinAs(room.roomCode, ok)).status, ok).toBe(201);
    // NFD → NFC
    const nfd = await joinAs(room.roomCode, "José");
    expect(nfd.json.displayName).toBe("José");
    expect((await call(getRoom, { params: { id: org.id } })).json.seatsTaken).toBe(6);
  });

  it("tope: con maxSeats=2 el tercero recibe 409 room_full; reabrir con tope menor que los ocupados → 400", async () => {
    const org = await setupRegistration();
    const { json: room } = await openRoom(org, 2, 15);
    expect((await joinAs(room.roomCode, "Uno")).status).toBe(201);
    expect((await joinAs(room.roomCode, "Dos")).status).toBe(201);
    const full = await joinAs(room.roomCode, "Tres");
    expect(full.status).toBe(409);
    expect(full.json.code).toBe("room_full");
    expect((await store.listVoters(org.id)).length).toBe(2);
    expect((await call(getRoom, { params: { id: org.id } })).json).toMatchObject({ open: true, seatsTaken: 2, maxSeats: 2 });

    expect((await openRoom(org, 1, 15)).status).toBe(400);
    // Ampliar la sala abierta conserva el código (no hay que reimprimir el QR) → 200
    const more = await openRoom(org, 3, 15);
    expect(more.status).toBe(200);
    expect(more.json.roomCode).toBe(room.roomCode);
    expect((await joinAs(room.roomCode, "Tres")).status).toBe(201);
  });

  it("entradas concurrentes no superan el tope", async () => {
    const org = await setupRegistration();
    const { json: room } = await openRoom(org, 5, 15);
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => joinAs(room.roomCode, `Vecino ${i}`)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(7);
    expect((await store.listVoters(org.id)).length).toBe(5);
  });

  it("expiración: pasado expiresInMin → 410 room_closed y GET open:false closedReason:expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-24T15:00:00.000Z"));
    const org = await setupRegistration();
    const { json: room } = await openRoom(org, 60, 1);
    expect(room.expiresAt).toBe("2026-10-24T15:01:00.000Z");
    expect((await joinAs(room.roomCode, "A tiempo")).status).toBe(201);
    vi.setSystemTime(new Date("2026-10-24T15:01:00.001Z"));
    const late = await joinAs(room.roomCode, "Tarde");
    expect(late.status).toBe(410);
    expect(late.json.code).toBe("room_closed");
    expect(late.json.error).toMatch(/expiró/);
    expect((await call(getRoom, { params: { id: org.id } })).json).toMatchObject({ open: false, seatsTaken: 1, closedReason: "expired" });
    // Reabrir tras expirar da un código NUEVO; el viejo queda cerrado
    const again = await openRoom(org, 60, 5);
    expect(again.status).toBe(201);
    expect(again.json.roomCode).not.toBe(room.roomCode);
    expect((await joinAs(room.roomCode, "Viejo")).status).toBe(410);
    expect((await call(roomInfo, { params: { roomCode: room.roomCode } })).json.open).toBe(false);
    expect((await joinAs(again.json.roomCode, "Nuevo")).status).toBe(201);
  });

  it("DELETE cierra la sala (idempotente): 410 al entrar; los ya inscritos siguen en el censo", async () => {
    const org = await setupRegistration();
    const { json: room } = await openRoom(org);
    expect((await joinAs(room.roomCode, "Ana")).status).toBe(201);
    const del = await call(closeRoomRoute, { method: "DELETE", params: { id: org.id }, headers: org.auth });
    expect(del.status).toBe(200);
    expect(del.json).toMatchObject({ open: false, closedReason: "manual", seatsTaken: 1 });
    expect((await call(closeRoomRoute, { method: "DELETE", params: { id: org.id }, headers: org.auth })).json.closedReason).toBe("manual");
    const r = await joinAs(room.roomCode, "Beto");
    expect(r.status).toBe(410);
    expect(r.json.code).toBe("room_closed");
    expect(await store.listVoters(org.id)).toHaveLength(1);
  });

  it("rate limit por IP en join → 429", async () => {
    vi.stubEnv("QUORUM_RATELIMIT", "on");
    vi.stubEnv("ROOM_JOIN_RATE_PER_MIN", "2");
    const org = await setupRegistration();
    const { json: room } = await openRoom(org);
    const ip = "203.0.113.77";
    expect((await joinAs(room.roomCode, "Uno", ip)).status).toBe(201);
    expect((await joinAs(room.roomCode, "Dos", ip)).status).toBe(201);
    expect((await joinAs(room.roomCode, "Tres", ip)).status).toBe(429);
    expect((await joinAs(room.roomCode, "Cuatro", "203.0.113.78")).status).toBe(201);
  });
});

describe("Sala abierta — apertura de la votación y paquete de auditoría", () => {
  it("al abrir la votación la sala se cierra sola; dedupe facial 409; rollPolicy open-room en el paquete verificado", async () => {
    const org = await setupRegistration();
    const { json: room } = await openRoom(org, 60, 15);

    const a = (await joinAs(room.roomCode, "Ana")).json;
    const b = (await joinAs(room.roomCode, "Beto")).json;
    const c = (await joinAs(room.roomCode, "Ana otra vez")).json;
    const ra = await registerFromRoom(org, a, 501);
    const rb = await registerFromRoom(org, b, 502);
    // La misma persona entra dos veces a la sala: el dedupe 1:N la frena (control "una persona = un lugar", demo).
    const rc = await registerFromRoom(org, c, 501);
    expect(rc.enroll.status).toBe(409);
    expect(rc.enroll.json.code).toBe("duplicate_identity");

    const opened = await call(openRoute, { params: { id: org.id }, headers: org.auth });
    expect(opened.status).toBe(200);
    expect(opened.json.status).toBe("open");

    expect((await call(getRoom, { params: { id: org.id } })).json).toMatchObject({ open: false, closedReason: "election-opened", seatsTaken: 3, maxSeats: 60 });
    const late = await joinAs(room.roomCode, "Tarde");
    expect(late.status).toBe(410);
    expect(late.json.error).toMatch(/votación ya comenzó/);
    expect((await openRoom(org)).status).toBe(409);

    // Un voto real y cierre → paquete + verificador real
    const r = await call(roll, { params: { id: org.id } });
    expect(r.json.commitments).toHaveLength(2);
    const proof = await castBallot(ra.identity!.privateKey, r.json.commitments, org.id, 1, defaultArtifacts());
    expect((await call(vote, { params: { id: org.id }, body: { proof } })).status).toBe(201);
    void rb;
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.status).toBe(200);
    expect(closed.json.status).toBe("auditable");

    const art = await call(artifacts, { params: { id: org.id } });
    expect(art.json.rollPolicy).toEqual({
      kind: "open-room",
      maxSeats: 60,
      joined: 3,
      enrolled: 2,
      eligibility: "face-dedupe-demo",
      note: "censo abierto en sala: la elegibilidad depende de la deduplicación facial demo, no de un padrón",
    });
    // Nada de alias ni ids de votante en el paquete público
    const raw = JSON.stringify(art.json);
    for (const s of ["Ana", "Beto", a.voterId, a.inviteToken]) expect(raw).not.toContain(s);

    const au = await call(audit, { params: { id: org.id } });
    expect(au.json.auditResult.valid).toBe(true);
    const note = (au.json.auditResult.unsupportedGuarantees as string[]).find((g) => g.startsWith("censo-abierto-en-sala"));
    expect(note).toMatch(/la elegibilidad depende de la deduplicación facial demo, no de un padrón/);
    expect(note).toMatch(/tope 60 asientos, entraron 3, 2 llegaron al padrón de 2 commitments/);

    // Re-verificación independiente con los bytes publicados
    const rv = await call(auditVerify, { rawBody: JSON.stringify({ package: art.json }) });
    expect(rv.status).toBe(200);
    expect(rv.json.valid).toBe(true);
    expect((rv.json.unsupportedGuarantees as string[]).some((g) => g.startsWith("censo-abierto-en-sala"))).toBe(true);
  }, 60_000);

  it("elección solo por invitación: el paquete no declara rollPolicy", async () => {
    const org = await setupRegistration();
    const { POST: addVoters } = await import("@/app/api/elections/[id]/voters/route");
    const added = await call(addVoters, { params: { id: org.id }, headers: org.auth, body: { voters: [{ displayName: "Invitada" }] } });
    const v = added.json.voters[0];
    await registerFromRoom(org, { voterId: v.id, inviteToken: v.inviteToken }, 777);
    expect((await call(openRoute, { params: { id: org.id }, headers: org.auth })).status).toBe(200);
    expect((await call(close, { params: { id: org.id }, headers: org.auth })).status).toBe(200);
    const art = await call(artifacts, { params: { id: org.id } });
    expect(art.json).not.toHaveProperty("rollPolicy");
    const au = await call(audit, { params: { id: org.id } });
    expect((au.json.auditResult.unsupportedGuarantees as string[]).some((g) => g.startsWith("censo-abierto-en-sala"))).toBe(false);
  }, 60_000);
});
