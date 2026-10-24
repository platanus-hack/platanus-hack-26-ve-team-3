import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  ARTIFACT_SHA256,
  BASE_SEPOLIA_CHAIN_ID,
  EAS_BASE_SEPOLIA,
  LedgerRejection,
  anchorOnBaseSepolia,
  appendBallot,
  attestAnchorOnEas,
  buildAuditPackage,
  buildGroup,
  canonicalJson,
  castBallot,
  createLedger,
  createVoterIdentity,
  decodeAnchorCalldata,
  decodeEasAttestCalldata,
  defaultArtifacts,
  electionScope,
  encodeAnchorCalldata,
  finalHash,
  groupRoot,
  manifestHash,
  readAnchor,
  tally,
  verifyProof,
  demoManifest,
  type AnchorTransport,
  type SemaphoreProof,
} from "../src/index.js";
import { encodeAbiParameters, getAbiItem, padHex, toEventSelector, type Address, type Hex } from "viem";
import { EAS_ABI } from "../src/anchor.js";

const artifacts = defaultArtifacts();
const electionId = "test-election-1";
const manifest = demoManifest(electionId);

describe("artefactos vendorizados", () => {
  it("coinciden con los SHA-256 registrados (CDN snark-artifacts.pse.dev/semaphore/4.13.0)", () => {
    for (const k of ["wasm", "zkey"] as const) {
      const digest = createHash("sha256").update(readFileSync(artifacts[k])).digest("hex");
      expect(digest).toBe(ARTIFACT_SHA256[k]);
    }
  });
});

describe("hash canónico", () => {
  it("ordena claves y serializa bigint", () => {
    expect(canonicalJson({ b: 1n, a: [{ z: 1, y: undefined }] })).toBe('{"a":[{"z":1}],"b":"1"}');
  });
  it("electionScope es determinista y cabe en 31 bytes", () => {
    const s = electionScope("x".repeat(80));
    expect(s).toBe(electionScope("x".repeat(80)));
    expect(BigInt(s) < 1n << 248n).toBe(true);
  });
});

describe("identidad → grupo → prueba → ledger → paquete", () => {
  const voters = [createVoterIdentity(), createVoterIdentity(), createVoterIdentity()];
  const commitments = voters.map((v) => v.commitment);
  const root = groupRoot(commitments);
  const proofs: SemaphoreProof[] = [];

  beforeAll(async () => {
    proofs.push(await castBallot(voters[0].privateKey, commitments, electionId, 1, artifacts));
    proofs.push(await castBallot(voters[1].privateKey, commitments, electionId, 0, artifacts));
    proofs.push(await castBallot(voters[2].privateKey, commitments, electionId, 1, artifacts));
  }, 60_000);

  it("la identidad exporta clave y commitment; el grupo tiene raíz estable", () => {
    expect(voters[0].privateKey.length).toBeGreaterThan(20);
    expect(buildGroup(commitments).size).toBe(3);
    expect(groupRoot(commitments)).toBe(root);
    expect(groupRoot([...commitments].reverse())).not.toBe(root);
  });

  it("las pruebas son válidas, con profundidad 10, scope y raíz de la elección", async () => {
    for (const p of proofs) {
      expect(p.merkleTreeDepth).toBe(10);
      expect(p.merkleTreeRoot).toBe(root);
      expect(p.scope).toBe(electionScope(electionId));
      expect(await verifyProof(p)).toBe(true);
    }
    expect(proofs.map((p) => p.message)).toEqual(["1", "0", "1"]);
    expect(new Set(proofs.map((p) => p.nullifier)).size).toBe(3);
  });

  it("una prueba manipulada no verifica", async () => {
    const tampered = { ...proofs[0], message: "2" };
    expect(await verifyProof(tampered)).toBe(false);
  });

  it("un no elegible no puede emitir boleta", async () => {
    const outsider = createVoterIdentity();
    await expect(castBallot(outsider.privateKey, commitments, electionId, 0, artifacts)).rejects.toThrow(/NOT_IN_GROUP/);
  });

  it("ledger: acepta 3 boletas, rechaza doble voto, raíz incorrecta, scope incorrecto y prueba inválida", async () => {
    const ledger = createLedger(electionId, root);
    expect(finalHash(ledger)).toBe(ledger.genesisHash);
    for (const p of proofs) await appendBallot(ledger, p, root);
    expect(ledger.entries.length).toBe(3);
    expect(ledger.entries[1].prevHash).toBe(ledger.entries[0].hash);
    expect(finalHash(ledger)).toBe(ledger.entries[2].hash);

    // doble voto: nueva prueba con la misma credencial (otro mensaje) ⇒ mismo nullifier
    const again = await castBallot(voters[0].privateKey, commitments, electionId, 2, artifacts);
    expect(again.nullifier).toBe(proofs[0].nullifier);
    await expect(appendBallot(ledger, again, root)).rejects.toMatchObject({ code: "DOUBLE_VOTE" } satisfies Partial<LedgerRejection>);

    await expect(appendBallot(ledger, proofs[0], "123")).rejects.toMatchObject({ code: "WRONG_ROOT" });

    // prueba de otra elección (otro scope) sobre el mismo padrón
    const otherScope = await castBallot(voters[1].privateKey, commitments, "other-election", 0, artifacts);
    await expect(appendBallot(ledger, otherScope, root)).rejects.toMatchObject({ code: "WRONG_SCOPE" });

    // prueba de otro padrón (raíz distinta)
    const otherRoll = [...commitments, createVoterIdentity().commitment];
    const otherRootProof = await castBallot(voters[1].privateKey, otherRoll, electionId, 0, artifacts);
    await expect(appendBallot(ledger, otherRootProof, root)).rejects.toMatchObject({ code: "WRONG_ROOT" });

    // prueba inválida con nullifier nuevo
    const fresh = createLedger(electionId, root);
    const bad = { ...proofs[2], message: "2" };
    await expect(appendBallot(fresh, bad, root)).rejects.toMatchObject({ code: "INVALID_PROOF" });

    expect(tally(ledger, 3)).toEqual({ counts: [1, 2, 0], invalid: 0, total: 3 });
    expect(ledger.entries.length).toBe(3);

    const pkg = buildAuditPackage({ electionId, manifest, commitments, ledger, tally: tally(ledger, 3) });
    expect(pkg.version).toBe("quorum-audit/1");
    expect(pkg.protocol).toBe("semaphore-ledger");
    expect(pkg.groupRoot).toBe(root);
    expect(pkg.manifestHash).toBe(manifestHash(manifest));
    expect(pkg.finalHash).toBe(finalHash(ledger));
    expect(pkg.anchor).toBeNull();
    expect(pkg.ledger.map((e) => e.idx)).toEqual([0, 1, 2]);
    // sin PII: solo commitments, nunca claves privadas ni nombres
    const text = JSON.stringify(pkg);
    for (const v of voters) expect(text).not.toContain(v.privateKey);
    expect(JSON.parse(text)).toEqual(pkg); // serializable tal cual
  }, 60_000);
});

describe("ancla en Base Sepolia (transporte simulado; sin tx real)", () => {
  const payload = { finalHash: `0x${"ab".repeat(32)}` as const, groupRoot: groupRoot(["1", "2", "3"]), tallyHash: `0x${"cd".repeat(32)}` as const, electionId: "fixture-condominio-2026" };
  const from: Address = "0x1111111111111111111111111111111111111111";

  function mockTransport(chainId = BASE_SEPOLIA_CHAIN_ID) {
    const txs = new Map<Hex, { to: Address; data: Hex }>();
    let n = 0;
    const t: AnchorTransport & { txs: typeof txs } = {
      txs,
      chainId: async () => chainId,
      sender: () => from,
      send: async (to, data) => {
        const hash = `0x${(++n).toString(16).padStart(64, "0")}` as Hex;
        txs.set(hash, { to, data });
        return hash;
      },
      getTransaction: async (hash) => {
        const tx = txs.get(hash);
        if (!tx) throw new Error("tx not found");
        return { from, to: tx.to, input: tx.data, chainId };
      },
      getReceiptLogs: async (hash) => {
        const tx = txs.get(hash);
        if (!tx || tx.to.toLowerCase() !== EAS_BASE_SEPOLIA.toLowerCase()) return [];
        const uid = `0x${"77".repeat(32)}` as Hex;
        const selector = toEventSelector(getAbiItem({ abi: EAS_ABI, name: "Attested" }));
        const topics: Hex[] = [selector, padHex(from, { size: 32 }), padHex(from, { size: 32 }), `0x${"55".repeat(32)}`];
        return [{ address: EAS_BASE_SEPOLIA, data: encodeAbiParameters([{ type: "bytes32" }], [uid]), topics }];
      },
      call: async () => "0x",
    };
    return t;
  }

  it("calldata (bytes32,bytes32,bytes32,string) va y vuelve", () => {
    expect(decodeAnchorCalldata(encodeAnchorCalldata(payload))).toEqual(payload);
  });

  it("anchorOnBaseSepolia manda una tx a la propia cuenta y readAnchor la decodifica", async () => {
    const t = mockTransport();
    const res = await anchorOnBaseSepolia(payload, `0x${"11".repeat(32)}`, "http://mock", { transport: t });
    expect(res.chainId).toBe(84532);
    expect(t.txs.get(res.txHash)?.to).toBe(from);
    const read = await readAnchor(res.txHash, "http://mock", { transport: t });
    expect(read.selfTransfer).toBe(true);
    expect(read.payload).toEqual(payload);
  });

  it("rechaza otra cadena", async () => {
    await expect(anchorOnBaseSepolia(payload, `0x${"11".repeat(32)}`, "http://mock", { transport: mockTransport(1) })).rejects.toThrow(/84532/);
  });

  it("EAS: desactivado por defecto; con bandera codifica attest() y devuelve el uid del evento", async () => {
    const schema = `0x${"55".repeat(32)}` as const;
    await expect(attestAnchorOnEas(payload, schema, `0x${"11".repeat(32)}`, "http://mock")).rejects.toThrow(/EAS_DISABLED/);
    const t = mockTransport();
    const res = await attestAnchorOnEas(payload, schema, `0x${"11".repeat(32)}`, "http://mock", { enabled: true, transport: t });
    expect(res.attestationUid).toBe(`0x${"77".repeat(32)}`);
    const decoded = decodeEasAttestCalldata(t.txs.get(res.txHash)!.data);
    expect(decoded.schemaUid).toBe(schema);
    expect(decoded.payload).toEqual(payload);
  });
});
