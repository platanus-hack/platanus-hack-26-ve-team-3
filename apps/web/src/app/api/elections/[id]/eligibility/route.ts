import { EligibilityInput, Election } from "@quorum/contracts";
import { requireOrganizer } from "@/lib/server/auth";
import { updateEligibility } from "@/lib/server/badge";
import { json, parseBody, route } from "@/lib/server/errors";

/**
 * PUT /api/elections/:id/eligibility (organizador) `{ method, badgeUrlPrefix?, badgeCheck?, badgeAllowlist? }` → Election.
 * Solo en draft/registration y antes de que entre nadie por la sala (409 `closed`). `method:"list"` → 400 (próximamente).
 * La lista de usuarios se guarda solo como HMAC; la respuesta trae `eligibility.allowlistCount`, nunca los usuarios.
 */
export const PUT = route<{ id: string }>(async (req, { id }) => {
  await requireOrganizer(req, id);
  const input = await parseBody(req, EligibilityInput);
  return json(Election.parse(await updateEligibility(id, input)));
});
