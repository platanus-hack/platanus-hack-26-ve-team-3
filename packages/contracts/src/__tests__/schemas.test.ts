import { describe, expect, it } from "vitest";
import {
  Aggregates,
  ApiError,
  AuditResult,
  CreateElectionInput,
  Election,
  FaceEnrollInput,
  FaceVerifyResult,
  InviteRequest,
  LiveLayout,
  Receipt,
  SignedVote,
  Tile,
  Voter,
} from "../index";

/**
 * Tests del contrato compartido (docs/API_CONTRACT.md). Son la fuente de verdad que
 * frontend y backend deben respetar: si un esquema cambia, estos tests avisan.
 * Datos 100 % ficticios (condominio inventado, votantes inventados, teléfonos del rango 555-01XX).
 */

const ISO_START = "2026-03-01T13:00:00.000Z";
const ISO_END = "2026-03-08T22:00:00.000Z";

const validOptions = [
  { id: "sab-14-mar", label: "Sábado 14 de marzo, 9:00 a. m." },
  { id: "sab-21-mar", label: "Sábado 21 de marzo, 9:00 a. m." },
  { id: "dom-22-mar", label: "Domingo 22 de marzo, 10:00 a. m." },
];

const validElection = {
  id: "el_fixture_samanes_2026",
  title: "Condominio Los Samanes — fecha de la asamblea anual",
  description: "Elección ficticia de demostración (fixture).",
  kind: "multiple",
  options: validOptions,
  status: "draft",
  protocol: "integrity-demo",
  manifestHash: null,
  startsAt: ISO_START,
  endsAt: ISO_END,
  eligibilityIssuerId: "issuer_fixture_samanes",
  organizerId: "org_fixture_junta",
} as const;

const validVoter = {
  id: "vtr_fixture_01",
  electionId: validElection.id,
  displayName: "Ana Ejemplo (ficticia)",
  phoneE164: "+15550100001",
  inviteToken: "tok_fixture_01",
  inviteStatus: "pending",
  walletAddress: null,
  livenessPassedAt: null,
  credentialIssuedAt: null,
  votedAt: null,
} as const;

function firstPath(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }): string | null {
  if (result.success || !result.error) return null;
  return result.error.issues[0]?.path.map(String).join(".") ?? null;
}

describe("Election", () => {
  it("acepta una elección válida y aplica defaults (layout=null)", () => {
    const parsed = Election.parse(validElection);
    expect(parsed.layout).toBeNull();
    expect(parsed.options).toHaveLength(3);
  });

  it("aplica description='' por defecto", () => {
    const { description: _omit, ...rest } = validElection;
    expect(Election.parse(rest).description).toBe("");
  });

  it("rechaza título demasiado corto (<3)", () => {
    const r = Election.safeParse({ ...validElection, title: "ok" });
    expect(r.success).toBe(false);
    expect(firstPath(r)).toBe("title");
  });

  it("rechaza menos de 2 opciones", () => {
    const r = Election.safeParse({ ...validElection, options: [validOptions[0]] });
    expect(r.success).toBe(false);
    expect(firstPath(r)).toBe("options");
  });

  it("rechaza más de 10 opciones", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, label: `Opción ${i}` }));
    expect(Election.safeParse({ ...validElection, options: many }).success).toBe(false);
  });

  it("rechaza opción con id vacío o label demasiado largo", () => {
    expect(Election.safeParse({ ...validElection, options: [{ id: "", label: "A" }, validOptions[1]] }).success).toBe(false);
    expect(
      Election.safeParse({ ...validElection, options: [{ id: "a", label: "x".repeat(121) }, validOptions[1]] }).success,
    ).toBe(false);
  });

  it("rechaza kind, status y protocol fuera del enum", () => {
    expect(Election.safeParse({ ...validElection, kind: "political" }).success).toBe(false);
    expect(Election.safeParse({ ...validElection, status: "verified" }).success).toBe(false);
    expect(Election.safeParse({ ...validElection, protocol: "homemade-zk" }).success).toBe(false);
  });

  it("rechaza fechas que no son ISO 8601", () => {
    expect(Election.safeParse({ ...validElection, startsAt: "01/03/2026" }).success).toBe(false);
    expect(Election.safeParse({ ...validElection, endsAt: "mañana" }).success).toBe(false);
  });

  it("no expone campos de PII en el tipo (sin cédula, sin rostro, sin opción por elector)", () => {
    const keys = Object.keys(Election.shape);
    for (const forbidden of ["cedula", "nationalId", "faceImage", "voterChoices", "ballots"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("CreateElectionInput", () => {
  it("acepta solo los campos del wizard y descarta los del servidor", () => {
    const parsed = CreateElectionInput.parse({ ...validElection, status: "open", manifestHash: "0xabc" });
    expect(parsed).not.toHaveProperty("status");
    expect(parsed).not.toHaveProperty("manifestHash");
    expect(parsed).not.toHaveProperty("organizerId");
  });

  it("rechaza opciones <2 también en el input de creación", () => {
    const r = CreateElectionInput.safeParse({
      title: validElection.title,
      kind: "yes-no",
      options: [validOptions[0]],
      startsAt: ISO_START,
      endsAt: ISO_END,
    });
    expect(r.success).toBe(false);
  });
});

describe("Voter", () => {
  it("acepta un votante válido con teléfono E.164 ficticio", () => {
    expect(Voter.parse(validVoter).phoneE164).toBe("+15550100001");
  });

  it("acepta votante sin teléfono (campo opcional)", () => {
    const { phoneE164: _omit, ...rest } = validVoter;
    expect(Voter.safeParse(rest).success).toBe(true);
  });

  it.each([
    ["0412-1234567", "formato local con guion"],
    ["4121234567", "sin prefijo +"],
    ["+0412123456", "empieza por 0 tras el +"],
    ["+1 555 010 0001", "con espacios"],
    ["+123", "demasiado corto"],
    ["+1234567890123456", "demasiado largo (>15 dígitos)"],
  ])("rechaza teléfono inválido %s (%s)", (phone) => {
    const r = Voter.safeParse({ ...validVoter, phoneE164: phone });
    expect(r.success).toBe(false);
    expect(firstPath(r)).toBe("phoneE164");
  });

  it("rechaza walletAddress que no sea 0x + 40 hex", () => {
    expect(Voter.safeParse({ ...validVoter, walletAddress: "0x1234" }).success).toBe(false);
    expect(Voter.safeParse({ ...validVoter, walletAddress: "0x" + "g".repeat(40) }).success).toBe(false);
    expect(Voter.safeParse({ ...validVoter, walletAddress: "0x" + "ab".repeat(20) }).success).toBe(true);
  });

  it("rechaza inviteStatus fuera del enum", () => {
    expect(Voter.safeParse({ ...validVoter, inviteStatus: "voted-for-a" }).success).toBe(false);
  });

  it("no tiene ningún campo que ligue elector con opción elegida", () => {
    const keys = Object.keys(Voter.shape);
    for (const forbidden of ["choice", "option", "optionId", "ballot", "vote"]) {
      expect(keys).not.toContain(forbidden);
    }
    expect(keys).toContain("votedAt"); // el hecho de haber votado sí; el qué, nunca
  });
});

describe("InviteRequest", () => {
  const base = { electionId: validElection.id, voterIds: ["vtr_fixture_01"], channel: "dry-run" };
  it("acepta canal dry-run", () => expect(InviteRequest.safeParse(base).success).toBe(true));
  it("rechaza lista vacía de votantes", () => expect(InviteRequest.safeParse({ ...base, voterIds: [] }).success).toBe(false));
  it("rechaza más de 500 votantes", () => {
    expect(InviteRequest.safeParse({ ...base, voterIds: Array.from({ length: 501 }, (_, i) => `v${i}`) }).success).toBe(false);
  });
  it("rechaza canal desconocido", () => expect(InviteRequest.safeParse({ ...base, channel: "sms" }).success).toBe(false));
});

describe("Prueba de vida (demo)", () => {
  const descriptor = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 2);
  it("acepta descriptor de 128 floats con consentimiento explícito", () => {
    expect(FaceEnrollInput.safeParse({ voterId: "v1", inviteToken: "t1", descriptor, consent: true }).success).toBe(true);
  });
  it("rechaza descriptor corto (<64)", () => {
    const r = FaceEnrollInput.safeParse({ voterId: "v1", inviteToken: "t1", descriptor: descriptor.slice(0, 63), consent: true });
    expect(r.success).toBe(false);
    expect(firstPath(r)).toBe("descriptor");
  });
  it("rechaza descriptor demasiado largo (>2048)", () => {
    expect(
      FaceEnrollInput.safeParse({ voterId: "v1", inviteToken: "t1", descriptor: new Array(2049).fill(0), consent: true }).success,
    ).toBe(false);
  });
  it("rechaza consent=false (debe ser literal true)", () => {
    expect(FaceEnrollInput.safeParse({ voterId: "v1", inviteToken: "t1", descriptor, consent: false }).success).toBe(false);
  });
  it("no acepta imágenes: no existe campo image/photo en el esquema", () => {
    const keys = Object.keys(FaceEnrollInput.shape);
    expect(keys).not.toContain("image");
    expect(keys).not.toContain("photo");
  });
  it("FaceVerifyResult exige mode='demo-liveness' (nunca afirmar biometría real)", () => {
    const ok = { ok: true, similarity: 0.82, threshold: 0.6, voteNonce: "n1", mode: "demo-liveness" };
    expect(FaceVerifyResult.safeParse(ok).success).toBe(true);
    expect(FaceVerifyResult.safeParse({ ...ok, mode: "biometric" }).success).toBe(false);
  });
});

describe("SignedVote y Receipt", () => {
  it("acepta un voto firmado con la forma EIP-712 del contrato", () => {
    const r = SignedVote.safeParse({
      message: {
        electionId: validElection.id,
        ballotCommitment: "0x" + "ab".repeat(32),
        voter: "0x" + "cd".repeat(20),
        nonce: "0x" + "01".repeat(32),
        expires: "1780000000",
      },
      signature: "0x" + "ef".repeat(65),
    });
    expect(r.success).toBe(true);
  });
  it("rechaza voto sin firma", () => {
    expect(
      SignedVote.safeParse({ message: { electionId: "e", ballotCommitment: "0x", voter: "0x", nonce: "0x", expires: "1" } }).success,
    ).toBe(false);
  });
  it("Receipt acepta estados honestos y rechaza 'verificado' (eso lo dice el verificador, no el recibo)", () => {
    const base = { electionId: validElection.id, inclusionId: "inc_01", receivedAt: ISO_START, includedAt: null };
    for (const state of ["pendiente", "recibido", "incluido", "no verificable"]) {
      expect(Receipt.safeParse({ ...base, state }).success).toBe(true);
    }
    expect(Receipt.safeParse({ ...base, state: "verificado" }).success).toBe(false);
    expect(Receipt.safeParse({ ...base, state: "VERIFIED" }).success).toBe(false);
  });
  it("Receipt no transporta la opción elegida", () => {
    expect(Object.keys(Receipt.shape)).not.toContain("choice");
    expect(Object.keys(Receipt.shape)).not.toContain("optionId");
  });
});

describe("Aggregates (solo agregados)", () => {
  const validAggregates = {
    electionId: validElection.id,
    turnout: 5 / 6,
    totalVotes: 5,
    eligible: 6,
    leadingShare: 0.4,
    closesAt: ISO_END,
    status: "open",
    options: validOptions.map((o, i) => ({ ...o, count: [2, 2, 1][i] })),
  };

  it("acepta agregados válidos", () => expect(Aggregates.safeParse(validAggregates).success).toBe(true));

  it("rechaza turnout > 1", () => {
    const r = Aggregates.safeParse({ ...validAggregates, turnout: 1.2 });
    expect(r.success).toBe(false);
    expect(firstPath(r)).toBe("turnout");
  });

  it("rechaza turnout < 0 y leadingShare > 1", () => {
    expect(Aggregates.safeParse({ ...validAggregates, turnout: -0.1 }).success).toBe(false);
    expect(Aggregates.safeParse({ ...validAggregates, leadingShare: 1.5 }).success).toBe(false);
  });

  it("permite count=null por opción (menos de 5 votos no se desglosa)", () => {
    const r = Aggregates.safeParse({ ...validAggregates, totalVotes: 3, options: validOptions.map((o) => ({ ...o, count: null })) });
    expect(r.success).toBe(true);
  });

  it("rechaza totalVotes negativo o no entero", () => {
    expect(Aggregates.safeParse({ ...validAggregates, totalVotes: -1 }).success).toBe(false);
    expect(Aggregates.safeParse({ ...validAggregates, totalVotes: 2.5 }).success).toBe(false);
  });

  it("descarta votos individuales si el servidor los filtra por error (strip de claves desconocidas)", () => {
    const leaked = { ...validAggregates, votes: [{ voterId: "vtr_fixture_01", choice: "sab-14-mar" }] };
    const parsed = Aggregates.parse(leaked);
    expect(parsed).not.toHaveProperty("votes");
    expect(JSON.stringify(parsed)).not.toContain("vtr_fixture_01");
  });
});

describe("LiveLayout (layout generativo)", () => {
  const validLayout = {
    columns: "2",
    tiles: [
      { type: "stat", metric: "turnout" },
      { type: "bar-chart", series: "options", orientation: "horizontal" },
      { type: "text", template: "privacyNote" },
    ],
  };

  it("acepta un layout válido", () => expect(LiveLayout.safeParse(validLayout).success).toBe(true));

  it("rechaza tile con type desconocido", () => {
    const r = LiveLayout.safeParse({ ...validLayout, tiles: [...validLayout.tiles, { type: "iframe", src: "https://evil.example" }] });
    expect(r.success).toBe(false);
    expect(firstPath(r)).toContain("tiles");
  });

  it("rechaza stat con métrica no permitida (el LLM no puede inventar métricas)", () => {
    expect(Tile.safeParse({ type: "stat", metric: "votesForOptionA" }).success).toBe(false);
  });

  it("rechaza text con texto libre: solo plantillas del enum", () => {
    expect(Tile.safeParse({ type: "text", template: "Ganó la opción A" }).success).toBe(false);
    expect(Tile.safeParse({ type: "text", content: "hola" }).success).toBe(false);
  });

  it("rechaza bar-chart con orientación inválida o serie que no sea options", () => {
    expect(Tile.safeParse({ type: "bar-chart", series: "options", orientation: "diagonal" }).success).toBe(false);
    expect(Tile.safeParse({ type: "bar-chart", series: "voters", orientation: "vertical" }).success).toBe(false);
  });

  it("rechaza menos de 2 o más de 6 tiles", () => {
    expect(LiveLayout.safeParse({ ...validLayout, tiles: [{ type: "countdown" }] }).success).toBe(false);
    expect(LiveLayout.safeParse({ ...validLayout, tiles: new Array(7).fill({ type: "countdown" }) }).success).toBe(false);
  });

  it("rechaza columns fuera de '1'|'2'|'3' (incluido el número 2)", () => {
    expect(LiveLayout.safeParse({ ...validLayout, columns: "4" }).success).toBe(false);
    expect(LiveLayout.safeParse({ ...validLayout, columns: 2 }).success).toBe(false);
  });
});

describe("AuditResult (verificador independiente)", () => {
  const validAudit = {
    electionId: validElection.id,
    verifierVersion: "0.0.1",
    protocol: "integrity-demo",
    inputArtifactDigest: "sha256:" + "0".repeat(64),
    checkedAt: ISO_END,
    valid: false,
    checks: [{ name: "verifier-integrated", passed: false, reason: "verifier-not-integrated" }],
    unsupportedGuarantees: ["verifier-not-integrated"],
  };

  it("acepta un resultado honesto (valid=false con motivo)", () => expect(AuditResult.safeParse(validAudit).success).toBe(true));

  it("exige valid booleano (no 'true' como string ni 1)", () => {
    expect(AuditResult.safeParse({ ...validAudit, valid: "true" }).success).toBe(false);
    expect(AuditResult.safeParse({ ...validAudit, valid: 1 }).success).toBe(false);
  });

  it("exige método, versión y digest de entrada (nunca un booleano suelto de la DB)", () => {
    for (const key of ["verifierVersion", "inputArtifactDigest", "checks", "unsupportedGuarantees", "protocol"] as const) {
      const { [key]: _omit, ...rest } = validAudit;
      expect(AuditResult.safeParse(rest).success).toBe(false);
    }
  });

  it("rechaza check sin passed booleano", () => {
    expect(AuditResult.safeParse({ ...validAudit, checks: [{ name: "x", passed: "sí" }] }).success).toBe(false);
  });
});

describe("ApiError", () => {
  it("acepta los códigos del contrato", () => {
    for (const code of ["invalid_input", "not_found", "not_eligible", "already_voted", "closed", "forbidden", "unavailable"]) {
      expect(ApiError.safeParse({ error: "msg", code }).success).toBe(true);
    }
  });
  it("rechaza códigos desconocidos", () => {
    expect(ApiError.safeParse({ error: "msg", code: "internal" }).success).toBe(false);
  });
});
