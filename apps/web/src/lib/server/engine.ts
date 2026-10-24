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
  appendMember,
  ballotEntries,
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
import { enrollmentOpen, isContinuous, publishElection, requireElection, requireEngine, requireVoter } from "./elections";
import { env } from "./env";
import { HttpError, type ApiCode } from "./errors";
import { withLock } from "./lock";
import { freezeReviews } from "./reviews";
import { freezeRoomPolicy, rollPolicyNote } from "./rooms";
import { getStore, type EngineState, type ManualApprovals, type RollPolicy } from "./store";

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
  if (!enrollmentOpen(election)) throw new HttpError("closed", "El padrón ya está congelado o la elección no está en inscripción");
  if (!voter.registeredAt || !voter.walletAddress) throw new HttpError("not_eligible", "Primero hay que enlazar la wallet (firma FaceBinding)");
  return withLock(`engine:${election.id}`, async () => {
    const store = await getStore();
    const e = await requireElection(election.id);
    if (!enrollmentOpen(e)) throw new HttpError("closed", "La votación ya cerró: la inscripción está cerrada");
    const engine = await requireEngine(election.id);
    const fresh = await requireVoter(voterId);
    if (fresh.credentialIssuedAt || engine.roll.some((r) => r.voterId === voterId)) throw new HttpError("already_voted", "Este votante ya registró su identidad", 409);
    if (engine.roll.some((r) => r.commitment === input.commitment) || engine.commitments.includes(input.commitment)) throw new HttpError("invalid_input", "Ese commitment ya está en el padrón", 409);
    if (isContinuous(e) && engine.ledger?.enrollment) {
      // D-23: el commitment entra YA al grupo (member_added encadenado, nueva raíz), bajo el mismo lock que los votos.
      // Sin voterId en el ledger ni en `roll`: solo el commitment.
      try {
        appendMember(engine.ledger, input.commitment);
      } catch (err) {
        if (err instanceof LedgerRejection) throw new HttpError(err.code === "GROUP_FULL" ? "room_full" : "invalid_input", err.code === "GROUP_FULL" ? "El grupo está lleno" : "Ese commitment no es válido o ya está en el grupo", 409);
        throw err;
      }
      engine.commitments.push(input.commitment);
      await store.putEngine(engine);
      await store.putVoter({ ...fresh, credentialIssuedAt: now().toISOString() });
      return { ok: true as const, registeredCount: engine.commitments.length };
    }
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
  // D-23: en modo continuo no hay padrón que congelar: "Abrir" en borrador publica y abre inscripción + votación a la vez.
  const pre = await requireElection(id);
  if (isContinuous(pre)) {
    if (pre.status === "draft") return publishElection(id, { now });
    throw new HttpError("closed", pre.status === "open" ? "La votación ya está abierta: la gente se inscribe y vota en el momento." : "La votación ya terminó.", 409);
  }
  // engine → room → enroll (las entradas a la sala toman solo `room:`, el rostro solo `enroll:`): nadie entra ni se
  // inscribe mientras se congela el padrón, y ninguna revisión manual (D-21) queda a medio crear.
  return withLock(`engine:${id}`, () => withLock(`room:${id}`, () => withLock(`enroll:${id}`, async () => {
    const e = await requireElection(id);
    if (opts.auto && !scheduleDue(e, now().getTime())) return e;
    if (e.status !== "registration") throw new HttpError("closed", e.status === "draft" ? "Primero abre la inscripción." : "La votación ya se abrió o ya terminó.", 409);
    const engine = await requireEngine(id);
    if (engine.roll.length === 0) throw new HttpError("closed", "Todavía nadie terminó de inscribirse. Abre la sala (Proyectar), deja que la gente escanee el QR y se inscriba, y luego abre la votación.", 409);
    const commitments = engine.roll.map((r) => r.commitment);
    const root = computeGroupRoot(commitments);
    // Sala abierta: se cierra sola al abrir la votación y su política queda fijada para el paquete de auditoría.
    const rollPolicy = await freezeRoomPolicy(id);
    // D-21: las revisiones manuales pendientes se rechazan solas; se fija cuántas se aprobaron (sin ids).
    const { manualApprovals } = await freezeReviews(id, e.eligibility?.method);
    const next: EngineState = { ...engine, roll: [], commitments, ledger: createLedger(id, root), rollPolicy, manualApprovals };
    const store = await getStore();
    await store.putEngine(next);
    // A2: con el padrón congelado ya no hace falta el dedupe facial → se borran las plantillas (descriptores cifrados).
    await store.deleteFaceTemplates(id);
    // `votingStartsAt` pasa a ser la hora REAL de apertura (a mano o programada).
    const opened: Election = { ...e, status: "open", groupRoot: root, votingStartsAt: now().toISOString() };
    await saveElection(opened);
    return opened;
  })));
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
  if (engine.ledger?.enrollment) {
    // D-23: grupo vivo. La raíz es la vigente; una prueba contra ella sigue valiendo aunque entren otros (ventana).
    return {
      electionId: id,
      status: e.status,
      frozen: false,
      groupRoot: engine.ledger.groupRoot,
      scope: engine.ledger.scope,
      merkleTreeDepth: MERKLE_TREE_DEPTH,
      commitments: engine.commitments,
      votingMode: "continuous" as const,
      size: engine.commitments.length,
      minAnonymitySet: engine.ledger.enrollment.minAnonymitySet,
      rootWindow: engine.ledger.enrollment.rootWindow,
    };
  }
  const frozen = engine.ledger !== null;
  return {
    electionId: id,
    status: e.status,
    frozen,
    groupRoot: frozen ? engine.ledger!.groupRoot : null,
    scope: engine.ledger?.scope ?? null,
    merkleTreeDepth: MERKLE_TREE_DEPTH,
    commitments: frozen ? engine.commitments : engine.roll.map((r) => r.commitment),
    votingMode: "phased" as const,
    size: frozen ? engine.commitments.length : engine.roll.length,
  };
}

// ---------------------------------------------------------------------------
// Voto
// ---------------------------------------------------------------------------
const REJECTION_CODE: Record<string, ApiCode> = {
  DOUBLE_VOTE: "already_voted",
  WRONG_ROOT: "not_eligible",
  STALE_ROOT: "stale_root",
  ANONYMITY_SET_TOO_SMALL: "anonymity_pending",
  WRONG_SCOPE: "not_eligible",
  WRONG_DEPTH: "not_eligible",
  INVALID_PROOF: "not_eligible",
  INVALID_ENCODING: "invalid_input",
};
const REJECTION_MESSAGE: Record<string, string> = {
  DOUBLE_VOTE: "Esta credencial ya votó en esta elección (nullifier repetido)",
  WRONG_ROOT: "La prueba no es contra el padrón de esta elección",
  STALE_ROOT: "Entró mucha gente mientras preparabas tu voto: vuelve a intentarlo",
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
    if (!engine.ledger || (!e.groupRoot && !engine.ledger.enrollment)) throw new HttpError("closed", "Padrón no congelado");
    let entry;
    try {
      entry = await appendBallot(engine.ledger, proof, e.groupRoot ?? engine.ledger.groupRoot, { optionCount: e.options.length });
    } catch (err) {
      if (err instanceof LedgerRejection && err.code === "ANONYMITY_SET_TOO_SMALL") {
        const k = engine.ledger.enrollment?.minAnonymitySet ?? 0;
        throw new HttpError("anonymity_pending", `Tu voto se habilita cuando haya ${k} personas inscritas (ahora ${engine.commitments.length})`);
      }
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
  const entry = engine.ledger ? ballotEntries(engine.ledger).find((x) => x.proof.nullifier === inclusionId) : undefined;
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
    count: ledger ? ballotEntries(ledger).length : 0,
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

/** D-21: texto que acompaña a `manualApprovals` en el paquete. */
export const MANUAL_APPROVALS_NOTE =
  "inscripciones aprobadas manualmente por el organizador, en persona, tras una coincidencia facial con alguien ya inscrito " +
  "(p. ej. gemelos idénticos con credenciales distintas). Se decide durante la inscripción, después de publicar el manifiesto: " +
  "va fuera de manifestHash/checksums y el verificador no puede comprobarlo";
export type PublishedManualApprovals = ManualApprovals & { note: string };

function withRollPolicy(pkg: AuditPackage, engine: Pick<EngineState, "rollPolicy" | "manualApprovals">): AuditPackage & { rollPolicy?: PublishedRollPolicy; manualApprovals?: PublishedManualApprovals } {
  const policy = engine.rollPolicy;
  const manual = engine.manualApprovals;
  return {
    ...pkg,
    ...(policy ? { rollPolicy: { ...policy, note: rollPolicyNote(policy) } } : {}),
    ...(manual ? { manualApprovals: { ...manual, note: MANUAL_APPROVALS_NOTE } } : {}),
  };
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
  // engine → room → enroll (mismo orden que `openElection`): en modo continuo cerrar también cierra la inscripción.
  return withLock(`engine:${id}`, () => withLock(`room:${id}`, () => withLock(`enroll:${id}`, () => closeLocked(id))));
}

async function closeLocked(id: string): Promise<Election> {
  {
    const e = await requireElection(id);
    if (e.status !== "open") throw new HttpError("closed", `La elección no está abierta (estado ${e.status})`, 409);
    let engine = await requireEngine(id);
    if (!engine.ledger) throw new HttpError("closed", "Padrón no congelado", 409);
    if (engine.ledger.enrollment) {
      // D-23: cerrar = cerrar sala + votación. La política del censo y las aprobaciones manuales se fijan aquí; las
      // revisiones pendientes se rechazan y las plantillas faciales se borran (en continuo vivían hasta el cierre).
      const rollPolicy = await freezeRoomPolicy(id, "election-closed");
      const { manualApprovals } = await freezeReviews(id, e.eligibility?.method);
      engine = { ...engine, rollPolicy, manualApprovals };
      await (await getStore()).deleteFaceTemplates(id);
    }
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

    const pkg = withRollPolicy(buildAuditPackage({ electionId: id, manifest: engine.manifest, commitments: engine.commitments, ledger: engine.ledger, tally: t, anchor, generatedAt: now().toISOString() }), engine);
    if (pkg.manifestHash !== e.manifestHash) throw new HttpError("unavailable", "El manifiesto guardado no coincide con el publicado");
    const { json, digest } = serialize(pkg);
    const auditResult = await verifyStored(json, digest);

    await (await getStore()).putEngine({ ...engine, tally: t, packageJson: json, packageDigest: digest, auditResult, anchorStatus });
    const final: Election = { ...e, status: auditResult.valid ? "auditable" : "failed", anchor, packageDigest: digest, ...(engine.ledger.enrollment ? { groupRoot: engine.ledger.groupRoot } : {}) };
    await saveElection(final);
    return final;
  }
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
    const pkg = withRollPolicy(buildAuditPackage({ electionId: id, manifest: engine.manifest, commitments: engine.commitments, ledger: engine.ledger, tally: engine.tally, anchor: prev.anchor, generatedAt: now().toISOString(), draw }), engine);
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
