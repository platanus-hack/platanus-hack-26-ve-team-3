import { AuditResult, Protocol } from "@quorum/contracts";
import { z } from "zod";
import { canonicalJson, sha256Hex } from "@/lib/server/crypto";
import { json, parseBody, route } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/ratelimit";

const Input = z.object({ package: z.record(z.string(), z.unknown()) });

/**
 * POST /api/audit/verify → AuditResult.
 * Hasta que `apps/verifier` exista y se integre, devuelve `valid:false` con
 * `unsupportedGuarantees: ["verifier-not-integrated"]`. Nunca se finge una verificación
 * (regla dura 2: VERIFIED nunca sale de un booleano de nuestra DB).
 */
export const POST = route(async (req) => {
  rateLimit(req, "audit:verify", 30);
  const { package: pkg } = await parseBody(req, Input);
  const protocol = Protocol.safeParse(pkg.protocol);
  const result = AuditResult.parse({
    electionId: typeof pkg.electionId === "string" ? pkg.electionId : "unknown",
    verifierVersion: "not-integrated",
    protocol: protocol.success ? protocol.data : "integrity-demo",
    inputArtifactDigest: sha256Hex(canonicalJson(pkg)),
    checkedAt: new Date().toISOString(),
    valid: false,
    checks: [
      { name: "package-parsed", passed: true },
      { name: "independent-verifier", passed: false, reason: "apps/verifier aún no integrado; resultado no verificable" },
    ],
    unsupportedGuarantees: ["verifier-not-integrated"],
  });
  return json(result);
});
