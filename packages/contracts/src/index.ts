import { z } from "zod";

/** Tipos compartidos de Quórum. Sin PII sensible: nunca cédulas, rostros ni opción ligada a elector. */

export const ElectionKind = z.enum(["yes-no", "multiple", "ranking", "budget"]);
export type ElectionKind = z.infer<typeof ElectionKind>;

/**
 * Fases (Contrato v1, D-12): `draft → registration → open → closed → tallying → auditable → drawn`.
 * `failed` = el verificador independiente rechazó el paquete al cierre (se publica igual, nunca se oculta).
 */
export const ElectionStatus = z.enum(["draft", "registration", "open", "closed", "tallying", "auditable", "drawn", "failed"]);
export type ElectionStatus = z.infer<typeof ElectionStatus>;
export const Protocol = z.enum(["semaphore-ledger", "davinci", "helios", "integrity-demo"]);

export const Option = z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(120) });

/** Proyecto postulado al sorteo verificable (D-12). `amount` es informativo (moneda ficticia de la demo). */
export const Candidate = z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(160), amount: z.number().nonnegative().optional() });
export type Candidate = z.infer<typeof Candidate>;

/** Resultado del sorteo: `seed = keccak256(finalHash)`; Fisher-Yates con PRNG `keccak256(seed ‖ uint256(i))` sobre candidatos ordenados por id. */
export const DrawMethod = z.literal("keccak256(finalHash)|fisher-yates");
export const Draw = z.object({
  seed: z.string().regex(/^0x[0-9a-f]{64}$/),
  n: z.number().int().min(0),
  winners: z.array(z.string()),
  method: DrawMethod,
  finalHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  drawnAt: z.string().datetime().optional(),
});
export type Draw = z.infer<typeof Draw>;

export const AnchorInfo = z.object({
  chainId: z.number().int(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  /** Presente si se ancló vía `QuorumRegistry.anchor` (aditivo; sin él, modo antiguo de calldata). */
  registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});

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
  // --- Contrato v1 (aditivo; opcionales: no rompen datos ni fixtures v0; el servidor siempre los rellena) ---
  /** Raíz del padrón Semaphore congelada en `POST /open`. */
  groupRoot: z.string().regex(/^\d+$/).nullable().optional(),
  /** Si true, N ganadores del sorteo = valor numérico de la opción ganadora (`optionValues`). */
  winnersCountFromResult: z.boolean().optional(),
  /** N fijo de ganadores (si `winnersCountFromResult` es false). */
  winnersCount: z.number().int().min(1).nullable().optional(),
  /** Valor numérico de cada opción (mismo orden que `options`), p. ej. [1,2,3,4,5]. */
  optionValues: z.array(z.number().int().min(0)).nullable().optional(),
  candidates: z.array(Candidate).max(50).optional(),
  draw: Draw.nullable().optional(),
  anchor: AnchorInfo.nullable().optional(),
  registryAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(),
  /** sha256 (hex con 0x) de los bytes exactos del paquete de auditoría publicado. */
  packageDigest: z.string().nullable().optional(),
});
export type Election = z.infer<typeof Election>;

export const CreateElectionInput = Election.pick({ title: true, description: true, kind: true, options: true, startsAt: true, endsAt: true }).extend({
  candidates: z.array(Candidate).max(50).optional(),
  winnersCountFromResult: z.boolean().optional(),
  winnersCount: z.number().int().min(1).optional(),
  optionValues: z.array(z.number().int().min(0)).optional(),
});
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
  // --- Contrato v1 (aditivo) ---
  /** keccak256(electionId | voterId | sha256(descriptorCifrado)); lo firma la wallet (EIP-712 FaceBinding). */
  faceBindingHash: z.string().regex(/^0x[0-9a-f]{64}$/).nullable().optional(),
  walletKind: z.enum(["kernel", "eoa-demo"]).nullable().optional(),
  /** Momento en que la firma FaceBinding se verificó (rostro ↔ wallet). */
  registeredAt: z.string().datetime().nullable().optional(),
});
export type Voter = z.infer<typeof Voter>;

/** Estado público de un inscrito (GET /api/elections/:id/voters). Sin teléfono, sin commitment, nunca opción. */
export const VoterState = z.enum(["invited", "registered", "voted"]);
export const VoterSummary = z.object({
  id: z.string(),
  displayName: z.string(),
  state: VoterState,
  walletAddress: z.string().nullable(),
  hasIdentity: z.boolean(),
});
export type VoterSummary = z.infer<typeof VoterSummary>;

export const InviteChannel = z.enum(["kapso", "meta", "wame", "dry-run"]);
export const InviteRequest = z.object({ electionId: z.string(), voterIds: z.array(z.string()).min(1).max(500), channel: InviteChannel });

/** Prueba de vida (modo demo): el cliente manda un descriptor; el servidor nunca guarda imágenes. */
/** Respuesta de enrolamiento v1: incluye el `faceBindingHash` que la wallet debe firmar. */
export const FaceEnrollResult = z.object({ ok: z.literal(true), faceBindingHash: z.string().regex(/^0x[0-9a-f]{64}$/), voteNonce: z.string() });
export const FaceEnrollInput = z.object({ voterId: z.string(), inviteToken: z.string(), descriptor: z.array(z.number()).min(64).max(2048), consent: z.literal(true) });
/** v1 (hallazgo A3): exige `inviteToken` y la respuesta NO revela similitud ni umbral (evita usarla como oráculo). */
export const FaceVerifyInput = z.object({ voterId: z.string(), inviteToken: z.string().min(1), descriptor: z.array(z.number()).min(64).max(2048) });
export const FaceVerifyResult = z.object({ ok: z.boolean(), voteNonce: z.string().nullable(), mode: z.literal("demo-liveness") });

/** Respuesta de POST /api/elections (C4/A7): el token del organizador se devuelve UNA sola vez; el servidor guarda solo su hash. */
export const CreateElectionResult = Election.extend({ organizerToken: z.string().min(32) });

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

/**
 * Enlace rostro ↔ wallet (D-10). La wallet firma EIP-712 `FaceBinding`; el servidor la verifica
 * (`publicClient.verifyTypedData` por RPC: EOA, ERC-1271 y ERC-6492; sin RPC solo EOA).
 * Copia EXACTA de los tipos de `@quorum/wallet` (feat/phase2-wallet) para que el backend no dependa de ese paquete.
 */
export const FaceBindingDomain = { name: "Quorum", version: "1", chainId: 84532, verifyingContract: "0x0000000000000000000000000000000000000000" } as const;
export const FaceBindingTypes = {
  FaceBinding: [
    { name: "electionId", type: "string" },
    { name: "voterId", type: "string" },
    { name: "faceBindingHash", type: "bytes32" },
    { name: "wallet", type: "address" },
  ],
} as const;
export const WalletKind = z.enum(["kernel", "eoa-demo"]);
export const LinkWalletInput = z.object({
  inviteToken: z.string().min(1),
  walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  kind: WalletKind,
  bindingSignature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

/** Identidad Semaphore: solo el `commitment` (string decimal < campo BN254). La clave privada nunca sale del navegador. */
export const SNARK_SCALAR_FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
export const SemaphoreCommitment = z
  .string()
  .regex(/^[1-9]\d{0,77}$/, "commitment decimal canónico")
  .refine((c) => BigInt(c) > BigInt(0) && BigInt(c) < SNARK_SCALAR_FIELD, "commitment fuera del campo BN254");
export const IdentityInput = z.object({ inviteToken: z.string().min(1), commitment: SemaphoreCommitment });
export const IdentityResult = z.object({ ok: z.literal(true), registeredCount: z.number().int().min(0) });

/** Prueba Semaphore v4 tal cual la produce `@semaphore-protocol/core` (`message` = índice de opción). */
/** Decimal canónico (sin ceros a la izquierda ni hex) y < campo BN254 (hallazgos C1/A1). */
const Decimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,77})$/, "decimal canónico")
  .refine((v) => BigInt(v) < SNARK_SCALAR_FIELD, "fuera del campo BN254");
export const SemaphoreProofSchema = z.object({
  merkleTreeDepth: z.number().int().min(1).max(32),
  merkleTreeRoot: Decimal,
  message: Decimal,
  nullifier: Decimal,
  scope: Decimal,
  points: z.tuple([Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]),
});
export type SemaphoreProofInput = z.infer<typeof SemaphoreProofSchema>;
export const CastVoteInput = z.object({
  proof: SemaphoreProofSchema,
  onchain: z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).optional(),
});
export type CastVoteInput = z.infer<typeof CastVoteInput>;

/** Recibo. v1 añade `nullifier`, `index` y `txHash` (opcionales para compatibilidad v0). Nunca la opción. */
export const Receipt = z.object({
  electionId: z.string(),
  inclusionId: z.string(),
  receivedAt: z.string().datetime(),
  includedAt: z.string().datetime().nullable(),
  state: z.enum(["pendiente", "recibido", "incluido", "no verificable"]),
  nullifier: z.string().optional(),
  index: z.number().int().min(0).optional(),
  hash: z.string().optional(),
  txHash: z.string().optional(),
  /** Estado del txHash on-chain declarado por el cliente: nunca "verificado" sin leer la cadena. */
  onchainStatus: z.enum(["verificado", "no verificable", "fallo detectado"]).optional(),
});

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
/** `status` (aditivo, opcional): estado honesto del check. "no evaluado" lleva `passed: true` pero NO es "verificado". */
export const AuditCheck = z.object({ name: z.string(), passed: z.boolean(), reason: z.string().optional(), status: z.enum(["verificado", "no evaluado", "fallo detectado"]).optional() });
export const AuditResult = z.object({
  electionId: z.string(), verifierVersion: z.string(), protocol: Protocol, inputArtifactDigest: z.string(), checkedAt: z.string().datetime(),
  valid: z.boolean(), checks: z.array(AuditCheck), unsupportedGuarantees: z.array(z.string()),
});
export type AuditResult = z.infer<typeof AuditResult>;

export const ApiError = z.object({ error: z.string(), code: z.enum(["invalid_input", "not_found", "not_eligible", "already_voted", "closed", "forbidden", "unavailable", "duplicate_identity"]) });

// ---------------------------------------------------------------------------
// Respuestas HTTP del Contrato v1 tal como las implementa el backend (apps/web/src/lib/server/engine.ts).
// Fuente única para la web: el cliente las valida con estos esquemas (sin duplicados en apps/web).
// ---------------------------------------------------------------------------

/** GET /api/invite/:token. Nunca el teléfono. */
export const InviteResponse = z.object({
  election: Election.pick({ id: true, title: true, kind: true, options: true, status: true, endsAt: true }),
  voter: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    walletAddress: z.string().nullable(),
    livenessPassedAt: z.string().nullable(),
    votedAt: z.string().nullable(),
  }),
});
export type InviteResponse = z.infer<typeof InviteResponse>;

/** Conteos públicos de inscritos (GET /voters sin token). */
export const VoterCounts = z.object({ total: z.number().int(), invited: z.number().int(), registered: z.number().int(), withIdentity: z.number().int(), voted: z.number().int() });
export type VoterCounts = z.infer<typeof VoterCounts>;
/** GET /api/elections/:id/voters: público `{counts}`; organizador además `voters`. */
export const VotersListResponse = z.object({ voters: z.array(VoterSummary).optional(), counts: VoterCounts });
export type VotersListResponse = z.infer<typeof VotersListResponse>;

/** POST /api/voters/:id/voted (autodeclaración, separada del voto). */
export const MarkVotedResult = z.object({ ok: z.literal(true), votedAt: z.string() });

/** GET /api/elections/:id/roll. `groupRoot`/`scope` son null hasta `POST /open`. */
export const RollResponse = z.object({
  electionId: z.string(),
  status: ElectionStatus,
  frozen: z.boolean(),
  groupRoot: z.string().nullable(),
  scope: z.string().nullable(),
  merkleTreeDepth: z.number().int(),
  commitments: z.array(z.string()),
});
export type RollResponse = z.infer<typeof RollResponse>;

/** Entrada del ledger público (desde `closed`; durante `open` no se publican entradas, hallazgo C3). */
export const LedgerEntry = z.object({ idx: z.number().int().min(0), prevHash: z.string(), hash: z.string(), proof: SemaphoreProofSchema });
export type LedgerEntry = z.infer<typeof LedgerEntry>;
/** GET /api/elections/:id/ledger. */
export const LedgerResponse = z.object({
  electionId: z.string(),
  status: ElectionStatus,
  groupRoot: z.string().nullable(),
  scope: z.string().nullable(),
  genesisHash: z.string().nullable(),
  finalHash: z.string().nullable(),
  count: z.number().int().min(0),
  proofsPublished: z.boolean(),
  entries: z.array(LedgerEntry),
});
export type LedgerResponse = z.infer<typeof LedgerResponse>;

/** Estado del ancla on-chain al cierre: nunca "anclado" sin tx real. */
export const AnchorStatus = z.object({ mode: z.enum(["disabled", "anchored", "error"]), reason: z.string() });
/** GET /api/elections/:id/audit: resultado guardado de `verifyPackage` al cerrar/sortear. */
export const AuditResponse = z.object({ auditResult: AuditResult, packageDigest: z.string().nullable(), anchorStatus: AnchorStatus.nullable() });
export type AuditResponse = z.infer<typeof AuditResponse>;

/** GET /api/elections/:id/draw. */
export const DrawResponse = z.object({
  seed: Draw.shape.seed,
  n: Draw.shape.n,
  winners: Draw.shape.winners,
  method: DrawMethod,
  finalHash: Draw.shape.finalHash,
  candidates: z.array(Candidate),
  tieBreak: z.string().nullable(),
});
export type DrawResponse = z.infer<typeof DrawResponse>;
