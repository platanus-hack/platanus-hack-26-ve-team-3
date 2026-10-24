import { getLedger } from "@/lib/server/engine";
import { json, route } from "@/lib/server/errors";

/**
 * GET /api/elections/:id/ledger → ledger público sin PII. Con la elección `open` solo `{idx, prevHash, hash, nullifier}`
 * (las pruebas llevan la opción en claro); desde el cierre, las entradas completas.
 */
export const GET = route<{ id: string }>(async (_req, { id }) => {
  return json(await getLedger(id), { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=5" } });
});
