import { describe, expect, it } from "vitest";
import { concat, keccak256, toHex } from "viem";
import { DRAW_METHOD, drawSeed, drawWinners, runDraw, sortCandidates, winnersCountFor, winningOptionIndex, type DrawRule } from "../src/index.js";

const FINAL = "0x122281d0c1470dcd0000000000000000000000000000000000000000000000ab" as const;
const candidates = [
  { id: "p-05", label: "Techo del salón" },
  { id: "p-01", label: "Iluminación del estacionamiento" },
  { id: "p-03", label: "Bomba de agua" },
  { id: "p-02", label: "Jardín" },
  { id: "p-04", label: "Cámaras de la entrada" },
  { id: "p-06", label: "Pintura de fachada" },
];

describe("sorteo verificable (drawWinners)", () => {
  it("seed = keccak256(finalHash) sobre los 32 bytes", () => {
    expect(drawSeed(FINAL)).toBe(keccak256(FINAL));
    expect(() => drawSeed("0xABC" as `0x${string}`)).toThrow();
  });

  it("es determinista e independiente del orden de entrada", () => {
    const a = drawWinners(candidates, 3, FINAL);
    const b = drawWinners([...candidates].reverse(), 3, FINAL);
    expect(a).toEqual(b);
    expect(a.winners).toHaveLength(3);
    expect(new Set(a.winners).size).toBe(3);
    for (const w of a.winners) expect(candidates.some((c) => c.id === w)).toBe(true);
  });

  it("reproduce el algoritmo documentado paso a paso (Fisher-Yates parcial con keccak256(seed ‖ uint256(i)))", () => {
    const ids = sortCandidates(candidates).map((c) => c.id);
    const seed = keccak256(FINAL);
    for (let i = 0; i < 2; i++) {
      const r = BigInt(keccak256(concat([seed, toHex(BigInt(i), { size: 32 })])));
      const j = i + Number(r % BigInt(ids.length - i));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    expect(drawWinners(candidates, 2, FINAL).winners).toEqual(ids.slice(0, 2));
  });

  it("otro finalHash cambia la semilla; n se acota al número de candidatos; n=0 → sin ganadores", () => {
    const other = drawWinners(candidates, 6, `0x${"11".repeat(32)}`);
    expect(other.seed).not.toBe(drawSeed(FINAL));
    expect(drawWinners(candidates, 99, FINAL).n).toBe(candidates.length);
    expect(drawWinners(candidates, 0, FINAL).winners).toEqual([]);
    expect(() => drawWinners([{ id: "x" }, { id: "x" }], 1, FINAL)).toThrow(/unique/);
  });

  it("N desde el resultado: opción ganadora (empate → gana el N menor, tieBreak 'lowest') → valor de la opción", () => {
    expect(winningOptionIndex({ counts: [0, 2, 2, 1, 0] })).toBe(1);
    expect(winningOptionIndex({ counts: [0, 2, 2] }, [5, 3, 1])).toBe(2); // empate entre N=3 y N=1 → N=1
    expect(winningOptionIndex({ counts: [0, 0, 0] })).toBeNull();
    const rule: DrawRule = { candidates, winnersCount: { kind: "from-result", optionValues: [1, 2, 3, 4, 5] }, tieBreak: "lowest" };
    expect(winnersCountFor(rule, { counts: [0, 2, 0, 2, 1] })).toBe(2);
    expect(() => winnersCountFor({ ...rule, tieBreak: undefined }, { counts: [1, 0, 0, 0, 0] })).toThrow(/TIE_BREAK_MISSING/);
    expect(winnersCountFor(rule, { counts: [0, 0, 3, 1, 0] })).toBe(3);
    expect(winnersCountFor({ candidates, winnersCount: { kind: "fixed", n: 2 } }, { counts: [0, 0] })).toBe(2);
    const r = runDraw(rule, { counts: [0, 0, 3, 1, 0] }, FINAL);
    expect(r).toMatchObject({ n: 3, method: DRAW_METHOD, finalHash: FINAL, seed: keccak256(FINAL) });
    expect(() => runDraw(rule, { counts: [0, 0, 0, 0, 0] }, FINAL)).toThrow(/NO_VOTES/);
  });
});
