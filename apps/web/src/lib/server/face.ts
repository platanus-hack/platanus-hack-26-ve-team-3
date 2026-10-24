/**
 * Prueba de vida — modo demo (research/02 §B). El cliente calcula un descriptor (array de floats)
 * con un modelo local; el servidor NUNCA recibe ni guarda imágenes.
 *
 * El descriptor se guarda ofuscado con AES-256-GCM. Clave: `FACE_KEY` (hex de 64 chars o
 * cualquier string → sha256). Sin `FACE_KEY`, en dev se deriva de `DATA_DIR`: ESTO ES INSEGURO
 * para producción (la clave es adivinable) y solo existe para que la demo corra sin configuración.
 * En producción `FACE_KEY` es obligatoria (se lanza error si NODE_ENV=production y falta).
 */
import { FaceEnrollInput, FaceEnrollResult, FaceVerifyInput, FaceVerifyResult, type FaceEnrollResponse } from "@quorum/contracts";
import { keccak256, stringToBytes } from "viem";
import { z } from "zod";
import { canonicalJson, keyFromSecret, open, randomBytes32Hex, randomId, seal, sha256Hex, type SealedBlob } from "./crypto";
import { env, VOTE_NONCE_TTL_MS } from "./env";
import { HttpError } from "./errors";
import { withLock } from "./lock";
import { enrollmentOpen, requireVoter } from "./elections";
import { getStore, type VoteNonce } from "./store";

/** D-21: textos para el votante (sin jerga técnica). */
export const REVIEW_MESSAGES = {
  duplicate: "Este rostro ya está inscrito en esta votación",
  rejected: "No pudimos verificar tu identidad. Habla con el organizador.",
  full: "Este rostro ya está inscrito en esta votación. Hay muchos casos esperando revisión: habla con el organizador.",
} as const;

/** D-21: tope de revisiones PENDIENTES por elección (`QUORUM_MAX_PENDING_REVIEWS`, 1..100, default 10). */
export function maxPendingReviews(): number {
  const n = Number(process.env.QUORUM_MAX_PENDING_REVIEWS ?? "10");
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 10;
}

export function faceKey(): Buffer {
  const secret = env.faceKey;
  if (secret) return keyFromSecret(secret);
  if (process.env.NODE_ENV === "production") throw new HttpError("unavailable", "FACE_KEY no configurada");
  // Dev only — inseguro: clave derivada de un valor público.
  return keyFromSecret(`quorum-dev-face-key:${env.dataDir}`);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function issueVoteNonce(voterId: string, electionId: string): Promise<string> {
  const store = await getStore();
  const now = Date.now();
  const entry: VoteNonce = {
    nonce: randomBytes32Hex(),
    voterId,
    electionId,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + VOTE_NONCE_TTL_MS).toISOString(),
    usedAt: null,
  };
  await store.putNonce(entry);
  return entry.nonce;
}

/**
 * `faceBindingHash = keccak256(utf8(electionId | voterId | sha256(canonicalJson(descriptorCifrado))))`.
 * Liga el rostro inscrito (su plantilla cifrada, nunca el descriptor en claro) a un votante de una elección.
 * La wallet lo firma (EIP-712 `FaceBinding`) para quedar enlazada a ese rostro.
 */
export function faceBindingHashOf(electionId: string, voterId: string, sealed: SealedBlob): `0x${string}` {
  return keccak256(stringToBytes(`${electionId}|${voterId}|${sha256Hex(canonicalJson(sealed))}`));
}

/**
 * Inscripción facial (solo en `registration`) con **dedupe 1:N**: compara el descriptor contra todas las
 * plantillas de la misma elección (también las que están en revisión); si alguna supera `FACE_DEDUPE_THRESHOLD`:
 *  - por defecto → 409 `duplicate_identity` y NO se guarda nada;
 *  - D-21: si el votante entró con una credencial del evento (`source: "badge"`, que ya es distinta y de un solo uso
 *    por construcción: `badge_used`) → 202 `{ status: "pending_review" }`: la plantilla se guarda cifrada con
 *    `pending: true` y se crea una revisión para el organizador. Nunca se guarda con quién coincidió ni la similitud.
 *    Con `open-alias` (o invitación) NO aplica: sigue el rechazo automático. Tope de pendientes por elección.
 *  - el mismo votante en revisión reintenta → el mismo `pending_review` (idempotente); rechazado → 409.
 * `onNewReview` corre justo antes de crear una revisión nueva (la ruta pone ahí su rate limit: si lanza, no se crea).
 * Modo demo: descriptor de un modelo local, no es una garantía biométrica fuerte.
 */
export async function enrollFace(input: z.infer<typeof FaceEnrollInput>, opts: { onNewReview?: () => void } = {}): Promise<FaceEnrollResponse> {
  const store = await getStore();
  const voter = await requireVoter(input.voterId);
  if (voter.inviteToken !== input.inviteToken) throw new HttpError("forbidden", "inviteToken inválido");
  const election = await store.getElection(voter.electionId);
  if (!election || !enrollmentOpen(election)) throw new HttpError("closed", "La elección no está en fase de inscripción");
  // Serializado por elección: el dedupe 1:N no puede tener carreras.
  return withLock(`enroll:${voter.electionId}`, async () => {
    const review = await store.getReviewByVoter(voter.id);
    if (review?.status === "pending") return { status: "pending_review" as const };
    if (review?.status === "rejected") throw new HttpError("duplicate_identity", REVIEW_MESSAGES.rejected);
    if (await store.getFaceTemplate(voter.id)) throw new HttpError("forbidden", "Ya existe una prueba de vida para este votante");
    const key = faceKey();
    const threshold = env.faceDedupeThresholdFor(input.descriptor.length);
    let matched = false;
    for (const tpl of await store.listFaceTemplates(voter.electionId)) {
      // Descriptores de otro modelo (otras dimensiones) no se pueden comparar: aceptarlos saltaría el dedupe.
      if (tpl.dims !== input.descriptor.length) {
        throw new HttpError("invalid_input", "El reconocimiento facial de tu teléfono está desactualizado. Recarga la página e intenta de nuevo.");
      }
      let other: number[];
      try {
        other = JSON.parse(open(key, tpl.sealed)) as number[];
      } catch {
        throw new HttpError("unavailable", "No se pudo abrir una plantilla (¿cambió FACE_KEY?)");
      }
      // Nunca se revela con quién coincide ni la similitud exacta.
      if (cosineSimilarity(other, input.descriptor) >= threshold) {
        matched = true;
        break;
      }
    }
    const now = new Date().toISOString();
    const sealed = seal(key, JSON.stringify(input.descriptor));
    if (matched) {
      // D-21: solo con identidad distinta verificable (credencial del evento distinta y no usada).
      const reviewable = voter.source === "badge" && election.eligibility?.method === "event-badge";
      if (!reviewable) throw new HttpError("duplicate_identity", REVIEW_MESSAGES.duplicate);
      const pending = (await store.listReviews(voter.electionId)).filter((r) => r.status === "pending").length;
      if (pending >= maxPendingReviews()) throw new HttpError("duplicate_identity", REVIEW_MESSAGES.full);
      opts.onNewReview?.();
      await store.putFaceTemplate({ voterId: voter.id, electionId: voter.electionId, dims: input.descriptor.length, sealed, createdAt: now, pending: true });
      await store.putReview({ reviewId: randomId("rv"), electionId: voter.electionId, voterId: voter.id, createdAt: now, reason: "face_match", status: "pending", decidedAt: null, decidedBy: null });
      return { status: "pending_review" as const };
    }
    const faceBindingHash = faceBindingHashOf(voter.electionId, voter.id, sealed);
    await store.putFaceTemplate({ voterId: voter.id, electionId: voter.electionId, dims: input.descriptor.length, sealed, createdAt: now });
    await store.putVoter({ ...voter, livenessPassedAt: now, faceBindingHash });
    const voteNonce = await issueVoteNonce(voter.id, voter.electionId);
    return FaceEnrollResult.parse({ ok: true, faceBindingHash, voteNonce });
  });
}

export async function verifyFace(input: z.infer<typeof FaceVerifyInput>): Promise<z.infer<typeof FaceVerifyResult>> {
  const store = await getStore();
  const voter = await requireVoter(input.voterId);
  if (voter.inviteToken !== input.inviteToken) throw new HttpError("forbidden", "inviteToken inválido");
  const template = await store.getFaceTemplate(voter.id);
  if (!template || template.pending) throw new HttpError("not_found", "No hay prueba de vida enrolada para este votante");
  const threshold = env.faceThresholdFor(input.descriptor.length);
  let stored: number[];
  try {
    stored = JSON.parse(open(faceKey(), template.sealed)) as number[];
  } catch {
    throw new HttpError("unavailable", "No se pudo abrir la plantilla (¿cambió FACE_KEY?)");
  }
  const similarity = cosineSimilarity(stored, input.descriptor);
  const ok = similarity >= threshold;
  let voteNonce: string | null = null;
  if (ok) {
    await store.putVoter({ ...voter, livenessPassedAt: new Date().toISOString() });
    voteNonce = await issueVoteNonce(voter.id, voter.electionId);
  }
  // A3: solo ok/no-ok; nunca la similitud ni el umbral (no sirve de oráculo para ajustar un descriptor).
  return FaceVerifyResult.parse({ ok, voteNonce, mode: "demo-liveness" });
}
