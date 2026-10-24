/**
 * Prepara lo que se verifica: (original | copia alterada) + modo de ancla → bytes exactos + opciones del verificador.
 * Lo usan el laboratorio y `/audit` (copia compartida) para que ambos lados verifiquen EXACTAMENTE los mismos bytes.
 */
import { applyAlteration, serializePackage, simulatedAnchor, type AnchorRead, type Change, type LabPackage } from "./alter";
import type { AlterationId, AnchorMode } from "./catalog";

export type Prepared = {
  bytes: Uint8Array;
  pkg: LabPackage;
  changes: Change[];
  anchorMode: AnchorMode;
  verifyOpts: { anchorRpcUrl?: string; anchorReader?: (tx: `0x${string}`) => Promise<AnchorRead> };
};

/** Aplica el modo de ancla. `sim` declara un ancla simulada cuya acta es la del ORIGINAL. */
export function withAnchor(pkg: LabPackage, original: LabPackage, mode: AnchorMode, rpcUrl?: string): Pick<Prepared, "pkg" | "verifyOpts"> {
  if (mode === "sim") {
    const sim = simulatedAnchor(original);
    return { pkg: { ...pkg, anchor: sim.anchor }, verifyOpts: { anchorReader: sim.reader } };
  }
  if (mode === "real") return { pkg, verifyOpts: { anchorRpcUrl: rpcUrl } };
  return { pkg, verifyOpts: {} };
}

export function prepare(original: LabPackage, alteration: AlterationId | null, mode: AnchorMode, rpcUrl?: string): Prepared {
  const base = alteration ? applyAlteration(original, alteration) : { altered: original, changes: [] };
  const { pkg, verifyOpts } = withAnchor(base.altered, original, mode, rpcUrl);
  // El original sin ancla añadida se verifica sobre sus bytes tal cual llegaron (ver `originalBytes` en quien llama).
  return { pkg, bytes: serializePackage(pkg), changes: base.changes, anchorMode: mode, verifyOpts };
}

/** ¿Se puede evaluar el ancla real? (paquete con txHash + RPC público configurado). */
export const canUseRealAnchor = (pkg: LabPackage, rpcUrl?: string): boolean => !!pkg.anchor?.txHash && !!rpcUrl;
