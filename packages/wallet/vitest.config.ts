import { defineConfig } from "vitest/config";

/** Tests sin red: el SDK de ZeroDev se simula y el contrato corre en un EVM en memoria. */
export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"], testTimeout: 60_000 },
});
