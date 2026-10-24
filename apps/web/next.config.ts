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
  // Sala con ~60 teléfonos en el mismo wifi: los modelos de Human (~12 MB) y los artefactos Groth16 (~4 MB) se descargan
  // una sola vez por teléfono y quedan en caché. Los ZK tienen SHA-256 fijado en @quorum/protocol-adapter. OJO: si algún
  // archivo de /zk o /models cambia de contenido, hay que cambiarle el nombre; si no, los teléfonos usarán la copia vieja.
  async headers() {
    const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    return [
      { source: "/zk/:path*", headers: immutable },
      { source: "/models/:path*", headers: immutable },
      // El service worker (public/sw.js) se revalida siempre para poder actualizarlo.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
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
