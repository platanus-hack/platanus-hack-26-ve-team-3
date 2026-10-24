#!/usr/bin/env node
/**
 * Genera lo que el teléfono descarga para la prueba de vida (`public/models/*` y `public/tfjs/<versión>/*`) y el
 * manifiesto con sus tamaños (`src/lib/client/face-models.ts`). Uso: `node scripts/build-face-models.mjs`.
 *
 *  - blazeface (detector) → float16 (idéntico a float32 en las pruebas: mismos recuadros y descriptores).
 *  - antispoof (`face.real`) y liveness (`face.live`) → uint8 (|Δ| medio 0,001–0,003 sobre 800 rostros).
 *  - descriptor: insightface-mobilenet-emore (256 dimensiones, entrada 112×112) → uint8. Sustituye a faceres (6,98 MB).
 *  - sin facemesh: la acción de vida es «gira la cabeza», medida con los puntos del detector.
 *  - binarios WASM de TF.js (SIMD y sin SIMD) para el backend `wasm`.
 * Todo se guarda YA comprimido con gzip (mismo nombre); next.config.ts los sirve con `Content-Encoding: gzip`, así
 * que el navegador los descomprime solo (cualquier navegador, también por http en la red local).
 * Si cambia el contenido de algún archivo, cambia también su nombre (caché inmutable) o sube la versión de caché.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { quantizeModel } from "./quantize-models.mjs";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(WEB, "package.json"));
const HUMAN_DIR = path.resolve(path.dirname(require.resolve("@vladmandic/human")), ".."); // dist/human.node.js → raíz
const HUMAN_MODELS = path.join(HUMAN_DIR, "models");
const TFJS_VERSION = readFileSync(path.join(HUMAN_DIR, "dist/tfjs.version.js"), "utf8").match(/"(\d+\.\d+\.\d+)"/)[1];

// Fuentes externas fijadas por commit/versión y SHA-256.
const INSIGHTFACE_COMMIT = "c972aafea46d7481273c606cff4c6d5135ae1dc3"; // github.com/vladmandic/insightface (MIT)
const REMOTE = [
  { url: `https://raw.githubusercontent.com/vladmandic/insightface/${INSIGHTFACE_COMMIT}/models/insightface-mobilenet-emore.json`, file: "insightface-mobilenet-emore.json", sha256: "9b8f0cb0a4667086bef6e09e1fd54a54830e754348526f9e31cecac430104302" },
  { url: `https://raw.githubusercontent.com/vladmandic/insightface/${INSIGHTFACE_COMMIT}/models/insightface-mobilenet-emore.bin`, file: "insightface-mobilenet-emore.bin", sha256: "46131c5924a7ee9581df16829f0cba44ad431e8c42644123c48f0c75aaea3bc4" },
  // Binarios de @tensorflow/tfjs-backend-wasm (la versión que trae Human; si Human sube de versión, actualizar los hashes).
  { url: `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VERSION}/dist/tfjs-backend-wasm-simd.wasm`, file: "tfjs-backend-wasm-simd.wasm", sha256: "77ebb28a6d34f371dbbf2086b7f2de8994acd8ea5a3cf1fa24d2c26c840cac7b" },
  { url: `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@${TFJS_VERSION}/dist/tfjs-backend-wasm.wasm`, file: "tfjs-backend-wasm.wasm", sha256: "70a5d516060464e5269f01c74bac1772d6b8ab6cb612acf16b5cdaf61f78d892" },
];

const sha = (b) => createHash("sha256").update(b).digest("hex");
const work = mkdtempSync(path.join(tmpdir(), "quorum-face-models-"));

for (const r of REMOTE) {
  const res = await fetch(r.url);
  if (!res.ok) throw new Error(`${r.url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== r.sha256) throw new Error(`${r.file}: SHA-256 ${sha(buf)} ≠ ${r.sha256}`);
  writeFileSync(path.join(work, r.file), buf);
  console.log(`descargado ${r.file} (${buf.length} B, sha256 ${sha(buf)})`);
}

const models = [
  { src: HUMAN_MODELS, name: "blazeface", target: "float16", outName: "blazeface-f16" },
  { src: HUMAN_MODELS, name: "antispoof", target: "uint8", outName: "antispoof-u8" },
  { src: HUMAN_MODELS, name: "liveness", target: "uint8", outName: "liveness-u8" },
  { src: work, name: "insightface-mobilenet-emore", target: "uint8", outName: "insightface-u8" },
];
for (const m of models) {
  const r = quantizeModel({ ...m, dst: work });
  console.log(`${m.name} → ${m.outName} (${m.target}): ${r.before} → ${r.after} B`);
}

const MODELS_DIR = path.join(WEB, "public/models");
const TFJS_DIR = path.join(WEB, "public/tfjs", TFJS_VERSION);
rmSync(MODELS_DIR, { recursive: true, force: true });
rmSync(path.join(WEB, "public/tfjs"), { recursive: true, force: true });
mkdirSync(MODELS_DIR, { recursive: true });
mkdirSync(TFJS_DIR, { recursive: true });

const entries = [];
const put = (dir, urlDir, file, kind) => {
  const raw = readFileSync(path.join(work, file));
  const gz = gzipSync(raw, { level: 9 });
  writeFileSync(path.join(dir, file), gz);
  entries.push({ path: `${urlDir}/${file}`, kind, bytes: raw.length, wire: gz.length });
};
for (const m of models) {
  put(MODELS_DIR, "/models", `${m.outName}.json`, "model");
  put(MODELS_DIR, "/models", `${m.outName}.bin`, "model");
}
put(TFJS_DIR, `/tfjs/${TFJS_VERSION}`, "tfjs-backend-wasm-simd.wasm", "wasm-simd");
put(TFJS_DIR, `/tfjs/${TFJS_VERSION}`, "tfjs-backend-wasm.wasm", "wasm");
rmSync(work, { recursive: true, force: true });

const ts = `// GENERADO por scripts/build-face-models.mjs — no editar a mano.
/** Archivos de la prueba de vida: \`bytes\` = tamaño real; \`wire\` = lo que viaja por la red (gzip). */
export const TFJS_VERSION = ${JSON.stringify(TFJS_VERSION)};
export const FACE_MODEL_FILES = ${JSON.stringify(entries, null, 2)} as const;
`;
writeFileSync(path.join(WEB, "src/lib/client/face-models.ts"), ts);
const wire = entries.filter((e) => e.kind !== "wasm").reduce((a, e) => a + e.wire, 0);
const bytes = entries.filter((e) => e.kind !== "wasm").reduce((a, e) => a + e.bytes, 0);
console.log(`total por teléfono (modelos + wasm SIMD): ${bytes} B → ${wire} B con gzip`);
console.log(readdirSync(MODELS_DIR).join(", "), "|", existsSync(TFJS_DIR) ? readdirSync(TFJS_DIR).join(", ") : "");
