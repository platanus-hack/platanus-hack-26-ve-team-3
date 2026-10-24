/**
 * Ancla vía QuorumRegistry con transporte SIMULADO (sin red): el "registro" simulado aplica las mismas reglas que
 * contracts/QuorumRegistry.sol (solo el organizador, una sola vez por elección, bytes32 no nulos) y emite `Anchored`.
 */
import { describe, expect, it } from "vitest";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { electionIdToBytes32, encodeAnchor, registryAbi } from "@quorum/wallet";
import { anchorOnRegistry, findAnchoredEvent, BASE_SEPOLIA_CHAIN_ID, type AnchorTransport } from "../src/index";

const REGISTRY: Address = "0x64e7Cbf3b1A334a6633F0025D289335AEdA8be13";
const ORGANIZER: Address = "0x1111111111111111111111111111111111111111";
const FINAL = `0x${"ab".repeat(32)}` as const;

type Log = { address: Address; data: Hex; topics: Hex[] };

/** Registro simulado: guarda txs y produce el log Anchored como lo haría el contrato. */
export function simulatedRegistry(opts: { sender?: Address; chainId?: number; registry?: Address; organizer?: Address; emit?: (log: Log) => Log[] } = {}) {
  const sender = opts.sender ?? ORGANIZER;
  const registry = opts.registry ?? REGISTRY;
  const organizer = opts.organizer ?? ORGANIZER;
  const anchored = new Map<Hex, Hex>();
  const txs = new Map<Hex, { to: Address; data: Hex; logs: Log[] }>();
  let n = 0;
  const t: AnchorTransport & { txs: typeof txs } = {
    txs,
    chainId: async () => opts.chainId ?? BASE_SEPOLIA_CHAIN_ID,
    sender: () => sender,
    send: async (to, data) => {
      const hash = `0x${(++n).toString(16).padStart(64, "0")}` as Hex;
      let logs: Log[] = [];
      if (to.toLowerCase() === registry.toLowerCase()) {
        const { functionName, args } = decodeFunctionData({ abi: registryAbi, data });
        if (functionName !== "anchor") throw new Error("solo anchor en este simulador");
        const [eid, fh] = args as [Hex, Hex];
        if (sender.toLowerCase() !== organizer.toLowerCase()) throw new Error("execution reverted: NotOrganizer()");
        if (anchored.has(eid)) throw new Error("execution reverted: AlreadyAnchored");
        anchored.set(eid, fh);
        const log: Log = {
          address: registry,
          topics: encodeEventTopics({ abi: registryAbi, eventName: "Anchored", args: { electionId: eid, organizer: sender } }) as Hex[],
          data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [fh, 0n]),
        };
        logs = opts.emit ? opts.emit(log) : [log];
      }
      txs.set(hash, { to, data, logs });
      return hash;
    },
    getTransaction: async (hash) => {
      const tx = txs.get(hash);
      if (!tx) throw new Error("tx not found");
      return { from: sender, to: tx.to, input: tx.data, chainId: opts.chainId ?? BASE_SEPOLIA_CHAIN_ID };
    },
    getReceiptLogs: async (hash) => txs.get(hash)?.logs ?? [],
    call: async () => "0x",
  };
  return t;
}

describe("anchorOnRegistry (QuorumRegistry, transporte simulado)", () => {
  it("llama a anchor(keccak256(utf8(electionId)), finalHash) en el registro y devuelve {chainId, txHash, registryAddress}", async () => {
    const t = simulatedRegistry();
    const r = await anchorOnRegistry({ electionId: "el_demo", finalHash: FINAL, registryAddress: REGISTRY }, `0x${"11".repeat(32)}`, "http://mock", { transport: t });
    expect(r).toMatchObject({ chainId: 84532, registryAddress: REGISTRY, organizer: ORGANIZER, castCount: "0" });
    const tx = t.txs.get(r.txHash)!;
    expect(tx.to).toBe(REGISTRY);
    expect(tx.data).toBe(encodeAnchor("el_demo", FINAL));
    const ev = findAnchoredEvent(tx.logs, REGISTRY)!;
    expect(ev.electionId).toBe(electionIdToBytes32("el_demo"));
    expect(ev.finalHash).toBe(FINAL);
  });

  it("rechaza otra cadena, una clave que no es el organizador del manifiesto y un segundo anclaje", async () => {
    await expect(anchorOnRegistry({ electionId: "x", finalHash: FINAL, registryAddress: REGISTRY }, "0x", "http://mock", { transport: simulatedRegistry({ chainId: 1 }) })).rejects.toThrow(/84532/);
    await expect(
      anchorOnRegistry({ electionId: "x", finalHash: FINAL, registryAddress: REGISTRY }, "0x", "http://mock", {
        transport: simulatedRegistry(),
        expectedOrganizer: "0x2222222222222222222222222222222222222222",
      }),
    ).rejects.toThrow(/no es el organizador fijado/);
    const t = simulatedRegistry();
    await anchorOnRegistry({ electionId: "x", finalHash: FINAL, registryAddress: REGISTRY }, "0x", "http://mock", { transport: t });
    await expect(anchorOnRegistry({ electionId: "x", finalHash: FINAL, registryAddress: REGISTRY }, "0x", "http://mock", { transport: t })).rejects.toThrow(/AlreadyAnchored/);
  });

  it("si el receipt no trae el evento Anchored del registro (o trae otro hash), lanza en vez de dar el ancla por hecha", async () => {
    const noLog = simulatedRegistry({ emit: () => [] });
    await expect(anchorOnRegistry({ electionId: "x", finalHash: FINAL, registryAddress: REGISTRY }, "0x", "http://mock", { transport: noLog })).rejects.toThrow(/no contiene el evento Anchored/);
    const otherAddr = simulatedRegistry({ emit: (l) => [{ ...l, address: "0x3333333333333333333333333333333333333333" }] });
    await expect(anchorOnRegistry({ electionId: "x", finalHash: FINAL, registryAddress: REGISTRY }, "0x", "http://mock", { transport: otherAddr })).rejects.toThrow(/no contiene el evento Anchored/);
    const wrongHash = simulatedRegistry({ emit: (l) => [{ ...l, data: encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [`0x${"cd".repeat(32)}`, 0n]) }] });
    await expect(anchorOnRegistry({ electionId: "x", finalHash: FINAL, registryAddress: REGISTRY }, "0x", "http://mock", { transport: wrongHash })).rejects.toThrow(/finalHash no coincide/);
  });
});
