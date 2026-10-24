import { describe, expect, it } from "vitest";
import { shortError } from "../clientLog";

describe("shortError (diagnóstico link:error, sin datos personales)", () => {
  it("quita direcciones/hashes 0x…, tokens largos y correos; corta a 80", () => {
    const e = new Error(`Esa wallet 0x${"ab".repeat(20)} ya está enlazada; token tok_${"x".repeat(40)} de ana@example.com`);
    const s = shortError(e);
    expect(s).not.toMatch(/ab{2}ab|xxxxxxxx|ana@example\.com/);
    expect(s).toContain("0x…");
    expect(s.length).toBeLessThanOrEqual(80);
    expect(shortError(new TypeError("Failed to fetch"))).toBe("TypeError: Failed to fetch");
    expect(shortError("x".repeat(300)).length).toBeLessThanOrEqual(80);
  });
});
