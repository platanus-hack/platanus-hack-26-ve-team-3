import { receiptOf, requireElection } from "@/lib/server/elections";
import { HttpError, json, route } from "@/lib/server/errors";
import { getStore } from "@/lib/server/store";

/** GET /api/elections/:id/receipt/:inclusionId → Receipt (nunca revela la opción) */
export const GET = route<{ id: string; inclusionId: string }>(async (_req, { id, inclusionId }) => {
  await requireElection(id);
  const ballot = await (await getStore()).getBallot(id, inclusionId);
  if (!ballot) throw new HttpError("not_found", "Recibo no encontrado");
  return json(receiptOf(ballot));
});
