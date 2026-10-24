/**
 * ÚNICO punto de selección de la wallet del votante.
 * Hoy: stub local `eoa-demo` (etiquetado). Al integrar feat/phase2-wallet, reemplazar la primera línea por:
 *   export { WalletStep } from "../WalletStep";
 * El WalletStep real tiene la misma interfaz (`WalletStepProps` → `onDone({ address, signature, mode })`).
 */
export { EoaDemoWalletStep as WalletStep } from "./EoaDemoWalletStep";
export type { WalletMode, WalletStepProps, WalletStepResult } from "./types";
