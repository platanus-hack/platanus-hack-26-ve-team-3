import { describe, expect, it } from "vitest";
import { Aggregates, CreateElectionInput, Election, Voter } from "@quorum/contracts";
import {
  AuditPackage,
  buildSamplePackage,
  checkIntegrity,
  computeProofDigest,
  demoCastOptions,
  digestOf,
  demoElection,
  demoElectionInput,
  demoVoters,
  loadSamplePackage,
  loadTamperedPackage,
  makeTampered,
  TAMPER_KINDS,
  type TamperKind,
} from "../index";

describe("Elección y votantes ficticios", () => {
  it("la elección demo cumple Election y CreateElectionInput", () => {
    expect(Election.safeParse(demoElection).success).toBe(true);
    expect(CreateElectionInput.safeParse(demoElectionInput).success).toBe(true);
  });

  it("tiene exactamente 3 opciones neutrales (fechas) y está etiquetada como ficticia", () => {
    expect(demoElection.options).toHaveLength(3);
    expect(demoElection.title).toContain("Condominio Los Samanes");
    expect(demoElection.description.toLowerCase()).toContain("ficticia");
  });

  it("los 6 votantes cumplen Voter y usan teléfonos del bloque ficticio 555-01XX", () => {
    expect(demoVoters).toHaveLength(6);
    for (const v of demoVoters) {
      expect(Voter.safeParse(v).success).toBe(true);
      expect(v.phoneE164).toMatch(/^\+1555010\d{3}$/);
      expect(v.displayName).toContain("(ficticio)");
    }
    expect(new Set(demoVoters.map((v) => v.inviteToken)).size).toBe(6);
  });

  it("las opciones emitidas no están ligadas a ningún votante", () => {
    expect(demoCastOptions).toHaveLength(5);
    for (const o of demoCastOptions) expect(demoElection.options.map((x) => x.id)).toContain(o);
  });
});

describe("Paquete de auditoría íntegro (audit-package.sample.json)", () => {
  const onDisk = loadSamplePackage();

  it("coincide byte a byte con lo que genera buildSamplePackage() (determinismo)", () => {
    expect(onDisk).toEqual(buildSamplePackage());
  });

  it("tiene la forma {manifest, ballots[{inclusionId, commitment}], result{counts}, versions, checksums}", () => {
    expect(AuditPackage.safeParse(onDisk).success).toBe(true);
    expect(Object.keys(onDisk).sort()).toEqual(["ballots", "checksums", "fixture", "manifest", "result", "versions"]);
    expect(onDisk.ballots[0]).toEqual({ inclusionId: expect.stringMatching(/^inc_/), commitment: expect.stringMatching(/^0x/) });
  });

  it("está etiquetado como fixture sin adulteración", () => {
    expect(onDisk.fixture.label).toBe("fixture");
    expect(onDisk.fixture.tamper).toBeNull();
  });

  it("pasa todas las comprobaciones del oráculo de integridad", () => {
    const report = checkIntegrity(onDisk);
    expect(report.checks.filter((c) => !c.passed)).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("los conteos suman las boletas incluidas (5 de 6 elegibles)", () => {
    const sum = Object.values(onDisk.result.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(onDisk.ballots.length);
    expect(onDisk.result.totalVotes).toBe(5);
    expect(onDisk.manifest.eligibleCount).toBe(6);
  });

  it("no contiene PII: ni nombres, ni teléfonos, ni tokens, ni opción ligada a elector (spec §9.8)", () => {
    const text = JSON.stringify(onDisk);
    for (const v of demoVoters) {
      expect(text).not.toContain(v.displayName);
      expect(text).not.toContain(v.phoneE164!);
      expect(text).not.toContain(v.inviteToken);
      expect(text).not.toContain(v.id);
    }
    for (const key of ["voterId", "displayName", "phoneE164", "walletAddress", "choice"]) {
      expect(text).not.toContain(`"${key}"`);
    }
  });

  it("se puede derivar un Aggregates válido del paquete (solo agregados)", () => {
    const totalVotes = onDisk.result.totalVotes;
    const leading = Math.max(...Object.values(onDisk.result.counts));
    const aggregates = {
      electionId: onDisk.manifest.electionId,
      turnout: totalVotes / onDisk.manifest.eligibleCount,
      totalVotes,
      eligible: onDisk.manifest.eligibleCount,
      leadingShare: totalVotes ? leading / totalVotes : null,
      closesAt: onDisk.manifest.endsAt,
      status: "auditable",
      options: onDisk.manifest.options.map((o) => ({ ...o, count: totalVotes < 5 ? null : (onDisk.result.counts[o.id] ?? 0) })),
    };
    expect(Aggregates.safeParse(aggregates).success).toBe(true);
  });
});

describe("Copias adulteradas (fixtures/tampered/*.json) — casos adversariales spec §9", () => {
  const sample = loadSamplePackage();

  const expectedFailingCheck: Record<TamperKind, string> = {
    tampered_total: "total_matches_ballots",
    removed_record: "checksum_ballots",
    wrong_manifest: "manifest_hash",
    tampered_proof: "proof",
  };

  it.each(TAMPER_KINDS)("%s: el archivo en disco coincide con makeTampered() (determinismo)", (kind) => {
    expect(loadTamperedPackage(kind)).toEqual(makeTampered(sample, kind));
  });

  it.each(TAMPER_KINDS)("%s: está etiquetado fixture + tamper y difiere del íntegro", (kind) => {
    const pkg = AuditPackage.parse(loadTamperedPackage(kind));
    expect(pkg.fixture.label).toBe("fixture");
    expect(pkg.fixture.tamper?.kind).toBe(kind);
    expect(JSON.stringify({ ...pkg, fixture: null })).not.toEqual(JSON.stringify({ ...sample, fixture: null }));
  });

  it.each(TAMPER_KINDS)("%s: el oráculo lo rechaza (valid=false) con la causa esperada", (kind) => {
    const report = checkIntegrity(loadTamperedPackage(kind));
    expect(report.valid).toBe(false);
    const failing = report.checks.filter((c) => !c.passed);
    expect(failing.map((c) => c.name)).toContain(expectedFailingCheck[kind]);
    for (const c of failing) expect(c.reason).toBeTruthy();
  });

  it("tampered_total: la causa es discrepancia entre conteos y boletas", () => {
    const report = checkIntegrity(loadTamperedPackage("tampered_total"));
    const check = report.checks.find((c) => c.name === "total_matches_ballots")!;
    expect(check.passed).toBe(false);
    expect(check.reason).toContain("discrepancia");
  });

  it("tampered_proof: la causa es que la prueba no verifica (boletas y conteos intactos)", () => {
    const report = checkIntegrity(loadTamperedPackage("tampered_proof"));
    expect(report.checks.find((c) => c.name === "proof")!.passed).toBe(false);
    expect(report.checks.find((c) => c.name === "checksum_ballots")!.passed).toBe(true);
    expect(report.checks.find((c) => c.name === "total_matches_ballots")!.passed).toBe(true);
  });

  it("wrong_manifest: el manifestHash no corresponde al contenido", () => {
    const report = checkIntegrity(loadTamperedPackage("wrong_manifest"));
    expect(report.checks.find((c) => c.name === "manifest_hash")!.passed).toBe(false);
    expect(report.checks.find((c) => c.name === "checksum_manifest")!.passed).toBe(false);
  });

  it("removed_record: se detecta contra la COPIA (checksum de boletas); la completitud frente al motor real no está demostrada", () => {
    const report = checkIntegrity(loadTamperedPackage("removed_record"));
    expect(report.checks.find((c) => c.name === "checksum_ballots")!.passed).toBe(false);
    expect(report.checks.find((c) => c.name === "total_matches_ballots")!.passed).toBe(false);
    // LÍMITE DOCUMENTADO (spec §9.3): si quien publica borra la boleta ANTES de firmar checksums y prueba,
    // el protocolo integrity-demo no puede demostrar completitud. El oráculo acepta el paquete recomputado:
    const rebuilt = makeTampered(sample, "removed_record");
    rebuilt.result.counts[demoCastOptions[2]!] -= 1;
    rebuilt.result.totalVotes -= 1;
    rebuilt.result.proof.digest = computeProofDigest(rebuilt.ballots, rebuilt.result.counts);
    rebuilt.checksums.ballots = digestOf(rebuilt.ballots);
    rebuilt.checksums.result = digestOf(rebuilt.result);
    expect(checkIntegrity(rebuilt).valid, "cobertura no demostrada: omisión previa a la publicación no es detectable").toBe(true);
  });

  it("el paquete íntegro sigue intacto después de generar las copias (original no se modifica)", () => {
    expect(loadSamplePackage()).toEqual(buildSamplePackage());
    expect(checkIntegrity(loadSamplePackage()).valid).toBe(true);
  });
});
