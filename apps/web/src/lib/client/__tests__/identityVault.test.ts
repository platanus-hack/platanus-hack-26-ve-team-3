// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createEoaDemoWallet } from "@quorum/wallet";
import {
  isRegistered,
  loadPendingFace,
  loadReceipt,
  markRegistered,
  memoryKeyStore,
  openIdentity,
  peekIdentity,
  saveReceipt,
  savePendingFace,
  sealIdentity,
  sealIdentityLegacyV2,
  setDeviceKeyStore,
} from "../identityVault";

const PK1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const PK2 = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const;
const FBH = `0x${"cd".repeat(32)}` as const;
const META = { voterId: "v1", faceBindingHash: FBH, address: "0xAbCdEf0000000000000000000000000000000001", walletMode: "eoa-demo" as const };

async function unlockFor(pk: `0x${string}`) {
  const w = createEoaDemoWallet({ privateKey: pk });
  const { signature } = await w.signFaceBinding({ electionId: "e1", voterId: "v1", faceBindingHash: FBH });
  return { address: w.address, signature };
}

describe("bóveda local de la credencial (v3: clave del dispositivo, sin wallet)", () => {
  let store = memoryKeyStore();
  beforeEach(() => {
    localStorage.clear();
    store = memoryKeyStore();
    setDeviceKeyStore(store);
  });

  it("cifra con una clave AES-GCM NO extraíble, guarda en claro sólo lo público y reabre sin interacción", async () => {
    await sealIdentity("e1", META, { privateKey: "SECRETO-de-prueba", commitment: "123" });
    expect(localStorage.getItem("quorum.identity.e1") ?? "").not.toContain("SECRETO-de-prueba");
    expect(peekIdentity("e1")).toMatchObject({ v: 3, commitment: "123", voterId: "v1", faceBindingHash: FBH, walletMode: "eoa-demo", address: META.address.toLowerCase() });
    const key = await store.get("vault:e1");
    expect(key?.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key!)).rejects.toThrow();
    // Sin wallet ni firma: se abre con la clave del dispositivo.
    await expect(openIdentity("e1")).resolves.toEqual({ privateKey: "SECRETO-de-prueba", commitment: "123" });
  });

  it("otro navegador (sin la clave del dispositivo) no puede abrirla aunque copie el localStorage", async () => {
    await sealIdentity("e1", META, { privateKey: "x", commitment: "1" });
    setDeviceKeyStore(memoryKeyStore());
    await expect(openIdentity("e1")).rejects.toThrow(/perdió la clave/);
  });

  it("legado v2 (cifrado con la firma FaceBinding): se abre volviendo a firmar en segundo plano; otra wallet no", async () => {
    await sealIdentityLegacyV2("e1", { voterId: "v1", faceBindingHash: FBH }, await unlockFor(PK1), { privateKey: "viejo", commitment: "9" });
    expect(peekIdentity("e1")).toMatchObject({ v: 2, walletMode: null });
    expect(isRegistered("e1")).toBe(true);
    await expect(openIdentity("e1", { legacyUnlock: () => unlockFor(PK1) })).resolves.toEqual({ privateKey: "viejo", commitment: "9" });
    await expect(openIdentity("e1", { legacyUnlock: () => unlockFor(PK2) })).rejects.toThrow(/otra clave/);
  });

  it("inscripción completa sólo tras aceptar el commitment; rostro pendiente sobrevive a una recarga", async () => {
    await sealIdentity("e1", META, { privateKey: "x", commitment: "77" });
    expect(isRegistered("e1")).toBe(false);
    markRegistered("e1", "77");
    expect(isRegistered("e1")).toBe(true);
    savePendingFace("v1", FBH);
    expect(loadPendingFace("v1")).toBe(FBH);
    expect(loadPendingFace("v2")).toBeNull();
  });

  it("guarda el comprobante (nullifier) sin la opción", () => {
    saveReceipt("e1", { inclusionId: "9", nullifier: "9", index: 0, state: "incluido" });
    const r = loadReceipt("e1");
    expect(r?.nullifier).toBe("9");
    expect(JSON.stringify(r)).not.toMatch(/option|choice|message/);
  });
});
