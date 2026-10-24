/**
 * Endpoints del contrato v1 tal como los implementó feat/phase2-engine (docs/API_CONTRACT.md → "Contrato v1 — implementado").
 * Acciones del organizador con `Authorization: Bearer <organizerToken>`. Los candidatos del sorteo se fijan al crear la
 * elección (entran en el manifiesto vía `drawRule`); no hay endpoint para editarlos después.
 */
import { AuditResult } from "@quorum/contracts";
import { z } from "zod";
import { request, VotersResponse, InvitesResponse } from "./api";
import { orgAuthHeaders } from "./orgStore";
import {
  AggregatesV1,
  DrawInfo,
  ElectionV1,
  FaceEnrollV1Response,
  IdentityRegistered,
  InviteV1,
  LedgerPublic,
  ReceiptV1,
  RollV1,
  StoredAudit,
  VotersListV1,
  InclusionV1,
  type Candidate,
  type WalletKind,
} from "./v1";

/** Cuerpo de `POST /api/elections` (v1): v0 + candidatos y regla de ganadores del sorteo. */
export type CreateElectionV1 = {
  title: string;
  description: string;
  kind: "yes-no" | "multiple" | "ranking" | "budget";
  options: { id: string; label: string }[];
  startsAt: string;
  endsAt: string;
  candidates?: Candidate[];
  winnersCountFromResult?: boolean;
  winnersCount?: number;
  optionValues?: number[];
};

const e = encodeURIComponent;
const post = (body?: unknown): RequestInit => ({ method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
/** Acciones del organizador: `Authorization: Bearer <organizerToken>` (threat model C4). */
const org = (electionId: string, init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...orgAuthHeaders(electionId), ...(init.headers ?? {}) } });

/** `POST /api/elections` devuelve la elección + `organizerToken` (una sola vez). */
export const CreatedElection = ElectionV1.extend({ organizerToken: z.string().min(8).optional() });


export const apiV1 = {
  getInvite: (token: string) => request(`/api/invite/${e(token)}`, undefined, InviteV1),
  getElection: (id: string) => request(`/api/elections/${e(id)}`, undefined, ElectionV1),
  getTally: (id: string) => request(`/api/elections/${e(id)}/tally`, undefined, AggregatesV1),
  /** Sólo organizador (Bearer). La vista pública NO lista votantes: sólo agregados. */
  listVoters: (id: string) => request(`/api/elections/${e(id)}/voters`, org(id), VotersListV1),
  createElection: (body: CreateElectionV1) => request(`/api/elections`, post(body), CreatedElection),
  addVoters: (id: string, voters: { displayName: string; phoneE164?: string }[]) => request(`/api/elections/${e(id)}/voters`, org(id, post({ voters })), VotersResponse),
  sendInvites: (id: string, body: { electionId: string; voterIds: string[]; channel: "kapso" | "meta" | "wame" | "dry-run" }) =>
    request(`/api/elections/${e(id)}/invites`, org(id, post(body)), InvitesResponse),

  /* Inscripción */
  faceEnroll: (body: { voterId: string; inviteToken: string; descriptor: number[]; consent: true }) => request(`/api/face/enroll`, post(body), FaceEnrollV1Response),
  linkWallet: (voterId: string, body: { inviteToken: string; walletAddress: string; kind: WalletKind; bindingSignature: string }) =>
    request(`/api/voters/${e(voterId)}/wallet`, post(body), z.unknown()),
  registerIdentity: (voterId: string, body: { inviteToken: string; commitment: string }) => request(`/api/voters/${e(voterId)}/identity`, post(body), IdentityRegistered),

  /* Voto */
  getRoll: (id: string) => request(`/api/elections/${e(id)}/roll`, undefined, RollV1),
  vote: (id: string, body: { proof: unknown }) => request(`/api/elections/${e(id)}/vote`, post(body), ReceiptV1),
  /** Autodeclaración "ya voté" (estado del votante). Petición SEPARADA del voto: no lleva la prueba ni la opción. */
  markVoted: (voterId: string, inviteToken: string) => request(`/api/voters/${e(voterId)}/voted`, post({ inviteToken }), z.unknown()),
  getInclusion: (id: string, nullifier: string) => request(`/api/elections/${e(id)}/receipt/${e(nullifier)}`, undefined, InclusionV1),
  getLedger: (id: string) => request(`/api/elections/${e(id)}/ledger`, undefined, LedgerPublic),

  /* Auditoría */
  getAudit: (id: string) => request(`/api/elections/${e(id)}/audit`, undefined, StoredAudit),
  auditVerify: (pkg: unknown) => request(`/api/audit/verify`, post({ package: pkg }), AuditResult),

  /* Sorteo */
  getDraw: (id: string) => request(`/api/elections/${e(id)}/draw`, undefined, DrawInfo),

  /* Organizador: transiciones de fase */
  publish: (id: string) => request(`/api/elections/${e(id)}/publish`, org(id, post()), ElectionV1),
  open: (id: string) => request(`/api/elections/${e(id)}/open`, org(id, post()), ElectionV1),
  close: (id: string) => request(`/api/elections/${e(id)}/close`, org(id, post()), ElectionV1),
  draw: (id: string) => request(`/api/elections/${e(id)}/draw`, org(id, post()), z.unknown()),

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
