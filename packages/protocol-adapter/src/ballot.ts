import { generateProof, verifyProof, type SemaphoreProof } from "@semaphore-protocol/core";
import { buildGroup, electionScope, importIdentity, MERKLE_TREE_DEPTH } from "./identity";
import type { SnarkArtifactPaths } from "./artifacts";

export type { SemaphoreProof };

/**
 * Emite una boleta: prueba Semaphore de que una identidad del padrón vota `optionIndex` en `electionId`.
 * - `message` = optionIndex (número; Semaphore lo guarda como string decimal y lo hashea para el circuito).
 * - `scope` = electionScope(electionId) ⇒ nullifier único por credencial y elección.
 * - `merkleTreeDepth` fijo en 10 para usar los artefactos vendorizados aunque el grupo sea pequeño.
 * El contenido del voto (optionIndex) viaja en claro dentro de la prueba: el servidor lo ve. No hay secreto de contenido.
 */
export async function castBallot(
  identityExport: string,
  commitments: readonly string[],
  electionId: string,
  optionIndex: number,
  artifacts: SnarkArtifactPaths,
): Promise<SemaphoreProof> {
  if (!Number.isInteger(optionIndex) || optionIndex < 0) throw new RangeError("optionIndex must be a non-negative integer");
  const identity = importIdentity(identityExport);
  const group = buildGroup(commitments);
  if (group.indexOf(identity.commitment) === -1) throw new Error("NOT_IN_GROUP: identity commitment is not in the electoral roll");
  return generateProof(identity, group, optionIndex, electionScope(electionId), MERKLE_TREE_DEPTH, artifacts);
}

/** Reexport del verificador oficial de Semaphore (claves de verificación embebidas; no necesita artefactos). */
export { verifyProof };
