import { hashCanonical } from "./hash";
import { electionScope, groupRoot as computeRoot, MERKLE_TREE_DEPTH, SEMAPHORE_VERSION } from "./identity";
import { finalHash, type Hex32, type Ledger, type LedgerEntry, type Tally } from "./ledger";
import type { DrawResult, DrawRule } from "./draw";

export const AUDIT_PACKAGE_VERSION = "quorum-audit/1";
export const ADAPTER_VERSION = "0.1.0";

/** Manifiesto público de la elección. Se fija en `publish`; su hash es `manifestHash`. Sin PII. */
export type ElectionManifest = {
  electionId: string;
  title: string;
  kind: "yes-no" | "multiple" | "ranking" | "budget";
  options: { id: string; label: string }[];
  startsAt: string;
  endsAt: string;
  protocol: "semaphore-ledger";
  merkleTreeDepth: number;
  /** Etiqueta honesta: "fixture" | "simulación" | "real". */
  label?: string;
  /** Regla del sorteo verificable (D-12). Opcional; si está, entra en `manifestHash`. */
  drawRule?: DrawRule;
  /**
   * Hallazgo M1: quién puede anclar y dónde, fijado ANTES de votar. Aditivo y opcional; si está, entra en
   * `manifestHash`. El verificador exige que el evento `Anchored` venga de `registryAddress` con `organizer` igual.
   */
  anchorPolicy?: AnchorPolicy;
};

export type AnchorPolicy = {
  /** `quorum-registry`: `QuorumRegistry.anchor`; `calldata`: modo antiguo (tx del organizador a sí mismo). */
  kind: "quorum-registry" | "calldata";
  chainId: number;
  /** Dirección del QuorumRegistry (checksum EIP-55). Obligatoria con `quorum-registry`; ausente con `calldata`. */
  registryAddress?: string;
  /** Dirección del organizador (checksum EIP-55), la única que el contrato acepta en `anchor`. */
  organizer: string;
};

export type AnchorRef = {
  chainId: number;
  txHash?: Hex32;
  attestationUid?: Hex32;
  /** Presente si el ancla es una llamada a `QuorumRegistry.anchor` (si falta: modo antiguo, tx a sí mismo con calldata). */
  registryAddress?: string;
} | null;

export type AuditPackage = {
  version: typeof AUDIT_PACKAGE_VERSION;
  protocol: "semaphore-ledger";
  electionId: string;
  manifest: ElectionManifest;
  manifestHash: Hex32;
  scope: string;
  merkleTreeDepth: number;
  groupRoot: string;
  commitments: string[];
  ledger: LedgerEntry[];
  genesisHash: Hex32;
  tally: Tally;
  tallyHash: Hex32;
  finalHash: Hex32;
  anchor: AnchorRef;
  checksums: { manifest: Hex32; commitments: Hex32; ledger: Hex32; tally: Hex32 };
  versions: { adapter: string; semaphore: string; artifacts: string };
  generatedAt: string;
  /** Resultado del sorteo (fase `drawn`). El verificador lo recomputa (`draw_matches`). Fuera de `checksums` porque es derivable. */
  draw?: DrawResult;
};

export function manifestHash(manifest: ElectionManifest): Hex32 {
  return hashCanonical(manifest);
}

export function tallyHash(t: Tally): Hex32 {
  return hashCanonical(t);
}

/**
 * Construye el paquete público de auditoría. No incluye nada que ligue a una persona con su boleta:
 * solo commitments (sin nombres), pruebas (anónimas por construcción) y agregados.
 * `groupRoot` se recomputa aquí desde `commitments` y debe coincidir con el del ledger.
 */
export function buildAuditPackage(input: {
  electionId: string;
  manifest: ElectionManifest;
  commitments: readonly string[];
  ledger: Ledger;
  tally: Tally;
  anchor?: AnchorRef;
  generatedAt?: string;
  draw?: DrawResult;
}): AuditPackage {
  const { electionId, manifest, ledger } = input;
  if (manifest.electionId !== electionId) throw new Error("manifest.electionId != electionId");
  if (ledger.electionId !== electionId) throw new Error("ledger.electionId != electionId");
  const root = computeRoot(input.commitments);
  if (root !== ledger.groupRoot) throw new Error(`groupRoot from commitments (${root}) != ledger.groupRoot (${ledger.groupRoot})`);
  const commitments = [...input.commitments];
  const entries = ledger.entries.map((e) => ({ idx: e.idx, prevHash: e.prevHash, hash: e.hash, proof: e.proof }));
  const t: Tally = { counts: [...input.tally.counts], invalid: input.tally.invalid, total: input.tally.total };
  return {
    version: AUDIT_PACKAGE_VERSION,
    protocol: "semaphore-ledger",
    electionId,
    manifest,
    manifestHash: manifestHash(manifest),
    scope: electionScope(electionId),
    merkleTreeDepth: MERKLE_TREE_DEPTH,
    groupRoot: root,
    commitments,
    ledger: entries,
    genesisHash: ledger.genesisHash,
    tally: t,
    tallyHash: tallyHash(t),
    finalHash: finalHash(ledger),
    anchor: input.anchor ?? null,
    checksums: {
      manifest: hashCanonical(manifest),
      commitments: hashCanonical(commitments),
      ledger: hashCanonical(entries),
      tally: hashCanonical(t),
    },
    versions: { adapter: ADAPTER_VERSION, semaphore: SEMAPHORE_VERSION, artifacts: "snark-artifacts.pse.dev/semaphore/4.13.0" },
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    ...(input.draw ? { draw: { ...input.draw, winners: [...input.draw.winners] } } : {}),
  };
}
