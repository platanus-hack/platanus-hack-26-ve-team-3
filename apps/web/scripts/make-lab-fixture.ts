/**
 * Genera `public/fixtures/protocol/lab-drawn.json`: paquete `quorum-audit/1` FIXTURE v1 para el laboratorio del jurado
 * (`/audit/lab` sin `?id=`). Elección ficticia con pruebas Semaphore Groth16 REALES, regla de sorteo en el manifiesto
 * (`drawRule` con candidatos, `from-result`, `tieBreak: "lowest"`) y el sorteo ya hecho con el adaptador (`runDraw`),
 * igual que lo produce el motor en fase `drawn`. Así las alteraciones del sorteo tienen algo que alterar.
 *
 *   pnpm --filter @quorum/web fixtures:lab
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildAuditPackage, buildDemoElection, runDraw, type DrawRule, type ElectionManifest } from "@quorum/protocol-adapter";

const out = path.resolve(process.cwd(), "public/fixtures/protocol/lab-drawn.json");

const rule: DrawRule = {
  candidates: [
    { id: "p-biblioteca", label: "Biblioteca de intercambio (ficticio)", amount: 300 },
    { id: "p-cancha", label: "Reparación de la cancha (ficticio)", amount: 1500 },
    { id: "p-huerto", label: "Huerto comunitario (ficticio)", amount: 600 },
    { id: "p-luces", label: "Iluminación del estacionamiento (ficticio)", amount: 1200 },
  ],
  // El manifiesto de demo tiene 3 opciones: la ganadora fija 1, 2 o 3 proyectos.
  winnersCount: { kind: "from-result", optionValues: [1, 2, 3] },
  tieBreak: "lowest",
};

async function main() {
const t0 = Date.now();
// 4 credenciales, 3 boletas (opción "2 proyectos" gana 2–1): deja candidatos sin ganar para "colar un ganador".
const demo = await buildDemoElection({ votes: [1, 0, 1], voterCount: 4, electionId: "fixture-lab-sorteo-2026", generatedAt: "2026-10-24T16:00:00.000Z" });
const manifest: ElectionManifest = { ...demo.manifest, title: "[fixture] ¿Cuántos proyectos vecinales financiamos? (laboratorio)", drawRule: rule };
const pkg0 = buildAuditPackage({ electionId: manifest.electionId, manifest, commitments: demo.commitments, ledger: demo.ledger, tally: demo.pkg.tally, generatedAt: "2026-10-24T16:00:00.000Z" });
const draw = runDraw(rule, pkg0.tally, pkg0.finalHash);
const pkg = buildAuditPackage({ electionId: manifest.electionId, manifest, commitments: demo.commitments, ledger: demo.ledger, tally: pkg0.tally, generatedAt: "2026-10-24T16:00:00.000Z", draw });
writeFileSync(out, JSON.stringify(pkg, null, 2) + "\n");
console.log(`lab-drawn.json: ${pkg.ledger.length} boletas, ${pkg.commitments.length} commitments, tally=${JSON.stringify(pkg.tally)}, sorteo N=${draw.n} [${draw.winners.join(", ")}] (${Date.now() - t0} ms)`);
}

// snarkjs deja hilos vivos: se sale explícitamente al terminar.
main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
