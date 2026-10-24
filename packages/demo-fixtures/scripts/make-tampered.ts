/**
 * Genera las copias ADULTERADAS del paquete íntegro en `fixtures/tampered/`:
 *   tampered_total.json   — un voto de más en los conteos
 *   removed_record.json   — una boleta eliminada
 *   wrong_manifest.json   — manifiesto cambiado con hash original
 *   tampered_proof.json   — digest de la prueba alterado
 * Todas llevan `fixture.label = "fixture"` y `fixture.tamper` describiendo la alteración.
 * Son FIXTURES para probar que el verificador detecta manipulación; no son paquetes reales.
 *   pnpm --filter @quorum/demo-fixtures fixtures:build
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkIntegrity, FIXTURE_PATHS, loadSamplePackage, makeTampered, TAMPER_KINDS } from "../src/index";

const sample = loadSamplePackage();
const baseline = checkIntegrity(sample);
if (!baseline.valid) {
  console.error("[fixture] el paquete íntegro no pasa el oráculo; regenera con make-sample.ts primero", baseline.checks);
  process.exit(1);
}

for (const kind of TAMPER_KINDS) {
  const tampered = makeTampered(sample, kind);
  const path = FIXTURE_PATHS.tampered(kind);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(tampered, null, 2) + "\n");
  const report = checkIntegrity(tampered);
  const failing = report.checks.filter((c) => !c.passed).map((c) => c.name);
  console.log(`[fixture] ${kind}: escrito ${path}; oráculo valid=${report.valid}; fallan: ${failing.join(", ") || "ninguno (!)"}`);
}
