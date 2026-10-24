import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

function readEnvLocal(): Record<string, string> {
  try {
    return parseEnv(readFileSync(path.resolve(__dirname, ".env.local"), "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Tests de RED (`*.net.test.ts`): tocan Base Sepolia / ZeroDev de verdad. No corren en `pnpm test`.
 *   pnpm --filter @quorum/web test:net
 * Carga `.env.local` (sin imprimir valores). Cada test se salta solo si falta su variable.
 */
export default defineConfig(() => {
  const fileEnv = readEnvLocal();
  const pick = (k: string) => (process.env[k] ?? fileEnv[k] ?? "");
  return {
    resolve: { alias: { "@": path.resolve(__dirname, "src") } },
    test: {
      environment: "node",
      include: ["src/**/*.net.test.ts"],
      testTimeout: 120_000,
      env: {
        QUORUM_STORE: "memory",
        QUORUM_RATELIMIT: "off",
        NEXT_PUBLIC_CHAIN_ID: "84532",
        BASE_SEPOLIA_RPC: pick("BASE_SEPOLIA_RPC"),
        NEXT_PUBLIC_ZERODEV_PROJECT_ID: pick("NEXT_PUBLIC_ZERODEV_PROJECT_ID"),
      },
    },
  };
});
