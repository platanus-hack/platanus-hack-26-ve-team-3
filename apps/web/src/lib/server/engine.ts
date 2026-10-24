/**
 * Motor `semaphore-ledger` (ADR-001 Plan A) cableado a la API — Contrato v1.
 *
 *   registration ──POST /identity (commitment)──► roll
 *   POST /open  ──► congela commitments (sin ids) → groupRoot → ledger vacío → `open`
 *   POST /vote {proof} ──► appendBallot (raíz, scope, profundidad, nullifier, Groth16) → Receipt
 *   POST /close ──► closed → tallying → tally → ancla opcional → buildAuditPackage → verifyPackage → auditable|failed
 *   POST /draw  ──► runDraw(regla del manifiesto, tally, finalHash) → paquete con `draw` → verifyPackage → drawn|failed
 *
 * El servidor nunca recibe la clave privada Semaphore ni guarda `voterId` junto a una boleta.
 * "Verificado" solo sale de `verifyPackage` (`@quorum/verifier`), nunca de un booleano propio.
 */
import { Election, Receipt, type AuditResult, type CastVoteInput } from "@quorum/contracts";
import {
  anchorOnBaseSepolia,
  anchorOnRegistry,
  appendBallot,
  buildAuditPackage,
  canonicalJson,
  createLedger,
  finalHash,
  groupRoot as computeGroupRoot,
  LedgerRejection,
  MERKLE_TREE_DEPTH,
  runDraw,
  sha256Utf8,
  tally as recount,
  tallyHash,
  type AnchorTransport,
  type AuditPackage,
  type SemaphoreProof,
} from "@quorum/protocol-adapter";
import { verifyPackage, type AnchorReader } from "@quorum/verifier";
import type { Address } from "viem";
import { z } from "zod";
import { requireElection, requireEngine, requireVoter } from "./elections";
import { env } from "./env";
import { HttpError, type ApiCode } from "./errors";
import { withLock } from "./lock";
import { freezeRoomPolicy, rollPolicyNote } from "./rooms";
import { getStore, type EngineState, type RollPolicy } from "./store";

type ReceiptT = z.infer<typeof Receipt>;

// ---------------------------------------------------------------------------
// Hooks de prueba (sin red): transporte del ancla, lector del ancla y lector de tx on-chain.
// ---------------------------------------------------------------------------
const hooks: { anchorTransport?: AnchorTransport; anchorReader?: AnchorReader; now?: () => Date } = {};
export function setEngineHooksForTests(h: typeof hooks) {
  for (const k of Object.keys(hooks) as (keyof typeof hooks)[]) delete hooks[k];
  Object.assign(hooks, h);
}
const now = () => (hooks.now ? hooks.now() : new Date());

async function saveElection(e: Election) {
  await (await getStore()).putElection(Election.parse(e));
}

// ---------------------------------------------------------------------------
// Inscripción: identidad Semaphore (commitment)
// ---------------------------------------------------------------------------
export async function registerIdentity(voterId: string, input: { inviteToken: string; commitment: string }) {
  const voter = await requireVoter(voterId);
  if (voter.inviteToken !== input.inviteToken) throw new HttpError("forbidden", "inviteToken inválido");
  const election = await requireElection(voter.electionId);
  if (election.status !== "registration") throw new HttpError("closed", "El padrón ya está congelado o la elección no está en inscripción");
  if (!voter.registeredAt || !voter.walletAddress) throw new HttpError("not_eligible", "Primero hay que enlazar la wallet (firma FaceBinding)");
  return withLock(`engine:${election.id}`, async () => {
    const store = await getStore();
    const engine = await requireEngine(election.id);
    const fresh = await requireVoter(voterId);
    if (fresh.credentialIssuedAt || engine.roll.some((r) => r.voterId === voterId)) throw new HttpError("already_voted", "Este votante ya registró su identidad", 409);
    if (engine.roll.some((r) => r.commitment === input.commitment)) throw new HttpError("invalid_input", "Ese commitment ya está en el padrón", 409);
    engine.roll.push({ voterId, commitment: input.commitment });
    await store.putEngine(engine);
    await store.putVoter({ ...fresh, credentialIssuedAt: now().toISOString() });
    return { ok: true as const, registeredCount: engine.roll.length };
  });
}

// ---------------------------------------------------------------------------
// Apertura: congela el padrón
// ---------------------------------------------------------------------------
/**
 * `registration → open`. Con `{ auto: true }` (inicio programado) solo abre si, YA DENTRO del lock, la elección sigue en
 * `registration` y `votingStartsAt` ya pasó: si otra petición la abrió primero o el organizador movió la hora, no hace
 * nada y devuelve la elección tal cual (idempotente).
 */
export async function openElection(id: string, opts: { auto?: boolean } = {}): Promise<Election> {
  // engine → room (las entradas a la sala toman solo `room:`): la sala no admite a nadie mientras se congela el padrón.
  return withLock(`engine:${id}`, () => withLock(`room:${id}`, async () => {
    const e = await requireElection(id);
    if (opts.auto && !scheduleDue(e, now().getTime())) return e;
    if (e.status !== "registration") throw new HttpError("closed", `Solo se abre desde inscripción (estado ${e.status})`, 409);
    const engine = await requireEngine(id);
    if (engine.roll.length === 0) throw new HttpError("closed", "No hay identidades inscritas: no se puede congelar un padrón vacío", 409);
    const commitments = engine.roll.map((r) => r.commitment);
    const root = computeGroupRoot(commitments);
    // Sala abierta: se cierra sola al abrir la votación y su política queda fijada para el paquete de auditoría.
    const rollPolicy = await freezeRoomPolicy(id);
    const next: EngineState = { ...engine, roll: [], commitments, ledger: createLedger(id, root), rollPolicy };
    const store = await getStore();
    await store.putEngine(next);
    // A2: con el padrón congelado ya no hace falta el dedupe facial → se borran las plantillas (descriptores cifrados).
    await store.deleteFaceTemplates(id);
    // `votingStartsAt` pasa a ser la hora REAL de apertura (a mano o programada).
    const opened: Election = { ...e, status: "open", groupRoot: root, votingStartsAt: now().toISOString() };
    await saveElection(opened);
    return opened;
  }));
}

/** ¿Toca abrir sola? Fase `registration` con hora programada ya alcanzada. */
export function scheduleDue(e: Pick<Election, "status" | "votingStartsAt">, nowMs: number): boolean {
  if (e.status !== "registration" || !e.votingStartsAt) return false;
  const at = Date.parse(e.votingStartsAt);
  return Number.isFinite(at) && nowMs >= at;
}

/**
 * Inicio programado, perezoso: se llama al principio de cada lectura/escritura relevante (GET elección, sala, padrón,
 * invitación, tally; POST voto, join, identidad…). Si la hora ya llegó y la fase es `registration`, ejecuta la MISMA
 * transición que `POST /open` bajo el lock de la elección (una sola vez: las demás peticiones concurrentes ven `open`
 * dentro del lock y no hacen nada). Si no se puede abrir (padrón vacío) la elección sigue en `registration`.
 */
export async function syncSchedule(id: string): Promise<void> {
  const e = await (await getStore()).getElection(id);
  if (!e || !scheduleDue(e, now().getTime())) return;
  try {
    await openElection(id, { auto: true });
  } catch (err) {
    if (!(err instanceof HttpError)) throw err; // p. ej. padrón vacío: se queda en `registration`
  }
}

export async function getRoll(id: string) {
  const e = await requireElection(id);
  const engine = await requireEngine(id);
  const frozen = engine.ledger !== null;
  return {
    electionId: id,
    status: e.status,
    frozen,
    groupRoot: frozen ? engine.ledger!.groupRoot : null,
    scope: engine.ledger?.scope ?? null,
    merkleTreeDepth: MERKLE_TREE_DEPTH,
    commitments: frozen ? engine.commitments : engine.roll.map((r) => r.commitment),
  };
}

// ---------------------------------------------------------------------------
// Voto
// ---------------------------------------------------------------------------
const REJECTION_CODE: Record<string, ApiCode> = {
  DOUBLE_VOTE: "already_voted",
  WRONG_ROOT: "not_eligible",
  WRONG_SCOPE: "not_eligible",
  WRONG_DEPTH: "not_eligible",
  INVALID_PROOF: "not_eligible",
  INVALID_ENCODING: "invalid_input",
};
const REJECTION_MESSAGE: Record<string, string> = {
  DOUBLE_VOTE: "Esta credencial ya votó en esta elección (nullifier repetido)",
  WRONG_ROOT: "La prueba no es contra el padrón congelado de esta elección",
  WRONG_SCOPE: "La prueba es de otra elección (scope distinto)",
  WRONG_DEPTH: "Profundidad del árbol distinta a la del padrón",
  INVALID_PROOF: "La prueba Semaphore no verifica",
  INVALID_ENCODING: "Prueba con codificación no canónica o mensaje fuera de las opciones",
};

export async function castVote(id: string, input: CastVoteInput): Promise<ReceiptT> {
  const e0 = await requireElection(id);
  if (e0.status !== "open") throw new HttpError("closed", "La elección no está abierta para votar");
  const proof = input.proof as unknown as SemaphoreProof;
  // C2 + decisión de José ("solo ancla on-chain"): el único registro on-chain es el ancla del organizador al cierre.
  // Un `Cast` desde la wallet del votante ligaría wallet ↔ boleta por tiempo, así que `onchain` se RECHAZA (400).
  if (input.onchain !== undefined) {
    throw new HttpError("onchain_not_supported", "Solo ancla on-chain: el voto no admite registro on-chain desde la wallet del votante (campo `onchain`)");
  }
  return withLock(`engine:${id}`, async () => {
    const e = await requireElection(id);
    if (e.status !== "open") throw new HttpError("closed", "La elección no está abierta para votar");
    const engine = await requireEngine(id);
    if (!engine.ledger || !e.groupRoot) throw new HttpError("closed", "Padrón no congelado");
    let entry;
    try {
      entry = await appendBallot(engine.ledger, proof, e.groupRoot, { optionCount: e.options.length });
    } catch (err) {
      if (err instanceof LedgerRejection) throw new HttpError(REJECTION_CODE[err.code] ?? "not_eligible", REJECTION_MESSAGE[err.code] ?? err.code);
      throw err;
    }
    const includedAt = now().toISOString();
    engine.receipts[proof.nullifier] = { includedAt };
    await (await getStore()).putEngine(engine);
    return Receipt.parse({
      electionId: id,
      inclusionId: proof.nullifier,
      nullifier: proof.nullifier,
      index: entry.idx,
      hash: entry.hash,
      receivedAt: includedAt,
      includedAt,
      state: "incluido",
    });
  });
}

const CARACAS_OFFSET_MS = 4 * 60 * 60 * 1000;
/** Inicio del día en America/Caracas (UTC−4, sin horario de verano) para un instante dado. */
export function caracasDayStart(d: Date): Date {
  const local = new Date(d.getTime() - CARACAS_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + CARACAS_OFFSET_MS);
}

/** Autodeclaración "ya voté" (para el estado público del inscrito). Petición separada del voto: no liga persona ↔ boleta. */
export async function markVoted(voterId: string, inviteToken: string) {
  const voter = await requireVoter(voterId);
  if (voter.inviteToken !== inviteToken) throw new HttpError("forbidden", "inviteToken inválido");
  const e = await requireElection(voter.electionId);
  if (e.status !== "open") throw new HttpError("closed", "La elección no está abierta");
  if (!voter.credentialIssuedAt) throw new HttpError("not_eligible", "Este votante no tiene identidad en el padrón");
  if (voter.votedAt) return { ok: true as const, votedAt: voter.votedAt };
  // C5 / AT-10: no se guarda la hora exacta. Con milisegundos, ordenar a los votantes por `votedAt` y emparejarlos
  // con el ledger por posición reconstruía votante → opción desde la DB. Solo el día (America/Caracas, UTC−4).
  const votedAt = caracasDayStart(now()).toISOString();
  await (await getStore()).putVoter({ ...voter, votedAt });
  return { ok: true as const, votedAt };
}

export async function getReceipt(id: string, inclusionId: string): Promise<ReceiptT> {
  await requireElection(id);
  const engine = await requireEngine(id);
  const entry = engine.ledger?.entries.find((x) => x.proof.nullifier === inclusionId);
  if (!entry) throw new HttpError("not_found", "Recibo no encontrado");
  const r = engine.receipts[inclusionId];
  return Receipt.parse({
    electionId: id,
    inclusionId,
    nullifier: inclusionId,
    index: entry.idx,
    hash: entry.hash,
    receivedAt: r?.includedAt ?? now().toISOString(),
    includedAt: r?.includedAt ?? null,
    state: "incluido",
    ...(r?.txHash ? { txHash: r.txHash, onchainStatus: r.onchainStatus } : {}),
  });
}

/**
 * Ledger público (hallazgo C3). Mientras la elección está `registration`/`open` NO se publica ninguna entrada
 * (las pruebas llevan `message` = opción en claro y el orden + tiempo permitiría correlacionar): solo la cantidad
 * de boletas y el `finalHash` vigente; el votante comprueba su inclusión con GET /receipt/:nullifier y los
 * agregados salen de GET /tally (umbral de 5). Desde `closed` se publican las entradas completas.
 */
export async function getLedger(id: string) {
  const e = await requireElection(id);
  const engine = await requireEngine(id);
  const ledger = engine.ledger;
  const proofsPublished = ["closed", "tallying", "auditable", "drawn", "failed"].includes(e.status);
  return {
    electionId: id,
    status: e.status,
    groupRoot: ledger?.groupRoot ?? null,
    scope: ledger?.scope ?? null,
    genesisHash: ledger?.genesisHash ?? null,
    finalHash: ledger ? finalHash(ledger) : null,
    count: ledger?.entries.length ?? 0,
    proofsPublished,
    entries: proofsPublished ? (ledger?.entries ?? []) : [],
  };
}

// ---------------------------------------------------------------------------
// Cierre: paquete + verificador real + ancla opcional
// ---------------------------------------------------------------------------
/** Declaración honesta del censo en el paquete (fuera de `manifestHash`/`checksums`: el verificador la muestra como nota). */
export type PublishedRollPolicy = RollPolicy & { note: string };
export { OPEN_ROOM_NOTE } from "./rooms"; // D-19: las notas viven junto a la política del censo

function withRollPolicy(pkg: AuditPackage, policy: RollPolicy | null | undefined): AuditPackage & { rollPolicy?: PublishedRollPolicy } {
  return policy ? { ...pkg, rollPolicy: { ...policy, note: rollPolicyNote(policy) } } : pkg;
}

function serialize(pkg: AuditPackage) {
  const json = canonicalJson(pkg);
  return { json, digest: sha256Utf8(json) };
}

async function verifyStored(json: string, digest: string): Promise<AuditResult> {
  return verifyPackage(JSON.parse(json), {
    anchorRpcUrl: env.rpcUrl,
    ...(hooks.anchorReader ? { anchorReader: hooks.anchorReader } : {}),
    inputArtifactDigest: `sha256:${digest.slice(2)}`,
  });
}

export async function closeElection(id: string): Promise<Election> {
  return withLock(`engine:${id}`, async () => {
    const e = await requireElection(id);
    if (e.status !== "open") throw new HttpError("closed", `La elección no está abierta (estado ${e.status})`, 409);
    const engine = await requireEngine(id);
    if (!engine.ledger) throw new HttpError("closed", "Padrón no congelado", 409);
    await saveElection({ ...e, status: "closed" });
    await saveElection({ ...e, status: "tallying" });

    const t = recount(engine.ledger, e.options.length);
    const fh = finalHash(engine.ledger);

    // Ancla opcional: solo con ORGANIZER_PRIVATE_KEY + BASE_SEPOLIA_RPC. Sin credenciales: deshabilitada y se dice.
    // Con QuorumRegistry (fijado en el manifiesto, o NEXT_PUBLIC_REGISTRY_ADDRESS): `anchor(keccak256(electionId), finalHash)`.
    // Sin registro: modo antiguo (tx a sí mismo con el acta en calldata).
    let anchor: { chainId: number; txHash: `0x${string}`; registryAddress?: string } | null = null;
    let anchorStatus: EngineState["anchorStatus"];
    const pk = env.organizerPrivateKey;
    const rpc = env.rpcUrl;
    const policy = engine.manifest.anchorPolicy;
    // Si el manifiesto fijó el modo, se respeta; si no (elecciones publicadas antes de M1), decide el entorno.
    const registry = (policy ? policy.registryAddress : (e.registryAddress ?? env.registryAddress)) as Address | undefined;
    const transportOpt = hooks.anchorTransport ? { transport: hooks.anchorTransport } : {};
    if (!pk || !rpc) {
      anchorStatus = { mode: "disabled", reason: "ancla deshabilitada: faltan ORGANIZER_PRIVATE_KEY y/o BASE_SEPOLIA_RPC; el verificador la declara no evaluada" };
    } else if (registry) {
      try {
        const r = await anchorOnRegistry({ electionId: id, finalHash: fh, registryAddress: registry }, pk, rpc, {
          ...transportOpt,
          ...(policy ? { expectedOrganizer: policy.organizer as Address } : {}),
        });
        anchor = { chainId: r.chainId, txHash: r.txHash, registryAddress: r.registryAddress };
        anchorStatus = { mode: "anchored", reason: `anclado vía QuorumRegistry ${r.registryAddress} en Base Sepolia, tx ${r.txHash}` };
      } catch (err) {
        anchorStatus = { mode: "error", reason: `no se pudo anclar en el QuorumRegistry: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}` };
      }
    } else {
      try {
        const r = await anchorOnBaseSepolia({ finalHash: fh, groupRoot: engine.ledger.groupRoot, tallyHash: tallyHash(t), electionId: id }, pk, rpc, {
          ...transportOpt,
          ...(policy ? { expectedOrganizer: policy.organizer as Address } : {}),
        });
        anchor = { chainId: r.chainId, txHash: r.txHash };
        anchorStatus = { mode: "anchored", reason: `anclado en Base Sepolia (calldata, sin registro), tx ${r.txHash}` };
      } catch (err) {
        anchorStatus = { mode: "error", reason: `no se pudo anclar: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}` };
      }
    }

    const pkg = withRollPolicy(buildAuditPackage({ electionId: id, manifest: engine.manifest, commitments: engine.commitments, ledger: engine.ledger, tally: t, anchor, generatedAt: now().toISOString() }), engine.rollPolicy);
    if (pkg.manifestHash !== e.manifestHash) throw new HttpError("unavailable", "El manifiesto guardado no coincide con el publicado");
    const { json, digest } = serialize(pkg);
    const auditResult = await verifyStored(json, digest);

    await (await getStore()).putEngine({ ...engine, tally: t, packageJson: json, packageDigest: digest, auditResult, anchorStatus });
    const final: Election = { ...e, status: auditResult.valid ? "auditable" : "failed", anchor, packageDigest: digest };
    await saveElection(final);
    return final;
  });
}

export async function getArtifacts(id: string): Promise<{ json: string; digest: string }> {
  await requireElection(id);
  const engine = await requireEngine(id);
  if (!engine.packageJson || !engine.packageDigest) throw new HttpError("not_found", "El paquete de auditoría se genera al cerrar la elección");
  return { json: engine.packageJson, digest: engine.packageDigest };
}

export async function getAudit(id: string) {
  await requireElection(id);
  const engine = await requireEngine(id);
  if (!engine.auditResult) throw new HttpError("not_found", "Aún no hay resultado del verificador (la elección no ha cerrado)");
  return { auditResult: engine.auditResult, packageDigest: engine.packageDigest, anchorStatus: engine.anchorStatus };
}

// ---------------------------------------------------------------------------
// Sorteo verificable
// ---------------------------------------------------------------------------
export async function drawElection(id: string): Promise<Election> {
  return withLock(`engine:${id}`, async () => {
    const e = await requireElection(id);
    if (e.status !== "auditable") throw new HttpError("closed", `El sorteo solo se hace con la elección auditable (estado ${e.status})`, 409);
    const engine = await requireEngine(id);
    const rule = engine.manifest.drawRule;
    if (!rule) throw new HttpError("closed", "Esta elección no declara sorteo en su manifiesto", 409);
    if (!engine.ledger || !engine.tally || !engine.packageJson) throw new HttpError("closed", "Falta el paquete de cierre", 409);
    const fh = finalHash(engine.ledger);
    let draw;
    try {
      draw = runDraw(rule, engine.tally, fh);
    } catch (err) {
      throw new HttpError("closed", err instanceof Error && err.message.startsWith("NO_VOTES") ? "No hay votos válidos: N no está definido" : "No se pudo sortear", 409);
    }
    const prev = JSON.parse(engine.packageJson) as AuditPackage;
    const pkg = withRollPolicy(buildAuditPackage({ electionId: id, manifest: engine.manifest, commitments: engine.commitments, ledger: engine.ledger, tally: engine.tally, anchor: prev.anchor, generatedAt: now().toISOString(), draw }), engine.rollPolicy);
    const { json, digest } = serialize(pkg);
    const auditResult = await verifyStored(json, digest);
    await (await getStore()).putEngine({ ...engine, packageJson: json, packageDigest: digest, auditResult });
    const drawnAt = now().toISOString();
    const final: Election = { ...e, status: auditResult.valid ? "drawn" : "failed", draw: { ...draw, drawnAt }, packageDigest: digest };
    await saveElection(final);
    return final;
  });
}

export async function getDraw(id: string) {
  const e = await requireElection(id);
  const engine = await requireEngine(id);
  if (!e.draw) throw new HttpError("not_found", "Aún no hay sorteo");
  return {
    seed: e.draw.seed,
    n: e.draw.n,
    winners: e.draw.winners,
    method: e.draw.method,
    finalHash: e.draw.finalHash,
    candidates: engine.manifest.drawRule?.candidates ?? [],
    tieBreak: engine.manifest.drawRule?.tieBreak ?? null,
  };
}

/** POST /api/audit/verify: verificador real sobre los bytes recibidos. */
export async function verifyUploaded(pkg: unknown, rawBodyDigest: string): Promise<AuditResult> {
  return verifyPackage(pkg, {
    anchorRpcUrl: env.rpcUrl,
    ...(hooks.anchorReader ? { anchorReader: hooks.anchorReader } : {}),
    inputArtifactDigest: `sha256:${rawBodyDigest}`,
  });
}
