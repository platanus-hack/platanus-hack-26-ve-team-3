import { describe, expect, it } from "vitest";
import { FaceBindingDomain, FaceBindingTypes } from "@quorum/contracts";
import { FaceBindingTypes as WalletFaceBindingTypes } from "@quorum/wallet";
import { createEoaDemoWallet, faceBindingTypedData, verifyFaceBinding } from "@quorum/wallet";
import { voteDomain } from "../vote";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const; // clave de prueba (hardhat #1), nunca real

describe("FaceBinding EIP-712 (web ↔ backend ↔ @quorum/wallet)", () => {
  it("la web, el backend (@quorum/contracts) y @quorum/wallet usan el mismo dominio y tipos", () => {
    expect(voteDomain).toEqual(FaceBindingDomain);
    const input = { electionId: "e1", voterId: "v1", faceBindingHash: `0x${"ab".repeat(32)}` as const, wallet: "0x0000000000000000000000000000000000000001" as const };
    const td = faceBindingTypedData(input);
    expect(td.domain).toEqual(FaceBindingDomain);
    expect(td.types).toEqual(FaceBindingTypes);
    expect(WalletFaceBindingTypes).toEqual(FaceBindingTypes);
  });

  it("la firma de la wallet eoa-demo verifica y es determinista (se re-firma al votar para abrir la credencial)", async () => {
    const w = createEoaDemoWallet({ privateKey: PK });
    const input = { electionId: "e1", voterId: "v1", faceBindingHash: `0x${"ab".repeat(32)}` as const };
    const a = await w.signFaceBinding(input);
    const b = await w.signFaceBinding(input);
    expect(b.signature).toBe(a.signature);
    expect(await verifyFaceBinding(a)).toBe(true);
  });
});
