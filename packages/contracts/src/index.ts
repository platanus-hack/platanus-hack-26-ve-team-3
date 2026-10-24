import { z } from "zod";

/** Tipos compartidos de Quórum. Sin PII sensible: nunca cédulas, rostros ni opción ligada a elector. */

export const ElectionKind = z.enum(["yes-no", "multiple", "ranking", "budget"]);
export type ElectionKind = z.infer<typeof ElectionKind>;

export const ElectionStatus = z.enum(["draft", "open", "closed", "tallying", "auditable", "failed"]);
export const Protocol = z.enum(["davinci", "maci", "helios", "integrity-demo"]);

export const Option = z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(120) });

export const Election = z.object({
  id: z.string(),
  title: z.string().min(3).max(160),
  description: z.string().max(2000).default(""),
  kind: ElectionKind,
  options: z.array(Option).min(2).max(10),
  status: ElectionStatus,
  protocol: Protocol,
  manifestHash: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  eligibilityIssuerId: z.string(),
  organizerId: z.string(),
  layout: z.unknown().nullable().default(null), // layout generativo validado aparte (LiveLayout)
});
export type Election = z.infer<typeof Election>;

export const CreateElectionInput = Election.pick({ title: true, description: true, kind: true, options: true, startsAt: true, endsAt: true });
export type CreateElectionInput = z.infer<typeof CreateElectionInput>;

/** Votante elegible: solo id opaco, teléfono hasheado para invitaciones y wallet. Nunca la opción. */
export const Voter = z.object({
  id: z.string(),
  electionId: z.string(),
  displayName: z.string().max(80),       // nombre que dio el votante; no se publica
  phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(), // solo en servidor; nunca en paquete público
  inviteToken: z.string(),               // un solo uso
  inviteStatus: z.enum(["pending", "sent", "delivered", "read", "failed", "claimed"]),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable(),
  livenessPassedAt: z.string().datetime().nullable(),
  credentialIssuedAt: z.string().datetime().nullable(),
  votedAt: z.string().datetime().nullable(), // hecho de haber votado, nunca qué
});
export type Voter = z.infer<typeof Voter>;

export const InviteChannel = z.enum(["kapso", "meta", "wame", "dry-run"]);
export const InviteRequest = z.object({ electionId: z.string(), voterIds: z.array(z.string()).min(1).max(500), channel: InviteChannel });

/** Prueba de vida (modo demo): el cliente manda un descriptor; el servidor nunca guarda imágenes. */
export const FaceEnrollInput = z.object({ voterId: z.string(), inviteToken: z.string(), descriptor: z.array(z.number()).min(64).max(2048), consent: z.literal(true) });
export const FaceVerifyInput = z.object({ voterId: z.string(), descriptor: z.array(z.number()).min(64).max(2048) });
export const FaceVerifyResult = z.object({ ok: z.boolean(), similarity: z.number(), threshold: z.number(), voteNonce: z.string().nullable(), mode: z.literal("demo-liveness") });

/** Voto firmado (EIP-712). `choice` nunca se guarda junto a `voter` en nuestra DB cuando el protocolo promete privacidad. */
export const VoteTypedDataDomain = { name: "Quorum", version: "1" } as const;
export const VoteTypes = {
  Vote: [
    { name: "electionId", type: "string" },
    { name: "ballotCommitment", type: "bytes32" }, // hash/cifrado de la boleta según el motor
    { name: "voter", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "expires", type: "uint64" },
  ],
} as const;
export const SignedVote = z.object({
  message: z.object({ electionId: z.string(), ballotCommitment: z.string(), voter: z.string(), nonce: z.string(), expires: z.string() }),
  signature: z.string(),
});

export const Receipt = z.object({ electionId: z.string(), inclusionId: z.string(), receivedAt: z.string().datetime(), includedAt: z.string().datetime().nullable(), state: z.enum(["pendiente", "recibido", "incluido", "no verificable"]) });

/** Agregados públicos: nunca votos individuales. Con menos de 5 votos no se desglosa por opción. */
export const Aggregates = z.object({
  electionId: z.string(), turnout: z.number().min(0).max(1), totalVotes: z.number().int().min(0), eligible: z.number().int().min(0),
  leadingShare: z.number().min(0).max(1).nullable(), closesAt: z.string().datetime(), status: ElectionStatus,
  options: z.array(z.object({ id: z.string(), label: z.string(), count: z.number().int().min(0).nullable() })),
});
export type Aggregates = z.infer<typeof Aggregates>;

/** Layout generativo: el LLM elige tiles; los números los pone el servidor. Sin texto libre. */
export const Tile = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stat"), metric: z.enum(["turnout", "totalVotes", "leadingShare"]) }),
  z.object({ type: z.literal("bar-chart"), series: z.literal("options"), orientation: z.enum(["horizontal", "vertical"]) }),
  z.object({ type: z.literal("donut"), series: z.literal("options") }),
  z.object({ type: z.literal("countdown") }),
  z.object({ type: z.literal("text"), template: z.enum(["howToRead", "privacyNote", "rankingHint", "budgetHint"]) }),
]);
export const LiveLayout = z.object({ columns: z.enum(["1", "2", "3"]), tiles: z.array(Tile).min(2).max(6) });
export type LiveLayout = z.infer<typeof LiveLayout>;

/** Resultado del verificador independiente (apps/verifier). Nunca derivado de un booleano de nuestra DB. */
export const AuditCheck = z.object({ name: z.string(), passed: z.boolean(), reason: z.string().optional() });
export const AuditResult = z.object({
  electionId: z.string(), verifierVersion: z.string(), protocol: Protocol, inputArtifactDigest: z.string(), checkedAt: z.string().datetime(),
  valid: z.boolean(), checks: z.array(AuditCheck), unsupportedGuarantees: z.array(z.string()),
});
export type AuditResult = z.infer<typeof AuditResult>;

export const ApiError = z.object({ error: z.string(), code: z.enum(["invalid_input", "not_found", "not_eligible", "already_voted", "closed", "forbidden", "unavailable"]) });
