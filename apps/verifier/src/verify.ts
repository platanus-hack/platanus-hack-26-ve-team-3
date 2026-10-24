/**
 * Verificador independiente de Quórum para el protocolo `semaphore-ledger` (ADR-001, Plan A).
 *
 * Reglas de independencia: este módulo NO importa `apps/web` ni `@quorum/protocol-adapter`; solo necesita
 * el paquete de auditoría público. Reimplementa el hash canónico y la cadena, usa `@semaphore-protocol/core`
 * (Group + verifyProof, claves de verificación embebidas) y `viem` para hashes/ABI/RPC.
 * Nunca deriva "verificado" de un booleano: cada check se recomputa aquí.
 */
import { Group, verifyProof } from "@semaphore-protocol/core";
import { AuditResult as AuditResultSchema, type AuditResult } from "@quorum/contracts";
import { concat, createPublicClient, decodeAbiParameters, decodeEventLog, getAddress, http, isAddress, keccak256, parseAbi, sha256, stringToBytes, toHex, type Hex } from "viem";
import { z } from "zod";

export const VERIFIER_VERSION = "quorum-verifier/0.1.0 (semaphore-core 4.14.5)";
export const BASE_SEPOLIA_CHAIN_ID = 84532;

// ---------- esquema del paquete (quorum-audit/1) ----------
const Hex32 = z.string().regex(/^0x[0-9a-f]{64}$/, "hex de 32 bytes");
/** Módulo del campo escalar de BN254. */
const SNARK_SCALAR_FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
/** Decimal canónico (sin ceros a la izquierda ni hex) y < r: evita dos codificaciones del mismo nullifier (C1). */
const Decimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,77})$/, "decimal canónico (sin ceros a la izquierda ni hex)")
  .refine((v) => BigInt(v) < SNARK_SCALAR_FIELD, "fuera del campo BN254");
const ProofSchema = z.object({
  merkleTreeDepth: z.number().int().min(1).max(32),
  merkleTreeRoot: Decimal,
  message: Decimal,
  nullifier: Decimal,
  scope: Decimal,
  points: z.tuple([Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]),
}).strict();
/** Boleta del modo con fases (sin `kind`). */
const PhasedEntrySchema = z.object({ idx: z.number().int().min(0), prevHash: Hex32, hash: Hex32, proof: ProofSchema }).strict();
/** D-22 modo continuo: boleta con el tamaño del grupo en la raíz de su prueba (conjunto de anonimato). */
const ContinuousBallotSchema = z.object({ idx: z.number().int().min(0), prevHash: Hex32, hash: Hex32, kind: z.literal("ballot"), proof: ProofSchema, groupSize: z.number().int().min(1) }).strict();
/** D-22 modo continuo: inscripción completada (sin voterId). */
const MemberAddedSchema = z.object({
  idx: z.number().int().min(0),
  prevHash: Hex32,
  hash: Hex32,
  kind: z.literal("member_added"),
  member: z.object({ index: z.number().int().min(0), commitment: Decimal, rootAfter: Decimal }).strict(),
}).strict();
const ContinuousEntrySchema = z.discriminatedUnion("kind", [ContinuousBallotSchema, MemberAddedSchema]);
const EnrollmentSchema = z.object({ mode: z.literal("continuous"), minAnonymitySet: z.number().int().min(1), rootWindow: z.number().int().min(1).max(1024) }).strict();
const Hex32Lower = z.string().regex(/^0x[0-9a-f]{64}$/, "hex de 32 bytes");
const DrawCandidateSchema = z.object({ id: z.string().min(1), label: z.string(), amount: z.number().optional() }).strict();
const DrawRuleSchema = z.object({
  candidates: z.array(DrawCandidateSchema).min(1),
  winnersCount: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), n: z.number().int().min(0) }).strict(),
    z.object({ kind: z.literal("from-result"), optionValues: z.array(z.number().int().min(0)) }).strict(),
  ]),
  tieBreak: z.literal("lowest").optional(),
}).strict();
const DrawSchema = z.object({
  seed: Hex32Lower,
  n: z.number().int().min(0),
  winners: z.array(z.string()),
  method: z.literal("keccak256(finalHash)|fisher-yates"),
  finalHash: Hex32Lower,
}).strict();
const ManifestSchema = z.object({
  electionId: z.string().min(1),
  title: z.string(),
  kind: z.enum(["yes-no", "multiple", "ranking", "budget"]),
  options: z.array(z.object({ id: z.string(), label: z.string() }).strict()).min(2),
  startsAt: z.string(),
  endsAt: z.string(),
  protocol: z.literal("semaphore-ledger"),
  merkleTreeDepth: z.number().int(),
  label: z.string().optional(),
  drawRule: DrawRuleSchema.optional(),
  anchorPolicy: z
    .object({
      kind: z.enum(["quorum-registry", "calldata"]),
      chainId: z.number().int(),
      registryAddress: z.string().refine((v) => isAddress(v, { strict: false }), "dirección EVM").optional(),
      organizer: z.string().refine((v) => isAddress(v, { strict: false }), "dirección EVM"),
    })
    .strict()
    .optional(),
  enrollment: EnrollmentSchema.optional(),
}).strict();
/**
 * Política del censo declarada por el organizador (opcional): `open-room` o `event-badge` (D-19): sala abierta en la que el público
 * se inscribió con un alias. No entra en `manifestHash` ni en `checksums` (la sala se abre después de publicar), así que
 * el verificador NO la comprueba: la muestra como garantía no soportada para que nadie lea el padrón como un censo cerrado.
 */
const OpenRoomPolicySchema = z.object({
  kind: z.literal("open-room"),
  maxSeats: z.number().int().min(1),
  joined: z.number().int().min(0),
  enrolled: z.number().int().min(0),
  eligibility: z.literal("face-dedupe-demo"),
  note: z.string().optional(),
}).strict();
/**
 * D-19: sala con credencial del evento (QR) + rostro obligatorio. Igual de declarativa: el verificador no puede comprobar
 * qué credenciales existían ni cuáles se usaron (solo hay HMAC en el servidor, nada en el paquete).
 */
const EventBadgePolicySchema = z.object({
  kind: z.literal("event-badge"),
  maxSeats: z.number().int().min(1),
  check: z.enum(["list", "live", "none"]),
  face: z.literal("full"),
  joined: z.number().int().min(0),
  enrolled: z.number().int().min(0),
  eligibility: z.literal("badge-once+face-dedupe-demo"),
  note: z.string().optional(),
}).strict();
const RollPolicySchema = z.discriminatedUnion("kind", [OpenRoomPolicySchema, EventBadgePolicySchema]);
/** D-21: inscripciones aprobadas a mano por el organizador tras coincidencia facial (solo conteo, sin ids). */
const ManualApprovalsSchema = z.object({
  count: z.number().int().min(0),
  method: z.literal("organizer-in-person"),
  note: z.string().optional(),
}).strict();
const TallySchema = z.object({ counts: z.array(z.number().int().min(0)), invalid: z.number().int().min(0), total: z.number().int().min(0) }).strict();
export const AuditPackageSchema = z.object({
  version: z.literal("quorum-audit/1"),
  protocol: z.literal("semaphore-ledger"),
  electionId: z.string().min(1),
  manifest: ManifestSchema,
  manifestHash: Hex32,
  scope: Decimal,
  merkleTreeDepth: z.number().int(),
  groupRoot: Decimal,
  commitments: z.array(Decimal),
  ledger: z.array(PhasedEntrySchema),
  genesisHash: Hex32,
  tally: TallySchema,
  tallyHash: Hex32,
  finalHash: Hex32,
  anchor: z
    .object({
      chainId: z.number().int(),
      txHash: Hex32.optional(),
      attestationUid: Hex32.optional(),
      registryAddress: z.string().refine((v) => isAddress(v, { strict: false }), "dirección EVM").optional(),
    })
    .strict()
    .nullable(),
  checksums: z.object({ manifest: Hex32, commitments: Hex32, ledger: Hex32, tally: Hex32 }).strict(),
  // Campos opcionales DOCUMENTADOS (fuera de checksums): versiones, fecha de generación, sorteo y política del censo.
  versions: z.object({ adapter: z.string(), semaphore: z.string(), artifacts: z.string() }).strict().optional(),
  generatedAt: z.string().optional(),
  draw: DrawSchema.optional(),
  rollPolicy: RollPolicySchema.optional(),
  manualApprovals: ManualApprovalsSchema.optional(),
}).strict();
/** D-22: el modo continuo (manifest.enrollment) usa el mismo esquema estricto con entradas member_added / ballot. */
export const ContinuousAuditPackageSchema = AuditPackageSchema.extend({ ledger: z.array(ContinuousEntrySchema) });
export type AuditPackage = z.infer<typeof AuditPackageSchema> | z.infer<typeof ContinuousAuditPackageSchema>;
/** Elige el esquema por el modo que declara el manifiesto (sin `enrollment` = con fases, formato original). */
function schemaFor(input: unknown) {
  const m = (input as { manifest?: { enrollment?: unknown } } | null)?.manifest;
  return m && typeof m === "object" && m.enrollment !== undefined ? ContinuousAuditPackageSchema : AuditPackageSchema;
}
type Entry = AuditPackage["ledger"][number];
type BallotLike = Extract<Entry, { proof: unknown }>;
type MemberLike = Extract<Entry, { kind: "member_added" }>;
const isMember = (e: Entry): e is MemberLike => (e as { kind?: string }).kind === "member_added";
/** Hash de una entrada según su forma (reimplementado: misma definición que el adaptador). */
function entryHashOf(e: Entry): Hex {
  if (isMember(e)) return hashCanonical({ idx: e.idx, prevHash: e.prevHash, kind: "member_added", member: e.member });
  if ("kind" in e && e.kind === "ballot") return hashCanonical({ idx: e.idx, prevHash: e.prevHash, kind: "ballot", proof: e.proof, groupSize: e.groupSize });
  return hashCanonical({ idx: e.idx, prevHash: e.prevHash, proof: e.proof });
}
/** Mediana (entera hacia abajo) de una lista no vacía. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.floor((s[m - 1] + s[m]) / 2);
}

/** ¿Declara ser un paquete quorum-audit/1 de semaphore-ledger? (objeto JSON con version y protocol). */
function looksLikePackage(input: unknown): boolean {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const o = input as Record<string, unknown>;
  return o.version === "quorum-audit/1" && o.protocol === "semaphore-ledger";
}

// ---------- hash canónico (misma definición que el adaptador; reimplementada a propósito) ----------
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}
export const hashCanonical = (v: unknown): Hex => sha256(stringToBytes(canonicalJson(v)));
export const expectedScope = (electionId: string): string => (BigInt(keccak256(stringToBytes(`quorum:${electionId}`))) >> 8n).toString();

// ---------- sorteo (reimplementado a propósito; misma definición que protocol-adapter/src/draw.ts) ----------
/** seed = keccak256(finalHash); Fisher-Yates parcial con r_i = keccak256(seed ‖ uint256(i)) sobre ids ordenados. */
export function recomputeDraw(candidateIds: readonly string[], n: number, finalHash: Hex): { seed: Hex; winners: string[]; n: number } {
  const ids = [...candidateIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const seed = keccak256(finalHash);
  const take = Math.min(n, ids.length);
  for (let i = 0; i < take; i++) {
    const r = BigInt(keccak256(concat([seed, toHex(BigInt(i), { size: 32 })])));
    const j = i + Number(r % BigInt(ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return { seed, winners: ids.slice(0, take), n: take };
}

// ---------- ancla ----------
export type AnchorLog = { address: string; data: Hex; topics: Hex[] };
export type AnchorRead = {
  chainId: number;
  from: string;
  to: string | null;
  input: Hex;
  /** Estado del receipt. Necesario para el modo registro. */
  status?: "success" | "reverted";
  /** Logs del receipt. Necesarios para el modo registro (evento `Anchored`). */
  logs?: AnchorLog[];
};
export type AnchorReader = (txHash: Hex) => Promise<AnchorRead>;

export function viemAnchorReader(rpcUrl: string): AnchorReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return async (hash) => {
    const [chainId, tx, receipt] = await Promise.all([client.getChainId(), client.getTransaction({ hash }), client.getTransactionReceipt({ hash })]);
    return {
      chainId,
      from: tx.from,
      to: tx.to ?? null,
      input: tx.input,
      status: receipt.status,
      logs: receipt.logs.map((l) => ({ address: l.address, data: l.data, topics: [...l.topics] as Hex[] })),
    };
  };
}

/**
 * Evento del QuorumRegistry (contracts/QuorumRegistry.sol). Declarado aquí a propósito (independencia: no se importa
 * @quorum/wallet): `event Anchored(bytes32 indexed electionId, bytes32 finalHash, uint256 castCount, address indexed organizer)`.
 */
export const ANCHORED_EVENT_ABI = parseAbi(["event Anchored(bytes32 indexed electionId, bytes32 finalHash, uint256 castCount, address indexed organizer)"]);
/** On-chain el id de elección es keccak256(utf8(electionId)). */
export const electionIdBytes32 = (electionId: string): Hex => keccak256(stringToBytes(electionId));

export function decodeAnchoredEvents(logs: AnchorLog[], registryAddress: string): { electionId: Hex; finalHash: Hex; castCount: bigint; organizer: string }[] {
  const out: { electionId: Hex; finalHash: Hex; castCount: bigint; organizer: string }[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== registryAddress.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: ANCHORED_EVENT_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      out.push({ electionId: ev.args.electionId, finalHash: ev.args.finalHash, castCount: ev.args.castCount, organizer: ev.args.organizer });
    } catch {
      /* otro evento del registro (p. ej. Cast) */
    }
  }
  return out;
}

export function decodeAnchorCalldata(data: Hex): { finalHash: Hex; groupRoot: string; tallyHash: Hex; electionId: string } {
  const [finalHash, root, tallyHash, electionId] = decodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "string" }], data);
  return { finalHash, groupRoot: BigInt(root).toString(), tallyHash, electionId };
}

// ---------- verificación ----------
export type VerifyOptions = {
  /** RPC de Base Sepolia para leer la tx de ancla. Sin esto, `anchor_matches` queda "no evaluado". */
  anchorRpcUrl?: string;
  /** Lector inyectable (tests). Tiene prioridad sobre anchorRpcUrl. */
  anchorReader?: AnchorReader;
  /** Digest del artefacto de entrada tal cual se recibió (p. ej. SHA-256 de los bytes del archivo). */
  inputArtifactDigest?: string;
  now?: () => Date;
};

/** Estado honesto de cada check: "no evaluado" nunca se presenta como "verificado". */
export type CheckStatus = "verificado" | "no evaluado" | "fallo detectado";
type Check = { name: string; passed: boolean; reason?: string; status?: CheckStatus };

const BASE_UNSUPPORTED = [
  "secreto-del-contenido-frente-al-servidor: la opción elegida viaja en claro dentro de la prueba Semaphore (no hay cifrado ElGamal); el servidor ve cada voto, aunque no sabe de quién es",
  "resistencia-a-coaccion: un votante puede demostrar a un tercero cómo votó",
  "validez-0/1-de-boletas-cifradas: no aplica (no hay cifrado); el recuento cuenta mensajes en claro y marca como inválidos los que no son una opción",
  "identidad-civil: el padrón son commitments admitidos por el organizador; el verificador no comprueba quién es cada persona ni si la lista es la correcta",
  "prueba-criptografica-de-escrutinio: no hay ZK del tally; es un recuento reproducible por cualquiera",
];

export async function verifyPackage(input: unknown, opts: VerifyOptions = {}): Promise<AuditResult> {
  const checkedAt = (opts.now?.() ?? new Date()).toISOString();
  const inputArtifactDigest: string = opts.inputArtifactDigest ?? hashCanonical(input);
  const checks: Check[] = [];
  const unsupported = [...BASE_UNSUPPORTED];

  const parsed = (schemaFor(input) as typeof AuditPackageSchema).safeParse(input) as { success: true; data: AuditPackage } | { success: false; error: z.ZodError };
  const maybeId = (input as { electionId?: unknown } | null)?.electionId;
  const electionId = typeof maybeId === "string" ? maybeId : "unknown";
  if (!parsed.success) {
    if (!looksLikePackage(input)) {
      // Un JSON que ni siquiera declara ser un paquete quorum-audit/1 no es evidencia de manipulación: no se puede
      // verificar. `valid` queda en false (nunca "verificado"), pero el estado es "no evaluado", no "fallo detectado".
      checks.push({ name: "package_schema", passed: false, status: "no evaluado", reason: "no evaluado: el archivo no es un paquete de auditoría quorum-audit/1 de semaphore-ledger (falta version/protocol); no hay nada que verificar" });
      unsupported.push("todas: el archivo recibido no tiene forma de paquete de auditoría");
      return finish({ electionId, protocol: "semaphore-ledger" });
    }
    // Declara ser un paquete pero no cumple el esquema ESTRICTO: campos que faltan, tipos alterados o campos extra no
    // declarados (que podrían esconder datos fuera de los hashes). Eso sí es fallo detectado.
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") || "raíz";
    const extra = issue?.code === "unrecognized_keys" ? `campos no declarados ${JSON.stringify((issue as { keys?: string[] }).keys ?? [])}` : issue?.message;
    checks.push({ name: "package_schema", passed: false, status: "fallo detectado", reason: `paquete no válido (${where}: ${extra})` });
    return finish({ electionId, protocol: "semaphore-ledger" });
  }
  const pkg = parsed.data;
  const continuous = pkg.manifest.enrollment ?? null;
  const ballots = pkg.ledger.filter((e): e is BallotLike => !isMember(e));
  const members = pkg.ledger.filter(isMember);
  if (!continuous && pkg.commitments.length === 0) {
    checks.push({ name: "package_schema", passed: false, status: "fallo detectado", reason: "paquete no válido (commitments: padrón vacío)" });
    return finish({ electionId: pkg.electionId, protocol: "semaphore-ledger" });
  }
  checks.push({
    name: "package_schema",
    passed: true,
    reason: continuous
      ? `quorum-audit/1 (modo continuo: K=${continuous.minAnonymitySet}, ventana ${continuous.rootWindow} raíces), ${members.length} inscripciones y ${ballots.length} boletas en el ledger, ${pkg.commitments.length} commitments`
      : `quorum-audit/1, ${pkg.ledger.length} boletas, ${pkg.commitments.length} commitments`,
  });

  // 1. manifest_hash
  {
    // Sobre el manifiesto TAL COMO LLEGÓ (forma canónica), no sobre la salida del parser: el hash cubre cada campo.
    const h = hashCanonical((input as { manifest: unknown }).manifest);
    const problems: string[] = [];
    if (h !== pkg.manifestHash) problems.push(`sha256(manifest) ${h} ≠ manifestHash publicado ${pkg.manifestHash}`);
    if (pkg.checksums.manifest !== h) problems.push(`checksums.manifest ≠ sha256(manifest)`);
    if (pkg.manifest.electionId !== pkg.electionId) problems.push(`manifest.electionId ≠ electionId`);
    if (pkg.manifest.merkleTreeDepth !== pkg.merkleTreeDepth) problems.push(`manifest.merkleTreeDepth ≠ merkleTreeDepth`);
    checks.push({ name: "manifest_hash", passed: problems.length === 0, reason: problems.length ? `manifiesto alterado: ${problems.join("; ")}` : `manifestHash coincide (${h.slice(0, 18)}…)` });
  }

  // 2. group_root. Continuo: se rehace la secuencia de raíces desde los eventos member_added con el Group de Semaphore.
  let rootOk = false;
  /** Continuo: raíces RECOMPUTADAS (no las publicadas) disponibles antes de cada posición del ledger. */
  const rootsBefore: { root: string; size: number }[][] = [];
  {
    let root = "";
    const problems: string[] = [];
    if (continuous) {
      try {
        const g = new Group();
        const history: { root: string; size: number }[] = [];
        pkg.ledger.forEach((e, pos) => {
          rootsBefore[pos] = history.slice();
          if (!isMember(e)) return;
          if (problems.length) return;
          if (e.member.index !== g.size) problems.push(`ledger[${pos}]: member_added con index ${e.member.index}, se esperaba ${g.size}`);
          g.addMember(BigInt(e.member.commitment));
          const r = g.root.toString();
          if (e.member.rootAfter !== r) problems.push(`ledger[${pos}]: rootAfter publicado ${e.member.rootAfter.slice(0, 12)}… ≠ raíz recomputada ${r.slice(0, 12)}… tras agregar el miembro #${e.member.index}`);
          history.push({ root: r, size: g.size });
        });
        root = g.root.toString();
      } catch (err) {
        problems.push(`no se pudo reconstruir el grupo: ${(err as Error).message}`);
      }
      const seq = members.map((m) => m.member.commitment);
      if (seq.length !== pkg.commitments.length || seq.some((c, i) => c !== pkg.commitments[i])) problems.push(`commitments publicados (${pkg.commitments.length}) ≠ secuencia de member_added del ledger (${seq.length})`);
    } else {
      try {
        root = new Group(pkg.commitments.map((c) => BigInt(c))).root.toString();
      } catch (e) {
        problems.push(`no se pudo reconstruir el padrón: ${(e as Error).message}`);
      }
    }
    if (root && root !== pkg.groupRoot) problems.push(`raíz recomputada desde ${pkg.commitments.length} commitments ${root.slice(0, 12)}… ≠ groupRoot publicada ${pkg.groupRoot.slice(0, 12)}…`);
    if (pkg.checksums.commitments !== hashCanonical(pkg.commitments)) problems.push("checksums.commitments ≠ sha256(commitments)");
    rootOk = problems.length === 0;
    checks.push({
      name: "group_root",
      passed: rootOk,
      reason: rootOk
        ? continuous
          ? `secuencia de ${members.length} raíces recomputada desde los eventos member_added; la raíz final coincide`
          : `raíz del padrón recomputada y coincide (${pkg.commitments.length} commitments)`
        : `padrón alterado: ${problems.join("; ")}`,
    });
  }

  // 2b. commitments_unique (M3): un commitment repetido daría dos hojas a la misma credencial en el padrón.
  {
    const seen = new Map<bigint, number>();
    const dups: string[] = [];
    pkg.commitments.forEach((c, i) => {
      const k = BigInt(c);
      const first = seen.get(k);
      if (first !== undefined) dups.push(`commitment #${i} duplica #${first}`);
      else seen.set(k, i);
    });
    checks.push({ name: "commitments_unique", passed: dups.length === 0, reason: dups.length ? `padrón con duplicados: ${dups.join("; ")}` : `${seen.size} commitments únicos` });
  }

  // 3. chain_integrity
  const scope = expectedScope(pkg.electionId);
  {
    const problems: string[] = [];
    const genesis = continuous
      ? hashCanonical({ kind: "quorum-ledger-genesis", electionId: pkg.electionId, scope: pkg.scope, groupRoot: "0", enrollment: continuous })
      : hashCanonical({ kind: "quorum-ledger-genesis", electionId: pkg.electionId, scope: pkg.scope, groupRoot: pkg.groupRoot });
    if (genesis !== pkg.genesisHash) problems.push(`genesisHash ${pkg.genesisHash.slice(0, 18)}… ≠ recomputado ${genesis.slice(0, 18)}…`);
    let prev: string = genesis;
    for (let i = 0; i < pkg.ledger.length && problems.length === 0; i++) {
      const e = pkg.ledger[i];
      if (e.idx !== i) problems.push(`cadena rota en #${i}: la entrada en esa posición tiene idx=${e.idx} (falta o sobra al menos una entrada)`);
      else if (e.prevHash !== prev) problems.push(`cadena rota en #${i}: prevHash ${e.prevHash.slice(0, 18)}… ≠ hash anterior ${prev.slice(0, 18)}…`);
      else {
        const h = entryHashOf(e);
        if (h !== e.hash) problems.push(`cadena rota en #${i}: hash ${e.hash.slice(0, 18)}… ≠ recomputado ${h.slice(0, 18)}…`);
      }
      prev = e.hash;
    }
    if (problems.length === 0) {
      const last = pkg.ledger.length ? pkg.ledger[pkg.ledger.length - 1].hash : genesis;
      if (last !== pkg.finalHash) problems.push(`finalHash publicado ${pkg.finalHash.slice(0, 18)}… ≠ último hash ${last.slice(0, 18)}…`);
      if (pkg.checksums.ledger !== hashCanonical(pkg.ledger)) problems.push("checksums.ledger ≠ sha256(ledger)");
    }
    const what = continuous ? `${members.length} inscripciones + ${ballots.length} boletas` : `${pkg.ledger.length} boletas`;
    checks.push({ name: "chain_integrity", passed: problems.length === 0, reason: problems.length ? problems.join("; ") : `cadena SHA-256 íntegra: génesis → ${what} → finalHash ${pkg.finalHash.slice(0, 18)}…` });
  }

  // 3b. Continuo: cada boleta usa una raíz histórica válida (anterior en el ledger) dentro de la ventana, y el grupo en esa
  // raíz tenía al menos K miembros. Se compara contra las raíces RECOMPUTADAS en group_root, no contra las publicadas.
  if (continuous) {
    const problems: string[] = [];
    const small: string[] = [];
    const sizes: number[] = [];
    let j = 0;
    pkg.ledger.forEach((e, pos) => {
      if (isMember(e)) return;
      const b = j++;
      const history = rootsBefore[pos] ?? [];
      let at = -1;
      for (let k = history.length - 1; k >= 0; k--) if (history[k].root === e.proof.merkleTreeRoot) { at = k; break; }
      if (at < 0) {
        problems.push(`boleta #${b} (ledger[${pos}]): su raíz ${e.proof.merkleTreeRoot.slice(0, 12)}… no es ninguna raíz histórica del grupo antes de esa posición (raíz inventada o de otro padrón)`);
        return;
      }
      const age = history.length - 1 - at;
      if (age >= continuous.rootWindow) problems.push(`boleta #${b} (ledger[${pos}]): su raíz tiene ${age} raíces encima, fuera de la ventana de ${continuous.rootWindow}`);
      const size = history[at].size;
      if ("groupSize" in e && e.groupSize !== size) problems.push(`boleta #${b} (ledger[${pos}]): groupSize publicado ${e.groupSize} ≠ tamaño recomputado del grupo en su raíz ${size}`);
      sizes.push(size);
      if (size < continuous.minAnonymitySet) small.push(`boleta #${b} (ledger[${pos}]) con ${size} miembros`);
    });
    checks.push({
      name: "root_history",
      passed: problems.length === 0,
      reason: problems.length ? problems.join("; ") : `${ballots.length}/${ballots.length} boletas usan una raíz histórica válida dentro de la ventana de ${continuous.rootWindow} raíces`,
    });
    const stats = sizes.length ? `mínimo ${Math.min(...sizes)}, mediana ${median(sizes)}` : "sin boletas";
    checks.push({
      name: "anonymity_set_min",
      passed: small.length === 0,
      reason: small.length
        ? `K no alcanzado (K=${continuous.minAnonymitySet}): ${small.join("; ")}`
        : `conjunto de anonimato por boleta (tamaño del grupo en la raíz de su prueba): ${stats}; todas ≥ K=${continuous.minAnonymitySet}`,
    });
    unsupported.push(
      `anonimato-variable-en-modo-continuo: en modo continuo el conjunto de anonimato de cada boleta es el tamaño del grupo en la raíz de su prueba ` +
        `(${stats}; K=${continuous.minAnonymitySet}); quien vota temprano se esconde entre menos personas que quien vota al final`,
    );
    unsupported.push(
      "correlacion-temporal-en-modo-continuo: el servidor ve cuándo se completa cada inscripción y cuándo llega cada boleta, y el ledger publica su orden; " +
        "puede correlacionar por tiempo (p. ej. alguien que se inscribe y vota enseguida cuando entra poca gente). El verificador no puede descartarlo",
    );
  }

  // 4. proofs_valid
  {
    const problems: string[] = [];
    if (pkg.scope !== scope) problems.push(`scope publicado ${pkg.scope.slice(0, 12)}… ≠ keccak("quorum:${pkg.electionId}")>>8`);
    for (let i = 0; i < ballots.length && problems.length === 0; i++) {
      const p = ballots[i].proof;
      if (!continuous && p.merkleTreeRoot !== pkg.groupRoot) problems.push(`boleta #${i}: raíz de la prueba ≠ groupRoot (prueba contra otro padrón)`);
      else if (p.scope !== scope) problems.push(`boleta #${i}: scope ≠ scope de la elección (prueba de otra elección)`);
      else if (p.merkleTreeDepth !== pkg.merkleTreeDepth) problems.push(`boleta #${i}: profundidad ${p.merkleTreeDepth} ≠ ${pkg.merkleTreeDepth}`);
      else {
        let ok = false;
        try {
          ok = await verifyProof(p);
        } catch (e) {
          problems.push(`boleta #${i}: error al verificar (${(e as Error).message})`);
          break;
        }
        if (!ok) problems.push(`boleta #${i}: la prueba Groth16 de Semaphore no verifica (contenido o prueba alterados)`);
      }
    }
    const against = continuous ? "su raíz histórica y el scope" : "groupRoot y scope";
    checks.push({ name: "proofs_valid", passed: problems.length === 0, reason: problems.length ? problems.join("; ") : `${ballots.length}/${ballots.length} pruebas Semaphore verifican contra ${against} de la elección` });
  }

  // 5. nullifiers_unique
  {
    // Se compara el VALOR (BigInt), no el texto: "0"+n y n son el mismo nullifier.
    const seen = new Map<bigint, number>();
    const dups: string[] = [];
    ballots.forEach((e, i) => {
      const key = BigInt(e.proof.nullifier);
      const first = seen.get(key);
      if (first !== undefined) dups.push(`#${i} repite el nullifier de #${first}`);
      else seen.set(key, i);
    });
    checks.push({ name: "nullifiers_unique", passed: dups.length === 0, reason: dups.length ? `doble voto: ${dups.join("; ")}` : `${seen.size} nullifiers únicos` });
  }

  // 6. tally_matches
  {
    const n = pkg.manifest.options.length;
    const counts = new Array<number>(n).fill(0);
    let invalid = 0;
    for (const e of ballots) {
      const m = Number(e.proof.message);
      if (Number.isInteger(m) && m >= 0 && m < n) counts[m] += 1;
      else invalid += 1;
    }
    const problems: string[] = [];
    if (pkg.tally.counts.length !== n) problems.push(`tally tiene ${pkg.tally.counts.length} opciones, el manifiesto ${n}`);
    else counts.forEach((c, i) => { if (pkg.tally.counts[i] !== c) problems.push(`opción ${i} (${pkg.manifest.options[i].id}): publicado ${pkg.tally.counts[i]}, recomputado ${c}`); });
    if (pkg.tally.invalid !== invalid) problems.push(`inválidas: publicado ${pkg.tally.invalid}, recomputado ${invalid}`);
    if (pkg.tally.total !== ballots.length) problems.push(`total: publicado ${pkg.tally.total}, boletas en el ledger ${ballots.length}`);
    const th = hashCanonical(pkg.tally);
    if (th !== pkg.tallyHash) problems.push("tallyHash ≠ sha256(tally)");
    if (pkg.checksums.tally !== th) problems.push("checksums.tally ≠ sha256(tally)");
    checks.push({ name: "tally_matches", passed: problems.length === 0, reason: problems.length ? `total publicado ≠ recomputado: ${problems.join("; ")}` : `recuento reproducido: ${JSON.stringify(counts)} (${ballots.length} boletas, ${invalid} inválidas)` });
  }

  // 7. anchor_matches — tres estados: verificado / no evaluado / fallo detectado.
  {
    const reader = opts.anchorReader ?? (opts.anchorRpcUrl ? viemAnchorReader(opts.anchorRpcUrl) : undefined);
    const policy = pkg.manifest.anchorPolicy;
    const notEvaluated = (reason: string) => checks.push({ name: "anchor_matches", passed: true, status: "no evaluado", reason: `no evaluado: ${reason}` });
    const policyProblems: string[] = [];
    if (policy && pkg.anchor) {
      if (policy.chainId !== pkg.anchor.chainId) policyProblems.push(`ancla en chainId ${pkg.anchor.chainId} ≠ chainId fijado en el manifiesto ${policy.chainId}`);
      if (policy.kind === "quorum-registry") {
        if (!policy.registryAddress) policyProblems.push("anchorPolicy quorum-registry sin registryAddress");
        else if (!pkg.anchor.registryAddress) policyProblems.push("el manifiesto fija un QuorumRegistry pero el ancla no es una llamada al registro");
        else if (pkg.anchor.registryAddress.toLowerCase() !== policy.registryAddress.toLowerCase()) policyProblems.push(`registro del ancla ${pkg.anchor.registryAddress} ≠ registro fijado en el manifiesto ${policy.registryAddress}`);
      } else if (pkg.anchor.registryAddress) policyProblems.push("el manifiesto fija ancla por calldata pero el paquete declara un registro");
    }
    if (!pkg.anchor) {
      notEvaluated("el paquete no declara ancla on-chain");
      unsupported.push("inmutabilidad-on-chain: paquete sin ancla; nada impide que el organizador publique otro paquete distinto más tarde");
      unsupported.push("completitud-del-ledger: sin ancla, una boleta eliminada con la cadena rehecha solo la detecta el votante con su recibo (nullifier)");
    } else if (policyProblems.length) {
      // Contradicción entre el paquete y el manifiesto: es fallo aunque no haya RPC.
      checks.push({ name: "anchor_matches", passed: false, status: "fallo detectado", reason: policyProblems.join("; ") });
    } else if (!pkg.anchor.txHash) {
      notEvaluated("ancla sin txHash (solo attestationUid); lectura EAS no implementada en este verificador");
      unsupported.push("inmutabilidad-on-chain: ancla no evaluada");
    } else if (!reader) {
      notEvaluated(`ancla declarada (chainId ${pkg.anchor.chainId}, tx ${pkg.anchor.txHash.slice(0, 12)}…) pero sin --anchor-rpc`);
      unsupported.push("inmutabilidad-on-chain: ancla no evaluada (sin RPC)");
      unsupported.push("completitud-del-ledger: sin comparar con el ancla, una boleta eliminada con la cadena rehecha no se detecta aquí");
    } else {
      let tx: AnchorRead | null = null;
      try {
        tx = await reader(pkg.anchor.txHash as Hex);
      } catch (e) {
        const err = e as Error;
        const notFound = /NotFound/.test(err.name ?? "") || /not found|could not be found/i.test(err.message ?? "");
        if (notFound) {
          // La tx declarada no existe en la cadena: el paquete afirma un ancla que no hay.
          checks.push({ name: "anchor_matches", passed: false, status: "fallo detectado", reason: `la tx de ancla declarada ${pkg.anchor.txHash.slice(0, 12)}… no existe en la cadena (${err.message.split("\n")[0]})` });
        } else {
          // Un RPC caído no es evidencia de manipulación, pero tampoco de ancla: no evaluado y el paquete NO se da por válido.
          checks.push({ name: "anchor_matches", passed: false, status: "no evaluado", reason: `no evaluado: no se pudo leer la tx de ancla ${pkg.anchor.txHash.slice(0, 12)}… (${err.message.split("\n")[0]}); reintentar con otro RPC` });
          unsupported.push("inmutabilidad-on-chain: ancla declarada pero no evaluada (RPC no disponible)");
        }
      }
      if (tx) {
        const problems: string[] = [];
        let organizerUnpinned = false;
        let okReason = "";
        if (tx.chainId !== pkg.anchor.chainId) problems.push(`chainId del RPC ${tx.chainId} ≠ ${pkg.anchor.chainId}`);
        if (pkg.anchor.chainId !== BASE_SEPOLIA_CHAIN_ID) problems.push(`ancla en chainId ${pkg.anchor.chainId}; este verificador solo acepta Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);
        if (pkg.anchor.registryAddress) {
          // Modo registro: se lee el receipt y el evento Anchored del QuorumRegistry.
          const registry = pkg.anchor.registryAddress;
          if (!tx.logs || !tx.status) problems.push("el lector RPC no devolvió el receipt (status/logs) de la tx de ancla");
          else if (tx.status !== "success") problems.push(`la tx de ancla ${pkg.anchor.txHash.slice(0, 12)}… está revertida`);
          else {
            const evs = decodeAnchoredEvents(tx.logs, registry);
            if (evs.length !== 1) problems.push(`se esperaba exactamente 1 evento Anchored de ${registry} en el receipt; hay ${evs.length}`);
            else {
              const ev = evs[0];
              const wantId = electionIdBytes32(pkg.electionId);
              if (ev.electionId.toLowerCase() !== wantId.toLowerCase()) problems.push(`Anchored.electionId ${ev.electionId.slice(0, 18)}… ≠ keccak256("${pkg.electionId}") ${wantId.slice(0, 18)}…`);
              if (ev.finalHash.toLowerCase() !== pkg.finalHash) problems.push(`hash final ≠ ancla: anclado ${ev.finalHash.slice(0, 18)}…, paquete ${pkg.finalHash.slice(0, 18)}…`);
              if (policy) {
                if (ev.organizer.toLowerCase() !== policy.organizer.toLowerCase()) problems.push(`ancló ${getAddress(ev.organizer)}, pero el manifiesto fija como organizador a ${getAddress(policy.organizer)}`);
              } else organizerUnpinned = true;
              okReason = `evento Anchored del QuorumRegistry ${getAddress(registry)} en Base Sepolia (tx ${pkg.anchor.txHash.slice(0, 12)}…): electionId y finalHash coinciden; organizador ${getAddress(ev.organizer)}${policy ? " = el fijado en el manifiesto" : ""}; castCount ${ev.castCount}`;
            }
          }
        } else {
          // Modo antiguo (fallback): tx del organizador a sí mismo con el acta en calldata.
          try {
            const a = decodeAnchorCalldata(tx.input);
            if (a.electionId !== pkg.electionId) problems.push(`electionId anclado "${a.electionId}" ≠ "${pkg.electionId}"`);
            if (a.finalHash !== pkg.finalHash) problems.push(`hash final ≠ ancla: anclado ${a.finalHash.slice(0, 18)}…, paquete ${pkg.finalHash.slice(0, 18)}…`);
            if (a.groupRoot !== pkg.groupRoot) problems.push(`groupRoot anclada ≠ paquete`);
            if (a.tallyHash !== pkg.tallyHash) problems.push(`tallyHash anclado ≠ paquete`);
          } catch (e) {
            problems.push(`no se pudo decodificar el calldata de la tx de ancla: ${(e as Error).message}`);
          }
          if (policy) {
            if (tx.from.toLowerCase() !== policy.organizer.toLowerCase()) problems.push(`la tx de ancla la envió ${tx.from}, no el organizador fijado en el manifiesto ${policy.organizer}`);
          } else organizerUnpinned = true;
          okReason = `ancla en Base Sepolia (tx ${pkg.anchor.txHash.slice(0, 12)}…, calldata) coincide con finalHash, groupRoot y tallyHash`;
        }
        if (problems.length) checks.push({ name: "anchor_matches", passed: false, status: "fallo detectado", reason: problems.join("; ") });
        else if (organizerUnpinned) {
          notEvaluated(`${okReason}; pero el manifiesto no fija la dirección del organizador, así que no se puede comprobar QUIÉN ancló`);
          unsupported.push("autoria-del-ancla: el manifiesto no fija el organizador (anchorPolicy); el ancla coincide pero cualquiera pudo emitirla");
        } else checks.push({ name: "anchor_matches", passed: true, status: "verificado", reason: okReason });
      }
    }
  }

  // 8. draw_matches (solo si el manifiesto declara regla de sorteo o el paquete trae sorteo)
  if (pkg.manifest.drawRule || pkg.draw) {
    const rule = pkg.manifest.drawRule;
    const draw = pkg.draw;
    if (!rule) {
      checks.push({ name: "draw_matches", passed: false, reason: "el paquete trae un sorteo pero el manifiesto no declara regla de sorteo (regla añadida después de publicar)" });
    } else if (!draw) {
      checks.push({ name: "draw_matches", passed: true, status: "no evaluado", reason: "no evaluado: el manifiesto declara sorteo pero aún no se ha realizado" });
      unsupported.push("sorteo: aún no realizado; no hay ganadores que comprobar");
    } else {
      const problems: string[] = [];
      const ids = rule.candidates.map((c) => c.id);
      if (new Set(ids).size !== ids.length) problems.push("ids de candidatos repetidos en el manifiesto");
      // N recomputado desde NUESTRO recuento, no desde el tally publicado.
      const n = pkg.manifest.options.length;
      const counts = new Array<number>(n).fill(0);
      for (const e of ballots) {
        const m = Number(e.proof.message);
        if (Number.isInteger(m) && m >= 0 && m < n) counts[m] += 1;
      }
      let expectedN: number | null;
      if (rule.winnersCount.kind === "fixed") expectedN = rule.winnersCount.n;
      else {
        // Empate en el máximo → gana la opción de MENOR valor N (tieBreak "lowest", declarado en el manifiesto).
        const values = rule.winnersCount.optionValues;
        const max = Math.max(0, ...counts);
        let best = -1;
        if (max > 0) counts.forEach((c, i) => { if (c === max && (best < 0 || values[i] < values[best])) best = i; });
        expectedN = best >= 0 ? (values[best] ?? null) : null;
        if (values.length !== n) problems.push(`optionValues tiene ${values.length} valores, el manifiesto ${n} opciones`);
        if (rule.tieBreak !== "lowest") problems.push("el manifiesto no declara regla de empate (tieBreak) para N");
      }
      if (expectedN === null) problems.push("no hay boletas válidas: la regla no fija N y no debería existir sorteo");
      if (draw.finalHash !== pkg.finalHash) problems.push(`sorteo hecho sobre finalHash ${draw.finalHash.slice(0, 18)}… ≠ finalHash del paquete ${pkg.finalHash.slice(0, 18)}…`);
      if (problems.length === 0 && expectedN !== null) {
        const r = recomputeDraw(ids, expectedN, pkg.finalHash as Hex);
        if (draw.seed !== r.seed) problems.push(`semilla publicada ${draw.seed.slice(0, 18)}… ≠ keccak256(finalHash) ${r.seed.slice(0, 18)}…`);
        if (draw.n !== r.n) problems.push(`N publicado ${draw.n} ≠ N recomputado ${r.n}`);
        if (JSON.stringify(draw.winners) !== JSON.stringify(r.winners)) problems.push(`ganadores publicados [${draw.winners.join(", ")}] ≠ recomputados [${r.winners.join(", ")}]`);
      }
      checks.push({
        name: "draw_matches",
        passed: problems.length === 0,
        reason: problems.length ? `sorteo no reproducible: ${problems.join("; ")}` : `sorteo recomputado: N=${draw.n}, ganadores [${draw.winners.join(", ")}] con semilla keccak256(finalHash)`,
      });
    }
  }

  // 9. Política del censo (declarativa; no es un check: no hay nada criptográfico que recomputar).
  if (pkg.rollPolicy) {
    const rp = pkg.rollPolicy;
    if (rp.kind === "event-badge") {
      const how = rp.check === "list" ? "contra una lista cargada por el organizador" : rp.check === "live" ? "consultando en vivo la URL de la credencial" : "sin comprobar que existiera";
      unsupported.push(
        `credencial-de-evento: la credencial demuestra que es participante del evento (comprobada ${how}) y se usa una sola vez; ` +
          `el rostro (deduplicación facial demo) impide que una misma persona use varias credenciales. El QR de la credencial no es secreto ` +
          `(el usuario está impreso): no autentica a quien lo escanea como su titular ` +
          `(tope ${rp.maxSeats} asientos, entraron ${rp.joined}, ${rp.enrolled} llegaron al padrón de ${pkg.commitments.length} commitments; ` +
          `declarado por el organizador fuera de manifestHash/checksums, el verificador no puede comprobarlo)`,
      );
    } else {
      unsupported.push(
        `censo-abierto-en-sala: censo abierto en sala: la elegibilidad depende de la deduplicación facial demo, no de un padrón ` +
          `(tope ${rp.maxSeats} asientos, entraron ${rp.joined}, ${rp.enrolled} llegaron al padrón de ${pkg.commitments.length} commitments; ` +
          `declarado por el organizador fuera de manifestHash/checksums, el verificador no puede comprobarlo)`,
      );
    }
  }

  // 10. Aprobaciones manuales (D-21, declarativa). Se deciden durante la inscripción, después de publicar el manifiesto:
  // no pueden entrar en manifestHash y nada criptográfico las respalda. Se muestran para que cualquiera las vea.
  if (pkg.manualApprovals && pkg.manualApprovals.count > 0) {
    const n = pkg.manualApprovals.count;
    unsupported.push(
      `aprobacion-manual: ${n} ${n === 1 ? "inscripción aprobada" : "inscripciones aprobadas"} manualmente por el organizador tras coincidencia facial ` +
        `(método organizer-in-person: el organizador vio a la persona y su credencial; p. ej. gemelos idénticos). ` +
        `Declarado por el organizador fuera de manifestHash/checksums, el verificador no puede comprobarlo; ` +
        `un organizador malicioso podría aprobar duplicados, por eso el número es público`,
    );
  }

  return finish({ electionId: pkg.electionId, protocol: "semaphore-ledger" });

  function finish(meta: { electionId: string; protocol: "semaphore-ledger" }): AuditResult {
    const result: AuditResult = {
      electionId: meta.electionId,
      verifierVersion: VERIFIER_VERSION,
      protocol: meta.protocol,
      inputArtifactDigest,
      checkedAt,
      valid: checks.every((c) => c.passed),
      checks: checks.map((c) => ({ ...c, status: c.status ?? (!c.passed ? "fallo detectado" : c.reason?.startsWith("no evaluado") ? "no evaluado" : "verificado") })),
      unsupportedGuarantees: unsupported,
    };
    return AuditResultSchema.parse(result);
  }
}
