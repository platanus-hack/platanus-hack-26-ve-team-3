import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyPackage } from "@quorum/verifier";
import { ALTERATIONS, expectedFor, type AnchorMode } from "../catalog";
import { applyAlteration, AlterationUnavailable, deepClone, unavailableReason, type LabPackage } from "../alter";
import { evaluate } from "../evaluate";
import { prepare } from "../prepare";
import { decodeEmbedded, digestMatches, encodeEmbedded, parseRecipe, recipeQuery } from "../share";
import { sha256Bytes } from "@/lib/client/zk";

const WEB = path.resolve(__dirname, "../../../../..");
// Fixture v1 del laboratorio: pruebas reales + regla de sorteo + sorteo hecho con el adaptador.
const original = JSON.parse(readFileSync(path.join(WEB, "public/fixtures/protocol/lab-drawn.json"), "utf8")) as LabPackage;
const ROOM_NOTE = "sala abierta (fixture)";
/** El mismo fixture con censo abierto en sala declarado, como lo publica el motor (`withRollPolicy`). */
/** D-22: paquete de una votación al instante (modo continuo) con pruebas reales: 7 inscripciones y 4 boletas. */
const continuous = JSON.parse(readFileSync(path.resolve(WEB, "../../packages/demo-fixtures/protocol/continuous_valid.json"), "utf8")) as LabPackage;
const withRoom: LabPackage = { ...deepClone(original), rollPolicy: { kind: "open-room", maxSeats: 60, joined: 4, enrolled: 4, eligibility: "face-dedupe-demo", note: ROOM_NOTE } };

async function run(alt: (typeof ALTERATIONS)[number]["id"] | null, mode: AnchorMode, base: LabPackage = original) {
  const p = prepare(base, alt, mode);
  return verifyPackage(p.pkg, p.verifyOpts);
}

describe("laboratorio · alteraciones con el verificador REAL (fixture lab-drawn.json, con sorteo)", () => {
  it("el original verifica (sin ancla y con ancla simulada)", async () => {
    expect((await run(null, "none")).valid).toBe(true);
    const sim = await run(null, "sim");
    expect(sim.valid).toBe(true);
    expect(sim.checks.find((c) => c.name === "anchor_matches")?.reason).toMatch(/coincide/);
  }, 60_000);

  for (const spec of ALTERATIONS) {
    for (const mode of ["none", "sim"] as const) {
      it(`${spec.id} (${mode === "none" ? "sin ancla" : "ancla simulada"})`, async () => {
        let base = original;
        if (spec.needs === "continuous") {
          // Solo para votaciones al instante: con el paquete con fases se ofrece deshabilitada, con motivo.
          expect(unavailableReason(original, spec.id)).toMatch(/Solo aplica a votaciones al instante/);
          base = continuous;
        }
        if (spec.needs === "room") {
          // El fixture no declara sala abierta: la alteración se ofrece deshabilitada, con motivo; con sala, aplica.
          expect(unavailableReason(original, spec.id)).toMatch(/censo abierto/);
          expect(() => applyAlteration(original, spec.id)).toThrow(AlterationUnavailable);
          base = withRoom;
        }
        expect(unavailableReason(base, spec.id)).toBeNull();
        const baseline = await run(null, mode, base);
        const result = await run(spec.id, mode, base);
        const ev = evaluate(expectedFor(spec, mode), result, baseline);
        if (expectedFor(spec, mode).length === 0) {
          expect(ev.verdict).toBe("no-detectable");
          expect(result.valid).toBe(true);
        } else {
          expect(ev.verdict, JSON.stringify(result.checks.filter((c) => !c.passed))).toBe("detectado");
          expect(result.valid).toBe(false);
        }
      }, 60_000);
    }
  }

  for (const id of ["tally-inflate", "ballot-root", "group-size"] as const) {
    for (const mode of ["none", "sim"] as const) {
      it(`modo continuo: ${id} (${mode === "none" ? "sin ancla" : "ancla simulada"}) ⇒ detectado`, async () => {
        expect(unavailableReason(continuous, id)).toBeNull();
        const spec = ALTERATIONS.find((a) => a.id === id)!;
        const baseline = await run(null, mode, continuous);
        expect(baseline.valid).toBe(true);
        const result = await run(id, mode, continuous);
        const ev = evaluate(expectedFor(spec, mode), result, baseline);
        expect(ev.verdict, JSON.stringify(result.checks.filter((c) => !c.passed))).toBe("detectado");
        expect(result.valid).toBe(false);
      }, 60_000);
    }
  }

  it("modo continuo: las recetas del formato con fases se ofrecen deshabilitadas, con motivo", () => {
    for (const spec of ALTERATIONS.filter((a) => !["tally-inflate", "ballot-root", "group-size"].includes(a.id))) {
      expect(unavailableReason(continuous, spec.id)).toMatch(/votación al instante el laboratorio ofrece/);
      expect(() => applyAlteration(continuous, spec.id)).toThrow(AlterationUnavailable);
    }
  });

  it("la alteración no toca el original y es determinista", () => {
    const before = JSON.stringify(original);
    const a = applyAlteration(original, "ballot-message");
    const b = applyAlteration(deepClone(original), "ballot-message");
    expect(JSON.stringify(original)).toBe(before);
    expect(JSON.stringify(a.altered)).toBe(JSON.stringify(b.altered));
    expect(a.changes.some((c) => c.kind === "tamper" && c.path === "ledger[0].proof.message")).toBe(true);
    expect(a.changes.some((c) => c.kind === "recomputed" && c.path === "finalHash")).toBe(true);
  });

  it("sorteo: el fixture trae `draw` real; las 2 alteraciones cambian semilla y ganador", () => {
    expect(original.draw?.winners.length).toBeGreaterThan(0);
    const s = applyAlteration(original, "draw-seed").altered;
    expect(s.draw?.seed).not.toBe(original.draw!.seed);
    const w = applyAlteration(original, "draw-winner").altered;
    expect(w.draw!.winners[0]).not.toBe(original.draw!.winners[0]);
    expect(original.draw!.winners).not.toContain(w.draw!.winners[0]);
  });

  it("censo abierto: el verificador declara la sala como garantía no soportada; ocultarla no se detecta (y se dice)", async () => {
    const r = await run(null, "none", withRoom);
    expect(r.valid).toBe(true);
    expect(r.unsupportedGuarantees.join(" ")).toMatch(/censo-abierto-en-sala/);
    const hidden = await run("room-hide", "none", withRoom);
    expect(hidden.valid).toBe(true);
    expect(hidden.unsupportedGuarantees.join(" ")).not.toMatch(/censo-abierto-en-sala/);
  }, 60_000);
});

describe("evaluate", () => {
  const r = (checks: { name: string; passed: boolean }[]) => ({ electionId: "x", verifierVersion: "v", protocol: "semaphore-ledger" as const, inputArtifactDigest: "d", checkedAt: new Date().toISOString(), valid: checks.every((c) => c.passed), checks, unsupportedGuarantees: [] });
  it("check esperado ausente en el verificador ⇒ no evaluado", () => {
    expect(evaluate(["draw_matches"], r([{ name: "tally_matches", passed: true }])).verdict).toBe("no-evaluado");
  });
  it("falla otro check ⇒ detectado-otro; nada falla ⇒ no-detectado", () => {
    expect(evaluate(["tally_matches"], r([{ name: "tally_matches", passed: true }, { name: "chain_integrity", passed: false }])).verdict).toBe("detectado-otro");
    expect(evaluate(["tally_matches"], r([{ name: "tally_matches", passed: true }])).verdict).toBe("no-detectado");
  });
});

describe("compartir", () => {
  it("la receta ida y vuelta", () => {
    const q = recipeQuery({ source: { kind: "election", id: "el-1" }, alteration: "tally-inflate", anchor: "sim", digest: "sha256:abcdef0123456789ffff" });
    const back = parseRecipe(new URLSearchParams(q));
    expect(back).toEqual({ source: { kind: "election", id: "el-1" }, alteration: "tally-inflate", anchor: "sim", digest: "abcdef0123456789" });
    expect(digestMatches("sha256:abcdef0123456789ffff", back!.digest)).toBe(true);
    expect(parseRecipe(new URLSearchParams("alt=nope&fixture=1&d=abcdef01"))).toBeNull();
  });

  it("el paquete embebido se recupera byte a byte (misma huella)", async () => {
    const p = prepare(original, "tally-inflate", "none");
    const enc = await encodeEmbedded(p.bytes);
    const dec = await decodeEmbedded(enc);
    expect(await sha256Bytes(dec)).toBe(await sha256Bytes(p.bytes));
    expect(enc.length).toBeLessThan(p.bytes.length);
  });
});
