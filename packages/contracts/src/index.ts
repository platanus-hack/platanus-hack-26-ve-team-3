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
/**
 * D-22: cuándo se vota. `continuous` (por defecto en votaciones nuevas): se inscriben y votan en el mismo momento; el
 * grupo crece mientras se vota. `phased` ("Con hora de inicio"): primero se inscriben todos y el padrón se congela al abrir.
 * Ausente en datos guardados = `phased` (compatibilidad).
 */
export const VotingMode = z.enum(["continuous", "phased"]);
export type VotingMode = z.infer<typeof VotingMode>;
/** K por defecto (D-24): no se aceptan votos mientras el grupo tenga menos miembros. Con 2 la privacidad es mínima: se declara. */
export const DEFAULT_MIN_ANONYMITY_SET = 2;
export const MinAnonymitySet = z.number().int().min(2).max(100);

export const Protocol = z.enum(["semaphore-ledger", "davinci", "helios", "integrity-demo"]);

/** Foto de una opción: data URI JPEG/WebP/PNG ya recortada y comprimida en el teléfono (≤ 192 px, ≤ 40 KB). */
export const OptionImage = z.string().regex(/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/).max(40_000);
/** Opción de la boleta. `subtitle` (cargo, equipo) e `image` son presentación; su huella entra en el manifiesto como `imageSha256`. */
export const Option = z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(120), subtitle: z.string().max(80).optional(), image: OptionImage.optional() });
export type Option = z.infer<typeof Option>;

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

// ---------------------------------------------------------------------------
// Método de elegibilidad (D-19). Quién puede entrar por la sala `/j/<código>`. El rostro (dedupe 1:N) es SIEMPRE
// obligatorio: la credencial del evento es una capa adicional, nunca lo sustituye.
// ---------------------------------------------------------------------------
/** `open-alias`: apodo libre (lo de siempre) · `event-badge`: QR de la credencial del evento · `list`: próximamente. */
export const EligibilityMethod = z.enum(["open-alias", "event-badge", "list"]);
export type EligibilityMethod = z.infer<typeof EligibilityMethod>;
/** Cómo se comprueba que la credencial existe: lista cargada por el organizador, consulta en vivo a la URL, o nada. */
export const BadgeCheck = z.enum(["list", "live", "none"]);
export type BadgeCheck = z.infer<typeof BadgeCheck>;
export const DEFAULT_BADGE_URL_PREFIX = "https://hack.platan.us/26-ve/id/";
/** Prefijo de la URL de la credencial: https y terminado en "/". El usuario va justo después. */
export const BadgeUrlPrefix = z
  .string()
  .max(200)
  .regex(/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[^\s?#]*\/$/, "Debe empezar por https:// y terminar en /");
/** Usuario de GitHub tal como va en la credencial: letras, números y guiones, 1..39. */
export const BadgeUser = z.string().regex(/^[A-Za-z0-9-]{1,39}$/, "Usuario inválido");

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
 * Extrae el usuario de una URL de credencial con el patrón EXACTO `^<prefijo>([A-Za-z0-9-]{1,39})$`
 * (p. ej. `https://hack.platan.us/26-ve/id/jgalvis414` → `jgalvis414`). `null` si no es una credencial del evento.
 */
export function parseBadgeUrl(raw: string, prefix: string = DEFAULT_BADGE_URL_PREFIX): string | null {
  const m = new RegExp(`^${escapeRegExp(prefix)}([A-Za-z0-9-]{1,39})$`).exec(raw.trim());
  return m ? m[1] : null;
}

/** Forma pública (va en `Election`): nunca la lista de usuarios, solo cuántos hay. Ausente = `open-alias`. */
export const Eligibility = z.object({
  method: EligibilityMethod,
  badgeUrlPrefix: BadgeUrlPrefix.optional(),
  badgeCheck: BadgeCheck.optional(),
  /** Con `badgeCheck: "list"`: cuántos usuarios cargó el organizador (los usuarios se guardan solo como HMAC). */
  allowlistCount: z.number().int().min(0).optional(),
});
export type Eligibility = z.infer<typeof Eligibility>;

/** Lo que manda el organizador (crear o `PUT /eligibility`). `list` aún no se acepta (400). */
export const EligibilityInput = z.object({
  method: EligibilityMethod,
  badgeUrlPrefix: BadgeUrlPrefix.optional(),
  badgeCheck: BadgeCheck.optional(),
  /** Usuarios permitidos (con `badgeCheck: "list"`). El servidor guarda solo su HMAC. */
  badgeAllowlist: z.array(BadgeUser).max(5000).optional(),
});
export type EligibilityInput = z.infer<typeof EligibilityInput>;

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
  /** D-19: método de elegibilidad de la sala (forma pública). Ausente = `open-alias`. */
  eligibility: Eligibility.optional(),
  /**
   * Inicio programado de la votación (fase `registration`). Al llegar esa hora el servidor pasa solo de `registration`
   * a `open` (misma transición que `POST /open`). `null` = la abre el organizador a mano. Al abrir (a mano o sola) se
   * fija a la hora real de apertura. No entra en el manifiesto.
   */
  votingStartsAt: z.string().datetime().nullable().optional(),
  /** D-22: modo de votación. Ausente = `phased` (elecciones creadas antes del modo continuo). */
  votingMode: VotingMode.optional(),
  /** D-22 (solo continuo): K, mínimo de inscritos para aceptar votos. Entra en el manifiesto (`enrollment`). */
  minAnonymitySet: MinAnonymitySet.optional(),
});
export type Election = z.infer<typeof Election>;

/** Hora del servidor (ISO) en la respuesta, para que el cliente corrija el desfase de reloj del teléfono. */
export const ServerNow = z.string().datetime();
/** GET /api/elections/:id: la elección + `serverNow`. */
export const ElectionResponse = Election.extend({ serverNow: ServerNow.optional() });
export type ElectionResponse = z.infer<typeof ElectionResponse>;

export const CreateElectionInput = Election.pick({ title: true, description: true, kind: true, options: true, startsAt: true, endsAt: true }).extend({
  candidates: z.array(Candidate).max(50).optional(),
  winnersCountFromResult: z.boolean().optional(),
  winnersCount: z.number().int().min(1).optional(),
  optionValues: z.array(z.number().int().min(0)).optional(),
  eligibility: EligibilityInput.optional(),
  /** D-22: ausente = `continuous` (el modo por defecto para votaciones nuevas). */
  votingMode: VotingMode.optional(),
  minAnonymitySet: MinAnonymitySet.optional(),
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
  /** Vía por la que entró al censo: invitación, sala abierta (alias libre) o credencial del evento (D-19). Ausente = "invite". */
  source: z.enum(["invite", "room", "badge"]).optional(),
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
  source: z.enum(["invite", "room", "badge"]).optional(),
});
export type VoterSummary = z.infer<typeof VoterSummary>;

export const InviteChannel = z.enum(["kapso", "meta", "wame", "dry-run"]);
export const InviteRequest = z.object({ electionId: z.string(), voterIds: z.array(z.string()).min(1).max(500), channel: InviteChannel });

/** Prueba de vida (modo demo): el cliente manda un descriptor; el servidor nunca guarda imágenes. */
/** Respuesta de enrolamiento v1: incluye el `faceBindingHash` que la wallet debe firmar. */
export const FaceEnrollResult = z.object({ ok: z.literal(true), faceBindingHash: z.string().regex(/^0x[0-9a-f]{64}$/), voteNonce: z.string() });
export const FaceEnrollInput = z.object({ voterId: z.string(), inviteToken: z.string(), descriptor: z.array(z.number()).min(64).max(2048), consent: z.literal(true) });
/**
 * D-21 (revisión manual de duplicados): `POST /api/face/enroll` → 202 cuando el rostro coincide con alguien ya inscrito
 * pero el votante entró con una credencial del evento distinta y no usada. No revela con quién coincidió ni la similitud.
 */
export const FaceEnrollPending = z.object({ status: z.literal("pending_review") });
export const FaceEnrollResponse = z.union([FaceEnrollResult, FaceEnrollPending]);
export type FaceEnrollResponse = z.infer<typeof FaceEnrollResponse>;
/** `POST /api/face/review` (votante, polling): estado de su revisión. `faceBindingHash` solo al aprobar. */
export const FaceReviewStatusInput = z.object({ voterId: z.string().min(1), inviteToken: z.string().min(1) });
export const FaceReviewStatus = z.object({
  status: z.enum(["none", "pending_review", "approved", "rejected"]),
  faceBindingHash: z.string().regex(/^0x[0-9a-f]{64}$/).optional(),
});
export type FaceReviewStatus = z.infer<typeof FaceReviewStatus>;
/** Organizador: decisión sobre una revisión pendiente (`POST /api/elections/:id/reviews/:reviewId`). */
export const ReviewDecisionInput = z.object({ decision: z.enum(["approve", "reject"]) });
export type ReviewDecisionInput = z.infer<typeof ReviewDecisionInput>;
/** Una revisión tal como la ve el organizador: sin datos biométricos, sin con quién coincidió ni la similitud. */
export const ReviewSummary = z.object({
  reviewId: z.string(),
  createdAt: z.string().datetime(),
  displayName: z.string(),
  method: z.enum(["event-badge"]),
  reason: z.literal("face_match"),
  status: z.enum(["pending", "approved", "rejected"]),
  decidedAt: z.string().datetime().nullable(),
  decidedBy: z.enum(["organizer", "auto-open"]).nullable(),
});
export type ReviewSummary = z.infer<typeof ReviewSummary>;
/** `GET /api/elections/:id/reviews`: lista + conteos; `maxPending` es el tope de pendientes por elección. */
export const ReviewsListResponse = z.object({
  reviews: z.array(ReviewSummary),
  pending: z.number().int().min(0),
  approved: z.number().int().min(0),
  maxPending: z.number().int().min(1),
});
export type ReviewsListResponse = z.infer<typeof ReviewsListResponse>;
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

/** Agregados públicos: nunca votos individuales. Con menos de MIN_VOTES_FOR_BREAKDOWN votos no se desglosa por opción (D-24: 2). */
export const MIN_VOTES_FOR_BREAKDOWN = 2;

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

export const ApiError = z.object({ error: z.string(), code: z.enum(["invalid_input", "not_found", "not_eligible", "already_voted", "closed", "forbidden", "unavailable", "duplicate_identity", "onchain_not_supported", "room_full", "room_closed", "badge_invalid", "badge_unknown", "badge_used", "stale_root", "anonymity_pending"]) });

// ---------------------------------------------------------------------------
// Respuestas HTTP del Contrato v1 tal como las implementa el backend (apps/web/src/lib/server/engine.ts).
// Fuente única para la web: el cliente las valida con estos esquemas (sin duplicados en apps/web).
// ---------------------------------------------------------------------------

/** GET /api/invite/:token. Nunca el teléfono. */
export const InviteResponse = z.object({
  election: Election.pick({ id: true, title: true, kind: true, options: true, status: true, endsAt: true, votingStartsAt: true, votingMode: true, minAnonymitySet: true }),
  serverNow: ServerNow.optional(),
  voter: z.object({
    id: z.string(),
    displayName: z.string().nullable(),
    walletAddress: z.string().nullable(),
    livenessPassedAt: z.string().nullable(),
    votedAt: z.string().nullable(),
    /** D-21: revisión manual en curso o rechazada (null/ausente = sin revisión o aprobada). */
    review: z.enum(["pending", "rejected"]).nullable().optional(),
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

/**
 * GET /api/elections/:id/roll (y su alias GET /group). Con fases: `groupRoot`/`scope` son null hasta `POST /open`.
 * Continuo (D-22): el grupo crece mientras se vota; `groupRoot` es la raíz VIGENTE, `size` los miembros y
 * `minAnonymitySet`/`rootWindow` la regla de validez (K y ventana de raíces).
 */
export const RollResponse = z.object({
  electionId: z.string(),
  status: ElectionStatus,
  frozen: z.boolean(),
  groupRoot: z.string().nullable(),
  scope: z.string().nullable(),
  merkleTreeDepth: z.number().int(),
  commitments: z.array(z.string()),
  votingMode: VotingMode.optional(),
  size: z.number().int().min(0).optional(),
  minAnonymitySet: z.number().int().optional(),
  rootWindow: z.number().int().optional(),
});
export type RollResponse = z.infer<typeof RollResponse>;

/**
 * Entrada del ledger público (desde `closed`; durante `open` no se publican entradas, hallazgo C3).
 * Con fases: boleta `{ idx, prevHash, hash, proof }`. Continuo (D-22): boleta con `kind:"ballot"` + `groupSize`, o
 * inscripción `kind:"member_added"` `{ index, commitment, rootAfter }` (sin voterId).
 */
export const LedgerBallotEntry = z.object({ idx: z.number().int().min(0), prevHash: z.string(), hash: z.string(), proof: SemaphoreProofSchema, kind: z.literal("ballot").optional(), groupSize: z.number().int().optional() });
export const LedgerMemberEntry = z.object({ idx: z.number().int().min(0), prevHash: z.string(), hash: z.string(), kind: z.literal("member_added"), member: z.object({ index: z.number().int().min(0), commitment: z.string(), rootAfter: z.string() }) });
export const LedgerEntry = z.union([LedgerMemberEntry, LedgerBallotEntry]);
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


// ---------------------------------------------------------------------------
// Sala abierta (asamblea abierta) — fase `registration`. Ver docs/API_CONTRACT.md § "Sala abierta".
// ---------------------------------------------------------------------------
/** POST /api/elections/:id/room (organizador). */
export const OpenRoomInput = z
  .object({
    maxSeats: z.number().int().min(1).max(500),
    expiresInMin: z.number().int().min(1).max(180),
    /**
     * Inicio programado de la votación. Ausente = el cierre de la sala (`expiresAt`), salvo que ya hubiera una hora
     * propia distinta; `null` = sin hora (la abre el organizador a mano). Alternativa relativa: `votingStartsInSec`.
     */
    votingStartsAt: z.string().datetime().nullable().optional(),
    votingStartsInSec: z.number().int().min(10).max(7 * 24 * 3600).optional(),
  })
  .refine((v) => !(v.votingStartsAt !== undefined && v.votingStartsInSec !== undefined), "Usa votingStartsAt o votingStartsInSec, no ambos");
export type OpenRoomInput = z.infer<typeof OpenRoomInput>;

/** `election-closed` (D-22, continuo): la sala sigue abierta mientras se vota y se cierra con la votación. */
export const RoomCloseReason = z.enum(["manual", "expired", "election-opened", "election-closed"]);

/** GET /api/elections/:id/room (público) — contador del proyector. Con Bearer añade `roomCode` y `joinUrl`. */
export const RoomStatus = z.object({
  open: z.boolean(),
  seatsTaken: z.number().int().min(0),
  maxSeats: z.number().int().min(1).nullable(),
  expiresAt: z.string().datetime().nullable(),
  closedReason: RoomCloseReason.nullable(),
  /** Inicio programado de la votación (de la elección); null = sin hora. */
  votingStartsAt: z.string().datetime().nullable().optional(),
  serverNow: ServerNow.optional(),
  roomCode: z.string().optional(),
  joinUrl: z.string().optional(),
});
export type RoomStatus = z.infer<typeof RoomStatus>;

/**
 * POST /api/elections/:id/schedule (organizador, fase `registration`): mueve el inicio programado. Exactamente uno:
 * `votingStartsAt` (ISO futura, o null = sin hora), `inSeconds` (desde ahora, hora del servidor) o `addSeconds`
 * (suma a la hora vigente; sin hora vigente, desde ahora).
 */
export const ScheduleInput = z.union([
  z.object({ votingStartsAt: z.string().datetime().nullable() }).strict(),
  z.object({ inSeconds: z.number().int().min(10).max(7 * 24 * 3600) }).strict(),
  z.object({ addSeconds: z.number().int().min(-3600).max(24 * 3600).refine((n) => n !== 0, "addSeconds no puede ser 0") }).strict(),
]);
export type ScheduleInput = z.infer<typeof ScheduleInput>;
export const ScheduleResult = z.object({ electionId: z.string(), status: ElectionStatus, votingStartsAt: z.string().datetime().nullable(), serverNow: ServerNow });
export type ScheduleResult = z.infer<typeof ScheduleResult>;

/** Respuesta de POST /api/elections/:id/room. */
export const OpenRoomResult = RoomStatus.extend({ roomCode: z.string(), joinUrl: z.string() });
export type OpenRoomResult = z.infer<typeof OpenRoomResult>;

/** GET /api/rooms/:roomCode (público) — lo que necesita la página /j/<roomCode> antes de unirse. */
export const RoomPublicInfo = RoomStatus.omit({ roomCode: true, joinUrl: true }).extend({
  electionId: z.string(),
  title: z.string(),
  /** D-19: cómo se entra (apodo o credencial). Ausente = `open-alias`. */
  eligibility: Eligibility.pick({ method: true, badgeUrlPrefix: true }).optional(),
});
export type RoomPublicInfo = z.infer<typeof RoomPublicInfo>;

/** Alias libre (sin PII): letras, números, espacios y . ' _ - ; 1..32 caracteres; nunca algo que parezca un teléfono. */
export const RoomAlias = z
  .string()
  .transform((s) => s.normalize("NFC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "El alias no puede estar vacío")
      .max(32, "Máximo 32 caracteres")
      .regex(/^[\p{L}\p{M}\p{N} .'_-]+$/u, "Solo letras, números, espacios y . ' _ -")
      .refine((s) => /[\p{L}\p{N}]/u.test(s), "El alias necesita al menos una letra o número")
      .refine((s) => (s.match(/\p{N}/gu) ?? []).length < 7, "No uses tu teléfono ni números de documento como alias"),
  );

/** POST /api/rooms/:roomCode/join (público, rate limit por IP). */
export const JoinRoomInput = z.object({ displayName: RoomAlias });
export type JoinRoomInput = z.infer<typeof JoinRoomInput>;

/** El `inviteToken` se devuelve UNA sola vez; desde aquí sigue el flujo normal /v/<token>. */
export const JoinRoomResult = z.object({
  electionId: z.string(),
  voterId: z.string(),
  displayName: z.string(),
  inviteToken: z.string(),
  inviteUrl: z.string(),
});
export type JoinRoomResult = z.infer<typeof JoinRoomResult>;

/** POST /api/rooms/:roomCode/join-badge `{ badgeUrl }` (D-19): la URL leída del QR de la credencial. Responde como `join`. */
export const JoinBadgeInput = z.object({ badgeUrl: z.string().min(1).max(300) });
export type JoinBadgeInput = z.infer<typeof JoinBadgeInput>;
