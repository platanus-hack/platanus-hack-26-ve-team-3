/**
 * @quorum/verifier — verificador independiente. Uso desde el backend:
 *   import { verifyPackage } from "@quorum/verifier";
 *   const result = await verifyPackage(pkg, { anchorRpcUrl: process.env.BASE_SEPOLIA_RPC });
 * Nunca importa apps/web ni lee la DB: solo el paquete de auditoría público.
 */
export { verifyPackage, AuditPackageSchema, VERIFIER_VERSION, canonicalJson, hashCanonical, expectedScope, decodeAnchorCalldata, recomputeDraw, viemAnchorReader, decodeAnchoredEvents, electionIdBytes32, ANCHORED_EVENT_ABI, type AuditPackage, type CheckStatus, type AnchorLog, type VerifyOptions, type AnchorReader, type AnchorRead } from "./verify";
export type { AuditResult } from "@quorum/contracts";
