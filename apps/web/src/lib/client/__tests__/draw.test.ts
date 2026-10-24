import { describe, expect, it } from "vitest";
import { compareDraw, recomputeDraw, referenceDraw } from "../draw";

const candidates = ["p-huerto", "p-luces", "p-cancha", "p-pintura", "p-biblioteca"].map((id) => ({ id, label: id }));
const finalHash = "0x122281d0c1470dcda725564556e276264e2072749952cab6bdde18dc267a33a3";

describe("sorteo: referencia local", () => {
  it("es determinista, elige N distintos y no depende del orden de entrada", () => {
    const a = referenceDraw(candidates, 2, finalHash);
    const b = referenceDraw([...candidates].reverse(), 2, finalHash);
    expect(a.winners).toHaveLength(2);
    expect(new Set(a.winners).size).toBe(2);
    expect(a).toEqual(b);
    expect(a.order.slice().sort()).toEqual(candidates.map((c) => c.id).sort());
  });

  it("cambia si cambia el hash final", () => {
    const other = referenceDraw(candidates, 5, "0x" + "11".repeat(32));
    expect(other.order).not.toEqual(referenceDraw(candidates, 5, finalHash).order);
  });

  it("rechaza un finalHash mal formado", () => {
    expect(() => referenceDraw(candidates, 2, "0x1234")).toThrow();
  });

  it("recomputeDraw cae en la referencia local mientras el adaptador no exporte drawWinners", async () => {
    const r = await recomputeDraw(candidates, 2, finalHash);
    expect(["adapter", "local-reference"]).toContain(r.source);
    if (r.source === "local-reference") expect(r.winners).toEqual(referenceDraw(candidates, 2, finalHash).winners);
  });

  it("un desacuerdo con la referencia local es 'no verificable'; con el adaptador, 'no coincide'", () => {
    const ref = referenceDraw(candidates, 2, finalHash);
    expect(compareDraw({ winners: [...ref.winners].reverse() }, ref)).toBe("coincide");
    expect(compareDraw({ winners: ["x", "y"] }, ref)).toBe("no verificable");
    expect(compareDraw({ winners: ["x", "y"] }, { ...ref, source: "adapter" })).toBe("no coincide");
  });
});
