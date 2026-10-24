import { configDefaults, defineConfig } from "vitest/config";

/** Unitarios de @quorum/web. Los `e2e/**` son de Playwright y se excluyen aquí. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
    passWithNoTests: true,
  },
});
