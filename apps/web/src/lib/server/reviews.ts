/**
 * D-21 — revisión manual de duplicados faciales (decisión de producto de Jesús).
 *
 * Caso real: el gemelo idéntico de un votante ya inscrito, con su propia credencial del evento, fue rechazado por el
 * dedupe 1:N. Salida legítima y transparente: si el rostro coincide pero el votante entró con una credencial distinta
 * y no usada, queda "en revisión" (ver `enrollFace`) y el organizador, viendo a la persona y su credencial, decide:
 *  - aprobar → se completa el enrolamiento (la plantilla entra al conjunto del dedupe y el votante sigue solo:
 *    vinculación → "¡Listo!");
 *  - rechazar → se borra la plantilla; el votante ve "No pudimos verificar tu identidad. Habla con el organizador."
 * Solo en `registration`. Al abrir la votación (a mano o programada) las pendientes se rechazan solas.
 * El paquete de auditoría declara cuántas se aprobaron (`manualApprovals`, sin ids).
 *
 * Privacidad: nada de esto guarda ni devuelve con quién coincidió ni la similitud (hallazgo A3).
 */
import { FaceReviewStatus, ReviewsListResponse, ReviewSummary, type ReviewDecisionInput } from "@quorum/contracts";
import { enrollmentOpen, isContinuous, requireElection, requireVoter } from "./elections";
import { HttpError } from "./errors";
import { faceBindingHashOf, issueVoteNonce, maxPendingReviews } from "./face";
import { withLock } from "./lock";
import { getStore, type FaceReview, type ManualApprovals } from "./store";

function summaryOf(r: FaceReview, displayName: string): ReviewSummary {
  return ReviewSummary.parse({
    reviewId: r.reviewId,
    createdAt: r.createdAt,
    displayName,
    method: "event-badge",
    reason: r.reason,
    status: r.status,
    decidedAt: r.decidedAt,
    decidedBy: r.decidedBy,
  });
}

/** GET /api/elections/:id/reviews (organizador). Sin datos biométricos: hora, alias genérico, método y estado. */
export async function listReviews(electionId: string): Promise<ReviewsListResponse> {
  await requireElection(electionId);
  const store = await getStore();
  const reviews = await store.listReviews(electionId);
  const out: ReviewSummary[] = [];
  for (const r of reviews) {
    const v = await store.getVoter(r.voterId);
    out.push(summaryOf(r, v?.displayName ?? "Participante"));
  }
  return ReviewsListResponse.parse({
    reviews: out,
    pending: reviews.filter((r) => r.status === "pending").length,
    approved: reviews.filter((r) => r.status === "approved").length,
    maxPending: maxPendingReviews(),
  });
}

/**
 * POST /api/elections/:id/reviews/:reviewId { decision } (organizador). Locks `engine:` → `enroll:` (mismo orden que
 * `openElection`): no puede cruzarse con la apertura ni con un enrolamiento en curso.
 */
export async function decideReview(electionId: string, reviewId: string, input: ReviewDecisionInput): Promise<ReviewSummary> {
  return withLock(`engine:${electionId}`, () =>
    withLock(`enroll:${electionId}`, async () => {
      const store = await getStore();
      const e = await requireElection(electionId);
      const review = await store.getReview(reviewId);
      if (!review || review.electionId !== electionId) throw new HttpError("not_found", "Revisión no encontrada");
      if (!enrollmentOpen(e)) throw new HttpError("closed", "Las revisiones solo se deciden durante la inscripción", 409);
      if (review.status !== "pending") throw new HttpError("closed", "Esta revisión ya se decidió", 409);
      const voter = await requireVoter(review.voterId);
      const now = new Date().toISOString();
      if (input.decision === "approve") {
        const tpl = await store.getFaceTemplate(voter.id);
        if (!tpl) throw new HttpError("unavailable", "No se encontró la plantilla del caso");
        // Se completa el enrolamiento: la plantilla deja de estar en revisión (ya contaba para el dedupe).
        await store.putFaceTemplate({ ...tpl, pending: false });
        const faceBindingHash = faceBindingHashOf(electionId, voter.id, tpl.sealed);
        await store.putVoter({ ...voter, livenessPassedAt: now, faceBindingHash });
        await issueVoteNonce(voter.id, electionId);
      } else {
        await store.deleteFaceTemplate(voter.id);
      }
      const decided: FaceReview = { ...review, status: input.decision === "approve" ? "approved" : "rejected", decidedAt: now, decidedBy: "organizer" };
      await store.putReview(decided);
      return summaryOf(decided, voter.displayName);
    }),
  );
}

/**
 * Al congelar el padrón (`openElection`, bajo su lock): rechaza las pendientes y devuelve la declaración para el
 * paquete. `count` = aprobaciones manuales cuyo votante llegó al padrón (identidad inscrita). Sin ids.
 * Solo existe si la elección usa credencial del evento (único método donde aplica la revisión).
 */
export async function freezeReviews(electionId: string, method: string | undefined): Promise<{ autoRejected: number; manualApprovals: ManualApprovals | null }> {
  const store = await getStore();
  const reviews = await store.listReviews(electionId);
  const now = new Date().toISOString();
  let autoRejected = 0;
  let count = 0;
  for (const r of reviews) {
    if (r.status === "pending") {
      await store.putReview({ ...r, status: "rejected", decidedAt: now, decidedBy: "auto-open" });
      await store.deleteFaceTemplate(r.voterId);
      autoRejected += 1;
    } else if (r.status === "approved") {
      const v = await store.getVoter(r.voterId);
      if (v?.credentialIssuedAt) count += 1;
    }
  }
  return { autoRejected, manualApprovals: method === "event-badge" ? { count, method: "organizer-in-person" } : null };
}

/** Estado de la revisión de un votante (para la invitación y el polling). Pendiente fuera de inscripción = rechazada. */
export async function reviewStateOf(voterId: string, electionStatus: string, continuous = false): Promise<"pending" | "rejected" | null> {
  const r = await (await getStore()).getReviewByVoter(voterId);
  if (!r || r.status === "approved") return null;
  if (r.status === "pending" && electionStatus !== "registration" && !(continuous && electionStatus === "open")) return "rejected";
  return r.status;
}

/** POST /api/face/review { voterId, inviteToken } (votante, polling tras el 202). */
export async function reviewStatusForVoter(input: { voterId: string; inviteToken: string }): Promise<FaceReviewStatus> {
  const store = await getStore();
  const voter = await requireVoter(input.voterId);
  if (voter.inviteToken !== input.inviteToken) throw new HttpError("forbidden", "inviteToken inválido");
  const r = await store.getReviewByVoter(voter.id);
  if (!r) return { status: "none" };
  if (r.status === "approved") {
    return FaceReviewStatus.parse({ status: "approved", ...(voter.faceBindingHash ? { faceBindingHash: voter.faceBindingHash } : {}) });
  }
  const e = await requireElection(voter.electionId);
  return { status: (await reviewStateOf(voter.id, e.status, isContinuous(e))) === "pending" ? "pending_review" : "rejected" };
}
