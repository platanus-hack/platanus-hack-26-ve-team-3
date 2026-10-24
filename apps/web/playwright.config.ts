import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright para @quorum/web.
 *  - `pnpm --filter @quorum/web exec playwright test`             (todo)
 *  - `pnpm --filter @quorum/web exec playwright test e2e/smoke.spec.ts`
 *  - `PLAYWRIGHT_BASE_URL=https://... playwright test`            (contra un deploy; sin webServer)
 * Proyectos: `chromium` (escritorio) y `mobile-360` (Pixel 5 forzado a 360×740, spec §9).
 *  - Fase 2: `e2e/phase2.spec.ts` (mocks del contrato v1) y `SCREENSHOTS=1 … e2e/screenshots.phase2.spec.ts`.
 *    Usa un puerto propio (`PORT=3317`) para no reutilizar el servidor de otro worktree.
 *  - Sala abierta y proyector: `e2e/room.spec.ts` (mocks) y `SCREENSHOTS=1 … e2e/screenshots.room.spec.ts`.
 *  - Servidor real (sin mocks): `playwright.real.config.ts` → `e2e/room.real.spec.ts`.
 */
const PORT = Number(process.env.PORT ?? 3000);
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // El E2E real (servidor de producción propio, sin mocks) tiene su config: playwright.real.config.ts.
  testIgnore: /\.real\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: "es-VE",
    timezoneId: "America/Caracas",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-360", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } } },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        // `E2E_PROD=1`: contra `next start` (requiere `NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE=1 pnpm build` antes).
        command: process.env.E2E_PROD ? `pnpm exec next start -p ${PORT}` : "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
        // Fase 2: Playwright no tiene cámara. Este flag (sólo E2E) muestra "Simular rostro" en la prueba de vida.
        // E2E hermético aunque `.env.local` tenga claves (Next no pisa variables ya definidas, aunque estén vacías):
        // sin ancla ni registro on-chain (cerrar no envía tx), sin ZeroDev (wallet eoa-demo, sin red), sin RPC.
        env: {
          NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE: "1",
          ORGANIZER_PRIVATE_KEY: "",
          NEXT_PUBLIC_REGISTRY_ADDRESS: "",
          NEXT_PUBLIC_ZERODEV_PROJECT_ID: "",
          BASE_SEPOLIA_RPC: "",
          NEXT_PUBLIC_BASE_SEPOLIA_RPC: "",
          INVITE_SEND_APPROVED: "",
          AI_GATEWAY_API_KEY: "",
        },
      },
});
