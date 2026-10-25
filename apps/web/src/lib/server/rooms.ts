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
import { Election as ElectionSchema, type Election, type OpenRoomInput, type RoomStatus, type ScheduleInput, type Voter } from "@quorum/contracts";
import { enrollmentOpen, inviteUrlFor, isContinuous, requireElection } from "./elections";
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
  if (!enrollmentOpen(election)) return isContinuous(election) ? "election-closed" : "election-opened";
  if (Date.parse(room.expiresAt) <= nowMs) return "expired";
  return null;
}

async function seatsTaken(electionId: string): Promise<number> {
  const voters = await (await getStore()).listVoters(electionId);
  return voters.filter((v) => v.source === "room" || v.source === "badge").length;
}

function statusOf(room: Room | null, election: Election, taken: number, withSecret: boolean): RoomStatus {
  const clock = { votingStartsAt: election.votingStartsAt ?? null, serverNow: new Date().toISOString() };
  if (!room) return { open: false, seatsTaken: taken, maxSeats: null, expiresAt: null, closedReason: null, ...clock };
  const reason = closedReasonOf(room, election);
  return {
    open: reason === null,
    seatsTaken: taken,
    maxSeats: room.maxSeats,
    expiresAt: room.expiresAt,
    closedReason: reason,
    ...clock,
    ...(withSecret ? { roomCode: room.code, joinUrl: joinUrlFor(room.code) } : {}),
  };
}

/** Máximo horizonte del inicio programado: 7 días. */
const MAX_SCHEDULE_MS = 7 * 24 * 3600_000;

function validStart(atMs: number, nowMs: number): string {
  if (!Number.isFinite(atMs)) throw new HttpError("invalid_input", "votingStartsAt inválido");
  if (atMs <= nowMs) throw new HttpError("invalid_input", "La hora de inicio ya pasó: para empezar ya, usa «Abrir ahora» (POST /open)");
  if (atMs - nowMs > MAX_SCHEDULE_MS) throw new HttpError("invalid_input", "La hora de inicio no puede estar a más de 7 días");
  return new Date(atMs).toISOString();
}

async function saveElection(e: Election) {
  await (await getStore()).putElection(ElectionSchema.parse(e));
}

/**
 * POST /api/elections/:id/room — abre la sala (o, si ya hay una abierta, actualiza tope y expiración
 * conservando el mismo código para no reimprimir el QR). Solo en `registration`.
 */
export async function openRoom(electionId: string, input: OpenRoomInput): Promise<{ status: RoomStatus & { roomCode: string; joinUrl: string }; created: boolean }> {
  // engine → room (mismo orden que `openElection`): también fija `votingStartsAt` de la elección.
  return withLock(`engine:${electionId}`, () => withLock(`room:${electionId}`, async () => {
    const store = await getStore();
    const e = await requireElection(electionId);
    if (!enrollmentOpen(e)) throw new HttpError("closed", e.status === "draft" ? "Primero abre la inscripción; después puedes abrir la sala y proyectar el QR." : isContinuous(e) ? "La votación ya terminó: la sala no se puede abrir." : "La sala solo existe durante la inscripción: la votación ya se abrió o ya terminó.", 409);
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
    // Inicio programado: explícito (ISO o relativo), null = a mano; ausente = el cierre de la sala, salvo que el
    // organizador ya hubiera fijado una hora propia (distinta del cierre de la sala vigente), que se respeta.
    let votingStartsAt: string | null;
    // D-22: en modo continuo ya se está votando; no hay hora de inicio que programar.
    if (isContinuous(e)) votingStartsAt = e.votingStartsAt ?? null;
    else if (input.votingStartsInSec !== undefined) votingStartsAt = validStart(now + input.votingStartsInSec * 1000, now);
    else if (input.votingStartsAt !== undefined) votingStartsAt = input.votingStartsAt === null ? null : validStart(Date.parse(input.votingStartsAt), now);
    else {
      const prev = e.votingStartsAt ?? null;
      const linked = !prev || (current !== null && closedReasonOf(current, e, now) === null && current.expiresAt === prev) || Date.parse(prev) <= now;
      votingStartsAt = linked ? expiresAt : prev;
    }
    await store.putRoom(room);
    const next: Election = { ...e, votingStartsAt };
    await saveElection(next);
    const status = statusOf(room, next, taken, true) as RoomStatus & { roomCode: string; joinUrl: string };
    return { status, created };
  }));
}

/**
 * POST /api/elections/:id/schedule — mueve el inicio programado (solo en `registration`). Si la sala sigue abierta y
 * su cierre estaba atado a la hora de inicio (el valor por defecto), el cierre de la sala se mueve con ella.
 */
export async function setSchedule(electionId: string, input: ScheduleInput) {
  return withLock(`engine:${electionId}`, () => withLock(`room:${electionId}`, async () => {
    const store = await getStore();
    const e = await requireElection(electionId);
    if (e.status !== "registration") throw new HttpError("closed", `La hora de inicio solo se puede cambiar durante la inscripción (estado ${e.status})`, 409);
    const now = Date.now();
    const prev = e.votingStartsAt ?? null;
    let votingStartsAt: string | null;
    if ("votingStartsAt" in input) votingStartsAt = input.votingStartsAt === null ? null : validStart(Date.parse(input.votingStartsAt), now);
    else if ("inSeconds" in input) votingStartsAt = validStart(now + input.inSeconds * 1000, now);
    else {
      const base = prev && Date.parse(prev) > now ? Date.parse(prev) : now;
      votingStartsAt = validStart(base + input.addSeconds * 1000, now);
    }
    const room = await store.getLatestRoom(electionId);
    if (room && prev && closedReasonOf(room, e, now) === null && room.expiresAt === prev && votingStartsAt) {
      await store.putRoom({ ...room, expiresAt: votingStartsAt });
    }
    await saveElection({ ...e, votingStartsAt });
    return { electionId, status: e.status, votingStartsAt, serverNow: new Date(now).toISOString() };
  }));
}

/** DELETE /api/elections/:id/room — cierra la sala (idempotente). Los votantes ya creados siguen en el censo. */
export async function closeRoom(electionId: string, reason: "manual" | "election-opened" | "election-closed" = "manual"): Promise<RoomStatus> {
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
  const eligibility = e.eligibility ? { method: e.eligibility.method, ...(e.eligibility.badgeUrlPrefix ? { badgeUrlPrefix: e.eligibility.badgeUrlPrefix } : {}) } : undefined;
  // Vista previa de la boleta ("Así es la boleta"): solo lo que se pinta en cada tarjeta; ni descripción, ni fechas, ni nada del organizador.
  const options = e.options.map((o) => ({ id: o.id, label: o.label, ...(o.subtitle ? { subtitle: o.subtitle } : {}), ...(o.image ? { image: o.image } : {}) }));
  return { electionId: e.id, title: e.title, ...status, ...(eligibility ? { eligibility } : {}), options };
}

const CLOSED_MESSAGE: Record<NonNullable<CloseReason>, string> = {
  manual: "La sala está cerrada",
  expired: "La sala expiró",
  "election-opened": "La votación ya comenzó: la inscripción está cerrada",
  "election-closed": "La votación terminó: la inscripción está cerrada",
};

/**
 * POST /api/rooms/:roomCode/join — crea un votante `source:"room"` con el alias y devuelve su inviteToken (una vez).
 * D-19: `join-badge` reutiliza esta misma admisión con `source:"badge"` y `admit` (credencial no usada / existente),
 * que corre dentro del lock de la sala justo antes de crear el votante.
 */
export async function joinRoom(rawCode: string, input: { displayName: string }, opts: { source?: "room" | "badge"; admit?: (e: Election) => Promise<void> } = {}) {
  const source = opts.source ?? "room";
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
    if (source === "room" && e.eligibility?.method === "event-badge") throw new HttpError("invalid_input", "Esta votación pide escanear la credencial del evento");
    await opts.admit?.(e);
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
      source,
    };
    await store.putVoter(voter);
    return { electionId: e.id, voterId: voter.id, displayName: voter.displayName, inviteToken: voter.inviteToken, inviteUrl: inviteUrlFor(voter.inviteToken) };
  });
}

/**
 * Al congelar el padrón (`open`): cierra la sala y fija la política del censo para el paquete de auditoría.
 * Devuelve `null` si la elección nunca tuvo sala (censo solo por invitación).
 */
export async function freezeRoomPolicy(electionId: string, reason: "election-opened" | "election-closed" = "election-opened"): Promise<RollPolicy | null> {
  const store = await getStore();
  const room = await store.getLatestRoom(electionId);
  if (!room) return null;
  if (!room.closedReason) await store.putRoom({ ...room, closedAt: new Date().toISOString(), closedReason: reason });
  const roomVoters = (await store.listVoters(electionId)).filter((v) => v.source === "room" || v.source === "badge");
  const e = await store.getElection(electionId);
  if (e?.eligibility?.method === "event-badge") {
    return {
      kind: "event-badge",
      maxSeats: room.maxSeats,
      check: e.eligibility.badgeCheck ?? "live",
      face: "full",
      joined: roomVoters.length,
      enrolled: roomVoters.filter((v) => Boolean(v.credentialIssuedAt)).length,
      eligibility: "badge-once+face-dedupe-demo",
    };
  }
  return {
    kind: "open-room",
    maxSeats: room.maxSeats,
    joined: roomVoters.length,
    enrolled: roomVoters.filter((v) => Boolean(v.credentialIssuedAt)).length,
    eligibility: "face-dedupe-demo",
  };
}

export const OPEN_ROOM_NOTE = "censo abierto en sala: la elegibilidad depende de la deduplicación facial demo, no de un padrón";
/** D-19: texto honesto de la credencial del evento (paquete de auditoría, KNOWN_LIMITATIONS y verificador). */
export const EVENT_BADGE_NOTE =
  "credencial del evento + rostro: la credencial demuestra que es participante del evento y se usa una sola vez; " +
  "el rostro impide que una misma persona use varias credenciales. El QR de la credencial no es secreto (el usuario está impreso): " +
  "no prueba que quien lo escanea sea su titular";

/** Nota que acompaña a la política del censo en el paquete de auditoría. */
export function rollPolicyNote(policy: RollPolicy): string {
  return policy.kind === "event-badge" ? EVENT_BADGE_NOTE : OPEN_ROOM_NOTE;
}
