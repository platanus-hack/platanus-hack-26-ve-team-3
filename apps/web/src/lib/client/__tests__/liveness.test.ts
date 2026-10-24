// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { CAPTURES, cosine, faceFilesFor, formatMB, LivenessTracker, resolveBackend, TURN_DELTA, yawProxy, type LivenessFrame } from "../human";

const emb = (seed: number, noise = 0) => Array.from({ length: 256 }, (_, i) => Math.sin(seed * 31 + i) + (noise ? Math.cos(i * noise) * 0.05 : 0));

describe("yawProxy (giro con los puntos del detector)", () => {
  it("de frente ≈ 0; nariz hacia un lado ⇒ signo y magnitud", () => {
    expect(yawProxy({ mesh: [[100, 100, 0], [160, 100, 0], [130, 130, 0]] })).toBeCloseTo(0);
    expect(yawProxy({ mesh: [[100, 100, 0], [160, 100, 0], [151, 130, 0]] })).toBeCloseTo(0.35);
    expect(yawProxy({ mesh: [[100, 100, 0], [160, 100, 0], [109, 130, 0]] })).toBeCloseTo(-0.35);
    expect(yawProxy({ mesh: [] })).toBeNull();
  });
});

describe("LivenessTracker: mirar → girar → volver a mirar", () => {
  const frame = (t: number, over: Partial<LivenessFrame> = {}): LivenessFrame => ({ t, face: true, present: true, yaw: 0.02, embedding: emb(1, t), ...over });

  it("flujo completo: 3 capturas de frente, giro, vuelta ⇒ promedio de 4 descriptores", () => {
    const tr = new LivenessTracker();
    let t = 0;
    expect(tr.feed(frame(t))).toBe("look");
    // Capturas separadas ≥250 ms: un cuadro a los 100 ms no cuenta.
    expect(tr.feed(frame((t += 100)))).toBe("look");
    expect(tr.captures).toHaveLength(1);
    while (tr.stage === "look") tr.feed(frame((t += 260)));
    expect(tr.captures).toHaveLength(CAPTURES);
    expect(tr.stage).toBe("turn");
    // Un giro pequeño no basta; uno ≥ TURN_DELTA sí (aunque antispoof baje durante el giro).
    expect(tr.feed(frame((t += 50), { yaw: 0.15 }))).toBe("turn");
    expect(tr.feed(frame((t += 50), { yaw: 0.02 + TURN_DELTA + 0.01, present: false }))).toBe("back");
    // Sigue girado: espera a que vuelva de frente.
    expect(tr.feed(frame((t += 50), { yaw: 0.4 }))).toBe("back");
    expect(tr.feed(frame((t += 50)))).toBe("done");
    expect(tr.result).toHaveLength(256);
  });

  it("antispoof/liveness bajo el umbral ⇒ «spoof», sin capturar", () => {
    const tr = new LivenessTracker();
    expect(tr.feed(frame(0, { present: false }))).toBe("spoof");
    expect(tr.captures).toHaveLength(0);
    expect(tr.feed(frame(300))).toBe("look");
  });

  it("de lado al empezar no captura (tiene que mirar de frente)", () => {
    const tr = new LivenessTracker();
    tr.feed(frame(0, { yaw: 0.5 }));
    expect(tr.captures).toHaveLength(0);
  });

  it("si al volver aparece OTRA cara, empieza de nuevo", () => {
    const tr = new LivenessTracker();
    let t = 0;
    while (tr.stage === "look") tr.feed(frame((t += 300)));
    tr.feed(frame((t += 50), { yaw: 0.5 }));
    expect(tr.stage).toBe("back");
    const otherFace = Array.from({ length: 256 }, (_, i) => (i % 2 ? 1 : -1) * Math.cos(i * 7.3));
    expect(cosine(otherFace, emb(1))).toBeLessThan(0.55);
    expect(tr.feed(frame((t += 50), { embedding: otherFace }))).toBe("look");
    expect(tr.captures).toHaveLength(0);
    expect(tr.result).toBeNull();
  });
});

describe("selección de backend (?fb=) y archivos a descargar", () => {
  afterEach(() => sessionStorage.clear());

  it("por defecto wasm; ?fb= lo cambia y se recuerda en la pestaña; ?fb=auto vuelve al defecto", () => {
    expect(resolveBackend("")).toEqual({ backend: "wasm", source: "default" });
    expect(resolveBackend("?fb=humangl")).toEqual({ backend: "humangl", source: "query" });
    expect(resolveBackend("")).toEqual({ backend: "humangl", source: "session" });
    expect(resolveBackend("?fb=nada")).toEqual({ backend: "humangl", source: "session" });
    expect(resolveBackend("?fb=auto")).toEqual({ backend: "wasm", source: "default" });
    expect(resolveBackend("?fb=webgl").backend).toBe("webgl");
  });

  it("wasm baja su binario (SIMD o no); WebGL no baja ningún .wasm", () => {
    const simd = faceFilesFor("wasm", true).map((f) => f.path);
    expect(simd.filter((p) => p.endsWith(".wasm"))).toEqual([expect.stringMatching(/tfjs-backend-wasm-simd\.wasm$/)]);
    expect(faceFilesFor("wasm", false).filter((f) => f.path.endsWith(".wasm")).map((f) => f.kind)).toEqual(["wasm"]);
    expect(faceFilesFor("humangl").some((f) => f.path.endsWith(".wasm"))).toBe(false);
    expect(faceFilesFor("humangl")).toHaveLength(8);
  });

  it("MB con coma decimal", () => {
    expect(formatMB(1_234_567)).toBe("1,2");
    expect(formatMB(2_966_034)).toBe("3,0");
  });
});
