/**
 * Autorización del organizador (hallazgos C4/A7). Al crear la elección se genera un token aleatorio de 32 bytes
 * que se devuelve UNA sola vez; el servidor guarda solo `sha256(token)`. Los endpoints del organizador
 * (publish, voters POST/GET, invites, open, close, draw) exigen `Authorization: Bearer <organizerToken>`.
 */
import { randomToken, safeEqualHex, sha256Hex } from "./crypto";
import { HttpError } from "./errors";
import { getStore } from "./store";

export async function issueOrganizerToken(electionId: string): Promise<string> {
  const token = randomToken(32);
  await (await getStore()).putOrganizerTokenHash(electionId, sha256Hex(token));
  return token;
}

export function bearerOf(req: Request): string | null {
  const h = req.headers.get("authorization");
  const m = h?.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

export async function isOrganizer(req: Request, electionId: string): Promise<boolean> {
  const token = bearerOf(req);
  if (!token) return false;
  const stored = await (await getStore()).getOrganizerTokenHash(electionId);
  return Boolean(stored && safeEqualHex(stored, sha256Hex(token)));
}

export async function requireOrganizer(req: Request, electionId: string): Promise<void> {
  if (!(await isOrganizer(req, electionId))) throw new HttpError("forbidden", "Se requiere Authorization: Bearer <organizerToken> de esta elección", 401);
}
