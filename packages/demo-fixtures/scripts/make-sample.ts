/**
 * Genera `fixtures/audit-package.sample.json` (paquete de auditoría ÍNTEGRO, etiquetado fixture).
 * Determinista: ejecutarlo dos veces produce los mismos bytes.
 *   pnpm --filter @quorum/demo-fixtures fixtures:build
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildSamplePackage, FIXTURE_PATHS } from "../src/index";

const pkg = buildSamplePackage();
mkdirSync(dirname(FIXTURE_PATHS.sample), { recursive: true });
writeFileSync(FIXTURE_PATHS.sample, JSON.stringify(pkg, null, 2) + "\n");
console.log(`[fixture] escrito ${FIXTURE_PATHS.sample} (${pkg.ballots.length} boletas, manifestHash ${pkg.manifest.manifestHash})`);
