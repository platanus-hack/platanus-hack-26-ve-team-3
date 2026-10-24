// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createEoaDemoWallet } from "@/components/voter/wallet/eoaDemo";
import { loadReceipt, openIdentity, peekIdentity, saveReceipt, sealIdentity } from "../identityVault";

const PK1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const PK2 = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const;
const FBH = `0x${"cd".repeat(32)}` as const;

async function unlockFor(pk: `0x${string}`) {
  const w = createEoaDemoWallet("e1", pk);
  return { address: w.address, signature: await w.signFaceBinding({ electionId: "e1", voterId: "v1", faceBindingHash: FBH }) };
}

describe("bóveda local de la credencial", () => {
  beforeEach(() => localStorage.clear());

  it("cifra con la firma de la wallet, guarda en claro sólo lo público y reabre con la misma wallet", async () => {
    const u = await unlockFor(PK1);
    await sealIdentity("e1", { voterId: "v1", faceBindingHash: FBH }, u, { privateKey: "SECRETO-de-prueba", commitment: "123" });
    expect(localStorage.getItem("quorum.identity.e1") ?? "").not.toContain("SECRETO-de-prueba");
    expect(peekIdentity("e1")).toMatchObject({ commitment: "123", voterId: "v1", faceBindingHash: FBH, address: u.address.toLowerCase() });
    // La wallet vuelve a firmar lo mismo al votar (firma determinista) y abre la bóveda.
    await expect(openIdentity("e1", await unlockFor(PK1))).resolves.toEqual({ privateKey: "SECRETO-de-prueba", commitment: "123" });
  });

  it("otra wallet no puede abrirla", async () => {
    await sealIdentity("e1", { voterId: "v1", faceBindingHash: FBH }, await unlockFor(PK1), { privateKey: "x", commitment: "1" });
    await expect(openIdentity("e1", await unlockFor(PK2))).rejects.toThrow(/otra wallet/);
  });

  it("guarda el comprobante (nullifier) sin la opción", () => {
    saveReceipt("e1", { inclusionId: "9", nullifier: "9", index: 0 });
    const r = loadReceipt("e1");
    expect(r?.nullifier).toBe("9");
    expect(JSON.stringify(r)).not.toMatch(/option|choice|message/);
  });
});
