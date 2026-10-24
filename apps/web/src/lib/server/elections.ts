/**
 * Servicio de elecciones: crear, publicar (manifiesto + layout), censo, cierre, tally y paquete
 * de auditoría. Sin PII en nada que salga hacia afuera.
 */
import { Aggregates, Election, Receipt, Voter, type CreateElectionInput } from "@quorum/contracts";
import { z } from "zod";

type ReceiptT = z.infer<typeof Receipt>;
import { canonicalJson, randomId, randomToken, sha256Hex } from "./crypto";
import { env, MIN_VOTES_FOR_BREAKDOWN } from "./env";
import { HttpError } from "./errors";
import { generateLayout, layoutHints } from "./layout";
import { getStore, type Ballot } from "./store";

export const APP_VERSION = "0.1.0";
/** Motor: pendiente ADR-001. Mientras tanto, `integrity-demo` (boleta en claro sin vínculo al votante). */
export const ENGINE = { protocol: "integrity-demo" as const, version: "stub-pending-ADR-001" };

export async function requireElection(id: string): Promise<Election> {
  const store = await getStore();
  const e = await store.getElection(id);
  if (!e) throw new HttpError("not_found", "Elección no encontrada");
  return e;
}

export async function createElection(input: CreateElectionInput): Promise<Election> {
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new HttpError("invalid_input", "endsAt debe ser posterior a startsAt");
  }
  const ids = new Set(input.options.map((o) => o.id));
  if (ids.size !== input.options.length) throw new HttpError("invalid_input", "Ids de opciones repetidos");
  const election = Election.parse({
    id: randomId("el"),
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
  });
  const store = await getStore();
  await store.putElection(election);
  return election;
}

/** Manifiesto = JSON canónico (claves ordenadas) de `{title, kind, options, startsAt, endsAt}`. */
export function manifestOf(e: Pick<Election, "title" | "kind" | "options" | "startsAt" | "endsAt">) {
  return { title: e.title, kind: e.kind, options: e.options, startsAt: e.startsAt, endsAt: e.endsAt };
}

export function manifestHashOf(e: Pick<Election, "title" | "kind" | "options" | "startsAt" | "endsAt">): string {
  return sha256Hex(canonicalJson(manifestOf(e)));
}

export async function publishElection(id: string): Promise<Election> {
  const store = await getStore();
  const e = await requireElection(id);
  if (e.status !== "draft") throw new HttpError("closed", `La elección ya está en estado ${e.status}`, 409);
  const { layout } = await generateLayout(layoutHints(e));
  const published: Election = { ...e, status: "open", manifestHash: manifestHashOf(e), layout };
  await store.putElection(published);
  return published;
}

/** Cierre: `closed` → `tallying` → `auditable`. El tally real lo hará el motor (ADR-001); aquí es el stub. */
export async function closeElection(id: string): Promise<Election> {
  const store = await getStore();
  const e = await requireElection(id);
  if (e.status !== "open") throw new HttpError("closed", `La elección no está abierta (estado ${e.status})`, 409);
  await store.putElection({ ...e, status: "closed" });
  await store.putElection({ ...e, status: "tallying" });
  const now = new Date().toISOString();
  for (const b of await store.listBallots(id)) {
    if (!b.includedAt) await store.putBallot({ ...b, includedAt: now });
  }
  const final: Election = { ...e, status: "auditable" };
  await store.putElection(final);
  return final;
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

export function inviteUrlFor(token: string): string {
  return `${env.appUrl}/v/${token}`;
}

export async function addVoters(electionId: string, input: z.infer<typeof AddVotersInput>) {
  const store = await getStore();
  const e = await requireElection(electionId);
  if (e.status !== "draft" && e.status !== "open") throw new HttpError("closed", "La elección ya cerró", 409);
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

// ---------------------------------------------------------------------------
// Recibos y agregados
// ---------------------------------------------------------------------------
export function receiptOf(b: Ballot): ReceiptT {
  return Receipt.parse({
    electionId: b.electionId,
    inclusionId: b.inclusionId,
    receivedAt: b.receivedAt,
    includedAt: b.includedAt,
    state: b.includedAt ? "incluido" : "recibido",
  });
}

export async function computeAggregates(e: Election): Promise<Aggregates> {
  const store = await getStore();
  const [ballots, voters] = await Promise.all([store.listBallots(e.id), store.listVoters(e.id)]);
  const total = ballots.length;
  const eligible = voters.length;
  const counts = new Map<string, number>();
  for (const b of ballots) if (b.choice !== undefined) counts.set(b.choice, (counts.get(b.choice) ?? 0) + 1);
  const breakdown = total >= MIN_VOTES_FOR_BREAKDOWN;
  const options = e.options.map((o) => ({ id: o.id, label: o.label, count: breakdown ? (counts.get(o.id) ?? 0) : null }));
  const max = breakdown ? Math.max(0, ...e.options.map((o) => counts.get(o.id) ?? 0)) : 0;
  return Aggregates.parse({
    electionId: e.id,
    turnout: eligible > 0 ? Math.min(1, total / eligible) : 0,
    totalVotes: total,
    eligible,
    leadingShare: breakdown && total > 0 ? max / total : null,
    closesAt: e.endsAt,
    status: e.status,
    options,
  });
}

/**
 * Paquete de auditoría (sin PII): manifiesto, commitments/boletas, resultado, versiones y checksums.
 * En `integrity-demo` la boleta incluye la opción en claro, sin ningún vínculo con el elector.
 */
export async function buildArtifacts(e: Election) {
  const store = await getStore();
  const ballots = (await store.listBallots(e.id))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.inclusionId.localeCompare(b.inclusionId))
    .map((b) => ({ inclusionId: b.inclusionId, commitment: b.commitment, choice: b.choice ?? null, includedAt: b.includedAt }));
  const counts: Record<string, number> = Object.fromEntries(e.options.map((o) => [o.id, 0]));
  for (const b of ballots) if (b.choice && b.choice in counts) counts[b.choice] += 1;
  const manifest = manifestOf(e);
  const ballotsJson = canonicalJson(ballots);
  const resultJson = canonicalJson(counts);
  const pkg = {
    format: "quorum-audit-package",
    formatVersion: "0.1",
    label: "simulación", // motor stub; no afirma garantías criptográficas (regla dura 5)
    electionId: e.id,
    status: e.status,
    protocol: e.protocol,
    engine: ENGINE,
    manifest,
    manifestHash: e.manifestHash ?? manifestHashOf(e),
    manifestCanonicalization: "json-sorted-keys/sha256-hex",
    eligibleCount: (await store.listVoters(e.id)).length,
    ballots,
    result: { totalVotes: ballots.length, counts },
    versions: { app: APP_VERSION, engine: ENGINE.version },
    checksums: { ballots: sha256Hex(ballotsJson), result: sha256Hex(resultJson) },
    generatedAt: new Date().toISOString(),
  };
  return pkg;
}
