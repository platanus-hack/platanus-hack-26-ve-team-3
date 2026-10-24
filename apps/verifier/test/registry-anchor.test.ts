/**
 * anchor_matches en modo QuorumRegistry, con lector RPC SIMULADO (sin red). Tres estados honestos:
 * verificado / no evaluado / fallo detectado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, keccak256, stringToBytes, type Hex } from "viem";
import { ANCHORED_EVENT_ABI, verifyPackage, type AnchorLog, type AnchorReader } from "../src/index";
import { buildDemoElection, hashCanonical, type AuditPackage } from "@quorum/protocol-adapter";

const REGISTRY = "0x64e7Cbf3b1A334a6633F0025D289335AEdA8be13";
const ORGANIZER = "0x51CD729395EF14cD476f1c208cDd141aAf9dA751";
const OTHER = "0x2222222222222222222222222222222222222222";
const TX = `0x${"a1".repeat(32)}` as const;

const anchorOf = (r: Awaited<ReturnType<typeof verifyPackage>>) => r.checks.find((c) => c.name === "anchor_matches")!;

function anchoredLog(electionId: string, finalHash: Hex, organizer = ORGANIZER, address = REGISTRY): AnchorLog {
  return {
    address,
    topics: encodeEventTopics({ abi: ANCHORED_EVENT_ABI, eventName: "Anchored", args: { electionId: keccak256(stringToBytes(electionId)), organizer: organizer as Hex } }) as Hex[],
    data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [finalHash, 0n]),
  };
}

function reader(logs: AnchorLog[], extra: Partial<{ status: "success" | "reverted"; chainId: number }> = {}): AnchorReader {
  return async (h) => {
    if (h !== TX) throw Object.assign(new Error(`Transaction with hash "${h}" could not be found.`), { name: "TransactionNotFoundError" });
    return { chainId: extra.chainId ?? 84532, from: ORGANIZER, to: REGISTRY, input: "0x", status: extra.status ?? "success", logs };
  };
}

/** Fija `anchorPolicy` en el manifiesto y rehace manifestHash/checksums (como haría el servidor al publicar). */
function withPolicy(pkg: AuditPackage, organizer = ORGANIZER, registry = REGISTRY): AuditPackage {
  const manifest = { ...pkg.manifest, anchorPolicy: { kind: "quorum-registry" as const, chainId: 84532, registryAddress: registry, organizer } };
  const h = hashCanonical(manifest);
  return { ...pkg, manifest, manifestHash: h, checksums: { ...pkg.checksums, manifest: h }, anchor: { chainId: 84532, txHash: TX, registryAddress: REGISTRY } };
}

let base: AuditPackage;
beforeAll(async () => {
  base = (await buildDemoElection({ votes: [0, 1, 1], electionId: "test-registry-anchor" })).pkg;
}, 60_000);

describe("anchor_matches · QuorumRegistry (lector simulado)", () => {
  it("verificado: evento Anchored del registro con electionId, finalHash y organizador del manifiesto", async () => {
    const pkg = withPolicy(base);
    const r = await verifyPackage(pkg, { anchorReader: reader([anchoredLog(pkg.electionId, pkg.finalHash as Hex)]) });
    expect(r.valid).toBe(true);
    expect(r.checks.find((c) => c.name === "manifest_hash")?.passed).toBe(true);
    expect(anchorOf(r)).toMatchObject({ passed: true, status: "verificado" });
    expect(anchorOf(r).reason).toMatch(/organizador 0x51CD.*= el fijado en el manifiesto/);
    expect(r.unsupportedGuarantees.join("\n")).not.toMatch(/inmutabilidad-on-chain|autoria-del-ancla/);
    // el resto de checks "no evaluado" (p. ej. sorteo pendiente) nunca sale como "verificado"
    for (const c of r.checks) if (c.reason?.startsWith("no evaluado")) expect(c.status).toBe("no evaluado");
  });

  it("fallo detectado: paquete con finalHash alterado (el ancla delata el cambio)", async () => {
    const pkg = withPolicy(base);
    const read = reader([anchoredLog(pkg.electionId, pkg.finalHash as Hex)]);
    const t = { ...pkg, finalHash: `0x${"ee".repeat(32)}` };
    const r = await verifyPackage(t, { anchorReader: read });
    expect(r.valid).toBe(false);
    expect(anchorOf(r)).toMatchObject({ passed: false, status: "fallo detectado" });
    expect(anchorOf(r).reason).toMatch(/hash final ≠ ancla/);
  });

  it("fallo detectado: ancló otra dirección distinta a la fijada en el manifiesto", async () => {
    const pkg = withPolicy(base);
    const r = await verifyPackage(pkg, { anchorReader: reader([anchoredLog(pkg.electionId, pkg.finalHash as Hex, OTHER)]) });
    expect(anchorOf(r)).toMatchObject({ passed: false, status: "fallo detectado" });
    expect(anchorOf(r).reason).toMatch(/pero el manifiesto fija como organizador/);
  });

  it("fallo detectado: evento de otra elección, de otro contrato, tx revertida o tx inexistente", async () => {
    const pkg = withPolicy(base);
    const fh = pkg.finalHash as Hex;
    const otherElection = await verifyPackage(pkg, { anchorReader: reader([anchoredLog("otra-eleccion", fh)]) });
    expect(anchorOf(otherElection).reason).toMatch(/Anchored.electionId/);
    const otherContract = await verifyPackage(pkg, { anchorReader: reader([anchoredLog(pkg.electionId, fh, ORGANIZER, OTHER)]) });
    expect(anchorOf(otherContract).reason).toMatch(/exactamente 1 evento Anchored.*hay 0/);
    const reverted = await verifyPackage(pkg, { anchorReader: reader([], { status: "reverted" }) });
    expect(anchorOf(reverted).reason).toMatch(/revertida/);
    const missing = await verifyPackage({ ...pkg, anchor: { ...pkg.anchor!, txHash: `0x${"b2".repeat(32)}` } }, { anchorReader: reader([]) });
    expect(anchorOf(missing).reason).toMatch(/no existe en la cadena/);
    for (const r of [otherElection, otherContract, reverted, missing]) {
      expect(r.valid).toBe(false);
      expect(anchorOf(r).status).toBe("fallo detectado");
    }
  });

  it("fallo detectado sin red: el ancla apunta a un registro distinto del fijado en el manifiesto", async () => {
    const pkg = withPolicy(base, ORGANIZER, OTHER);
    const r = await verifyPackage(pkg); // sin RPC
    expect(anchorOf(r)).toMatchObject({ passed: false, status: "fallo detectado" });
    expect(anchorOf(r).reason).toMatch(/registro del ancla .* ≠ registro fijado en el manifiesto/);
  });

  it("no evaluado: sin RPC; con RPC caído (y el paquete no se da por válido); manifiesto sin organizador fijado", async () => {
    const pkg = withPolicy(base);
    const noRpc = await verifyPackage(pkg);
    expect(anchorOf(noRpc)).toMatchObject({ passed: true, status: "no evaluado" });
    expect(noRpc.unsupportedGuarantees.join("\n")).toMatch(/inmutabilidad-on-chain/);

    const down = await verifyPackage(pkg, { anchorReader: async () => { throw new Error("fetch failed: ECONNREFUSED"); } });
    expect(down.valid).toBe(false);
    expect(anchorOf(down)).toMatchObject({ passed: false, status: "no evaluado" });

    // Paquete antiguo: ancla vía registro pero el manifiesto no fija organizador (hallazgo M1) → coincide, pero no se sabe quién ancló.
    const unpinned = { ...base, anchor: { chainId: 84532, txHash: TX, registryAddress: REGISTRY } };
    const r = await verifyPackage(unpinned, { anchorReader: reader([anchoredLog(base.electionId, base.finalHash as Hex, OTHER)]) });
    expect(anchorOf(r)).toMatchObject({ passed: true, status: "no evaluado" });
    expect(anchorOf(r).reason).toMatch(/no fija la dirección del organizador/);
    expect(r.unsupportedGuarantees.join("\n")).toMatch(/autoria-del-ancla/);
  });

  it("anchorPolicy entra en manifestHash: cambiar el organizador fijado sin rehacer el hash se detecta", async () => {
    const pkg = withPolicy(base);
    const t = { ...pkg, manifest: { ...pkg.manifest, anchorPolicy: { ...pkg.manifest.anchorPolicy!, organizer: OTHER } } };
    const r = await verifyPackage(t, { anchorReader: reader([anchoredLog(pkg.electionId, pkg.finalHash as Hex, OTHER)]) });
    expect(r.checks.find((c) => c.name === "manifest_hash")).toMatchObject({ passed: false, status: "fallo detectado" });
    expect(r.valid).toBe(false);
  });

  it("modo antiguo (calldata) con organizador fijado: una tx enviada por otra cuenta falla", async () => {
    const { encodeAnchorCalldata } = await import("@quorum/protocol-adapter");
    const pkg = withPolicy(base);
    const legacy = { ...pkg, anchor: { chainId: 84532, txHash: TX } };
    // sin registryAddress en el ancla el manifiesto que fija registro lo marca como contradicción
    const contradiction = await verifyPackage(legacy);
    expect(anchorOf(contradiction).reason).toMatch(/no es una llamada al registro/);
    const input = encodeAnchorCalldata({ finalHash: base.finalHash, groupRoot: base.groupRoot, tallyHash: base.tallyHash, electionId: base.electionId });
    const legacyReader: AnchorReader = async () => ({ chainId: 84532, from: OTHER, to: OTHER, input });
    const unpinned = await verifyPackage({ ...base, anchor: { chainId: 84532, txHash: TX } }, { anchorReader: legacyReader });
    expect(anchorOf(unpinned)).toMatchObject({ passed: true, status: "no evaluado" });

    // anchorPolicy "calldata": organizador fijado sin registro
    const manifest = { ...base.manifest, anchorPolicy: { kind: "calldata" as const, chainId: 84532, organizer: ORGANIZER } };
    const h = hashCanonical(manifest);
    const pinned = { ...base, manifest, manifestHash: h, checksums: { ...base.checksums, manifest: h }, anchor: { chainId: 84532, txHash: TX } };
    const byOther = await verifyPackage(pinned, { anchorReader: legacyReader });
    expect(anchorOf(byOther)).toMatchObject({ passed: false, status: "fallo detectado" });
    expect(anchorOf(byOther).reason).toMatch(/no el organizador fijado en el manifiesto/);
    const byOrganizer = await verifyPackage(pinned, { anchorReader: async () => ({ chainId: 84532, from: ORGANIZER, to: ORGANIZER, input }) });
    expect(anchorOf(byOrganizer)).toMatchObject({ passed: true, status: "verificado" });
    expect(byOrganizer.valid).toBe(true);
  });
});
