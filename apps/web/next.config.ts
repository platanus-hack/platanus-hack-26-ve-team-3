import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
