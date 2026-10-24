import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AuditPackage, type TamperKind } from "./audit-package";

export * from "./canonical";
export * from "./election";
export * from "./audit-package";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

export const FIXTURE_PATHS = {
  sample: join(FIXTURES_DIR, "audit-package.sample.json"),
  tampered: (kind: TamperKind) => join(FIXTURES_DIR, "tampered", `${kind}.json`),
} as const;

/** Lee el paquete íntegro desde disco (validado por Zod). */
export function loadSamplePackage(): AuditPackage {
  return AuditPackage.parse(JSON.parse(readFileSync(FIXTURE_PATHS.sample, "utf8")));
}

/** Lee una copia adulterada desde disco. Se devuelve sin validar para que los tests decidan. */
export function loadTamperedPackage(kind: TamperKind): unknown {
  return JSON.parse(readFileSync(FIXTURE_PATHS.tampered(kind), "utf8"));
}
