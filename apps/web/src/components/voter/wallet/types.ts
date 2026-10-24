/**
 * Punto de inserción `WalletStep`: MISMA interfaz que `apps/web/src/components/voter/WalletStep.tsx` de
 * feat/phase2-wallet (`WalletStepProps` / `WalletStepResult`), para que integrar sea cambiar un re-export.
 * El paso crea o recupera la wallet y firma EIP-712 `FaceBinding`; NO llama a la API: el flujo hace `POST /wallet`.
 */
import type { Address, Hex } from "viem";

export type WalletMode = "kernel" | "eoa-demo";

/** Lo que el paso entrega al flujo (para `POST /api/voters/:id/wallet`). */
export type WalletStepResult = { address: Address; signature: Hex; mode: WalletMode };

export type WalletStepProps = {
  electionId: string;
  voterId: string;
  /** `faceBindingHash` devuelto por `POST /api/face/enroll` (bytes32 hex). */
  faceBindingHash: Hex;
  onDone: (result: WalletStepResult) => void;
  onBack?: () => void;
};
