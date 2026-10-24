import { closeElection } from "@/lib/server/engine";
import { requireOrganizer } from "@/lib/server/auth";
import { json, route } from "@/lib/server/errors";

/**
 * POST /api/elections/:id/close → Election. `open → closed → tallying → auditable|failed`: recuento, ancla opcional
 * (sin credenciales: deshabilitada), paquete `quorum-audit/1` y `verifyPackage` del verificador independiente.
 */
export const POST = route<{ id: string }>(async (req, { id }) => {
  await requireOrganizer(req, id);
  return json(await closeElection(id));
});
