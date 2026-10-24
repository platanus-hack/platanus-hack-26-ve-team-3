import { describe, expect, it } from "vitest";
import { AuditResponse, LedgerResponse, VotersListResponse } from "@quorum/contracts";
import { findNullifier, normalizeNullifier } from "../onchain";

const proof = (nullifier: string) => ({ merkleTreeDepth: 10, merkleTreeRoot: "1", message: "1", nullifier, scope: "2", points: ["1", "2", "3", "4", "5", "6", "7", "8"] });

describe("nullifier y ledger público (formas reales del backend, @quorum/contracts)", () => {
  it("normaliza a decimal canónico y rechaza hex/vacío", () => {
    expect(normalizeNullifier(" 00123 ")).toBe("123");
    expect(normalizeNullifier("0x1")).toBeNull();
    expect(normalizeNullifier("")).toBeNull();
  });

  it("acepta el ledger de fase open (sin entradas, hashes null antes de abrir) y el de cierre (con proof)", () => {
    const pre = LedgerResponse.parse({ electionId: "e", status: "registration", groupRoot: null, scope: null, genesisHash: null, finalHash: null, count: 0, proofsPublished: false, entries: [] });
    expect(pre.entries).toEqual([]);
    const closed = LedgerResponse.parse({ electionId: "e", status: "auditable", groupRoot: "1", scope: "2", genesisHash: "0x00", finalHash: "0xaa", count: 1, proofsPublished: true, entries: [{ idx: 0, prevHash: "0x00", hash: "0xaa", proof: proof("42") }] });
    const entries = closed.entries.flatMap((x) => ("proof" in x ? [{ idx: x.idx, hash: x.hash, nullifier: x.proof.nullifier }] : []));
    expect(findNullifier(entries, "042")?.idx).toBe(0);
    expect(findNullifier(entries, "43")).toBeNull();
  });

  it("GET /voters público trae sólo conteos; GET /audit trae auditResult y anchorStatus como objeto", () => {
    expect(VotersListResponse.parse({ counts: { total: 3, invited: 1, registered: 1, withIdentity: 1, voted: 1 } }).voters).toBeUndefined();
    expect(() => AuditResponse.parse({ result: {}, packageDigest: "x", anchorStatus: null })).toThrow();
  });
});
