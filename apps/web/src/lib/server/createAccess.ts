import { timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { HttpError } from "./errors";

export const CREATE_CODE_HEADER = "x-quorum-create-code";

/** D-25: ¿hace falta código para crear votaciones? Solo si `QUORUM_CREATE_CODE` está configurado. */
export function createCodeRequired(): boolean {
  return Boolean(env.createCode);
}

/** Compara en tiempo constante; `false` si falta o no coincide. */
export function createCodeMatches(given: string | null | undefined): boolean {
  const expected = env.createCode;
  if (!expected) return true;
  if (!given) return false;
  const a = Buffer.from(given.trim(), "utf8");
  const b = Buffer.from(expected.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Lanza 403 `forbidden` si el código (cabecera `x-quorum-create-code`) falta o no coincide. */
export function requireCreateCode(req: Request): void {
  if (!createCodeRequired()) return;
  if (!createCodeMatches(req.headers.get(CREATE_CODE_HEADER))) throw new HttpError("forbidden", "Código de acceso incorrecto para crear votaciones", 403);
}
