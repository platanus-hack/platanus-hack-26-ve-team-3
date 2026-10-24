import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Paquetes del monorepo en TS fuente (ESM con imports `./x.js`) que la web usa en el navegador:
  // el votante genera su prueba Semaphore y cualquiera corre `verifyPackage` sin servidor.
  transpilePackages: ["@quorum/protocol-adapter", "@quorum/verifier"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
      "*.ts": {
        condition: { path: /(protocol-adapter|verifier)\/src\// },
        loaders: [require.resolve("./build-tools/strip-js-ext-loader.cjs")],
      },
    },
  },
};

export default nextConfig;
