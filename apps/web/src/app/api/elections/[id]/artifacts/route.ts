import { getArtifacts } from "@/lib/server/engine";
import { route } from "@/lib/server/errors";

/** GET /api/elections/:id/artifacts → paquete de auditoría tal cual se guardó (bytes exactos; ETag = sha256). */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const { json, digest } = await getArtifacts(id);
  const etag = `"${digest}"`;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache",
    etag,
    "x-package-digest": digest,
    "content-disposition": `attachment; filename="quorum-${id}-audit.json"`,
  };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(json, { status: 200, headers });
});
