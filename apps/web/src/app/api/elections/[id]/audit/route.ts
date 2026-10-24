import { getAudit } from "@/lib/server/engine";
import { json, route } from "@/lib/server/errors";

/** GET /api/elections/:id/audit → { auditResult, packageDigest, anchorStatus }: lo que devolvió `verifyPackage` al cerrar/sortear. */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  return json(await getAudit(id));
});
