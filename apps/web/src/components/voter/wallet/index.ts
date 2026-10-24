/**
 * ÚNICO punto de selección de la wallet del votante: el `WalletStep` real de `@quorum/wallet`
 * (Kernel gasless con `NEXT_PUBLIC_ZERODEV_PROJECT_ID`; si no, `eoa-demo` etiquetada como demo).
 */
export { WalletStep } from "../WalletStep";
export type { WalletStepProps, WalletStepResult } from "../WalletStep";
export type { WalletMode } from "@quorum/wallet";
