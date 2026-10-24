import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HUMAN_CONFIG } from "../human";
import { HEAVY_ASSETS } from "../room";

const MODELS_DIR = path.resolve(__dirname, "../../../../public/models");

describe("peso por teléfono: Human carga solo lo necesario", () => {
  it("activos: detector, malla (parpadeo/giro), descriptor (dedupe), antispoof y liveness; apagados: iris, emoción, cuerpo, manos…", () => {
    const f = HUMAN_CONFIG.face!;
    expect(f.enabled).toBe(true);
    expect(f.mesh?.enabled).toBe(true);
    expect(f.description?.enabled).toBe(true);
    expect(f.antispoof?.enabled).toBe(true);
    expect(f.liveness?.enabled).toBe(true);
    expect(f.iris?.enabled).toBe(false);
    expect(f.emotion?.enabled).toBe(false);
    expect(f.attention?.enabled).toBe(false);
    for (const k of ["body", "hand", "object", "segmentation"] as const) expect(HUMAN_CONFIG[k]?.enabled).toBe(false);
    expect(HUMAN_CONFIG.gesture?.enabled).toBe(true); // blink / facing left|right salen de la malla
  });

  it("/models sirve exactamente lo que se precarga (sin archivos muertos como iris o models.json)", () => {
    const served = readdirSync(MODELS_DIR).map((f) => `/models/${f}`).sort();
    const prefetched = HEAVY_ASSETS.filter((a) => a.startsWith("/models/")).slice().sort();
    expect(served).toEqual(prefetched);
    expect(served.some((f) => /iris|emotion|models\.json/.test(f))).toBe(false);
  });
});
