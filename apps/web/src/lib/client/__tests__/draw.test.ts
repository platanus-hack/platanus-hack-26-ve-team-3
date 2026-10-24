import { describe, expect, it } from "vitest";
import { drawWinners } from "@quorum/protocol-adapter";
import { compareDraw, recomputeDraw } from "../draw";

const candidates = ["p-huerto", "p-luces", "p-cancha", "p-pintura", "p-biblioteca"].map((id) => ({ id, label: id }));
const finalHash = "0x122281d0c1470dcda725564556e276264e2072749952cab6bdde18dc267a33a3";

describe("sorteo: recomputar en el navegador con el adaptador", () => {
  it("usa drawWinners del adaptador (mismo resultado que el servidor) y no depende del orden de entrada", async () => {
    const a = await recomputeDraw(candidates, 2, finalHash);
    const b = await recomputeDraw([...candidates].reverse(), 2, finalHash);
    const server = drawWinners(candidates, 2, finalHash);
    expect(a).toEqual({ seed: server.seed, winners: server.winners, n: 2 });
    expect(b).toEqual(a);
    expect(new Set(a.winners).size).toBe(2);
  });

  it("cambia si cambia el hash final", async () => {
    const other = await recomputeDraw(candidates, 5, "0x" + "11".repeat(32));
    expect(other.winners).not.toEqual((await recomputeDraw(candidates, 5, finalHash)).winners);
  });

  it("rechaza un finalHash mal formado", async () => {
    await expect(recomputeDraw(candidates, 2, "0x1234")).rejects.toThrow();
  });

  it("coincide sólo con la misma semilla y los mismos ganadores en el mismo orden", async () => {
    const r = await recomputeDraw(candidates, 2, finalHash);
    expect(compareDraw({ winners: r.winners, seed: r.seed }, r)).toBe("coincide");
    expect(compareDraw({ winners: [...r.winners].reverse(), seed: r.seed }, r)).toBe("no coincide");
    expect(compareDraw({ winners: ["x", "y"], seed: r.seed }, r)).toBe("no coincide");
    expect(compareDraw({ winners: r.winners, seed: "0x" + "00".repeat(32) }, r)).toBe("no coincide");
  });
});
