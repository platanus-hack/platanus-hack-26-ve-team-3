import type { CreateElectionInput, Election, Voter } from "@quorum/contracts";

/**
 * FIXTURE — Elección ficticia de demostración.
 * Condominio inventado, opciones neutrales (fechas de una asamblea), sin ninguna
 * referencia a elecciones, partidos, candidatos o personas reales.
 */
export const FIXTURE_LABEL = "fixture" as const;

export const DEMO_ELECTION_ID = "el_fixture_samanes_2026";

export const demoElectionInput: CreateElectionInput = {
  title: "Condominio Los Samanes — fecha de la asamblea anual",
  description:
    "Elección ficticia (fixture) para la demo de Quórum. Los propietarios eligen la fecha de la asamblea anual del condominio.",
  kind: "multiple",
  options: [
    { id: "sab-14-mar", label: "Sábado 14 de marzo, 9:00 a. m." },
    { id: "sab-21-mar", label: "Sábado 21 de marzo, 9:00 a. m." },
    { id: "dom-22-mar", label: "Domingo 22 de marzo, 10:00 a. m." },
  ],
  startsAt: "2026-03-01T13:00:00.000Z",
  endsAt: "2026-03-08T22:00:00.000Z",
};

export const demoElection: Election = {
  id: DEMO_ELECTION_ID,
  ...demoElectionInput,
  status: "draft",
  protocol: "integrity-demo",
  manifestHash: null,
  eligibilityIssuerId: "issuer_fixture_samanes",
  organizerId: "org_fixture_junta_condominio",
  layout: null,
};

/**
 * FIXTURE — 6 votantes ficticios. Nombres obviamente inventados.
 * Teléfonos del bloque ficticio norteamericano 555-01XX (reservado para ficción): NO son números reales.
 * Nunca se publica esta lista; solo vive en el servidor de demo.
 */
export const demoVoters: Voter[] = [
  "Ana Ejemplo",
  "Bruno Ficticio",
  "Carla Prueba",
  "Darío Demo",
  "Elena Simulada",
  "Félix Muestra",
].map((name, i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    id: `vtr_fixture_${n}`,
    electionId: DEMO_ELECTION_ID,
    displayName: `${name} (ficticio)`,
    phoneE164: `+15550100${n}`, // +1 555 0100 01..06 — bloque reservado para ficción
    inviteToken: `tok_fixture_${n}`,
    inviteStatus: "pending",
    walletAddress: null,
    livenessPassedAt: null,
    credentialIssuedAt: null,
    votedAt: null,
  };
});

/**
 * Boletas emitidas en la simulación: SOLO la lista de opciones elegidas, sin ningún
 * vínculo con un votante (5 de 6 votantes ficticios participan; el sexto no vota).
 * Es deliberado: ni siquiera el fixture conoce "quién votó qué".
 */
export const demoCastOptions: string[] = ["sab-14-mar", "sab-21-mar", "sab-14-mar", "dom-22-mar", "sab-21-mar"];
