import { OpenRoomInput } from "@quorum/contracts";
import { isOrganizer, requireOrganizer } from "@/lib/server/auth";
import { json, parseBody, route } from "@/lib/server/errors";
import { closeRoom, openRoom, roomStatus } from "@/lib/server/rooms";
import { syncSchedule } from "@/lib/server/schedule";

/**
 * POST /api/elections/:id/room (organizador) `{ maxSeats, expiresInMin }` → `{ open, seatsTaken, maxSeats, expiresAt,
 * closedReason, roomCode, joinUrl }`. 201 si crea sala; 200 si ya había una abierta (mismo código, tope/expiración nuevos).
 * Solo en `registration` (si no, 409 `closed`).
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  await requireOrganizer(req, id);
  const input = await parseBody(req, OpenRoomInput);
  await syncSchedule(id);
  const { status, created } = await openRoom(id, input);
  return json(status, { status: created ? 201 : 200 });
});

/** DELETE /api/elections/:id/room (organizador) → RoomStatus con `open:false`. Idempotente. */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  await requireOrganizer(req, id);
  return json(await closeRoom(id, "manual"));
});

/** GET /api/elections/:id/room — público `{ open, seatsTaken, maxSeats, expiresAt, closedReason }`; con Bearer añade `roomCode` y `joinUrl`. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  await syncSchedule(id);
  const organizer = await isOrganizer(req, id);
  const status = await roomStatus(id, organizer);
  return json(status, organizer ? {} : { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=5" } });
});
