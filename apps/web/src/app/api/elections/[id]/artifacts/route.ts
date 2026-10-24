import { buildArtifacts, requireElection } from "@/lib/server/elections";
import { json, route } from "@/lib/server/errors";

/** GET /api/elections/:id/artifacts → paquete de auditoría JSON (sin PII) */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  const election = await requireElection(id);
  return json(await buildArtifacts(election), {
    headers: { "content-disposition": `attachment; filename="quorum-${id}-audit.json"` },
  });
});
