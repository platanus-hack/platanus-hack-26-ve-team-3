import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright para @quorum/web.
 *  - `pnpm --filter @quorum/web exec playwright test`             (todo)
 *  - `pnpm --filter @quorum/web exec playwright test e2e/smoke.spec.ts`
 *  - `PLAYWRIGHT_BASE_URL=https://... playwright test`            (contra un deploy; sin webServer)
 * Proyectos: `chromium` (escritorio) y `mobile-360` (Pixel 5 forzado a 360×740, spec §9).
 *  - Fase 2: `e2e/phase2.spec.ts` (mocks del contrato v1) y `SCREENSHOTS=1 … e2e/screenshots.phase2.spec.ts`.
 *    Usa un puerto propio (`PORT=3317`) para no reutilizar el servidor de otro worktree.
 */
const PORT = Number(process.env.PORT ?? 3000);
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = externalBaseURL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
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
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
        // Fase 2: Playwright no tiene cámara. Este flag (sólo E2E) muestra "Simular rostro" en la prueba de vida.
        env: { NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE: "1" },
      },
});
