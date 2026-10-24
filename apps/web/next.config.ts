import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E real (`playwright.real.config.ts`) compila en un directorio propio con su env (sin ZeroDev ni ancla),
  // sin pisar el build normal ni el `.next/dev` del servidor de desarrollo.
  ...(process.env.QUORUM_NEXT_DIST_DIR ? { distDir: process.env.QUORUM_NEXT_DIST_DIR } : {}),
  /* config options here */
  cacheComponents: true,
  // Sin el indicador flotante de desarrollo (tapa contenido en las capturas de Playwright).
  devIndicators: false,
  // Paquetes del monorepo en TS fuente que la web usa en el navegador: el votante genera su prueba
  // Semaphore, maneja su wallet y cualquiera corre `verifyPackage` sin servidor. Los imports relativos
  // ya no llevan `.js` (motor de fase 2), así que no hace falta ningún loader propio.
  transpilePackages: ["@quorum/protocol-adapter", "@quorum/verifier", "@quorum/wallet"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
