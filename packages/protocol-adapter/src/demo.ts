import { buildAuditPackage, type AuditPackage, type ElectionManifest } from "./audit-package.js";
import { defaultArtifacts, type SnarkArtifactPaths } from "./artifacts.js";
import { castBallot } from "./ballot.js";
import { createVoterIdentity, groupRoot, MERKLE_TREE_DEPTH } from "./identity.js";
import { appendBallot, createLedger, tally, type Ledger } from "./ledger.js";

/** Manifiesto de demo: elección ficticia de un condominio, opciones neutrales. Etiquetado como fixture. */
export function demoManifest(electionId = "fixture-condominio-2026"): ElectionManifest {
  return {
    electionId,
    title: "[fixture] Reparación del techo del edificio",
    kind: "multiple",
    options: [
      { id: "opt-a", label: "Reparar este trimestre" },
      { id: "opt-b", label: "Reparar el próximo trimestre" },
      { id: "opt-c", label: "Pedir nuevas cotizaciones" },
    ],
    startsAt: "2026-10-24T12:00:00.000Z",
    endsAt: "2026-10-24T13:00:00.000Z",
    protocol: "semaphore-ledger",
    merkleTreeDepth: MERKLE_TREE_DEPTH,
    label: "fixture",
  };
}

export type DemoElection = {
  manifest: ElectionManifest;
  voters: { privateKey: string; commitment: string }[];
  commitments: string[];
  ledger: Ledger;
  pkg: AuditPackage;
};

/**
 * Corre el flujo completo del Plan A con N votantes y las opciones dadas:
 * identidad → padrón → prueba → ledger (con validación) → recuento → paquete de auditoría.
 * Todo real (pruebas Groth16 de verdad), ~0,5 s por boleta en Node 22.
 */
export async function buildDemoElection(opts: { votes: number[]; electionId?: string; artifacts?: SnarkArtifactPaths; generatedAt?: string; voterCount?: number } ): Promise<DemoElection> {
  const manifest = demoManifest(opts.electionId);
  const artifacts = opts.artifacts ?? defaultArtifacts();
  const voterCount = opts.voterCount ?? opts.votes.length;
  const voters = Array.from({ length: voterCount }, () => createVoterIdentity());
  const commitments = voters.map((v) => v.commitment);
  const root = groupRoot(commitments);
  const ledger = createLedger(manifest.electionId, root);
  for (let i = 0; i < opts.votes.length; i++) {
    const proof = await castBallot(voters[i].privateKey, commitments, manifest.electionId, opts.votes[i], artifacts);
    await appendBallot(ledger, proof, root);
  }
  const t = tally(ledger, manifest.options.length);
  const pkg = buildAuditPackage({ electionId: manifest.electionId, manifest, commitments, ledger, tally: t, generatedAt: opts.generatedAt });
  return { manifest, voters, commitments, ledger, pkg };
}
