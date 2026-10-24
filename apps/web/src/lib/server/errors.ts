import { ZodError, type ZodType } from "zod";
import { ApiError } from "@quorum/contracts";
import { z } from "zod";

export type ApiCode = z.infer<typeof ApiError>["code"];

const STATUS_BY_CODE: Record<ApiCode, number> = {
  invalid_input: 400,
  not_found: 404,
  not_eligible: 403,
  already_voted: 409,
  closed: 409,
  forbidden: 403,
  unavailable: 503,
  duplicate_identity: 409,
  /** Decisión de José (solo ancla on-chain): el voto no admite `onchain`; rechazarlo en vez de ignorarlo. */
  onchain_not_supported: 400,
};

/** Error tipado que las rutas convierten en una respuesta `ApiError`. */
export class HttpError extends Error {
  readonly status: number;
  constructor(readonly code: ApiCode, message: string, status?: number) {
    super(message);
    this.name = "HttpError";
    this.status = status ?? STATUS_BY_CODE[code];
  }
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function errorResponse(code: ApiCode, message: string, status?: number): Response {
  const body = ApiError.parse({ error: message, code });
  return json(body, { status: status ?? STATUS_BY_CODE[code] });
}

/** Parsea y valida el body JSON. Lanza `HttpError(invalid_input)` si no cumple el esquema. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError("invalid_input", "Body JSON inválido");
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new HttpError("invalid_input", formatZod(result.error));
  return result.data;
}

export function formatZod(err: ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

type RouteContext<P> = { params: Promise<P> };
type Handler<P> = (req: Request, params: P) => Promise<Response>;

/**
 * Envuelve un handler: resuelve `params`, convierte `HttpError`/`ZodError` en `ApiError`
 * y nunca filtra stack traces. Los route handlers corren en runtime Node (nunca edge).
 */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx?: RouteContext<P>): Promise<Response> => {
    try {
      const params = (ctx ? await ctx.params : {}) as P;
      return await handler(req, params);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err.code, err.message, err.status);
      if (err instanceof ZodError) return errorResponse("invalid_input", formatZod(err));
      // Nunca registrar el body (puede contener opción de voto o descriptor facial).
      console.error("[api] unhandled", err instanceof Error ? err.message : String(err));
      return errorResponse("unavailable", "Error interno", 500);
    }
  };
}
