/**
 * Artefactos Groth16 de Semaphore v4 para profundidad 10, vendorizados desde
 * https://snark-artifacts.pse.dev/semaphore/4.13.0/ (descargados 2026-10-24; ver ADR-001 para los SHA-256).
 * El repo snark-artifacts está archivado desde 2026-08-19 pero el CDN sigue sirviendo; por eso se vendorizan.
 */
export type SnarkArtifactPaths = { wasm: string; zkey: string };

export const ARTIFACT_FILES = { wasm: "semaphore-10.wasm", zkey: "semaphore-10.zkey" } as const;

/** SHA-256 registrados al vendorizar. Un script de verificación puede compararlos antes de usar los archivos. */
export const ARTIFACT_SHA256 = {
  wasm: "1e9e1e3ad9917164bc96c751e32fae724400b92063f5a2cfd22ca64674bf4f96",
  zkey: "f644af6753be9d48454d8f9bb74bf2e9a416dd7d1a704c3cf1d50e535969a19a",
} as const;

/** Rutas absolutas en Node a los artefactos vendorizados en este paquete (sin importar módulos node:*). */
export function defaultArtifacts(): SnarkArtifactPaths {
  // La ruta se arma en tiempo de ejecución para que los bundlers (Turbopack) no la traten como asset:
  // solo se usa en Node (tests, scripts); el servidor web nunca genera pruebas.
  // Además se usa `globalThis.URL`: Turbopack trata `new URL(x, import.meta.url)` como asset a empaquetar y falla
  // con una ruta dinámica cuando el adaptador entra en el bundle del navegador (prueba/sorteo). Mismo resultado en Node.
  const dir = ["..", "artifacts", ""].join("/");
  const NodeURL = globalThis.URL;
  const base = new NodeURL(dir, import.meta.url);
  return {
    wasm: decodeURIComponent(new URL(ARTIFACT_FILES.wasm, base).pathname),
    zkey: decodeURIComponent(new URL(ARTIFACT_FILES.zkey, base).pathname),
  };
}

/** Rutas públicas para el navegador, una vez copiados con scripts/copy-artifacts.sh a apps/web/public/zk/. */
export function browserArtifacts(publicBase = "/zk"): SnarkArtifactPaths {
  return { wasm: `${publicBase}/${ARTIFACT_FILES.wasm}`, zkey: `${publicBase}/${ARTIFACT_FILES.zkey}` };
}
