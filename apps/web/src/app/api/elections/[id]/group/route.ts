import { getRoll } from "@/lib/server/engine";
import { json, route } from "@/lib/server/errors";
import { syncSchedule } from "@/lib/server/schedule";

/**
 * GET /api/elections/:id/group → grupo Semaphore vigente (alias de /roll). D-22, modo continuo: `groupRoot` vigente,
 * `size`, `minAnonymitySet` (K) y `rootWindow`; el votante genera su prueba contra esta raíz y sigue valiendo aunque
 * entren otros mientras tanto (ventana). Público, sin nombres.
 */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  await syncSchedule(id);
  return json(await getRoll(id));
});
