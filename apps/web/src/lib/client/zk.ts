/**
 * Puente del navegador hacia el motor (Plan A, ADR-001). NO implementa criptografía: llama a
 * `@quorum/protocol-adapter` (Semaphore v4 vía @semaphore-protocol/core) y a `@quorum/verifier` (`verifyPackage`).
 * Ambos se cargan con `import()` dinámico para no inflar el bundle inicial (snarkjs + WASM ≈ cientos de KB).
 * Artefactos Groth16 en `/zk/semaphore-10.{wasm,zkey}` (SHA-256 registrados en el adaptador; ver test).
 */
import { SemaphoreProofSchema, type AuditResult, type SemaphoreProofInput } from "@quorum/contracts";

export type BrowserIdentity = { privateKey: string; commitment: string };

export async function createBrowserIdentity(): Promise<BrowserIdentity> {
  const { createVoterIdentity } = await import("@quorum/protocol-adapter");
  return createVoterIdentity();
}

export type ProofResult = { proof: SemaphoreProofInput; nullifier: string; message: string; ms: number };

/** Genera la prueba de pertenencia al padrón para `optionIndex`. Lanza `NOT_IN_GROUP` si el commitment no está en el padrón. */
export async function proveBallot(args: { privateKey: string; commitments: string[]; electionId: string; optionIndex: number; artifactsBase?: string }): Promise<ProofResult> {
  const t0 = performance.now();
  const { castBallot, browserArtifacts } = await import("@quorum/protocol-adapter");
  const raw = await castBallot(args.privateKey, args.commitments, args.electionId, args.optionIndex, browserArtifacts(args.artifactsBase ?? "/zk"));
  // Misma validación que el servidor (decimales canónicos < campo BN254): falla aquí antes de enviar algo inválido.
  const proof = SemaphoreProofSchema.parse(raw);
  return { proof, nullifier: String(proof.nullifier), message: String(proof.message), ms: Math.round(performance.now() - t0) };
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type BrowserVerification =
  | { ok: true; result: AuditResult; inputDigest: string; ms: number; runtime: "navegador" }
  | { ok: false; error: string; inputDigest: string | null; ms: number; runtime: "navegador" };

/**
 * Ejecuta el verificador independiente EN ESTE NAVEGADOR sobre los bytes exactos del paquete.
 * El hash de entrada es SHA-256 de esos bytes (mismo formato `sha256:<hex>` que usa `/api/audit/verify`).
 * Con `anchorRpcUrl` (RPC público de Base Sepolia, `NEXT_PUBLIC_BASE_SEPOLIA_RPC`) también lee el ancla; sin él,
 * `anchor_matches` queda "no evaluado" y así se muestra.
 * Nunca devuelve "verificado" por sí mismo: devuelve el `AuditResult` íntegro o el error.
 */
export async function verifyPackageInBrowser(bytes: Uint8Array, opts: { anchorRpcUrl?: string } = {}): Promise<BrowserVerification> {
  const t0 = performance.now();
  let inputDigest: string | null = null;
  try {
    inputDigest = `sha256:${await sha256Bytes(bytes)}`;
    let pkg: unknown;
    try {
      pkg = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return { ok: false, error: "El paquete descargado no es JSON válido.", inputDigest, ms: Math.round(performance.now() - t0), runtime: "navegador" };
    }
    const { verifyPackage } = await import("@quorum/verifier");
    const result = await verifyPackage(pkg, { inputArtifactDigest: inputDigest, anchorRpcUrl: opts.anchorRpcUrl });
    return { ok: true, result, inputDigest, ms: Math.round(performance.now() - t0), runtime: "navegador" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), inputDigest, ms: Math.round(performance.now() - t0), runtime: "navegador" };
  }
}

/** RPC público opcional para leer el ancla desde el navegador. Sin él, el ancla queda "no evaluado". */
export const publicAnchorRpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC?.trim() || undefined;
