/**
 * Sala abierta (asamblea abierta) — fase `registration`.
 *
 * El organizador abre una sala con tope de asientos y expiración; el público entra por `/j/<roomCode>` con un
 * alias libre (sin PII) y recibe su `inviteToken` una sola vez. Desde ahí sigue el flujo normal:
 * rostro (dedupe 1:N → 409 duplicate_identity, control "una persona = un lugar", modo demo) → wallet → identidad.
 *
 * Es la ÚNICA vía abierta de entrada al censo (hallazgo A6: el opt-in de WhatsApp ya no crea votantes): explícita,
 * activada por el organizador, con tope y expiración, y declarada en el paquete de auditoría (`rollPolicy`).
 */
import { randomInt } from "node:crypto";
import type { Election, OpenRoomInput, RoomStatus, Voter } from "@quorum/contracts";
import { inviteUrlFor, requireElection } from "./elections";
import { env } from "./env";
import { HttpError } from "./errors";
import { withLock } from "./lock";
import { randomId, randomToken } from "./crypto";
import { getStore, type Room, type RollPolicy } from "./store";

/** Sin 0/O, 1/I/L: se dicta y se teclea sin ambigüedad. */
const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_RE = /^[A-HJ-KM-NP-Z2-9]{6}$/;

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase();
}

function newRoomCode(): string {
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)];
  return out;
}

export function joinUrlFor(code: string): string {
  return `${env.appUrl}/j/${code}`;
}

type CloseReason = RoomStatus["closedReason"];

/** Razón por la que la sala NO admite entradas ahora mismo (null = abierta). */
function closedReasonOf(room: Room, election: Election, nowMs = Date.now()): CloseReason {
  if (room.closedReason) return room.closedReason;
  if (election.status !== "registration") return "election-opened";
  if (Date.parse(room.expiresAt) <= nowMs) return "expired";
  return null;
}

async function seatsTaken(electionId: string): Promise<number> {
  const voters = await (await getStore()).listVoters(electionId);
  return voters.filter((v) => v.source === "room").length;
}

function statusOf(room: Room | null, election: Election, taken: number, withSecret: boolean): RoomStatus {
  if (!room) return { open: false, seatsTaken: taken, maxSeats: null, expiresAt: null, closedReason: null };
  const reason = closedReasonOf(room, election);
  return {
    open: reason === null,
    seatsTaken: taken,
    maxSeats: room.maxSeats,
    expiresAt: room.expiresAt,
    closedReason: reason,
    ...(withSecret ? { roomCode: room.code, joinUrl: joinUrlFor(room.code) } : {}),
  };
}

/**
 * POST /api/elections/:id/room — abre la sala (o, si ya hay una abierta, actualiza tope y expiración
 * conservando el mismo código para no reimprimir el QR). Solo en `registration`.
 */
export async function openRoom(electionId: string, input: OpenRoomInput): Promise<{ status: RoomStatus & { roomCode: string; joinUrl: string }; created: boolean }> {
  return withLock(`room:${electionId}`, async () => {
    const store = await getStore();
    const e = await requireElection(electionId);
    if (e.status !== "registration") throw new HttpError("closed", `La sala abierta solo existe en fase de inscripción (estado ${e.status})`, 409);
    const taken = await seatsTaken(electionId);
    if (input.maxSeats < taken) throw new HttpError("invalid_input", `maxSeats (${input.maxSeats}) es menor que los asientos ya ocupados (${taken})`);
    const now = Date.now();
    const expiresAt = new Date(now + input.expiresInMin * 60_000).toISOString();
    const current = await store.getLatestRoom(electionId);
    let room: Room;
    let created = false;
    if (current && closedReasonOf(current, e, now) === null) {
      room = { ...current, maxSeats: input.maxSeats, expiresAt };
    } else {
      let code = newRoomCode();
      while (await store.getRoom(code)) code = newRoomCode();
      room = { code, electionId, maxSeats: input.maxSeats, openedAt: new Date(now).toISOString(), expiresAt, closedAt: null, closedReason: null };
      created = true;
    }
    await store.putRoom(room);
    const status = statusOf(room, e, taken, true) as RoomStatus & { roomCode: string; joinUrl: string };
    return { status, created };
  });
}

/** DELETE /api/elections/:id/room — cierra la sala (idempotente). Los votantes ya creados siguen en el censo. */
export async function closeRoom(electionId: string, reason: "manual" | "election-opened" = "manual"): Promise<RoomStatus> {
  return withLock(`room:${electionId}`, async () => {
    const store = await getStore();
    const e = await requireElection(electionId);
    const room = await store.getLatestRoom(electionId);
    if (room && !room.closedReason) {
      const closed: Room = { ...room, closedAt: new Date().toISOString(), closedReason: reason };
      await store.putRoom(closed);
      return statusOf(closed, e, await seatsTaken(electionId), true);
    }
    return statusOf(room, e, await seatsTaken(electionId), true);
  });
}

/** GET /api/elections/:id/room — público: contador; con Bearer además `roomCode` y `joinUrl`. */
export async function roomStatus(electionId: string, withSecret: boolean): Promise<RoomStatus> {
  const e = await requireElection(electionId);
  const room = await (await getStore()).getLatestRoom(electionId);
  return statusOf(room, e, await seatsTaken(electionId), withSecret);
}

async function requireRoom(rawCode: string): Promise<Room> {
  const code = normalizeRoomCode(rawCode);
  if (!ROOM_CODE_RE.test(code)) throw new HttpError("not_found", "Sala no encontrada");
  const room = await (await getStore()).getRoom(code);
  if (!room) throw new HttpError("not_found", "Sala no encontrada");
  return room;
}

/** GET /api/rooms/:roomCode — público: lo que muestra /j/<roomCode> antes de unirse. */
export async function roomPublicInfo(rawCode: string) {
  const room = await requireRoom(rawCode);
  const e = await requireElection(room.electionId);
  const latest = await (await getStore()).getLatestRoom(room.electionId);
  // Un código viejo (sala reemplazada) se reporta cerrado aunque la elección tenga otra sala.
  const effective: Room = latest && latest.code !== room.code && !room.closedReason ? { ...room, closedReason: "manual" } : room;
  const { roomCode: _c, joinUrl: _j, ...status } = statusOf(effective, e, await seatsTaken(e.id), false);
  void _c;
  void _j;
  return { electionId: e.id, title: e.title, ...status };
}

const CLOSED_MESSAGE: Record<NonNullable<CloseReason>, string> = {
  manual: "La sala está cerrada",
  expired: "La sala expiró",
  "election-opened": "La votación ya comenzó: la inscripción está cerrada",
};

/** POST /api/rooms/:roomCode/join — crea un votante `source:"room"` con el alias y devuelve su inviteToken (una vez). */
export async function joinRoom(rawCode: string, input: { displayName: string }) {
  const room0 = await requireRoom(rawCode);
  return withLock(`room:${room0.electionId}`, async () => {
    const store = await getStore();
    const room = (await store.getRoom(room0.code))!;
    const e = await requireElection(room.electionId);
    const latest = await store.getLatestRoom(e.id);
    if (latest && latest.code !== room.code) throw new HttpError("room_closed", CLOSED_MESSAGE.manual);
    const reason = closedReasonOf(room, e);
    if (reason) throw new HttpError("room_closed", CLOSED_MESSAGE[reason]);
    const taken = await seatsTaken(e.id);
    if (taken >= room.maxSeats) throw new HttpError("room_full", `La sala está llena (${taken} de ${room.maxSeats})`);
    const voter: Voter = {
      id: randomId("vt"),
      electionId: e.id,
      displayName: input.displayName,
      inviteToken: randomToken(),
      inviteStatus: "claimed",
      walletAddress: null,
      livenessPassedAt: null,
      credentialIssuedAt: null,
      votedAt: null,
      faceBindingHash: null,
      walletKind: null,
      registeredAt: null,
      source: "room",
    };
    await store.putVoter(voter);
    return { electionId: e.id, voterId: voter.id, displayName: voter.displayName, inviteToken: voter.inviteToken, inviteUrl: inviteUrlFor(voter.inviteToken) };
  });
}

/**
 * Al congelar el padrón (`open`): cierra la sala y fija la política del censo para el paquete de auditoría.
 * Devuelve `null` si la elección nunca tuvo sala (censo solo por invitación).
 */
export async function freezeRoomPolicy(electionId: string): Promise<RollPolicy | null> {
  const store = await getStore();
  const room = await store.getLatestRoom(electionId);
  if (!room) return null;
  if (!room.closedReason) await store.putRoom({ ...room, closedAt: new Date().toISOString(), closedReason: "election-opened" });
  const roomVoters = (await store.listVoters(electionId)).filter((v) => v.source === "room");
  return {
    kind: "open-room",
    maxSeats: room.maxSeats,
    joined: roomVoters.length,
    enrolled: roomVoters.filter((v) => Boolean(v.credentialIssuedAt)).length,
    eligibility: "face-dedupe-demo",
  };
}
