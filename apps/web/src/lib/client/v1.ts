/**
 * Contrato v1 (docs/API_CONTRACT.md, sección "Contrato v1 (fase 2, H+4)") visto desde el cliente.
 *
 * Alineado con lo implementado en feat/phase2-engine (docs/API_CONTRACT.md → "Contrato v1 — implementado").
 * Mientras esta rama no tenga los tipos v1 de `@quorum/contracts` (están en esa rama), este archivo es el ÚNICO lugar
 * donde la web describe esas formas. Al integrar: reemplazar por los de `@quorum/contracts` y borrar lo duplicado. Los esquemas son tolerantes (campos nuevos opcionales) para no romper
 * si el backend agrega datos, pero estrictos en lo que la UI usa para afirmar algo.
 */
import { z } from "zod";
import { Aggregates, AuditResult, Election, Option } from "@quorum/contracts";

/* ---------- Fases ---------- */

export const ElectionPhase = z.enum(["draft", "registration", "open", "closed", "tallying", "auditable", "drawn", "failed"]);
export type ElectionPhase = z.infer<typeof ElectionPhase>;

/* ---------- Elección ---------- */

export const Candidate = z.object({ id: z.string().min(1), label: z.string().min(1), amount: z.number().nonnegative().optional() });
export type Candidate = z.infer<typeof Candidate>;

export const DrawRecord = z.object({
  seed: z.string(),
  winners: z.array(z.string()),
  method: z.string(),
});

export const AnchorRef = z.object({ chainId: z.number().int(), txHash: z.string().optional() });

export const ElectionV1 = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional().default(""),
  kind: Election.shape.kind,
  options: z.array(Option).min(2),
  status: ElectionPhase,
  protocol: z.string().optional(),
  manifestHash: z.string().nullable().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string(),
  eligibilityIssuerId: z.string().optional(),
  organizerId: z.string().optional(),
  layout: z.unknown().optional(),
  groupRoot: z.string().nullable().optional(),
  winnersCountFromResult: z.boolean().optional(),
  candidates: z.array(Candidate).optional().default([]),
  draw: DrawRecord.nullable().optional(),
  anchor: AnchorRef.nullable().optional(),
  registryAddress: z.string().nullable().optional(),
});
export type ElectionV1 = z.infer<typeof ElectionV1>;

/** Agregados con fase v1 (el `status` de v0 no conoce `registration`/`drawn`). */
export const AggregatesV1 = Aggregates.extend({ status: ElectionPhase });
export type AggregatesV1 = z.infer<typeof AggregatesV1>;

/* ---------- Participantes ---------- */

export const VoterState = z.enum(["invited", "registered", "voted"]);
export type VoterState = z.infer<typeof VoterState>;
export const VoterCounts = z.object({ total: z.number().int(), invited: z.number().int(), registered: z.number().int(), withIdentity: z.number().int().optional(), voted: z.number().int() });
/** `GET /voters`: sin token sólo `counts` (vista pública); con token del organizador además `voters`. */
export const VotersListV1 = z.object({
  voters: z
    .array(z.object({ id: z.string(), displayName: z.string(), state: VoterState, walletAddress: z.string().nullable().optional(), hasIdentity: z.boolean().optional() }))
    .optional(),
  counts: VoterCounts.optional(),
});
export type VotersListV1 = z.infer<typeof VotersListV1>;

/* ---------- Invitación (igual que v0, con fase v1) ---------- */

export const InviteV1 = z.object({
  election: z.object({ id: z.string(), title: z.string(), kind: Election.shape.kind, options: z.array(Option), status: ElectionPhase, endsAt: z.string() }),
  voter: z.object({
    id: z.string(),
    displayName: z.string().nullable().optional(),
    walletAddress: z.string().nullable().optional(),
    livenessPassedAt: z.string().nullable().optional(),
    votedAt: z.string().nullable().optional(),
    state: VoterState.optional(),
  }),
});
export type InviteV1 = z.infer<typeof InviteV1>;

/* ---------- Inscripción ---------- */

export const FaceEnrollV1Response = z.object({ ok: z.boolean(), faceBindingHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), voteNonce: z.string().optional() });
export type FaceEnrollV1Response = z.infer<typeof FaceEnrollV1Response>;

export const WalletKind = z.enum(["kernel", "eoa-demo"]);
export type WalletKind = z.infer<typeof WalletKind>;

export const IdentityRegistered = z.object({ ok: z.boolean(), registeredCount: z.number().int().nonnegative() });

/* ---------- Voto ---------- */

const Decimal = z.string().regex(/^\d+$/);
export const SemaphoreProofSchema = z.object({
  merkleTreeDepth: z.number().int(),
  merkleTreeRoot: Decimal,
  message: Decimal,
  nullifier: Decimal,
  scope: Decimal,
  points: z.array(Decimal).length(8),
});

export const RollV1 = z.object({ groupRoot: z.string(), commitments: z.array(Decimal), merkleTreeDepth: z.number().int() });
export type RollV1 = z.infer<typeof RollV1>;

export const ReceiptV1 = z.object({
  electionId: z.string().optional(),
  hash: z.string().optional(),
  inclusionId: z.string(),
  nullifier: z.string(),
  index: z.number().int().nonnegative().optional(),
  txHash: z.string().nullable().optional(),
  receivedAt: z.string().optional(),
  includedAt: z.string().nullable().optional(),
  state: z.enum(["pendiente", "recibido", "incluido", "no verificable"]),
});
export type ReceiptV1 = z.infer<typeof ReceiptV1>;

/**
 * Entrada pública del ledger. Durante `open` el servidor publica sólo `{ idx, nullifier, hash }` (sin `message`, threat
 * model C3); desde `closed` publica la prueba completa. Se normaliza a `{ idx, hash, nullifier }`.
 */
export const LedgerEntryPublic = z
  .object({
    idx: z.number().int(),
    hash: z.string(),
    prevHash: z.string().optional(),
    nullifier: z.string().optional(),
    proof: z.object({ nullifier: z.string() }).passthrough().optional(),
  })
  .transform((x, ctx) => {
    const nullifier = x.nullifier ?? x.proof?.nullifier;
    if (!nullifier) {
      ctx.addIssue({ code: "custom", message: "entrada sin nullifier" });
      return z.NEVER;
    }
    return { idx: x.idx, hash: x.hash, nullifier };
  });
/** Durante `open` el servidor no publica entradas (`proofsPublished:false`, sólo `count`/`finalHash`). */
export const LedgerPublic = z.object({
  electionId: z.string().optional(),
  groupRoot: z.string().optional(),
  genesisHash: z.string().optional(),
  count: z.number().int().optional(),
  finalHash: z.string().optional(),
  proofsPublished: z.boolean().optional(),
  entries: z.array(LedgerEntryPublic).optional().default([]),
});
export type LedgerPublic = z.infer<typeof LedgerPublic>;

/* ---------- Auditoría y sorteo ---------- */

export const StoredAudit = z.object({ auditResult: AuditResult, packageDigest: z.string(), anchorStatus: z.string().optional() });
export type StoredAudit = z.infer<typeof StoredAudit>;

export const DrawInfo = z.object({
  seed: z.string(),
  n: z.number().int().nonnegative(),
  winners: z.array(z.string()),
  candidates: z.array(Candidate),
  finalHash: z.string(),
  method: z.string().optional(),
  tieBreak: z.string().optional(),
});
export type DrawInfo = z.infer<typeof DrawInfo>;

/** `GET /receipt/:nullifier`: inclusión de una boleta (no revela la opción). Forma tolerante. */
export const InclusionV1 = z.object({ index: z.number().int().optional(), idx: z.number().int().optional(), hash: z.string().optional(), state: z.string().optional() }).passthrough();
