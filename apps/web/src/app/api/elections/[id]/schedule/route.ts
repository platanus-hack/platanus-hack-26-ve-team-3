import { ScheduleInput } from "@quorum/contracts";
import { requireOrganizer } from "@/lib/server/auth";
import { json, parseBody, route } from "@/lib/server/errors";
import { setSchedule } from "@/lib/server/rooms";
import { syncSchedule } from "@/lib/server/schedule";

/**
 * POST /api/elections/:id/schedule (organizador) — mueve el inicio programado de la votación durante `registration`.
 * Body (uno): `{ votingStartsAt: ISO | null }` · `{ inSeconds }` ("Empezar en 5 min" = 300) · `{ addSeconds }` ("+5 min" = 300).
 * → `{ electionId, status, votingStartsAt, serverNow }`. 409 `closed` fuera de `registration`; 400 si la hora ya pasó
 * (para empezar ya: `POST /open`) o está a más de 7 días.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  await requireOrganizer(req, id);
  const input = await parseBody(req, ScheduleInput);
  await syncSchedule(id);
  return json(await setSchedule(id, input));
});
