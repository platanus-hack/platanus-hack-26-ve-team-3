// Loader de Turbopack para los paquetes del monorepo escritos en TS fuente (ESM) que la web usa en el
// navegador (`@quorum/protocol-adapter`, `@quorum/verifier`). Hace dos reescrituras mínimas y nada más:
//  1. Imports relativos `./x.js` → `./x`: Turbopack no reescribe `.js` → `.ts` fuera de la app.
//  2. `new URL("../artifacts/", import.meta.url)` → base fija "file:///": sólo lo usa `defaultArtifacts()`
//     (rutas de Node, nunca en la web); sin esto Turbopack intenta empaquetar el directorio como asset.
//     En el navegador se usan `browserArtifacts()` → `/zk/semaphore-10.{wasm,zkey}`.
// La lógica criptográfica no cambia: el resto del código se ejecuta tal cual lo escribió su dueño.
const RELATIVE_JS_IMPORT = /((?:from|import)\s*\(?\s*["'])(\.{1,2}\/[^"']+?)\.js(["'])/g;
const DIR_URL_FROM_META = /new URL\((["'][^"']*\/["']),\s*import\.meta\.url\)/g;

function quorumWorkspaceTsLoader(source) {
  return source.replace(RELATIVE_JS_IMPORT, "$1$2$3").replace(DIR_URL_FROM_META, 'new URL($1, "file:///")');
}

module.exports = quorumWorkspaceTsLoader;
module.exports.RELATIVE_JS_IMPORT = RELATIVE_JS_IMPORT;
