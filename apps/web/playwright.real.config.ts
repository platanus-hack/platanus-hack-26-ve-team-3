import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra el SERVIDOR REAL (sin mocks): `next start` con `DATA_DIR` temporal y sin claves on-chain.
 *   pnpm --filter @quorum/web build && pnpm --filter @quorum/web exec playwright test -c playwright.real.config.ts
 * Puerto propio (`REAL_PORT`, 3338 por defecto) para no chocar con otros worktrees.
 */
const PORT = Number(process.env.REAL_PORT ?? 3338);
const baseURL = `http://localhost:${PORT}`;
const dataDir = process.env.REAL_DATA_DIR ?? mkdtempSync(path.join(tmpdir(), "quorum-room-e2e-"));

export default defineConfig({
  testDir: "./e2e-real",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL, locale: "es-VE", timezoneId: "America/Caracas", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATA_DIR: dataDir,
      APP_URL: baseURL,
      QUORUM_STORE: "json",
      ORGANIZER_PRIVATE_KEY: "",
      NEXT_PUBLIC_REGISTRY_ADDRESS: "",
      NEXT_PUBLIC_ZERODEV_PROJECT_ID: "",
      INVITE_CHANNEL: "dry-run",
    },
  },
});
