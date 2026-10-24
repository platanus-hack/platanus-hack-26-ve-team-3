import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { FACE_MODEL_FILES, TFJS_VERSION } from "../face-models";
import { DESCRIPTOR_DIMS, HUMAN_CONFIG } from "../human";
import { HEAVY_ASSETS, HEAVY_CACHE } from "../room";

const PUBLIC = path.resolve(__dirname, "../../../../public");
const MODELS_DIR = path.join(PUBLIC, "models");

describe("peso por teléfono: Human carga solo lo necesario", () => {
  it("activos: detector, antispoof, liveness e insightface (descriptor); apagados: malla, faceres, iris, emoción, gestos…", () => {
    const f = HUMAN_CONFIG.face! as typeof HUMAN_CONFIG.face & { insightface?: { enabled: boolean; modelPath: string } };
    expect(f.enabled).toBe(true);
    expect(f.mesh?.enabled).toBe(false);
    expect(f.description?.enabled).toBe(false);
    expect(f.insightface).toEqual({ enabled: true, modelPath: "insightface-u8.json" });
    expect(f.antispoof?.enabled).toBe(true);
    expect(f.liveness?.enabled).toBe(true);
    expect(f.iris?.enabled).toBe(false);
    expect(f.emotion?.enabled).toBe(false);
    expect(f.attention?.enabled).toBe(false);
    for (const k of ["body", "hand", "object", "segmentation", "gesture"] as const) expect(HUMAN_CONFIG[k]?.enabled).toBe(false);
    expect(HUMAN_CONFIG.backend).toBe("wasm");
    expect(HUMAN_CONFIG.wasmPath).toBe(`/tfjs/${TFJS_VERSION}/`);
    expect(DESCRIPTOR_DIMS).toBe(256);
  });

  it("/models sirve exactamente los modelos de la config (nada muerto: ni facemesh, ni faceres, ni iris)", () => {
    const served = readdirSync(MODELS_DIR).map((f) => `/models/${f}`).sort();
    const listed = FACE_MODEL_FILES.filter((f) => f.kind === "model").map((f) => f.path).sort();
    expect(served).toEqual(listed);
    const f = HUMAN_CONFIG.face!;
    const used = [f.detector?.modelPath, f.antispoof?.modelPath, f.liveness?.modelPath, "insightface-u8.json"].map((p) => `/models/${p}`);
    for (const p of used) expect(served).toContain(p);
    expect(served.some((p) => /iris|facemesh|faceres|emotion|models\.json/.test(p))).toBe(false);
    // Precarga: modelos + WASM SIMD + ZK (el WASM sin SIMD solo se baja si hace falta).
    expect(HEAVY_ASSETS.filter((a) => a.startsWith("/models/")).slice().sort()).toEqual(listed);
    expect(HEAVY_ASSETS).toContain(`/tfjs/${TFJS_VERSION}/tfjs-backend-wasm-simd.wasm`);
    expect(HEAVY_CACHE).toBe("quorum-heavy-v2");
    expect(readFileSync(path.join(PUBLIC, "sw.js"), "utf8")).toContain(`const CACHE = "${HEAVY_CACHE}"`);
  });

  it("los archivos están guardados con gzip, sus tamaños coinciden con el manifiesto y cada .json apunta a su .bin", () => {
    for (const f of FACE_MODEL_FILES) {
      const wire = readFileSync(path.join(PUBLIC, f.path));
      expect(wire.length, f.path).toBe(f.wire);
      const raw = gunzipSync(wire);
      expect(raw.length, f.path).toBe(f.bytes);
      if (f.path.endsWith(".json")) {
        const m = JSON.parse(raw.toString("utf8")) as { weightsManifest: { paths: string[] }[] };
        for (const p of m.weightsManifest.flatMap((g) => g.paths)) expect(FACE_MODEL_FILES.map((x) => x.path)).toContain(`/models/${p}`);
      }
      if (f.path.endsWith(".wasm")) expect([...raw.subarray(0, 4)]).toEqual([0, 97, 115, 109]);
    }
    const wire = FACE_MODEL_FILES.filter((f) => f.kind !== "wasm").reduce((a, f) => a + f.wire, 0);
    expect(wire).toBeLessThan(3_100_000); // antes: 10,7 MB sin comprimir
  });

  it("el WASM servido es de la misma versión de TF.js que trae Human", () => {
    const require = createRequire(import.meta.url);
    const humanDir = path.resolve(path.dirname(require.resolve("@vladmandic/human")), "..");
    const v = readFileSync(path.join(humanDir, "dist/tfjs.version.js"), "utf8").match(/"(\d+\.\d+\.\d+)"/)?.[1];
    expect(v).toBe(TFJS_VERSION);
  });
});
