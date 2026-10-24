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
  FaceEnrollResult,
  IdentityResult,
  InviteResponse,
  LedgerResponse,
  MarkVotedResult,
  Receipt,
  RollResponse,
  VotersListResponse,
  CreateElectionInput,
  type EligibilityInput,
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
  getElection: (id: string) => request(`/api/elections/${e(id)}`, undefined, Election),
  getTally: (id: string) => request(`/api/elections/${e(id)}/tally`, undefined, Aggregates),
  /** Con token del organizador trae `voters`; sin token sólo `counts` (nunca lista nominal pública). */
  listVoters: (id: string) => request(`/api/elections/${e(id)}/voters`, org(id), VotersListResponse),
  createElection: (body: CreateElectionV1) => request(`/api/elections`, post(body), CreateElectionResult),
  addVoters: (id: string, voters: { displayName: string; phoneE164?: string }[]) => request(`/api/elections/${e(id)}/voters`, org(id, post({ voters })), VotersResponse),
  sendInvites: (id: string, body: { electionId: string; voterIds: string[]; channel: "kapso" | "meta" | "wame" | "dry-run" }) =>
    request(`/api/elections/${e(id)}/invites`, org(id, post(body)), InvitesResponse),

  /* Inscripción */
  faceEnroll: (body: { voterId: string; inviteToken: string; descriptor: number[]; consent: true }) => request(`/api/face/enroll`, post(body), FaceEnrollResult),
  linkWallet: (voterId: string, body: { inviteToken: string; walletAddress: string; kind: "kernel" | "eoa-demo"; bindingSignature: string }) =>
    request(`/api/voters/${e(voterId)}/wallet`, post(body), z.unknown()),
  registerIdentity: (voterId: string, body: { inviteToken: string; commitment: string }) => request(`/api/voters/${e(voterId)}/identity`, post(body), IdentityResult),

  /* Voto */
  getRoll: (id: string) => request(`/api/elections/${e(id)}/roll`, undefined, RollResponse),
  vote: (id: string, body: { proof: SemaphoreProofInput }) => request(`/api/elections/${e(id)}/vote`, post(body), Receipt),
  /** Autodeclaración "ya voté". Petición SEPARADA del voto: no lleva la prueba ni la opción. */
  markVoted: (voterId: string, inviteToken: string) => request(`/api/voters/${e(voterId)}/voted`, post({ inviteToken }), MarkVotedResult),
  /** `GET /receipt/:inclusionId` (inclusionId = nullifier): inclusión de una boleta sin revelar la opción. */
  getInclusion: (id: string, nullifier: string) => request(`/api/elections/${e(id)}/receipt/${e(nullifier)}`, undefined, Receipt),
  getLedger: async (id: string): Promise<PublicLedger> => {
    const l = await request(`/api/elections/${e(id)}/ledger`, undefined, LedgerResponse);
    return { ...l, entries: l.entries.map((x) => ({ idx: x.idx, hash: x.hash, nullifier: x.proof.nullifier })) };
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
