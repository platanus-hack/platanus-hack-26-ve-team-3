import { z } from "zod";
import { ElectionKind, Protocol } from "@quorum/contracts";
import { canonicalize, digestOf, sha256Hex } from "./canonical";
import { DEMO_ELECTION_ID, demoCastOptions, demoElection, demoVoters, FIXTURE_LABEL } from "./election";

/**
 * Forma del paquete de auditoría público (docs/API_CONTRACT.md, GET /api/elections/:id/artifacts):
 * { manifest, ballots: [{ inclusionId, commitment }], result: { counts }, versions, checksums }
 * más una etiqueta `fixture` obligatoria en estos archivos de demostración.
 * Sin PII: no hay nombres, teléfonos, wallets ni opción ligada a elector.
 */
export const AuditManifest = z.object({
  electionId: z.string(),
  title: z.string().min(3).max(160),
  kind: ElectionKind,
  protocol: Protocol,
  options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2).max(10),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  eligibilityIssuerId: z.string(),
  eligibleCount: z.number().int().min(0),
  manifestHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
});

export const AuditBallot = z.object({
  inclusionId: z.string().regex(/^inc_[0-9a-f]{16}$/),
  commitment: z.string().regex(/^0x[0-9a-f]{64}$/),
});

export const AuditResultSection = z.object({
  counts: z.record(z.string(), z.number().int().min(0)),
  totalVotes: z.number().int().min(0),
  proof: z.object({
    type: z.literal("integrity-demo/sha256"),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  }),
});

export const AuditPackage = z.object({
  fixture: z.object({
    label: z.literal(FIXTURE_LABEL),
    note: z.string(),
    tamper: z.object({ kind: z.string(), description: z.string() }).nullable(),
  }),
  manifest: AuditManifest,
  ballots: z.array(AuditBallot),
  result: AuditResultSection,
  versions: z.object({ packageFormat: z.string(), protocol: Protocol, engine: z.string(), generator: z.string() }),
  checksums: z.object({ algorithm: z.literal("sha256"), manifest: z.string(), ballots: z.string(), result: z.string() }),
});
export type AuditPackage = z.infer<typeof AuditPackage>;

const NOTE =
  "FIXTURE de demostración. Elección y votantes ficticios. Los commitments son hashes de demo con sal fija; no afirman privacidad ni anonimato.";

/** Digest de la prueba de integridad (demo): liga la lista de commitments con los conteos. */
export function computeProofDigest(ballots: { commitment: string }[], counts: Record<string, number>): string {
  return digestOf({ commitments: ballots.map((b) => b.commitment), counts });
}

export function computeManifestHash(manifest: Omit<z.infer<typeof AuditManifest>, "manifestHash">): string {
  return digestOf(manifest);
}

/** Construye el paquete íntegro de forma determinista (mismo input → mismos bytes). */
export function buildSamplePackage(): AuditPackage {
  const manifestBody = {
    electionId: DEMO_ELECTION_ID,
    title: demoElection.title,
    kind: demoElection.kind,
    protocol: demoElection.protocol,
    options: demoElection.options,
    startsAt: demoElection.startsAt,
    endsAt: demoElection.endsAt,
    eligibilityIssuerId: demoElection.eligibilityIssuerId,
    eligibleCount: demoVoters.length,
  };
  const manifest = { ...manifestBody, manifestHash: computeManifestHash(manifestBody) };

  const ballots = demoCastOptions.map((optionId, i) => {
    // Sal fija y pública: es un FIXTURE, no un esquema de compromiso que oculte la opción.
    const commitment = "0x" + sha256Hex(`${DEMO_ELECTION_ID}|${optionId}|fixture-salt-${i + 1}`);
    const inclusionId = "inc_" + sha256Hex(`${DEMO_ELECTION_ID}|inclusion|${commitment}`).slice(0, 16);
    return { inclusionId, commitment };
  });

  const counts: Record<string, number> = Object.fromEntries(demoElection.options.map((o) => [o.id, 0]));
  for (const optionId of demoCastOptions) counts[optionId] = (counts[optionId] ?? 0) + 1;

  const result = {
    counts,
    totalVotes: ballots.length,
    proof: { type: "integrity-demo/sha256" as const, digest: computeProofDigest(ballots, counts) },
  };

  const pkg: AuditPackage = {
    fixture: { label: FIXTURE_LABEL, note: NOTE, tamper: null },
    manifest,
    ballots,
    result,
    versions: {
      packageFormat: "quorum-audit-package/0",
      protocol: "integrity-demo",
      engine: "integrity-demo-fixture/0 (stub hasta ADR-001)",
      generator: "@quorum/demo-fixtures/0.0.1",
    },
    checksums: { algorithm: "sha256", manifest: digestOf(manifest), ballots: digestOf(ballots), result: digestOf(result) },
  };
  return AuditPackage.parse(pkg);
}

export type IntegrityCheck = { name: string; passed: boolean; reason?: string };
export type IntegrityReport = { valid: boolean; checks: IntegrityCheck[] };

const PII_KEYS = ["displayName", "phoneE164", "phone", "voterId", "walletAddress", "cedula", "descriptor"];

/**
 * ORÁCULO DE PRUEBAS, no el verificador del producto.
 * Recalcula hashes y consistencia interna de un paquete para demostrar que los fixtures
 * adulterados realmente difieren del íntegro. `apps/verifier` (crypto+QA) es el verificador
 * independiente real; cuando exista, los tests deben correr también contra él.
 */
export function checkIntegrity(input: unknown): IntegrityReport {
  const checks: IntegrityCheck[] = [];
  const parsed = AuditPackage.safeParse(input);
  checks.push({ name: "schema", passed: parsed.success, reason: parsed.success ? undefined : parsed.error.issues[0]?.message });
  if (!parsed.success) return { valid: false, checks };
  const pkg = parsed.data;

  const { manifestHash, ...manifestBody } = pkg.manifest;
  const expectedManifestHash = computeManifestHash(manifestBody);
  checks.push({
    name: "manifest_hash",
    passed: manifestHash === expectedManifestHash,
    reason: manifestHash === expectedManifestHash ? undefined : `manifestHash ${manifestHash} ≠ recalculado ${expectedManifestHash}`,
  });

  for (const section of ["manifest", "ballots", "result"] as const) {
    const expected = digestOf(pkg[section]);
    const actual = pkg.checksums[section];
    checks.push({ name: `checksum_${section}`, passed: actual === expected, reason: actual === expected ? undefined : `checksums.${section} no coincide con el contenido` });
  }

  const ids = new Set(pkg.ballots.map((b) => b.inclusionId));
  checks.push({ name: "unique_inclusion_ids", passed: ids.size === pkg.ballots.length, reason: ids.size === pkg.ballots.length ? undefined : "inclusionId duplicado" });

  const sum = Object.values(pkg.result.counts).reduce((a, b) => a + b, 0);
  const totalsOk = sum === pkg.ballots.length && pkg.result.totalVotes === pkg.ballots.length;
  checks.push({
    name: "total_matches_ballots",
    passed: totalsOk,
    reason: totalsOk ? undefined : `discrepancia: suma de conteos ${sum}, totalVotes ${pkg.result.totalVotes}, boletas incluidas ${pkg.ballots.length}`,
  });

  const optionIds = new Set(pkg.manifest.options.map((o) => o.id));
  const unknownOption = Object.keys(pkg.result.counts).find((id) => !optionIds.has(id));
  checks.push({ name: "counts_match_options", passed: !unknownOption, reason: unknownOption ? `conteo para opción desconocida ${unknownOption}` : undefined });

  const expectedProof = computeProofDigest(pkg.ballots, pkg.result.counts);
  checks.push({
    name: "proof",
    passed: pkg.result.proof.digest === expectedProof,
    reason: pkg.result.proof.digest === expectedProof ? undefined : "la prueba de integridad no verifica contra boletas + conteos",
  });

  const serialized = canonicalize(input);
  const leakedKey = PII_KEYS.find((k) => serialized.includes(`"${k}"`));
  checks.push({ name: "no_pii", passed: !leakedKey, reason: leakedKey ? `campo de PII presente: ${leakedKey}` : undefined });

  return { valid: checks.every((c) => c.passed), checks };
}

export type TamperKind = "tampered_total" | "removed_record" | "wrong_manifest" | "tampered_proof";
export const TAMPER_KINDS: TamperKind[] = ["tampered_total", "removed_record", "wrong_manifest", "tampered_proof"];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function flipLastHexChar(digest: string): string {
  const last = digest.at(-1)!;
  const replacement = last === "0" ? "1" : "0";
  return digest.slice(0, -1) + replacement;
}

/**
 * Genera una copia adulterada del paquete íntegro. Cada copia conserva los checksums y la
 * prueba ORIGINALES (como haría alguien que edita el JSON publicado) y queda etiquetada
 * `fixture.tamper` para que nunca se confunda con un paquete auténtico.
 */
export function makeTampered(sample: AuditPackage, kind: TamperKind): AuditPackage {
  const pkg = clone(sample);
  switch (kind) {
    case "tampered_total": {
      const firstOption = pkg.manifest.options[0]!.id;
      pkg.result.counts[firstOption] = (pkg.result.counts[firstOption] ?? 0) + 1;
      pkg.result.totalVotes += 1;
      pkg.fixture.tamper = { kind, description: `Se sumó 1 voto a '${firstOption}' sin boleta que lo respalde; checksums originales.` };
      break;
    }
    case "removed_record": {
      const removed = pkg.ballots.splice(2, 1)[0]!;
      pkg.fixture.tamper = { kind, description: `Se eliminó la boleta ${removed.inclusionId}; conteos, prueba y checksums originales.` };
      break;
    }
    case "wrong_manifest": {
      pkg.manifest.title = "Condominio Los Samanes — aprobación del presupuesto 2027";
      pkg.manifest.options[0]!.label = "Sábado 7 de marzo, 9:00 a. m.";
      pkg.fixture.tamper = { kind, description: "Se cambió título y una opción del manifiesto; manifestHash y checksums originales." };
      break;
    }
    case "tampered_proof": {
      pkg.result.proof.digest = flipLastHexChar(pkg.result.proof.digest);
      pkg.fixture.tamper = { kind, description: "Se alteró un carácter del digest de la prueba; boletas y conteos originales." };
      break;
    }
  }
  return pkg;
}
