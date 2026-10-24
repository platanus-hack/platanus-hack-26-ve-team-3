/**
 * Inicio programado de la votación (`votingStartsAt`): al llegar la hora, la primera petición relevante ejecuta la
 * MISMA transición que `POST /open` (padrón congelado, sala cerrada, plantillas faciales borradas), una sola vez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { FaceBindingTypes } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts, groupRoot } from "@quorum/protocol-adapter";
import { POST as createElection } from "@/app/api/elections/route";
import { GET as getElection } from "@/app/api/elections/[id]/route";
import { POST as publish } from "@/app/api/elections/[id]/publish/route";
import { GET as getRoom, POST as openRoomRoute } from "@/app/api/elections/[id]/room/route";
import { POST as schedule } from "@/app/api/elections/[id]/schedule/route";
import { GET as roomInfo } from "@/app/api/rooms/[roomCode]/route";
import { POST as join } from "@/app/api/rooms/[roomCode]/join/route";
import { GET as invite } from "@/app/api/invite/[token]/route";
import { POST as enroll } from "@/app/api/face/enroll/route";
import { POST as linkWallet } from "@/app/api/voters/[id]/wallet/route";
import { POST as identity } from "@/app/api/voters/[id]/identity/route";
import { POST as openRoute } from "@/app/api/elections/[id]/open/route";
import { GET as roll } from "@/app/api/elections/[id]/roll/route";
import { GET as tally } from "@/app/api/elections/[id]/tally/route";
import { POST as vote } from "@/app/api/elections/[id]/vote/route";
import { POST as close } from "@/app/api/elections/[id]/close/route";
import { faceBindingDomain, setWalletRpcVerifierForTests } from "../wallet";
import { setEngineHooksForTests } from "../engine";
import { call, descriptor, freshStore, sampleElection } from "./helpers";
import type { MemoryStore } from "../store";

let store: MemoryStore;
const T0 = new Date("2026-10-24T15:00:00.000Z");
beforeEach(() => {
  store = freshStore();
  setEngineHooksForTests({});
  setWalletRpcVerifierForTests(undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

type Org = { id: string; auth: Record<string, string> };

async function setupRegistration(): Promise<Org> {
  const created = await call(createElection, { body: sampleElection() });
  expect(created.status).toBe(201);
  const org = { id: created.json.id as string, auth: { authorization: `Bearer ${created.json.organizerToken}` } };
  expect((await call(publish, { params: { id: org.id }, headers: org.auth })).json.status).toBe("registration");
  return org;
}

async function openRoom(org: Org, body: Record<string, unknown> = {}) {
  return call(openRoomRoute, { params: { id: org.id }, headers: org.auth, body: { maxSeats: 60, expiresInMin: 15, ...body } });
}

let ipSeq = 0;
/** Sala → rostro → wallet (FaceBinding) → identidad Semaphore. */
async function enrollVoter(org: Org, roomCode: string, alias: string, seed: number) {
  const j = await call(join, { params: { roomCode }, body: { displayName: alias }, headers: { "x-forwarded-for": `10.9.0.${++ipSeq}` } });
  expect(j.status).toBe(201);
  const v = j.json as { voterId: string; inviteToken: string };
  const en = await call(enroll, { body: { voterId: v.voterId, inviteToken: v.inviteToken, descriptor: descriptor(seed), consent: true } });
  expect(en.status).toBe(201);
  const account = privateKeyToAccount(generatePrivateKey());
  const bindingSignature = await account.signTypedData({
    domain: faceBindingDomain(),
    types: FaceBindingTypes,
    primaryType: "FaceBinding",
    message: { electionId: org.id, voterId: v.voterId, faceBindingHash: en.json.faceBindingHash, wallet: account.address },
  });
  expect((await call(linkWallet, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature } })).status).toBe(200);
  const id = createVoterIdentity();
  expect((await call(identity, { params: { id: v.voterId }, body: { inviteToken: v.inviteToken, commitment: id.commitment } })).status).toBe(201);
  return { ...v, identity: id };
}

const get = (org: Org) => call(getElection, { params: { id: org.id } });

describe("Inicio programado — exposición y valores por defecto", () => {
  it("abrir la sala fija votingStartsAt = cierre de la sala; GET público de elección, sala e invitación lo exponen con serverNow", async () => {
    const org = await setupRegistration();
    expect((await get(org)).json.votingStartsAt).toBeNull();
    const opened = await openRoom(org);
    expect(opened.status).toBe(201);
    expect(opened.json.expiresAt).toBe("2026-10-24T15:15:00.000Z");
    expect(opened.json.votingStartsAt).toBe(opened.json.expiresAt);

    const e = await get(org);
    expect(e.json).toMatchObject({ status: "registration", votingStartsAt: "2026-10-24T15:15:00.000Z", serverNow: T0.toISOString() });
    const pub = await call(getRoom, { params: { id: org.id } });
    expect(pub.json).toEqual({ open: true, seatsTaken: 0, maxSeats: 60, expiresAt: opened.json.expiresAt, closedReason: null, votingStartsAt: opened.json.expiresAt, serverNow: T0.toISOString() });
    const info = await call(roomInfo, { params: { roomCode: opened.json.roomCode } });
    expect(info.json).toMatchObject({ votingStartsAt: opened.json.expiresAt, serverNow: T0.toISOString() });

    const v = (await call(join, { params: { roomCode: opened.json.roomCode }, body: { displayName: "Ana" } })).json;
    const inv = await call(invite, { params: { token: v.inviteToken } });
    expect(inv.json.election.votingStartsAt).toBe(opened.json.expiresAt);
    expect(inv.json.serverNow).toBe(T0.toISOString());
  });

  it("votingStartsAt explícito, relativo o null (a mano); «Ampliar» sin el campo respeta una hora propia", async () => {
    const org = await setupRegistration();
    expect((await openRoom(org, { votingStartsInSec: 20 })).json.votingStartsAt).toBe("2026-10-24T15:00:20.000Z");
    // Ampliar sin el campo: la hora propia (≠ cierre de la sala) se respeta.
    expect((await openRoom(org, { expiresInMin: 30 })).json.votingStartsAt).toBe("2026-10-24T15:00:20.000Z");
    expect((await openRoom(org, { votingStartsAt: null })).json.votingStartsAt).toBeNull();
    expect((await openRoom(org, { votingStartsAt: "2026-10-24T16:00:00.000Z" })).json.votingStartsAt).toBe("2026-10-24T16:00:00.000Z");
    expect((await openRoom(org, { votingStartsAt: "2026-10-24T14:59:00.000Z" })).status).toBe(400); // en el pasado
    expect((await openRoom(org, { votingStartsAt: "2026-11-24T14:59:00.000Z" })).status).toBe(400); // > 7 días
    expect((await openRoom(org, { votingStartsAt: null, votingStartsInSec: 30 })).status).toBe(400);
  });
});

describe("Inicio programado — POST /schedule", () => {
  it("auth, «Empezar en 5 min», «+5 min», sin hora; la sala atada a la hora se mueve con ella", async () => {
    const org = await setupRegistration();
    const opened = await openRoom(org, { expiresInMin: 10 });
    expect((await call(schedule, { params: { id: org.id }, body: { inSeconds: 300 } })).status).toBe(401);
    // +5 min sobre la hora vigente (15:10) → 15:15, y la sala (atada) también cierra a las 15:15.
    const plus = await call(schedule, { params: { id: org.id }, headers: org.auth, body: { addSeconds: 300 } });
    expect(plus.status).toBe(200);
    expect(plus.json).toEqual({ electionId: org.id, status: "registration", votingStartsAt: "2026-10-24T15:15:00.000Z", serverNow: T0.toISOString() });
    expect((await call(getRoom, { params: { id: org.id } })).json.expiresAt).toBe("2026-10-24T15:15:00.000Z");
    // Empezar en 5 min (desde ahora, reloj del servidor) → 15:05; la sala sigue atada.
    const in5 = await call(schedule, { params: { id: org.id }, headers: org.auth, body: { inSeconds: 300 } });
    expect(in5.json.votingStartsAt).toBe("2026-10-24T15:05:00.000Z");
    expect((await call(getRoom, { params: { id: org.id } })).json).toMatchObject({ open: true, expiresAt: "2026-10-24T15:05:00.000Z", votingStartsAt: "2026-10-24T15:05:00.000Z" });
    expect(opened.json.roomCode).toBeTruthy();
    // Sin hora: la abre el organizador a mano.
    expect((await call(schedule, { params: { id: org.id }, headers: org.auth, body: { votingStartsAt: null } })).json.votingStartsAt).toBeNull();
    // +5 min sin hora vigente: desde ahora.
    expect((await call(schedule, { params: { id: org.id }, headers: org.auth, body: { addSeconds: 300 } })).json.votingStartsAt).toBe("2026-10-24T15:05:00.000Z");
    // Errores de entrada
    for (const body of [{ votingStartsAt: "2026-10-24T14:00:00.000Z" }, { inSeconds: 5 }, { addSeconds: 0 }, { addSeconds: -3600 }, {}, { inSeconds: 60, addSeconds: 60 }]) {
      expect((await call(schedule, { params: { id: org.id }, headers: org.auth, body })).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("fuera de registration → 409 closed", async () => {
    const created = await call(createElection, { body: sampleElection() });
    const org = { id: created.json.id as string, auth: { authorization: `Bearer ${created.json.organizerToken}` } };
    const r = await call(schedule, { params: { id: org.id }, headers: org.auth, body: { inSeconds: 300 } });
    expect(r.status).toBe(409);
    expect(r.json.code).toBe("closed");
  });
});

describe("Inicio programado — transición automática", () => {
  it("al llegar la hora, la primera lectura abre la votación: padrón congelado igual que POST /open, sala cerrada, plantillas borradas; se vota", async () => {
    const org = await setupRegistration();
    const { json: room } = await openRoom(org, { votingStartsInSec: 20 });
    const a = await enrollVoter(org, room.roomCode, "Ana", 801);
    const b = await enrollVoter(org, room.roomCode, "Beto", 802);
    expect((await store.listFaceTemplates(org.id)).length).toBe(2);

    // Un segundo antes: nada cambia.
    vi.setSystemTime(new Date(T0.getTime() + 19_000));
    expect((await get(org)).json.status).toBe("registration");
    expect((await call(roll, { params: { id: org.id } })).json.frozen).toBe(false);

    // Llega la hora: el voto programado se abre con la primera lectura (aquí, el padrón que pide el teléfono).
    vi.setSystemTime(new Date(T0.getTime() + 20_000));
    const r = await call(roll, { params: { id: org.id } });
    expect(r.json).toMatchObject({ status: "open", frozen: true, groupRoot: groupRoot([a.identity.commitment, b.identity.commitment]) });
    expect(r.json.commitments).toEqual([a.identity.commitment, b.identity.commitment]);

    const e = await get(org);
    expect(e.json).toMatchObject({ status: "open", groupRoot: r.json.groupRoot, votingStartsAt: "2026-10-24T15:00:20.000Z" });
    expect((await call(getRoom, { params: { id: org.id } })).json).toMatchObject({ open: false, closedReason: "election-opened" });
    expect((await call(join, { params: { roomCode: room.roomCode }, body: { displayName: "Tarde" } })).status).toBe(410);
    expect(await store.listFaceTemplates(org.id)).toHaveLength(0);
    const engine = (await store.getEngine(org.id))!;
    expect(engine.roll).toEqual([]);
    expect(engine.rollPolicy).toEqual({ kind: "open-room", maxSeats: 60, joined: 2, enrolled: 2, eligibility: "face-dedupe-demo" });
    // El organizador ya no puede abrir (ni mover la hora): 409.
    expect((await call(openRoute, { params: { id: org.id }, headers: org.auth })).status).toBe(409);
    expect((await call(schedule, { params: { id: org.id }, headers: org.auth, body: { inSeconds: 300 } })).status).toBe(409);

    // Se vota y se cierra normalmente: el verificador real acepta el paquete.
    const proof = await castBallot(a.identity.privateKey, r.json.commitments, org.id, 0, defaultArtifacts());
    expect((await call(vote, { params: { id: org.id }, body: { proof } })).status).toBe(201);
    const closed = await call(close, { params: { id: org.id }, headers: org.auth });
    expect(closed.json.status).toBe("auditable");
  }, 60_000);

  it("mismo padrón congelado que con POST /open manual (comparando dos elecciones gemelas)", async () => {
    const auto = await setupRegistration();
    const manual = await setupRegistration();
    const ra = (await openRoom(auto, { votingStartsInSec: 60 })).json;
    const rm = (await openRoom(manual, { votingStartsAt: null })).json;
    for (const [org, room, seed] of [[auto, ra, 900], [manual, rm, 950]] as const) {
      await enrollVoter(org, room.roomCode, "Uno", seed);
      await enrollVoter(org, room.roomCode, "Dos", seed + 1);
    }
    expect((await call(openRoute, { params: { id: manual.id }, headers: manual.auth })).status).toBe(200);
    vi.setSystemTime(new Date(T0.getTime() + 61_000));
    await get(auto);
    const [ea, em] = [(await store.getEngine(auto.id))!, (await store.getEngine(manual.id))!];
    for (const s of [ea, em]) {
      expect(s.roll).toEqual([]);
      expect(s.commitments).toHaveLength(2);
      expect(s.ledger?.entries).toEqual([]);
      expect(s.ledger?.groupRoot).toBe(groupRoot(s.commitments));
      expect(s.rollPolicy).toMatchObject({ kind: "open-room", joined: 2, enrolled: 2 });
    }
    expect(Object.keys(ea).sort()).toEqual(Object.keys(em).sort());
    expect((await store.getElection(auto.id))?.status).toBe("open");
  }, 60_000);

  it("idempotente con lecturas concurrentes: una sola transición", async () => {
    const org = await setupRegistration();
    const { json: room } = await openRoom(org, { votingStartsInSec: 30 });
    const a = await enrollVoter(org, room.roomCode, "Ana", 811);
    await enrollVoter(org, room.roomCode, "Beto", 812);
    const delTemplates = vi.spyOn(store, "deleteFaceTemplates");
    const putRoom = vi.spyOn(store, "putRoom");
    vi.setSystemTime(new Date(T0.getTime() + 31_000));
    const reads = await Promise.all(
      Array.from({ length: 24 }, (_, i) => {
        switch (i % 6) {
          case 0: return get(org);
          case 1: return call(getRoom, { params: { id: org.id } });
          case 2: return call(roll, { params: { id: org.id } });
          case 3: return call(invite, { params: { token: a.inviteToken } });
          case 4: return call(tally, { params: { id: org.id } });
          default: return call(roomInfo, { params: { roomCode: room.roomCode } });
        }
      }),
    );
    expect(reads.map((r) => r.status)).toEqual(Array(24).fill(200));
    expect(delTemplates).toHaveBeenCalledTimes(1);
    expect(putRoom).toHaveBeenCalledTimes(1); // la sala se cierra una vez
    const after = await call(roll, { params: { id: org.id } });
    expect(after.json.frozen).toBe(true);
    expect((await get(org)).json.status).toBe("open");
  }, 60_000);

  it("no ocurre fuera de registration ni antes de la hora; con padrón vacío se queda en inscripción", async () => {
    // draft con hora pasada (forzada en el store): sigue en draft
    const created = await call(createElection, { body: sampleElection() });
    const draftId = created.json.id as string;
    const d = (await store.getElection(draftId))!;
    await store.putElection({ ...d, votingStartsAt: "2026-10-24T14:00:00.000Z" });
    expect((await call(getElection, { params: { id: draftId } })).json.status).toBe("draft");

    // abierta a mano antes de la hora: la hora posterior no hace nada más
    const org = await setupRegistration();
    const { json: room } = await openRoom(org, { votingStartsInSec: 60 });
    await enrollVoter(org, room.roomCode, "Ana", 821);
    const opened = await call(openRoute, { params: { id: org.id }, headers: org.auth });
    expect(opened.json).toMatchObject({ status: "open", votingStartsAt: T0.toISOString() });
    const engineBefore = JSON.stringify(await store.getEngine(org.id));
    vi.setSystemTime(new Date(T0.getTime() + 120_000));
    expect((await get(org)).json.status).toBe("open");
    expect(JSON.stringify(await store.getEngine(org.id))).toBe(engineBefore);

    // cerrada: tampoco
    expect((await call(close, { params: { id: org.id }, headers: org.auth })).json.status).toBe("auditable");
    expect((await get(org)).json.status).toBe("auditable");

    // padrón vacío a la hora: no se puede congelar → sigue en registration, sin errores para quien lee
    vi.setSystemTime(T0);
    const empty = await setupRegistration();
    await openRoom(empty, { votingStartsInSec: 10 });
    vi.setSystemTime(new Date(T0.getTime() + 11_000));
    const ge = await get(empty);
    expect(ge.status).toBe(200);
    expect(ge.json.status).toBe("registration");
  }, 60_000);
});
