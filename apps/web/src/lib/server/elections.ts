/**
 * Servicio de elecciones (Contrato v1): crear, publicar (manifiesto + layout → `registration`), censo,
 * resumen de inscritos y agregados. El motor (padrón, ledger, cierre, sorteo) vive en `engine.ts`.
 * Sin PII en nada que salga hacia afuera.
 */
import { Aggregates, DEFAULT_MIN_ANONYMITY_SET, Election, Voter, VoterSummary, type CreateElectionInput } from "@quorum/contracts";
import { ballotEntries, createContinuousLedger, DEFAULT_ROOT_WINDOW, manifestHash, MERKLE_TREE_DEPTH, sha256Utf8, type AnchorPolicy, type DrawRule, type ElectionManifest, type EnrollmentPolicy } from "@quorum/protocol-adapter";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";
import { applyEligibility } from "./badge";
import { randomId, randomToken } from "./crypto";
import { env, MIN_VOTES_FOR_BREAKDOWN } from "./env";
import { HttpError } from "./errors";
import { generateLayout, layoutHints } from "./layout";
import { getStore, type EngineState } from "./store";

export const APP_VERSION = "0.2.0";
/** Motor del ADR-001 (Plan A). */
export const ENGINE = { protocol: "semaphore-ledger" as const, version: "protocol-adapter 0.1.0 / semaphore 4.14.5" };
/** Etiqueta honesta del manifiesto: la demo corre en testnet con datos ficticios. */
export const MANIFEST_LABEL = "simulación";

/** D-22: ¿modo continuo (se inscriben y votan a la vez)? Ausente = con fases (datos anteriores). */
export function isContinuous(e: Pick<Election, "votingMode">): boolean {
  return e.votingMode === "continuous";
}

/** ¿Se aceptan inscripciones (rostro, wallet, identidad, sala) ahora? Con fases: solo `registration`; continuo: también `open`. */
export function enrollmentOpen(e: Pick<Election, "status" | "votingMode">): boolean {
  return e.status === "registration" || (isContinuous(e) && e.status === "open");
}

/** Mensaje para quien intenta inscribirse (rostro, vinculación, identidad) cuando la inscripción ya no está abierta. */
export function enrollmentClosedMessage(e: Pick<Election, "status" | "votingMode"> | null | undefined): string {
  if (!e) return "Elección no encontrada";
  if (e.status === "draft") return "La inscripción todavía no abre. Deja esta página abierta: se actualiza sola.";
  if (e.status === "open" && !isContinuous(e)) return "La votación ya empezó: la inscripción está cerrada.";
  return "La votación terminó: ya no se puede inscribir.";
}

/** Política del modo continuo que va al manifiesto (K y ventana de raíces). */
export function enrollmentOf(e: Pick<Election, "votingMode" | "minAnonymitySet">): EnrollmentPolicy | undefined {
  if (!isContinuous(e)) return undefined;
  return { mode: "continuous", minAnonymitySet: e.minAnonymitySet ?? DEFAULT_MIN_ANONYMITY_SET, rootWindow: DEFAULT_ROOT_WINDOW };
}

export async function requireElection(id: string): Promise<Election> {
  const store = await getStore();
  const e = await store.getElection(id);
  if (!e) throw new HttpError("not_found", "Elección no encontrada");
  // Rellena defaults v1 en datos guardados con v0.
  return Election.parse(e);
}

export async function requireEngine(id: string): Promise<EngineState> {
  const s = await (await getStore()).getEngine(id);
  if (!s) throw new HttpError("closed", "La elección aún no está publicada", 409);
  return s;
}

function validateDrawConfig(input: CreateElectionInput) {
  const candidates = input.candidates ?? [];
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length) throw new HttpError("invalid_input", "Ids de candidatos repetidos");
  if (input.winnersCountFromResult) {
    if (!input.optionValues || input.optionValues.length !== input.options.length) {
      throw new HttpError("invalid_input", "winnersCountFromResult exige optionValues con un valor por opción");
    }
    if (candidates.length === 0) throw new HttpError("invalid_input", "El sorteo necesita al menos un candidato");
  }
  if (input.winnersCount !== undefined && candidates.length === 0) throw new HttpError("invalid_input", "winnersCount sin candidatos");
  if (candidates.length > 0 && !input.winnersCountFromResult && input.winnersCount === undefined) {
    throw new HttpError("invalid_input", "Con candidatos hay que fijar winnersCount o winnersCountFromResult");
  }
}

export async function createElection(input: CreateElectionInput, opts: { id?: string } = {}): Promise<Election> {
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new HttpError("invalid_input", "endsAt debe ser posterior a startsAt");
  }
  const ids = new Set(input.options.map((o) => o.id));
  if (ids.size !== input.options.length) throw new HttpError("invalid_input", "Ids de opciones repetidos");
  validateDrawConfig(input);
  // D-22: el modo continuo es el predeterminado para votaciones nuevas.
  const votingMode = input.votingMode ?? "continuous";
  const election = Election.parse({
    id: opts.id ?? randomId("el"),
    title: input.title,
    description: input.description ?? "",
    kind: input.kind,
    options: input.options,
    status: "draft",
    protocol: ENGINE.protocol,
    manifestHash: null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    eligibilityIssuerId: "demo-issuer",
    organizerId: "demo-organizer",
    layout: null,
    candidates: input.candidates ?? [],
    winnersCountFromResult: input.winnersCountFromResult ?? false,
    winnersCount: input.winnersCount ?? null,
    optionValues: input.optionValues ?? null,
    registryAddress: env.registryAddress ?? null,
    votingStartsAt: null,
    votingMode,
    ...(votingMode === "continuous" ? { minAnonymitySet: input.minAnonymitySet ?? DEFAULT_MIN_ANONYMITY_SET } : {}),
  });
  // D-19: método de elegibilidad de la sala (la lista de usuarios se guarda solo como HMAC, aparte).
  if (input.eligibility) election.eligibility = await applyEligibility(election.id, input.eligibility);
  const store = await getStore();
  await store.putElection(election);
  return election;
}

export function drawRuleOf(e: Election): DrawRule | undefined {
  if (!e.candidates || e.candidates.length === 0) return undefined;
  const candidates = e.candidates.map((c) => ({ id: c.id, label: c.label, ...(c.amount !== undefined ? { amount: c.amount } : {}) }));
  if (e.winnersCountFromResult && e.optionValues) return { candidates, winnersCount: { kind: "from-result", optionValues: [...e.optionValues] }, tieBreak: "lowest" };
  if (e.winnersCount) return { candidates, winnersCount: { kind: "fixed", n: e.winnersCount } };
  return undefined;
}

/**
 * Hallazgo M1: fija en el manifiesto (antes de votar) quién puede anclar y dónde. Con registro: `quorum-registry`
 * (QuorumRegistry + organizador); sin registro pero con clave: `calldata` (modo antiguo, solo organizador).
 * Sin clave del organizador no se promete nada. La dirección se deriva de la clave en el servidor; la clave nunca sale.
 */
export function anchorPolicyOf(e: Election): AnchorPolicy | undefined {
  const pk = env.organizerPrivateKey;
  if (!pk) return undefined;
  const organizer = privateKeyToAccount(pk).address;
  const registry = e.registryAddress ?? env.registryAddress;
  return registry
    ? { kind: "quorum-registry", chainId: env.chainId, registryAddress: getAddress(registry), organizer }
    : { kind: "calldata", chainId: env.chainId, organizer };
}

/** Manifiesto canónico del adaptador (`ElectionManifest`). Su SHA-256 es `manifestHash`; lo recomputa el verificador. */
export function manifestOf(e: Election): ElectionManifest {
  const drawRule = drawRuleOf(e);
  const anchorPolicy = anchorPolicyOf(e);
  const enrollment = enrollmentOf(e);
  return {
    electionId: e.id,
    title: e.title,
    kind: e.kind,
    options: e.options.map((o) => ({ id: o.id, label: o.label, ...(o.subtitle ? { subtitle: o.subtitle } : {}), ...(o.image ? { imageSha256: sha256Utf8(o.image) } : {}) })),
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    protocol: "semaphore-ledger",
    merkleTreeDepth: MERKLE_TREE_DEPTH,
    label: MANIFEST_LABEL,
    ...(drawRule ? { drawRule } : {}),
    ...(anchorPolicy ? { anchorPolicy } : {}),
    ...(enrollment ? { enrollment } : {}),
  };
}

/**
 * Con fases: `draft → registration` (fija manifiesto y layout; abre la inscripción: rostro + wallet + identidad).
 * Continuo (D-22): `draft → open` directamente: inscripción y votación a la vez; el ledger nace vacío y crece con
 * cada inscripción (`member_added`).
 */
export async function publishElection(id: string, opts: { now?: () => Date } = {}): Promise<Election> {
  const store = await getStore();
  const e = await requireElection(id);
  if (e.status !== "draft") throw new HttpError("closed", `La elección ya está en estado ${e.status}`, 409);
  const manifest = manifestOf(e);
  const { layout } = await generateLayout(layoutHints(e));
  const continuous = manifest.enrollment;
  const published: Election = continuous
    ? { ...e, status: "open", manifestHash: manifestHash(manifest), layout, votingStartsAt: (opts.now?.() ?? new Date()).toISOString() }
    : { ...e, status: "registration", manifestHash: manifestHash(manifest), layout };
  await store.putEngine({
    electionId: id,
    manifest,
    roll: [],
    commitments: [],
    ledger: continuous ? createContinuousLedger(id, { minAnonymitySet: continuous.minAnonymitySet, rootWindow: continuous.rootWindow }) : null,
    receipts: {},
    tally: null,
    packageJson: null,
    packageDigest: null,
    auditResult: null,
    anchorStatus: null,
  });
  await store.putElection(published);
  return published;
}

// ---------------------------------------------------------------------------
// Censo
// ---------------------------------------------------------------------------
export const AddVotersInput = z.object({
  voters: z
    .array(z.object({ displayName: z.string().min(1).max(80), phoneE164: Voter.shape.phoneE164 }))
    .min(1)
    .max(500),
});

/** Fases en las que se admiten nuevos votantes/invitaciones: antes de congelar el padrón (continuo: también mientras se vota). */
export function acceptsVoters(e: Pick<Election, "status" | "votingMode">): boolean {
  return e.status === "draft" || enrollmentOpen(e);
}

export function inviteUrlFor(token: string): string {
  return `${env.appUrl}/v/${token}`;
}

export async function addVoters(electionId: string, input: z.infer<typeof AddVotersInput>) {
  const store = await getStore();
  const e = await requireElection(electionId);
  if (!acceptsVoters(e)) throw new HttpError("closed", "El padrón ya está congelado", 409);
  const created: Voter[] = [];
  for (const v of input.voters) {
    const voter: Voter = {
      id: randomId("vt"),
      electionId,
      displayName: v.displayName,
      phoneE164: v.phoneE164,
      inviteToken: randomToken(),
      inviteStatus: "pending",
      walletAddress: null,
      livenessPassedAt: null,
      credentialIssuedAt: null,
      votedAt: null,
      faceBindingHash: null,
      walletKind: null,
      registeredAt: null,
      source: "invite",
    };
    await store.putVoter(voter);
    created.push(voter);
  }
  return {
    voters: created.map((v) => ({ id: v.id, displayName: v.displayName, inviteToken: v.inviteToken, inviteUrl: inviteUrlFor(v.inviteToken) })),
  };
}

/** Votante sin teléfono (forma pública de `Voter`). */
export function publicVoter(v: Voter): Omit<Voter, "phoneE164"> {
  const { phoneE164: _phone, ...rest } = v;
  void _phone;
  return rest;
}

export async function requireVoter(id: string): Promise<Voter> {
  const store = await getStore();
  const v = await store.getVoter(id);
  if (!v) throw new HttpError("not_found", "Votante no encontrado");
  return v;
}

export function voterState(v: Voter): z.infer<typeof VoterSummary>["state"] {
  if (v.votedAt) return "voted";
  if (v.registeredAt) return "registered";
  return "invited";
}

/** Agregados públicos del censo: cuántos invitados, inscritos (rostro + wallet), con identidad y que dicen haber votado. */
export async function voterCounts(electionId: string) {
  await requireElection(electionId);
  const voters = await (await getStore()).listVoters(electionId);
  return {
    total: voters.length,
    invited: voters.filter((v) => voterState(v) === "invited").length,
    registered: voters.filter((v) => Boolean(v.registeredAt)).length,
    withIdentity: voters.filter((v) => Boolean(v.credentialIssuedAt)).length,
    voted: voters.filter((v) => Boolean(v.votedAt)).length,
  };
}

/** GET /voters del organizador: sin teléfono ni commitment; nunca la opción. */
export async function listVoterSummaries(electionId: string) {
  const counts = await voterCounts(electionId);
  const voters = await (await getStore()).listVoters(electionId);
  return {
    voters: voters.map((v) =>
      VoterSummary.parse({ id: v.id, displayName: v.displayName, state: voterState(v), walletAddress: v.walletAddress, hasIdentity: Boolean(v.credentialIssuedAt), source: v.source ?? "invite" }),
    ),
    counts,
  };
}

// ---------------------------------------------------------------------------
// Agregados (solo totales; con < MIN_VOTES_FOR_BREAKDOWN votos no se desglosa; en vivo, por lotes de ese tamaño)
// ---------------------------------------------------------------------------
export async function computeAggregates(e: Election): Promise<Aggregates> {
  const engine = await (await getStore()).getEngine(e.id);
  const entries = engine?.ledger ? ballotEntries(engine.ledger) : [];
  const total = entries.length;
  const eligible = engine ? (engine.commitments.length || engine.roll.length) : 0;
  const counts = new Array<number>(e.options.length).fill(0);
  // C3 / AT-10: mientras se vota, el desglose se publica por lotes completos de MIN_VOTES_FOR_BREAKDOWN boletas.
  // Si cambiara con cada voto, quien ve quién pasa a `voted` (el organizador) sabría la opción de cada persona
  // restando dos lecturas consecutivas del tally. Al cerrar se publica el recuento exacto.
  const live = e.status === "registration" || e.status === "open";
  const counted = live ? entries.slice(0, Math.floor(total / MIN_VOTES_FOR_BREAKDOWN) * MIN_VOTES_FOR_BREAKDOWN) : entries;
  for (const en of counted) {
    const m = Number(en.proof.message);
    if (Number.isInteger(m) && m >= 0 && m < counts.length) counts[m] += 1;
  }
  const breakdown = total >= MIN_VOTES_FOR_BREAKDOWN;
  const options = e.options.map((o, i) => ({ id: o.id, label: o.label, count: breakdown ? counts[i] : null }));
  const max = breakdown ? Math.max(0, ...counts) : 0;
  const countedTotal = counted.length;
  return Aggregates.parse({
    electionId: e.id,
    turnout: eligible > 0 ? Math.min(1, total / eligible) : 0,
    totalVotes: total,
    eligible,
    leadingShare: breakdown && countedTotal > 0 ? max / countedTotal : null,
    closesAt: e.endsAt,
    status: e.status,
    options,
  });
}
