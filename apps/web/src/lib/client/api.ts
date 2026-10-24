/**
 * Cliente HTTP contra docs/API_CONTRACT.md. Las rutas se usan EXACTAMENTE como en el contrato.
 * El backend se implementa en paralelo: todo error de red o de contrato se traduce a `ApiClientError`.
 */
import { z } from "zod";
import {
  Aggregates,
  ApiError,
  AuditResult,
  Election,
  LiveLayout,
  Receipt,
  Voter,
  type CreateElectionInput,
} from "@quorum/contracts";

export type ApiErrorCode = z.infer<typeof ApiError>["code"] | "network" | "bad_response";

export class ApiClientError extends Error {
  code: ApiErrorCode;
  status: number;
  constructor(message: string, code: ApiErrorCode, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof ApiClientError) {
    switch (err.code) {
      case "network":
        return "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.";
      case "not_found":
        return "No encontramos ese recurso. Puede que el enlace sea incorrecto o haya expirado.";
      case "not_eligible":
        return "Esta invitación no está habilitada para votar en esta elección.";
      case "already_voted":
        return "Esta invitación ya fue usada para votar. Cada invitación vale un solo voto.";
      case "closed":
        return "La elección ya está cerrada. No se aceptan más votos.";
      case "forbidden":
        return "No tienes permiso para esta acción.";
      case "unavailable":
        return `El servicio no está disponible en este momento (${err.message}). Inténtalo más tarde.`;
      case "invalid_input":
        return `Datos inválidos: ${err.message}`;
      case "bad_response":
        return `El servidor respondió con un formato inesperado: ${err.message}`;
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return "Ocurrió un error desconocido.";
}

async function request<T>(path: string, init: RequestInit | undefined, schema: z.ZodType<T> | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch (e) {
    throw new ApiClientError(e instanceof Error ? e.message : "fetch failed", "network", 0);
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // Sin cuerpo JSON: el endpoint no existe todavía o el servidor falló (no es un "recurso no encontrado" del dominio).
      if (!res.ok) throw new ApiClientError(`HTTP ${res.status} en ${path}`, "unavailable", res.status);
      throw new ApiClientError("respuesta no es JSON", "bad_response", res.status);
    }
  }
  if (!res.ok) {
    const parsed = ApiError.safeParse(json);
    if (parsed.success) throw new ApiClientError(parsed.data.error, parsed.data.code, res.status);
    const fallback: ApiErrorCode = res.status === 404 ? "not_found" : res.status >= 500 ? "unavailable" : "invalid_input";
    throw new ApiClientError(`HTTP ${res.status}`, fallback, res.status);
  }
  if (!schema) return json as T;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), "bad_response", res.status);
  }
  return parsed.data;
}

/* ---------- Esquemas de respuesta que el contrato describe inline ---------- */

export const InviteResponse = z.object({
  election: z.object({
    id: z.string(),
    title: z.string(),
    kind: Election.shape.kind,
    options: Election.shape.options,
    status: Election.shape.status,
    endsAt: z.string(),
  }),
  voter: z.object({
    id: z.string(),
    displayName: z.string().nullable().optional(),
    walletAddress: z.string().nullable().optional(),
    livenessPassedAt: z.string().nullable().optional(),
    votedAt: z.string().nullable().optional(),
  }),
});
export type InviteResponse = z.infer<typeof InviteResponse>;

export const FaceEnrollResponse = z.object({ ok: z.boolean(), voteNonce: z.string() });

export const VotersResponse = z.object({
  voters: z.array(z.object({ id: z.string(), displayName: z.string(), inviteToken: z.string(), inviteUrl: z.string() })),
});
export type VotersResponse = z.infer<typeof VotersResponse>;

export const InvitesResponse = z.object({
  results: z.array(z.object({ voterId: z.string(), status: z.string(), link: z.string().optional().nullable(), error: z.string().optional().nullable() })),
});
export type InvitesResponse = z.infer<typeof InvitesResponse>;

/** Election con `layout` tolerante (unknown) y campos opcionales que el backend podría omitir en vistas públicas. */
const PublicElection = Election.partial({ description: true, protocol: true, manifestHash: true, startsAt: true, eligibilityIssuerId: true, organizerId: true, layout: true });
export type PublicElection = z.infer<typeof PublicElection>;

/* ---------- Endpoints ---------- */

export const api = {
  getInvite: (token: string) => request(`/api/invite/${encodeURIComponent(token)}`, undefined, InviteResponse),

  faceEnroll: (body: { voterId: string; inviteToken: string; descriptor: number[]; consent: true }) =>
    request(`/api/face/enroll`, { method: "POST", body: JSON.stringify(body) }, FaceEnrollResponse),

  linkWallet: (voterId: string, body: { inviteToken: string; walletAddress: string }) =>
    request(`/api/voters/${encodeURIComponent(voterId)}/wallet`, { method: "POST", body: JSON.stringify(body) }, Voter.partial({ phoneE164: true })),

  vote: (electionId: string, body: unknown) =>
    request(`/api/elections/${encodeURIComponent(electionId)}/vote`, { method: "POST", body: JSON.stringify(body) }, Receipt),

  getReceipt: (electionId: string, inclusionId: string) =>
    request(`/api/elections/${encodeURIComponent(electionId)}/receipt/${encodeURIComponent(inclusionId)}`, undefined, Receipt),

  getElection: (id: string) => request(`/api/elections/${encodeURIComponent(id)}`, undefined, PublicElection),

  getTally: (id: string) => request(`/api/elections/${encodeURIComponent(id)}/tally`, undefined, Aggregates),

  getLayout: (id: string) => request(`/api/elections/${encodeURIComponent(id)}/layout`, undefined, LiveLayout),

  createElection: (body: CreateElectionInput) => request(`/api/elections`, { method: "POST", body: JSON.stringify(body) }, PublicElection),

  publishElection: (id: string) => request(`/api/elections/${encodeURIComponent(id)}/publish`, { method: "POST" }, PublicElection),

  addVoters: (id: string, voters: { displayName: string; phoneE164?: string }[]) =>
    request(`/api/elections/${encodeURIComponent(id)}/voters`, { method: "POST", body: JSON.stringify({ voters }) }, VotersResponse),

  sendInvites: (id: string, body: { electionId: string; voterIds: string[]; channel: "kapso" | "meta" | "wame" | "dry-run" }) =>
    request(`/api/elections/${encodeURIComponent(id)}/invites`, { method: "POST", body: JSON.stringify(body) }, InvitesResponse),

  closeElection: (id: string) => request(`/api/elections/${encodeURIComponent(id)}/close`, { method: "POST" }, PublicElection),

  getArtifacts: (id: string) => request<unknown>(`/api/elections/${encodeURIComponent(id)}/artifacts`, undefined, null),

  auditVerify: (pkg: unknown) => request(`/api/audit/verify`, { method: "POST", body: JSON.stringify({ package: pkg }) }, AuditResult),
};

export const artifactsUrl = (id: string) => `/api/elections/${encodeURIComponent(id)}/artifacts`;
