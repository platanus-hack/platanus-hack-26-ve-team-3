/**
 * Cliente del Contrato v1 (docs/API_CONTRACT.md → "Contrato v1 — implementado"). Todas las formas vienen de
 * `@quorum/contracts`, que es lo que el backend implementa; la web no replica tipos.
 * Acciones del organizador con `Authorization: Bearer <organizerToken>` (threat model C4). Los candidatos del sorteo
 * se fijan al crear la elección (entran en el manifiesto vía `drawRule`); no hay endpoint para editarlos después.
 */
import {
  Aggregates,
  AuditResponse,
  AuditResult,
  CreateElectionResult,
  DrawResponse,
  Election,
  ElectionResponse,
  FaceEnrollResponse,
  FaceReviewStatus,
  IdentityResult,
  InviteResponse,
  LedgerResponse,
  MarkVotedResult,
  Receipt,
  RollResponse,
  ReviewsListResponse,
  ReviewSummary,
  ScheduleResult,
  VotersListResponse,
  CreateElectionInput,
  type EligibilityInput,
  type ScheduleInput,
  type SemaphoreProofInput,
} from "@quorum/contracts";
import { z } from "zod";
import { request, VotersResponse, InvitesResponse } from "./api";
import { orgAuthHeaders } from "./orgStore";

/** Cuerpo de `POST /api/elections` (v1): v0 + candidatos y regla de ganadores del sorteo. */
export type CreateElectionV1 = z.input<typeof CreateElectionInput>;

/** Ledger público con el nullifier de cada entrada a mano (para "mi voto está"). */
export type PublicLedger = Omit<LedgerResponse, "entries"> & { entries: { idx: number; hash: string; nullifier: string }[] };

const e = encodeURIComponent;
const post = (body?: unknown): RequestInit => ({ method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const org = (electionId: string, init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...orgAuthHeaders(electionId), ...(init.headers ?? {}) } });

export const apiV1 = {
  getInvite: (token: string) => request(`/api/invite/${e(token)}`, undefined, InviteResponse),
  /** Incluye `serverNow` (hora del servidor) para corregir el reloj del teléfono en las cuentas regresivas. */
  getElection: (id: string) => request(`/api/elections/${e(id)}`, undefined, ElectionResponse),
  getTally: (id: string) => request(`/api/elections/${e(id)}/tally`, undefined, Aggregates),
  /** Con token del organizador trae `voters`; sin token sólo `counts` (nunca lista nominal pública). */
  listVoters: (id: string) => request(`/api/elections/${e(id)}/voters`, org(id), VotersListResponse),
  createElection: (body: CreateElectionV1) => request(`/api/elections`, post(body), CreateElectionResult),
  addVoters: (id: string, voters: { displayName: string; phoneE164?: string }[]) => request(`/api/elections/${e(id)}/voters`, org(id, post({ voters })), VotersResponse),
  sendInvites: (id: string, body: { electionId: string; voterIds: string[]; channel: "kapso" | "meta" | "wame" | "dry-run" }) =>
    request(`/api/elections/${e(id)}/invites`, org(id, post(body)), InvitesResponse),

  /* Inscripción */
  /** 201 `{ ok, faceBindingHash }` o, D-21, 202 `{ status: "pending_review" }` (revisión manual del organizador). */
  faceEnroll: (body: { voterId: string; inviteToken: string; descriptor: number[]; consent: true }) => request(`/api/face/enroll`, post(body), FaceEnrollResponse),
  /** D-21: polling del votante mientras su caso está en revisión. */
  faceReviewStatus: (body: { voterId: string; inviteToken: string }) => request(`/api/face/review`, post(body), FaceReviewStatus),
  linkWallet: (voterId: string, body: { inviteToken: string; walletAddress: string; kind: "kernel" | "eoa-demo"; bindingSignature: string }) =>
    request(`/api/voters/${e(voterId)}/wallet`, post(body), z.unknown()),
  registerIdentity: (voterId: string, body: { inviteToken: string; commitment: string }) => request(`/api/voters/${e(voterId)}/identity`, post(body), IdentityResult),

  /* Voto */
  getRoll: (id: string) => request(`/api/elections/${e(id)}/roll`, undefined, RollResponse),
  /** D-22: grupo vigente (raíz, tamaño, K). Mismo cuerpo que /roll. */
  getGroup: (id: string) => request(`/api/elections/${e(id)}/group`, undefined, RollResponse),
  vote: (id: string, body: { proof: SemaphoreProofInput }) => request(`/api/elections/${e(id)}/vote`, post(body), Receipt),
  /** Autodeclaración "ya voté". Petición SEPARADA del voto: no lleva la prueba ni la opción. */
  markVoted: (voterId: string, inviteToken: string) => request(`/api/voters/${e(voterId)}/voted`, post({ inviteToken }), MarkVotedResult),
  /** `GET /receipt/:inclusionId` (inclusionId = nullifier): inclusión de una boleta sin revelar la opción. */
  getInclusion: (id: string, nullifier: string) => request(`/api/elections/${e(id)}/receipt/${e(nullifier)}`, undefined, Receipt),
  getLedger: async (id: string): Promise<PublicLedger> => {
    const l = await request(`/api/elections/${e(id)}/ledger`, undefined, LedgerResponse);
    // D-22: en modo continuo el ledger también trae inscripciones (member_added); aquí solo interesan las boletas.
    return { ...l, entries: l.entries.flatMap((x) => ("proof" in x ? [{ idx: x.idx, hash: x.hash, nullifier: x.proof.nullifier }] : [])) };
  },

  /* Auditoría */
  getAudit: (id: string) => request(`/api/elections/${e(id)}/audit`, undefined, AuditResponse),
  auditVerify: (pkg: unknown) => request(`/api/audit/verify`, post({ package: pkg }), AuditResult),

  /* Sorteo */
  getDraw: (id: string) => request(`/api/elections/${e(id)}/draw`, undefined, DrawResponse),

  /* Organizador: transiciones de fase (todas devuelven la Election actualizada) */
  publish: (id: string) => request(`/api/elections/${e(id)}/publish`, org(id, post()), Election),
  /** D-19: método de elegibilidad de la sala (antes de que entre nadie). */
  setEligibility: (id: string, body: EligibilityInput) => request(`/api/elections/${e(id)}/eligibility`, org(id, { method: "PUT", body: JSON.stringify(body) }), Election),
  open: (id: string) => request(`/api/elections/${e(id)}/open`, org(id, post()), Election),
  close: (id: string) => request(`/api/elections/${e(id)}/close`, org(id, post()), Election),
  draw: (id: string) => request(`/api/elections/${e(id)}/draw`, org(id, post()), Election),
  /** Inicio programado (solo en inscripción): `{ inSeconds }`, `{ addSeconds }` o `{ votingStartsAt: ISO | null }`. */
  /** D-21: casos de coincidencia facial por revisar (sin datos biométricos). */
  listReviews: (id: string) => request(`/api/elections/${e(id)}/reviews`, org(id), ReviewsListResponse),
  decideReview: (id: string, reviewId: string, decision: "approve" | "reject") =>
    request(`/api/elections/${e(id)}/reviews/${e(reviewId)}`, org(id, post({ decision })), ReviewSummary),
  schedule: (id: string, body: ScheduleInput) => request(`/api/elections/${e(id)}/schedule`, org(id, post(body)), ScheduleResult),
};

/**
 * Descarga el paquete de auditoría como BYTES (no como objeto) para que el hash de entrada que muestra la UI sea el
 * de lo que realmente llegó, antes de cualquier parseo.
 */
export async function fetchAuditPackageBytes(id: string): Promise<{ bytes: Uint8Array; text: string; etag: string | null }> {
  const res = await fetch(`/api/elections/${e(id)}/artifacts`, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el paquete de auditoría`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, text: new TextDecoder().decode(buf), etag: res.headers.get("etag") };
}
