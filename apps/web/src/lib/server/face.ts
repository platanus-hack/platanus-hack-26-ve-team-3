/**
 * Prueba de vida — modo demo (research/02 §B). El cliente calcula un descriptor (array de floats)
 * con un modelo local; el servidor NUNCA recibe ni guarda imágenes.
 *
 * El descriptor se guarda ofuscado con AES-256-GCM. Clave: `FACE_KEY` (hex de 64 chars o
 * cualquier string → sha256). Sin `FACE_KEY`, en dev se deriva de `DATA_DIR`: ESTO ES INSEGURO
 * para producción (la clave es adivinable) y solo existe para que la demo corra sin configuración.
 * En producción `FACE_KEY` es obligatoria (se lanza error si NODE_ENV=production y falta).
 */
import { FaceEnrollInput, FaceEnrollResult, FaceVerifyInput, FaceVerifyResult } from "@quorum/contracts";
import { keccak256, stringToBytes } from "viem";
import { z } from "zod";
import { canonicalJson, keyFromSecret, open, randomBytes32Hex, seal, sha256Hex, type SealedBlob } from "./crypto";
import { env, VOTE_NONCE_TTL_MS } from "./env";
import { HttpError } from "./errors";
import { withLock } from "./lock";
import { requireVoter } from "./elections";
import { getStore, type VoteNonce } from "./store";

function faceKey(): Buffer {
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
 * plantillas de la misma elección; si alguna supera `FACE_DEDUPE_THRESHOLD` → 409 `duplicate_identity`
 * y NO se guarda nada. Modo demo: descriptor de un modelo local, no es una garantía biométrica fuerte.
 */
export async function enrollFace(input: z.infer<typeof FaceEnrollInput>): Promise<z.infer<typeof FaceEnrollResult>> {
  const store = await getStore();
  const voter = await requireVoter(input.voterId);
  if (voter.inviteToken !== input.inviteToken) throw new HttpError("forbidden", "inviteToken inválido");
  const election = await store.getElection(voter.electionId);
  if (!election || election.status !== "registration") throw new HttpError("closed", "La elección no está en fase de inscripción");
  // Serializado por elección: el dedupe 1:N no puede tener carreras.
  return withLock(`enroll:${voter.electionId}`, async () => {
    if (await store.getFaceTemplate(voter.id)) throw new HttpError("forbidden", "Ya existe una prueba de vida para este votante");
    const key = faceKey();
    const threshold = env.faceDedupeThreshold;
    for (const tpl of await store.listFaceTemplates(voter.electionId)) {
      let other: number[];
      try {
        other = JSON.parse(open(key, tpl.sealed)) as number[];
      } catch {
        throw new HttpError("unavailable", "No se pudo abrir una plantilla (¿cambió FACE_KEY?)");
      }
      // Nunca se revela con quién coincide ni la similitud exacta.
      if (cosineSimilarity(other, input.descriptor) >= threshold) {
        throw new HttpError("duplicate_identity", "Este rostro ya está inscrito en esta votación");
      }
    }
    const now = new Date().toISOString();
    const sealed = seal(key, JSON.stringify(input.descriptor));
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
  if (!template) throw new HttpError("not_found", "No hay prueba de vida enrolada para este votante");
  const threshold = env.faceThreshold;
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
