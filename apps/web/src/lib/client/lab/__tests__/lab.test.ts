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
const original = JSON.parse(readFileSync(path.join(WEB, "public/fixtures/protocol/valid.json"), "utf8")) as LabPackage;

async function run(alt: (typeof ALTERATIONS)[number]["id"] | null, mode: AnchorMode) {
  const p = prepare(original, alt, mode);
  return verifyPackage(p.pkg, p.verifyOpts);
}

describe("laboratorio · alteraciones con el verificador REAL (fixture valid.json)", () => {
  it("el original verifica (sin ancla y con ancla simulada)", async () => {
    expect((await run(null, "none")).valid).toBe(true);
    const sim = await run(null, "sim");
    expect(sim.valid).toBe(true);
    expect(sim.checks.find((c) => c.name === "anchor_matches")?.reason).toMatch(/coincide/);
  }, 60_000);

  for (const spec of ALTERATIONS) {
    for (const mode of ["none", "sim"] as const) {
      it(`${spec.id} (${mode === "none" ? "sin ancla" : "ancla simulada"})`, async () => {
        const why = unavailableReason(original, spec.id);
        if (spec.needs === "draw") {
          // valid.json no trae sorteo: la alteración se ofrece deshabilitada, con motivo.
          expect(why).toMatch(/no trae sorteo/);
          expect(() => applyAlteration(original, spec.id)).toThrow(AlterationUnavailable);
          return;
        }
        expect(why).toBeNull();
        const baseline = await run(null, mode);
        const result = await run(spec.id, mode);
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

  it("la alteración no toca el original y es determinista", () => {
    const before = JSON.stringify(original);
    const a = applyAlteration(original, "ballot-message");
    const b = applyAlteration(deepClone(original), "ballot-message");
    expect(JSON.stringify(original)).toBe(before);
    expect(JSON.stringify(a.altered)).toBe(JSON.stringify(b.altered));
    expect(a.changes.some((c) => c.kind === "tamper" && c.path === "ledger[0].proof.message")).toBe(true);
    expect(a.changes.some((c) => c.kind === "recomputed" && c.path === "finalHash")).toBe(true);
  });

  it("sorteo: con un paquete que trae `draw`, cambia semilla y ganador", () => {
    const withDraw = deepClone(original);
    withDraw.manifest.drawRule = { candidates: [{ id: "p-a", label: "A" }, { id: "p-b", label: "B" }, { id: "p-c", label: "C" }] };
    withDraw.draw = { seed: `0x${"11".repeat(32)}`, n: 1, winners: ["p-b"], method: "keccak256(finalHash)|fisher-yates", finalHash: original.finalHash };
    const s = applyAlteration(withDraw, "draw-seed").altered;
    expect(s.draw?.seed).not.toBe(withDraw.draw.seed);
    const w = applyAlteration(withDraw, "draw-winner").altered;
    expect(w.draw?.winners).toEqual(["p-a"]);
  });
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
