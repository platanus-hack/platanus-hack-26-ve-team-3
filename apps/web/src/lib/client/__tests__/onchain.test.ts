import { describe, expect, it } from "vitest";
import { findNullifier, normalizeNullifier } from "../onchain";
import { LedgerPublic, StoredAudit, VotersListV1 } from "../v1";

describe("nullifier y ledger público", () => {
  it("normaliza a decimal canónico y rechaza hex/vacío", () => {
    expect(normalizeNullifier(" 00123 ")).toBe("123");
    expect(normalizeNullifier("0x1")).toBeNull();
    expect(normalizeNullifier("")).toBeNull();
  });

  it("acepta el ledger de fase open (sin entradas) y el de cierre (con proof)", () => {
    const open = LedgerPublic.parse({ count: 3, finalHash: "0xaa", proofsPublished: false });
    expect(open.entries).toEqual([]);
    const closed = LedgerPublic.parse({ entries: [{ idx: 0, prevHash: "0x00", hash: "0xaa", proof: { nullifier: "42", message: "1" } }] });
    expect(closed.entries[0]).toEqual({ idx: 0, hash: "0xaa", nullifier: "42" });
    expect(findNullifier(closed.entries, "042")?.idx).toBe(0);
    expect(findNullifier(closed.entries, "43")).toBeNull();
  });

  it("GET /voters público trae sólo conteos; GET /audit trae auditResult", () => {
    expect(VotersListV1.parse({ counts: { total: 3, invited: 1, registered: 1, withIdentity: 1, voted: 1 } }).voters).toBeUndefined();
    expect(() => StoredAudit.parse({ result: {}, packageDigest: "x" })).toThrow();
  });
});
