/**
 * QuorumRegistry en un EVM en memoria (@ethereumjs/evm), sin red ni fondos.
 * También comprueba que el ABI/bytecode versionado en el repo coincide con una compilación fresca.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createEVM, type EVM } from "@ethereumjs/evm";
import { createAddressFromString, type Address as EjsAddress } from "@ethereumjs/util";
import { getAddress, bytesToHex, decodeErrorResult, decodeEventLog, decodeFunctionResult, encodeFunctionData, hexToBytes, keccak256, toBytes, type Hex } from "viem";
import { compileRegistry } from "../src/compile";
import { encodeAnchor, encodeCast, electionIdToBytes32, registryAbi, registryBytecode, registrySourceSha256, toBytes32 } from "../src/index";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ORGANIZER = createAddressFromString("0x00000000000000000000000000000000000000aa");
const VOTER = createAddressFromString("0x00000000000000000000000000000000000000bb");
const ELECTION = "demo-condominio-01";
const C1 = keccak256(toBytes("ledger-entry-1"));
const C2 = toBytes32("1234567890123456789012345678901234567890"); // nullifier decimal estilo Semaphore

let evm: EVM;
let registry: EjsAddress;

async function call(caller: EjsAddress, data: Hex) {
  const r = await evm.runCall({ caller, to: registry, data: hexToBytes(data), gasLimit: 1_000_000n, skipBalance: true });
  const logs = (r.execResult.logs ?? []).map(([, topics, d]) => ({ topics: topics.map((t) => bytesToHex(t)) as [Hex, ...Hex[]], data: bytesToHex(d) }));
  const out = bytesToHex(r.execResult.returnValue);
  return { reverted: Boolean(r.execResult.exceptionError), out, logs };
}

async function read<T>(functionName: "organizer" | "isCast" | "castCount" | "finalHashOf", args: readonly unknown[]): Promise<T> {
  const data = encodeFunctionData({ abi: registryAbi, functionName, args } as never);
  const r = await call(VOTER, data);
  return decodeFunctionResult({ abi: registryAbi, functionName, data: r.out } as never) as T;
}

function errorName(out: Hex) {
  return decodeErrorResult({ abi: registryAbi, data: out }).errorName;
}

beforeAll(async () => {
  evm = await createEVM();
  const r = await evm.runCall({ caller: ORGANIZER, data: hexToBytes(registryBytecode), gasLimit: 3_000_000n, skipBalance: true });
  expect(r.execResult.exceptionError).toBeUndefined();
  registry = r.createdAddress!;
});

describe("artefacto compilado", () => {
  it("ABI y bytecode del repo coinciden con una compilación fresca de contracts/QuorumRegistry.sol", () => {
    const fresh = compileRegistry(repoRoot);
    expect(fresh.sourceSha256).toBe(registrySourceSha256);
    expect(fresh.bytecode).toBe(registryBytecode);
    expect(fresh.abi).toEqual(registryAbi);
    const json = JSON.parse(readFileSync(path.join(repoRoot, "contracts/build/QuorumRegistry.json"), "utf8"));
    expect(json.bytecode).toBe(registryBytecode);
  });

  it("el ABI no expone ninguna función que reciba la opción de voto", () => {
    const fns = registryAbi.filter((x) => x.type === "function").map((x) => x.name).sort();
    expect(fns).toEqual(["anchor", "cast", "castCount", "finalHashOf", "isCast", "organizer"]);
  });
});

describe("QuorumRegistry (EVM en memoria)", () => {
  it("organizer = quien despliega", async () => {
    expect((await read<string>("organizer", [])).toLowerCase()).toBe(ORGANIZER.toString());
  });

  it("cast registra el compromiso y emite Cast(electionId, commitment)", async () => {
    const r = await call(VOTER, encodeCast(ELECTION, C1));
    expect(r.reverted).toBe(false);
    expect(r.logs).toHaveLength(1);
    const ev = decodeEventLog({ abi: registryAbi, ...r.logs[0]! });
    expect(ev.eventName).toBe("Cast");
    expect(ev.args).toEqual({ electionId: electionIdToBytes32(ELECTION), commitment: C1 });
    expect(await read<boolean>("isCast", [electionIdToBytes32(ELECTION), C1])).toBe(true);
    expect(await read<bigint>("castCount", [electionIdToBytes32(ELECTION)])).toBe(1n);
  });

  it("rechaza el mismo compromiso dos veces (AlreadyCast)", async () => {
    const r = await call(VOTER, encodeCast(ELECTION, C1));
    expect(r.reverted).toBe(true);
    expect(errorName(r.out)).toBe("AlreadyCast");
  });

  it("acepta nullifiers decimales convertidos a bytes32", async () => {
    const r = await call(VOTER, encodeCast(ELECTION, C2));
    expect(r.reverted).toBe(false);
    expect(await read<bigint>("castCount", [electionIdToBytes32(ELECTION)])).toBe(2n);
  });

  it("el evento Anchored declara organizer como topic indexado (M1)", () => {
    const ev = registryAbi.find((x) => x.type === "event" && x.name === "Anchored") as unknown as { inputs: readonly { name: string; indexed: boolean }[] };
    expect(ev.inputs.find((i) => i.name === "organizer")?.indexed).toBe(true);
  });

  it("anchor solo lo puede llamar el organizador (NotOrganizer)", async () => {
    const r = await call(VOTER, encodeAnchor(ELECTION, keccak256(toBytes("final"))));
    expect(r.reverted).toBe(true);
    expect(errorName(r.out)).toBe("NotOrganizer");
  });

  it("anchor fija el hash final una vez, emite Anchored y cierra la elección", async () => {
    const finalHash = keccak256(toBytes("final"));
    const r = await call(ORGANIZER, encodeAnchor(ELECTION, finalHash));
    expect(r.reverted).toBe(false);
    const ev = decodeEventLog({ abi: registryAbi, ...r.logs[0]! });
    expect(ev.eventName).toBe("Anchored");
    expect(ev.args).toEqual({ electionId: electionIdToBytes32(ELECTION), finalHash, castCount: 2n, organizer: getAddress(ORGANIZER.toString()) });
    expect(await read<Hex>("finalHashOf", [electionIdToBytes32(ELECTION)])).toBe(finalHash);

    const again = await call(ORGANIZER, encodeAnchor(ELECTION, keccak256(toBytes("otro"))));
    expect(errorName(again.out)).toBe("AlreadyAnchored");
    const late = await call(VOTER, encodeCast(ELECTION, keccak256(toBytes("tarde"))));
    expect(late.reverted).toBe(true);
    expect(errorName(late.out)).toBe("AlreadyAnchored");
  });

  it("rechaza valores cero (ZeroValue) y las elecciones son independientes", async () => {
    const zero = await call(VOTER, encodeFunctionData({ abi: registryAbi, functionName: "cast", args: [electionIdToBytes32("otra"), `0x${"0".repeat(64)}`] }));
    expect(errorName(zero.out)).toBe("ZeroValue");
    const other = await call(VOTER, encodeCast("otra", C1));
    expect(other.reverted).toBe(false);
  });
});
