import { Identity, Group } from "@semaphore-protocol/core";
import { keccakToField } from "./hash.js";

/** Profundidad del árbol con la que se compilaron los artefactos vendorizados (2^10 = 1024 votantes). */
export const MERKLE_TREE_DEPTH = 10;

/** Versión del motor subyacente, fijada en package.json. Se publica en el paquete de auditoría. */
export const SEMAPHORE_VERSION = "4.14.5";

export type VoterIdentity = {
  /** Clave privada Semaphore exportada (base64). Vive SOLO en el dispositivo del votante; nunca se envía al servidor. */
  privateKey: string;
  /** Compromiso público (Poseidon del punto público EdDSA). Es lo único que guarda el padrón. */
  commitment: string;
};

/** Crea una identidad Semaphore v4 nueva. En producto se ejecuta en el navegador del votante. */
export function createVoterIdentity(): VoterIdentity {
  const identity = new Identity();
  return { privateKey: identity.export(), commitment: identity.commitment.toString() };
}

/** Reconstruye la identidad a partir de la clave privada exportada. */
export function importIdentity(privateKey: string): Identity {
  return Identity.import(privateKey);
}

/** Construye el padrón anónimo (LeanIMT de Semaphore) a partir de los commitments publicados. El orden importa para la raíz. */
export function buildGroup(commitments: readonly string[]): Group {
  return new Group(commitments.map((c) => BigInt(c)));
}

/** Raíz del padrón como string decimal. Es la `merkleTreeRoot` que cada prueba debe referenciar. */
export function groupRoot(commitments: readonly string[]): string {
  return buildGroup(commitments).root.toString();
}

/**
 * Scope Semaphore de una elección: keccak256("quorum:<electionId>") >> 8, como string decimal.
 * Un nullifier = Poseidon(scope, secreto) ⇒ una credencial solo puede producir UNA prueba válida por elección.
 * Se deriva por hash porque Semaphore limita los scopes textuales a 31 bytes y los ids pueden ser más largos.
 */
export function electionScope(electionId: string): string {
  return keccakToField(`quorum:${electionId}`).toString();
}
