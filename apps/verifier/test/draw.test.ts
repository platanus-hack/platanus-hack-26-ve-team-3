import { beforeAll, describe, expect, it } from "vitest";
import { verifyPackage, recomputeDraw } from "../src/index.js";
// Solo en tests: el adaptador fabrica un paquete real (pruebas Groth16 de verdad) y el sorteo de referencia.
import { buildAuditPackage, buildDemoElection, runDraw, type AuditPackage, type DrawRule } from "@quorum/protocol-adapter";

const failing = (r: Awaited<ReturnType<typeof verifyPackage>>) => r.checks.filter((c) => !c.passed).map((c) => c.name);
const reasonOf = (r: Awaited<ReturnType<typeof verifyPackage>>, name: string) => r.checks.find((c) => c.name === name)?.reason ?? "";

const rule: DrawRule = {
  candidates: [
    { id: "p-01", label: "Iluminación del estacionamiento", amount: 1200 },
    { id: "p-02", label: "Jardín comunal", amount: 800 },
    { id: "p-03", label: "Bomba de agua", amount: 2500 },
    { id: "p-04", label: "Cámaras de la entrada", amount: 1800 },
  ],
  // El demo tiene 3 opciones: valen 1, 2 y 3 ganadores.
  winnersCount: { kind: "from-result", optionValues: [1, 2, 3] },
  tieBreak: "lowest",
};

let base: AuditPackage; // con regla de sorteo, sin sorteo
let drawn: AuditPackage; // con sorteo
beforeAll(async () => {
  const demo = await buildDemoElection({ votes: [1, 1, 0], electionId: "test-draw-election" });
  const manifest = { ...demo.manifest, drawRule: rule };
  const t = demo.pkg.tally;
  base = buildAuditPackage({ electionId: manifest.electionId, manifest, commitments: demo.commitments, ledger: demo.ledger, tally: t });
  drawn = buildAuditPackage({ electionId: manifest.electionId, manifest, commitments: demo.commitments, ledger: demo.ledger, tally: t, draw: runDraw(rule, t, demo.pkg.finalHash) });
}, 60_000);

describe("draw_matches", () => {
  it("regla sin sorteo → check presente y 'no evaluado'", async () => {
    const r = await verifyPackage(base);
    expect(r.valid).toBe(true);
    expect(reasonOf(r, "draw_matches")).toMatch(/no evaluado/);
  });

  it("sorteo legítimo → pasa; N = valor de la opción ganadora (opción 1 → 2 ganadores); coincide con el adaptador", async () => {
    const r = await verifyPackage(drawn);
    expect(r.valid).toBe(true);
    expect(r.checks.map((c) => c.name)).toContain("draw_matches");
    expect(drawn.draw?.n).toBe(2);
    expect(recomputeDraw(rule.candidates.map((c) => c.id), 2, drawn.finalHash).winners).toEqual(drawn.draw?.winners);
    expect(reasonOf(r, "draw_matches")).toMatch(/N=2/);
  });

  it("ganadores cambiados → falla con la lista recomputada", async () => {
    const t = structuredClone(drawn);
    const all = rule.candidates.map((c) => c.id);
    t.draw!.winners = all.filter((id) => !drawn.draw!.winners.includes(id)).slice(0, 2);
    const r = await verifyPackage(t);
    expect(r.valid).toBe(false);
    expect(failing(r)).toEqual(["draw_matches"]);
    expect(reasonOf(r, "draw_matches")).toMatch(/ganadores publicados/);
  });

  it("N inflado o semilla distinta → falla", async () => {
    const t = structuredClone(drawn);
    t.draw!.n = 3;
    expect(failing(await verifyPackage(t))).toEqual(["draw_matches"]);
    const s = structuredClone(drawn);
    s.draw!.seed = `0x${"00".repeat(32)}`;
    expect(reasonOf(await verifyPackage(s), "draw_matches")).toMatch(/semilla publicada/);
  });

  it("empate: gana el N menor (tieBreak 'lowest'); sin tieBreak declarado → falla", async () => {
    // votos [1,1,0] con valores [3,1,2]: empate entre opción 0 (N=3) y 1 (N=1) → N=1
    const demo = await buildDemoElection({ votes: [0, 1], electionId: "test-draw-tie" });
    const tieRule: DrawRule = { ...rule, winnersCount: { kind: "from-result", optionValues: [3, 1, 2] } };
    const manifest = { ...demo.manifest, drawRule: tieRule };
    const t = demo.pkg.tally;
    const draw = runDraw(tieRule, t, demo.pkg.finalHash);
    expect(draw.n).toBe(1);
    const pkg = buildAuditPackage({ electionId: manifest.electionId, manifest, commitments: demo.commitments, ledger: demo.ledger, tally: t, draw });
    expect((await verifyPackage(pkg)).valid).toBe(true);
    const lie = structuredClone(pkg);
    lie.draw = { ...draw, ...recomputeDraw(tieRule.candidates.map((c) => c.id), 3, pkg.finalHash) };
    expect(reasonOf(await verifyPackage(lie), "draw_matches")).toMatch(/N publicado 3 ≠ N recomputado 1/);
    const noTie = { ...manifest, drawRule: { ...tieRule, tieBreak: undefined } };
    const pkg2 = buildAuditPackage({ electionId: manifest.electionId, manifest: noTie, commitments: demo.commitments, ledger: demo.ledger, tally: t, draw });
    expect(reasonOf(await verifyPackage(pkg2), "draw_matches")).toMatch(/regla de empate/);
  }, 60_000);

  it("sorteo sin regla en el manifiesto → falla; regla añadida tras publicar → manifest_hash falla", async () => {
    const noRule = structuredClone(drawn);
    delete (noRule.manifest as { drawRule?: unknown }).drawRule;
    const r = await verifyPackage(noRule);
    expect(failing(r)).toContain("draw_matches");
    expect(failing(r)).toContain("manifest_hash");
    const otherRule = structuredClone(drawn);
    otherRule.manifest.drawRule!.candidates.push({ id: "p-99", label: "Proyecto añadido después" });
    expect(failing(await verifyPackage(otherRule))).toContain("manifest_hash");
  });
});
