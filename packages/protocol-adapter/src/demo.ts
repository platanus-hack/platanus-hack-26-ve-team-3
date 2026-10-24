import { buildAuditPackage, type AuditPackage, type ElectionManifest } from "./audit-package";
import { defaultArtifacts, type SnarkArtifactPaths } from "./artifacts";
import { castBallot } from "./ballot";
import { createVoterIdentity, groupRoot, MERKLE_TREE_DEPTH } from "./identity";
import { appendBallot, appendMember, createContinuousLedger, createLedger, LedgerRejection, memberCommitments, tally, type Ledger } from "./ledger";

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

/** Paso de una demo en modo continuo: alguien se inscribe, o el votante `voter` vota `option` (opcionalmente con la raíz de cuando el grupo tenía `rootOfSize` miembros). */
export type ContinuousStep = "join" | { vote: number; option: number; rootOfSize?: number };

export type ContinuousDemoElection = DemoElection & { rejections: { step: number; code: string }[] };

/**
 * Modo continuo (D-22) de punta a punta con pruebas reales: el grupo crece con cada `join` (member_added en la cadena)
 * y las boletas entran intercaladas, cada una contra la raíz vigente (o una anterior dentro de la ventana).
 * Las boletas que el ledger rechaza (K no alcanzado, raíz fuera de ventana…) se anotan en `rejections`, no lanzan.
 */
export async function buildContinuousDemoElection(opts: {
  steps: ContinuousStep[];
  electionId?: string;
  minAnonymitySet?: number;
  rootWindow?: number;
  artifacts?: SnarkArtifactPaths;
  generatedAt?: string;
}): Promise<ContinuousDemoElection> {
  const ledger = createContinuousLedger(opts.electionId ?? "fixture-continuo-2026", { minAnonymitySet: opts.minAnonymitySet, rootWindow: opts.rootWindow });
  const manifest: ElectionManifest = { ...demoManifest(ledger.electionId), title: "[fixture] Votación en vivo (modo continuo)", enrollment: ledger.enrollment };
  const artifacts = opts.artifacts ?? defaultArtifacts();
  const voters: { privateKey: string; commitment: string }[] = [];
  const rejections: { step: number; code: string }[] = [];
  for (let i = 0; i < opts.steps.length; i++) {
    const step = opts.steps[i];
    if (step === "join") {
      const v = createVoterIdentity();
      voters.push(v);
      appendMember(ledger, v.commitment);
      continue;
    }
    const members = memberCommitments(ledger);
    const view = members.slice(0, step.rootOfSize ?? members.length);
    const proof = await castBallot(voters[step.vote].privateKey, view, ledger.electionId, step.option, artifacts);
    try {
      await appendBallot(ledger, proof, ledger.groupRoot, { optionCount: manifest.options.length });
    } catch (err) {
      if (err instanceof LedgerRejection) rejections.push({ step: i, code: err.code });
      else throw err;
    }
  }
  const commitments = memberCommitments(ledger);
  const t = tally(ledger, manifest.options.length);
  const pkg = buildAuditPackage({ electionId: ledger.electionId, manifest, commitments, ledger, tally: t, generatedAt: opts.generatedAt });
  return { manifest, voters, commitments, ledger, pkg, rejections };
}
