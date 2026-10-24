/**
 * Inicio programado de la votación (perezoso). Cada ruta relevante llama a uno de estos helpers al empezar: si la hora
 * `votingStartsAt` ya llegó y la elección sigue en `registration`, se ejecuta la misma transición que `POST /open`
 * (ver `syncSchedule` en engine.ts: bajo el lock de la elección, una sola vez). No hay cron: la primera petición que
 * llegue después de la hora (el teléfono de un votante esperando, el proyector, el panel) abre la votación.
 */
import { syncSchedule } from "./engine";
import { getStore } from "./store";
import { normalizeRoomCode, ROOM_CODE_RE } from "./rooms";

export { syncSchedule };

export async function syncScheduleForVoter(voterId: string): Promise<void> {
  const v = await (await getStore()).getVoter(voterId);
  if (v) await syncSchedule(v.electionId);
}

export async function syncScheduleForToken(inviteToken: string): Promise<void> {
  const v = await (await getStore()).getVoterByToken(inviteToken);
  if (v) await syncSchedule(v.electionId);
}

export async function syncScheduleForRoom(rawCode: string): Promise<void> {
  const code = normalizeRoomCode(rawCode);
  if (!ROOM_CODE_RE.test(code)) return;
  const room = await (await getStore()).getRoom(code);
  if (room) await syncSchedule(room.electionId);
}
