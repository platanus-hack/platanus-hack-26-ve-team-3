import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

/** Unitarios de @quorum/web. Los `e2e/**` son de Playwright y se excluyen aquí. */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
    passWithNoTests: true,
    env: {
      QUORUM_STORE: "memory",
      QUORUM_RATELIMIT: "off",
      INVITE_CHANNEL: "dry-run",
      INVITE_SEND_APPROVED: "false",
      APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_CHAIN_ID: "84532",
      FACE_THRESHOLD: "0.6",
      KAPSO_WEBHOOK_SECRET: "test-webhook-secret",
    },
  },
});
