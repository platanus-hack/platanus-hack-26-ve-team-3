/**
 * FIXTURES — datos de ejemplo etiquetados. Nunca se presentan como reales.
 * Elección ficticia neutral: fecha de asamblea del "Condominio Los Samanes" (no existe).
 */
import type { Aggregates, LiveLayout } from "@quorum/contracts";

export const FIXTURE_TAG = "fixture";

export const fixtureElection = {
  id: "fixture-samanes-2026",
  title: "Fecha de la asamblea anual — Condominio Los Samanes (fixture)",
  description:
    "Elección de demostración. El condominio y sus participantes son ficticios. Se elige la fecha de la asamblea ordinaria.",
  kind: "multiple" as const,
  options: [
    { id: "opt-sab-07", label: "Sábado 7 de noviembre, 10:00 a. m." },
    { id: "opt-dom-15", label: "Domingo 15 de noviembre, 3:00 p. m." },
    { id: "opt-sab-21", label: "Sábado 21 de noviembre, 10:00 a. m." },
  ],
  status: "open" as const,
  protocol: "integrity-demo" as const,
  manifestHash: "0x3b5f2c9e1a7d4f60b8e2c1d9a4f7e3b2c6d8a1f0e9b7c5d3a2f1e0d9c8b7a6f5",
  startsAt: "2026-10-24T12:00:00.000Z",
  endsAt: "2026-10-31T23:00:00.000Z",
  eligibilityIssuerId: "junta-condominio-samanes (fixture)",
  organizerId: "org-fixture",
  layout: null,
};

export const fixtureAggregates: Aggregates = {
  electionId: fixtureElection.id,
  turnout: 0.42,
  totalVotes: 21,
  eligible: 50,
  leadingShare: 0.48,
  closesAt: fixtureElection.endsAt,
  status: "open",
  options: [
    { id: "opt-sab-07", label: "Sábado 7 de noviembre, 10:00 a. m.", count: 10 },
    { id: "opt-dom-15", label: "Domingo 15 de noviembre, 3:00 p. m.", count: 7 },
    { id: "opt-sab-21", label: "Sábado 21 de noviembre, 10:00 a. m.", count: 4 },
  ],
};

/** Layouts por defecto por tipo (mismo criterio que research/04) para cuando /layout no responde. */
export function defaultLayout(kind: string): LiveLayout {
  switch (kind) {
    case "yes-no":
      return { columns: "2", tiles: [{ type: "donut", series: "options" }, { type: "stat", metric: "turnout" }, { type: "countdown" }, { type: "text", template: "privacyNote" }] };
    case "ranking":
      return { columns: "2", tiles: [{ type: "bar-chart", series: "options", orientation: "horizontal" }, { type: "stat", metric: "totalVotes" }, { type: "countdown" }, { type: "text", template: "rankingHint" }] };
    case "budget":
      return { columns: "2", tiles: [{ type: "bar-chart", series: "options", orientation: "vertical" }, { type: "stat", metric: "turnout" }, { type: "countdown" }, { type: "text", template: "budgetHint" }] };
    default:
      return { columns: "2", tiles: [{ type: "bar-chart", series: "options", orientation: "horizontal" }, { type: "stat", metric: "turnout" }, { type: "stat", metric: "totalVotes" }, { type: "countdown" }, { type: "text", template: "howToRead" }] };
  }
}

/** Paquete de auditoría FIXTURE para el laboratorio cuando la API no responde. Forma ilustrativa; el verificador real decide. */
export const fixtureAuditPackage = {
  _fixture: true,
  _note: "Paquete de ejemplo (fixture) para el laboratorio de ataques. No corresponde a una elección real.",
  electionId: fixtureElection.id,
  protocol: "integrity-demo",
  versions: { packageFormat: "0.1.0-fixture", verifier: "unknown" },
  manifest: {
    title: fixtureElection.title,
    options: fixtureElection.options,
    startsAt: fixtureElection.startsAt,
    endsAt: fixtureElection.endsAt,
    eligibilityIssuerId: fixtureElection.eligibilityIssuerId,
  },
  manifestHash: fixtureElection.manifestHash,
  commitments: [
    "0x8f1c2a9b7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b",
    "0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809",
    "0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d",
    "0x5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b",
    "0x2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e",
  ],
  result: {
    totalVotes: 5,
    counts: { "opt-sab-07": 3, "opt-dom-15": 1, "opt-sab-21": 1 },
  },
  checksums: {
    commitments: "0x6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c",
    result: "0x4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a",
  },
};
