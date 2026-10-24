import { openElection } from "@/lib/server/engine";
import { requireOrganizer } from "@/lib/server/auth";
import { json, route } from "@/lib/server/errors";

/** POST /api/elections/:id/open → Election (`registration` → `open`). Congela el padrón: `groupRoot` de los commitments inscritos. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  await requireOrganizer(req, id);
  return json(await openElection(id));
});
