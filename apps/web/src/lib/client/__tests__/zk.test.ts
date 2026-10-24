import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ARTIFACT_SHA256, createVoterIdentity, verifyProof } from "@quorum/protocol-adapter";
import { proveBallot, verifyPackageInBrowser } from "../zk";

const WEB = path.resolve(__dirname, "../../../..");
const REPO = path.resolve(WEB, "../..");
const read = (p: string) => new Uint8Array(readFileSync(p));
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("artefactos y fixtures servidos por la web", () => {
  it("public/zk tiene los artefactos Groth16 con los SHA-256 registrados en el adaptador", () => {
    expect(sha(path.join(WEB, "public/zk/semaphore-10.wasm"))).toBe(ARTIFACT_SHA256.wasm);
    expect(sha(path.join(WEB, "public/zk/semaphore-10.zkey"))).toBe(ARTIFACT_SHA256.zkey);
  });

  it("public/fixtures/protocol es copia exacta de packages/demo-fixtures/protocol", () => {
    for (const f of ["valid.json", "tampered_total.json"]) {
      expect(sha(path.join(WEB, "public/fixtures/protocol", f))).toBe(sha(path.join(REPO, "packages/demo-fixtures/protocol", f)));
    }
  });
});

describe("verifyPackageInBrowser (el mismo verificador que corre en el navegador)", () => {
  it("paquete íntegro: valid=true, hash de entrada = sha256 de los bytes, ancla 'no evaluado'", async () => {
    const file = path.join(WEB, "public/fixtures/protocol/valid.json");
    const out = await verifyPackageInBrowser(read(file));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.valid).toBe(true);
    expect(out.result.inputArtifactDigest).toBe(`sha256:${sha(file)}`);
    expect(out.result.checks.find((c) => c.name === "anchor_matches")?.reason).toMatch(/^no evaluado/);
  }, 30_000);

  it("total alterado: valid=false con la causa en tally_matches", async () => {
    const out = await verifyPackageInBrowser(read(path.join(WEB, "public/fixtures/protocol/tampered_total.json")));
    expect(out.ok && out.result.valid).toBe(false);
    if (out.ok) expect(out.result.checks.find((c) => c.name === "tally_matches")?.passed).toBe(false);
  }, 30_000);

  it("bytes que no son JSON: error explícito, nunca un veredicto", async () => {
    const out = await verifyPackageInBrowser(new TextEncoder().encode("no-es-json"));
    expect(out.ok).toBe(false);
  });
});

describe("proveBallot (castBallot del adaptador con los artefactos de public/zk)", () => {
  it("genera una prueba real que verifica y cuyo message es el índice de opción", async () => {
    const me = createVoterIdentity();
    const others = [createVoterIdentity(), createVoterIdentity()];
    const commitments = [others[0].commitment, me.commitment, others[1].commitment];
    const r = await proveBallot({ privateKey: me.privateKey, commitments, electionId: "e-test", optionIndex: 2, artifactsBase: path.join(WEB, "public/zk") });
    expect(r.message).toBe("2");
    expect(await verifyProof(r.proof as Parameters<typeof verifyProof>[0])).toBe(true);
  }, 60_000);

  it("rechaza una credencial que no está en el padrón", async () => {
    const me = createVoterIdentity();
    await expect(proveBallot({ privateKey: me.privateKey, commitments: [createVoterIdentity().commitment], electionId: "e", optionIndex: 0, artifactsBase: path.join(WEB, "public/zk") })).rejects.toThrow(/NOT_IN_GROUP/);
  }, 60_000);
});
