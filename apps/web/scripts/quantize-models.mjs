#!/usr/bin/env node
/**
 * Re-cuantiza los pesos de un modelo de grafo de TensorFlow.js (formato de Human: `<nombre>.json` + `<nombre>.bin`).
 * Uso: node scripts/quantize-models.mjs <dir-origen> <dir-destino> <nombre> <uint8|float16> [nombre-salida]
 *
 * TF.js decodifica la cuantización al cargar (`uint8`: v·scale + min, una escala por tensor; `float16`: medio flotante),
 * así que el modelo resultante se usa igual en el navegador, solo pesa menos. Los tensores int32/bool no se tocan.
 * OJO: no todos los modelos lo aguantan (faceres en uint8 pierde mucha separación; ver docs/TEST_RESULTS.md, «rostro
 * rápido»). Medir siempre antes de cambiar un modelo de /models.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function halfToFloat(h) {
  const s = (h & 0x8000) >> 15 ? -1 : 1;
  const e = (h & 0x7c00) >> 10;
  const f = h & 0x03ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);
function floatToHalf(v) {
  f32[0] = v;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  const exp = ((x >>> 23) & 0xff) - 127 + 15;
  let mant = x & 0x7fffff;
  if (exp <= 0) {
    if (exp < -10) return sign;
    mant = (mant | 0x800000) >> (1 - exp);
    return sign | ((mant + 0x1000) >> 13);
  }
  if (exp >= 31) return sign | 0x7c00;
  return sign | (exp << 10) | ((mant + 0x1000) >> 13);
}

/** Lee `<src>/<name>.json` (+ sus .bin), escribe `<dst>/<outName>.json` y `<dst>/<outName>.bin`. Devuelve los bytes. */
export function quantizeModel({ src, dst, name, target, outName = name }) {
  if (!["uint8", "float16"].includes(target)) throw new Error(`destino no soportado: ${target}`);
  const model = JSON.parse(readFileSync(path.join(src, `${name}.json`), "utf8"));
  const groups = model.weightsManifest;
  const bin = Buffer.concat(groups.flatMap((g) => g.paths.map((p) => readFileSync(path.join(src, p)))));
  let off = 0;
  const outWeights = [];
  const chunks = [];
  for (const w of groups.flatMap((g) => g.weights)) {
    const n = w.shape.reduce((a, b) => a * b, 1);
    const q = w.quantization;
    if (w.dtype === "int32" || w.dtype === "bool") {
      const bytes = n * (w.dtype === "bool" ? 1 : 4);
      chunks.push(bin.subarray(off, off + bytes));
      off += bytes;
      outWeights.push({ ...w });
      continue;
    }
    const values = new Float32Array(n);
    if (!q) {
      for (let i = 0; i < n; i++) values[i] = bin.readFloatLE(off + i * 4);
      off += n * 4;
    } else if (q.dtype === "float16") {
      for (let i = 0; i < n; i++) values[i] = halfToFloat(bin.readUInt16LE(off + i * 2));
      off += n * 2;
    } else if (q.dtype === "uint8" || q.dtype === "uint16") {
      const b = q.dtype === "uint8" ? 1 : 2;
      for (let i = 0; i < n; i++) values[i] = (b === 1 ? bin[off + i] : bin.readUInt16LE(off + i * 2)) * q.scale + q.min;
      off += n * b;
    } else throw new Error(`cuantización desconocida: ${q.dtype}`);

    if (target === "float16") {
      const out = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) out.writeUInt16LE(floatToHalf(values[i]), i * 2);
      chunks.push(out);
      outWeights.push({ name: w.name, shape: w.shape, dtype: "float32", quantization: { dtype: "float16" } });
    } else {
      let min = Infinity;
      let max = -Infinity;
      for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const scale = max > min ? (max - min) / 255 : 1;
      const out = Buffer.alloc(n);
      for (let i = 0; i < n; i++) out[i] = Math.max(0, Math.min(255, Math.round((values[i] - min) / scale)));
      chunks.push(out);
      outWeights.push({ name: w.name, shape: w.shape, dtype: "float32", quantization: { dtype: "uint8", min, scale } });
    }
  }
  if (off !== bin.length) throw new Error(`${name}: ${bin.length - off} bytes sin leer`);
  const outBin = Buffer.concat(chunks);
  model.weightsManifest = [{ paths: [`${outName}.bin`], weights: outWeights }];
  writeFileSync(path.join(dst, `${outName}.json`), JSON.stringify(model));
  writeFileSync(path.join(dst, `${outName}.bin`), outBin);
  return { before: bin.length, after: outBin.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, dst, name, target, outName] = process.argv.slice(2);
  if (!src || !dst || !name || !target) {
    console.error("uso: quantize-models.mjs <origen> <destino> <nombre> <uint8|float16> [nombre-salida]");
    process.exit(1);
  }
  const r = quantizeModel({ src, dst, name, target, outName });
  console.log(`${name} → ${outName ?? name} (${target}): ${r.before} → ${r.after} bytes`);
}
