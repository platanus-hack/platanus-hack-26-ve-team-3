import { getReceipt } from "@/lib/server/engine";
import { json, route } from "@/lib/server/errors";

/** GET /api/elections/:id/receipt/:inclusionId → Receipt (busca el nullifier en el ledger; nunca revela la opción) */
export const GET = route<{ id: string; inclusionId: string }>(async (_req, { id, inclusionId }) => {
  return json(await getReceipt(id, inclusionId));
});
