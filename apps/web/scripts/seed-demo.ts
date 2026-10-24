/**
 * Siembra la elección FICTICIA "Condominio Los Samanes" (D-03, D-12) en el store local (`DATA_DIR`, por defecto `.data`).
 *
 *   pnpm --filter @quorum/web seed:demo                      # crea la elección en `registration` (inscripción abierta)
 *   pnpm --filter @quorum/web seed:demo -- --reset           # borra la anterior con el mismo id y la recrea
 *   pnpm --filter @quorum/web seed:demo -- --simulate 6      # además inscribe 6 vecinos SIMULADOS (rostro sintético, wallet eoa-demo)
 *   pnpm --filter @quorum/web seed:demo -- --simulate 6 --full   # … y abre, vota (pruebas Semaphore reales), cierra, verifica y sortea
 *   … --anchor                                              # permite anclar en Base Sepolia si hay ORGANIZER_PRIVATE_KEY + BASE_SEPOLIA_RPC
 *
 * Todo es simulación: nombres "Vecino N (simulado)", sin teléfonos, sin WhatsApp, descriptores faciales sintéticos.
 * Por defecto NO ancla aunque existan credenciales (enviar una tx es una acción hacia afuera: requiere `--anchor`).
 * El token del organizador se imprime UNA vez; el servidor solo guarda su hash.
 */
import { FaceBindingTypes, type CreateElectionInput } from "@quorum/contracts";
import { castBallot, createVoterIdentity, defaultArtifacts } from "@quorum/protocol-adapter";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

if (!flag("anchor")) {
  process.env.ORGANIZER_PRIVATE_KEY = "";
}

const ELECTION_ID = process.env.NEXT_PUBLIC_DEMO_ELECTION_ID || "el_demo_los_samanes";

export function losSamanes(now = Date.now()): CreateElectionInput {
  return {
    title: "Condominio Los Samanes (ficticio): ¿cuántos proyectos vecinales financiamos?",
    description:
      "Simulación para la demo de Quórum. La asamblea vota cuántos proyectos se financian (1 a 5); ese número fija cuántos ganadores salen de un sorteo verificable con semilla = keccak256(hash final del registro).",
    kind: "multiple",
    options: [1, 2, 3, 4, 5].map((n) => ({ id: `n${n}`, label: `${n} proyecto${n > 1 ? "s" : ""}` })),
    optionValues: [1, 2, 3, 4, 5],
    winnersCountFromResult: true,
    candidates: [
      { id: "p-01", label: "Iluminación LED del estacionamiento", amount: 1200 },
      { id: "p-02", label: "Jardín comunal y riego por goteo", amount: 800 },
      { id: "p-03", label: "Bomba de agua de respaldo", amount: 2500 },
      { id: "p-04", label: "Cámaras en la entrada principal", amount: 1800 },
      { id: "p-05", label: "Impermeabilización del salón de fiestas", amount: 3000 },
      { id: "p-06", label: "Pintura de la fachada norte", amount: 2200 },
      { id: "p-07", label: "Parque infantil", amount: 1500 },
    ],
    startsAt: new Date(now - 5 * 60_000).toISOString(),
    endsAt: new Date(now + 24 * 3_600_000).toISOString(),
  };
}

/** Descriptor sintético (128 floats) por semilla: dos semillas distintas no se parecen (similitud ≈ 0). */
function syntheticDescriptor(seed: number): number[] {
  let x = seed * 9301 + 49297;
  return Array.from({ length: 128 }, () => {
    x = (x * 233280 + 1) % 2147483647;
    return (x / 2147483647) * 2 - 1;
  });
}

async function main() {
  // Import diferido: env (ORGANIZER_PRIVATE_KEY) ya ajustado arriba.
  const { createElection, publishElection, addVoters } = await import("../src/lib/server/elections");
  const { issueOrganizerToken } = await import("../src/lib/server/auth");
  const { enrollFace } = await import("../src/lib/server/face");
  const { linkWallet, faceBindingDomain } = await import("../src/lib/server/wallet");
  const engine = await import("../src/lib/server/engine");
  const { getStore } = await import("../src/lib/server/store");
  const { env } = await import("../src/lib/server/env");

  const store = await getStore();
  if (await store.getElection(ELECTION_ID)) {
    if (!flag("reset")) {
      console.error(`Ya existe ${ELECTION_ID} en ${env.dataDir}. Usa --reset para recrearla.`);
      process.exit(2);
    }
    await store.deleteElectionData(ELECTION_ID);
  }

  const election = await createElection(losSamanes(), { id: ELECTION_ID });
  const organizerToken = await issueOrganizerToken(election.id);
  const published = await publishElection(election.id);
  console.log(`✔ ${published.id} · estado ${published.status} · manifestHash ${published.manifestHash}`);

  const simulate = Number(opt("simulate", "0"));
  const identities: { privateKey: string }[] = [];
  for (let i = 0; i < simulate; i++) {
    const { voters } = await addVoters(election.id, { voters: [{ displayName: `Vecino ${i + 1} (simulado)` }] });
    const v = voters[0];
    const { faceBindingHash } = await enrollFace({ voterId: v.id, inviteToken: v.inviteToken, descriptor: syntheticDescriptor(1000 + i), consent: true });
    const account = privateKeyToAccount(generatePrivateKey()); // wallet eoa-demo efímera; la clave no se guarda
    const bindingSignature = await account.signTypedData({
      domain: faceBindingDomain(),
      types: FaceBindingTypes,
      primaryType: "FaceBinding",
      message: { electionId: election.id, voterId: v.id, faceBindingHash: faceBindingHash as `0x${string}`, wallet: account.address },
    });
    await linkWallet(v.id, { inviteToken: v.inviteToken, walletAddress: account.address, kind: "eoa-demo", bindingSignature });
    const id = createVoterIdentity(); // la clave Semaphore vive solo en este proceso
    await engine.registerIdentity(v.id, { inviteToken: v.inviteToken, commitment: id.commitment });
    identities.push(id);
    console.log(`  · inscrito ${v.id} (simulado) → ${env.appUrl}/v/${v.inviteToken}`);
  }

  if (flag("full")) {
    if (identities.length === 0) throw new Error("--full requiere --simulate N (N ≥ 1)");
    const opened = await engine.openElection(election.id);
    console.log(`✔ open · groupRoot ${opened.groupRoot}`);
    const { commitments } = await engine.getRoll(election.id);
    // Distribución fija de la simulación: gana "3 proyectos".
    const pattern = [2, 2, 1, 2, 0, 3, 2, 4];
    for (let i = 0; i < identities.length; i++) {
      const proof = await castBallot(identities[i].privateKey, commitments, election.id, pattern[i % pattern.length], defaultArtifacts());
      const r = await engine.castVote(election.id, { proof: proof as never });
      console.log(`  · boleta #${r.index} incluida (nullifier ${r.nullifier!.slice(0, 12)}…)`);
    }
    const closed = await engine.closeElection(election.id);
    const audit = await engine.getAudit(election.id);
    console.log(`✔ close → ${closed.status} · verificador valid=${audit.auditResult.valid} · ancla: ${audit.anchorStatus?.reason}`);
    for (const c of audit.auditResult.checks) console.log(`    ${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.reason ?? ""}`);
    if (closed.status === "auditable") {
      const drawn = await engine.drawElection(election.id);
      console.log(`✔ draw → ${drawn.status} · N=${drawn.draw?.n} · ganadores ${drawn.draw?.winners.join(", ")} · seed ${drawn.draw?.seed}`);
    }
  }

  console.log(`\nToken del organizador (se muestra UNA vez; guárdalo en tu gestor, no en git):\n  ${organizerToken}`);
  console.log(`Panel: ${env.appUrl}/org/${election.id} · Transparencia: ${env.appUrl}/e/${election.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed:demo falló:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
