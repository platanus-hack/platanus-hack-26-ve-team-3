import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E REAL de fase 2 (sin mocks del contrato): `next build` + `next start` propios, store JSON en un DATA_DIR temporal.
 *   pnpm --filter @quorum/web test:e2e:real
 *
 * Entorno hermético (sobrescribe `.env.local`, que Next no aplica sobre variables ya definidas aunque estén vacías):
 *  - sin ORGANIZER_PRIVATE_KEY / NEXT_PUBLIC_REGISTRY_ADDRESS / BASE_SEPOLIA_RPC → cerrar NO envía ninguna tx: el ancla
 *    queda "no evaluado" (la UI lo muestra "no verificable");
 *  - sin NEXT_PUBLIC_ZERODEV_PROJECT_ID → wallet `eoa-demo` (sin red);
 *  - invitaciones en dry-run, sin AI Gateway, FACE_KEY de prueba aleatoria (obligatoria con NODE_ENV=production);
 *  - NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE=1 → "Simular rostro" (Playwright no tiene cámara).
 * Compila en `.next-e2e-real` para no pisar el build normal (las NEXT_PUBLIC_* se fijan al compilar).
 */
const PORT = Number(process.env.QUORUM_E2E_REAL_PORT ?? 3318);
const baseURL = `http://localhost:${PORT}`;
// La config se evalúa también en los workers: el DATA_DIR se crea una vez y se hereda por env.
const dataDir = (process.env.QUORUM_E2E_REAL_DATA_DIR ??= mkdtempSync(path.join(tmpdir(), "quorum-e2e-real-")));

const env: Record<string, string> = {
  NODE_ENV: "production",
  QUORUM_NEXT_DIST_DIR: ".next-e2e-real",
  DATA_DIR: dataDir,
  QUORUM_STORE: "json",
  APP_URL: baseURL,
  FACE_KEY: (process.env.QUORUM_E2E_REAL_FACE_KEY ??= randomBytes(32).toString("hex")),
  NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE: "1",
  // Sin red ni acciones hacia afuera:
  ORGANIZER_PRIVATE_KEY: "",
  NEXT_PUBLIC_REGISTRY_ADDRESS: "",
  BASE_SEPOLIA_RPC: "",
  NEXT_PUBLIC_BASE_SEPOLIA_RPC: "",
  NEXT_PUBLIC_ZERODEV_PROJECT_ID: "",
  QUORUM_ONCHAIN_CAST: "",
  NEXT_PUBLIC_QUORUM_ONCHAIN_CAST: "",
  QUORUM_EAS_ENABLED: "",
  AI_GATEWAY_API_KEY: "",
  INVITE_CHANNEL: "dry-run",
  INVITE_SEND_APPROVED: "",
  KAPSO_API_KEY: "",
  META_ACCESS_TOKEN: "",
  NEXT_PUBLIC_PRIVY_APP_ID: "",
  PRIVY_APP_SECRET: "",
  NEXT_PUBLIC_DEMO_ELECTION_ID: "",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: /\.real\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 300_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    locale: "es-VE",
    timezoneId: "America/Caracas",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium-real", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${PORT}`,
    url: baseURL,
    // Siempre un servidor nuevo con este env: nunca reutilizar uno que pueda tener claves reales.
    reuseExistingServer: false,
    timeout: 420_000,
    stdout: "ignore",
    stderr: "pipe",
    env,
  },
});
