/**
 * D-22: paquete de ejemplo en MODO CONTINUO (fixture / simulación) con pruebas Groth16 reales:
 * 5 entran (K=5) → votan 2 → entran 2 más → vota 1 con la raíz vieja (dentro de la ventana) y 1 con la vigente.
 *   pnpm --filter @quorum/protocol-adapter exec tsx scripts/make-continuous-fixture.ts
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildContinuousDemoElection } from "../src/index";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../demo-fixtures/protocol/continuous_valid.json");
const demo = await buildContinuousDemoElection({
  electionId: "fixture-continuo-2026",
  steps: ["join", "join", "join", "join", "join", { vote: 0, option: 0 }, { vote: 1, option: 1 }, "join", "join", { vote: 2, option: 1, rootOfSize: 5 }, { vote: 5, option: 2 }],
  generatedAt: "2026-10-24T22:00:00.000Z",
});
writeFileSync(out, JSON.stringify(demo.pkg, null, 2) + "\n");
console.log(`continuous_valid.json: ${demo.pkg.commitments.length} inscripciones, ${demo.pkg.tally.total} boletas, tally=${JSON.stringify(demo.pkg.tally)}, rechazos=${JSON.stringify(demo.rejections)}`);
process.exit(0);
