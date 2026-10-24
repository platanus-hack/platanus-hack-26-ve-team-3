import { describe, expect, it } from "vitest";
import { verifyTypedData } from "viem";
import { createEoaDemoWallet } from "@/components/voter/wallet/eoaDemo";
import { faceBindingTypedData, FaceBindingTypes } from "../faceBinding";
import { voteDomain } from "../vote";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // clave de prueba (hardhat #1), nunca real

describe("FaceBinding EIP-712", () => {
  it("usa el dominio acordado con backend y @quorum/wallet", () => {
    expect(voteDomain).toEqual({ name: "Quorum", version: "1", chainId: 84532, verifyingContract: "0x0000000000000000000000000000000000000000" });
    expect(FaceBindingTypes.FaceBinding.map((f) => f.name)).toEqual(["electionId", "voterId", "faceBindingHash", "wallet"]);
  });

  it("la firma de la wallet eoa-demo recupera su dirección y es determinista", async () => {
    const w = createEoaDemoWallet("e1", PK);
    const input = { electionId: "e1", voterId: "v1", faceBindingHash: `0x${"ab".repeat(32)}` as const };
    const sig = await w.signFaceBinding(input);
    expect(await w.signFaceBinding(input)).toBe(sig);
    const td = faceBindingTypedData({ ...input, wallet: w.address });
    const ok = await verifyTypedData({ ...(td as Omit<Parameters<typeof verifyTypedData>[0], "address" | "signature">), address: w.address, signature: sig } as Parameters<typeof verifyTypedData>[0]);
    expect(ok).toBe(true);
  });
});
