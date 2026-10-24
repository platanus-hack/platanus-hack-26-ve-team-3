"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import type { Address, Hex } from "viem";
import type { WalletMode } from "@quorum/wallet";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { shortHash } from "@/lib/client/format";

/** Lo que este paso entrega al flujo de inscripción (para `POST /api/voters/:id/wallet`). */
export type WalletStepResult = { address: Address; signature: Hex; mode: WalletMode };

export type WalletStepProps = {
  electionId: string;
  voterId: string;
  /** `faceBindingHash` devuelto por `POST /api/face/enroll` (bytes32 hex). */
  faceBindingHash: Hex;
  onDone: (result: WalletStepResult) => void;
  onBack?: () => void;
};

// Next solo inyecta variables NEXT_PUBLIC_* referenciadas literalmente.
const ZERODEV_PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID?.trim() || null;

type Phase = "idle" | "creating" | "signing" | "done";

/**
 * Paso de wallet: crea (o recupera) la smart wallet Kernel gasless del votante y firma EIP-712
 * `FaceBinding`. Sin `NEXT_PUBLIC_ZERODEV_PROJECT_ID` usa `eoa-demo`, etiquetado como demo.
 * No llama a la API: entrega `{address, signature, mode}` por `onDone`.
 * No envía nada on-chain (C2): `sendCast` queda tras `NEXT_PUBLIC_QUORUM_ONCHAIN_CAST`, desactivado por defecto.
 */
export function WalletStep({ electionId, voterId, faceBindingHash, onDone, onBack }: WalletStepProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ address: Address; mode: WalletMode; label: string; persisted: boolean; fellBack: boolean } | null>(null);

  const expectedMode: WalletMode = ZERODEV_PROJECT_ID ? "kernel" : "eoa-demo";
  const mode = info?.mode ?? expectedMode;
  const busy = phase === "creating" || phase === "signing";

  async function run() {
    setError(null);
    setPhase("creating");
    try {
      const { getOrCreateWallet } = await import("@quorum/wallet");
      let fellBack = false;
      const wallet = await getOrCreateWallet({
        projectId: ZERODEV_PROJECT_ID,
        onFallback: (e) => {
          fellBack = true;
          console.warn("[wallet] Kernel no disponible, se usa eoa-demo:", e instanceof Error ? e.message : String(e));
        },
      });
      setInfo({ address: wallet.address, mode: wallet.mode, label: wallet.label, persisted: wallet.persisted, fellBack });
      setPhase("signing");
      const { signature } = await wallet.signFaceBinding({ electionId, voterId, faceBindingHash });
      setPhase("done");
      onDone({ address: wallet.address, signature, mode: wallet.mode });
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? e.message : "No se pudo crear o usar la wallet.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h1" className="text-title">
            Tu wallet
          </CardTitle>
          {mode === "kernel" ? <Badge tone="warning">Smart wallet demo · sin gas · Base Sepolia (testnet)</Badge> : <Badge tone="warning">Wallet demo</Badge>}
        </div>
        <CardDescription>
          {mode === "kernel"
            ? "Wallet de demostración: creamos una smart wallet Kernel (ZeroDev) controlada por una clave que se guarda solo en este navegador. No hay frase semilla ni forma de exportar la clave: si borras los datos del sitio o cambias de dispositivo, la pierdes. No pagas gas. Firmarás que tu verificación facial queda enlazada a esta wallet."
            : "No hay proveedor de smart wallets configurado. Se usa una clave efímera de demostración en este navegador (se borra al cerrar la pestaña). No es una smart wallet y no envía nada on-chain."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {info ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3">
            <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-small text-muted-foreground">{info.label}</p>
              <p className="q-mono text-body font-semibold" title={info.address}>
                {shortHash(info.address, 10, 8)}
              </p>
            </div>
          </div>
        ) : null}
        {info?.fellBack ? (
          <Alert tone="warning" title="Smart wallet no disponible">
            No se pudo conectar con ZeroDev; se usó la wallet demo para no bloquear la inscripción.
          </Alert>
        ) : null}
        {info && !info.persisted ? (
          <Alert tone="warning" title="Este navegador no guardó la clave">
            Si cierras la página no podrás recuperar esta wallet. Evita el modo privado.
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" title="No se pudo completar el paso de wallet">
            {error}
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        {onBack ? (
          <Button variant="secondary" onClick={onBack} disabled={busy}>
            Atrás
          </Button>
        ) : null}
        <Button full className="md:flex-1" onClick={run} loading={busy} disabled={busy || phase === "done"}>
          {phase === "creating" ? "Creando wallet…" : phase === "signing" ? "Firmando enlace…" : phase === "done" ? "Wallet enlazada" : "Crear wallet y firmar"}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default WalletStep;
