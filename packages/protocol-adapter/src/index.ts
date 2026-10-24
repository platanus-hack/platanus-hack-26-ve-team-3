/**
 * @quorum/protocol-adapter — Plan A del ADR-001: Semaphore v4 + ledger hash-encadenado + ancla en Base Sepolia.
 * No implementa primitivas criptográficas: identidad, grupo, prueba y verificación son de @semaphore-protocol/core 4.14.5.
 *
 * Garantiza (y el verificador lo comprueba): elegibilidad sin identificar (prueba de pertenencia al padrón),
 * unicidad (un nullifier por credencial y elección), integridad del registro (cadena SHA-256), recuento
 * reproducible y, si se ancla, inmutabilidad del total publicado.
 * NO garantiza: secreto del contenido frente al servidor (la opción va en claro dentro de la prueba),
 * resistencia a coacción, validez 0/1 de boletas cifradas (no hay cifrado), identidad civil de los votantes.
 */
export { canonicalJson, hashCanonical, sha256Utf8, keccakToField } from "./hash.js";
export { createVoterIdentity, importIdentity, buildGroup, groupRoot, electionScope, MERKLE_TREE_DEPTH, SEMAPHORE_VERSION, type VoterIdentity } from "./identity.js";
export { defaultArtifacts, browserArtifacts, ARTIFACT_FILES, ARTIFACT_SHA256, type SnarkArtifactPaths } from "./artifacts.js";
export { castBallot, verifyProof, type SemaphoreProof } from "./ballot.js";
export { buildDemoElection, demoManifest, type DemoElection } from "./demo.js";
export { createLedger, appendBallot, finalHash, tally, genesisHash, entryHash, rechain, LedgerRejection, type Ledger, type LedgerEntry, type LedgerRejectionCode, type Tally, type Hex32 } from "./ledger.js";
export { buildAuditPackage, manifestHash, tallyHash, AUDIT_PACKAGE_VERSION, ADAPTER_VERSION, type AuditPackage, type ElectionManifest, type AnchorRef } from "./audit-package.js";
export {
  anchorOnBaseSepolia,
  readAnchor,
  encodeAnchorCalldata,
  decodeAnchorCalldata,
  viemTransport,
  attestAnchorOnEas,
  readEasAttestation,
  encodeEasAttestCalldata,
  decodeEasAttestCalldata,
  encodeRegisterAnchorSchemaCalldata,
  BASE_SEPOLIA_CHAIN_ID,
  EAS_BASE_SEPOLIA,
  EAS_SCHEMA_REGISTRY_BASE_SEPOLIA,
  ANCHOR_EAS_SCHEMA,
  EAS_ABI,
  type AnchorPayload,
  type AnchorTransport,
  type AnchorResult,
  type ReadAnchorResult,
  type EasAttestResult,
} from "./anchor.js";
