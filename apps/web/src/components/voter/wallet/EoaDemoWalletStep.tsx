"use client";

import { useState } from "react";
import { PenLine, Wallet } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { shortHash } from "@/lib/client/format";
import { createEoaDemoWallet, EOA_DEMO_LABEL } from "./eoaDemo";
import type { WalletStepProps } from "./types";

/**
 * STUB `eoa-demo` del punto de inserción WalletStep (misma interfaz que el WalletStep real de feat/phase2-wallet).
 * Crea/recupera una cuenta viem local y firma `FaceBinding`. Siempre etiquetado como demo.
 */
export function EoaDemoWalletStep({ electionId, voterId, faceBindingHash, onDone, onBack }: WalletStepProps) {
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setBusy(true);
    try {
      const w = createEoaDemoWallet(electionId);
      setAddress(w.address);
      const signature = await w.signFaceBinding({ electionId, voterId, faceBindingHash });
      onDone({ address: w.address, signature, mode: w.mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear o usar la wallet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h1" className="text-title">
            Tu wallet
          </CardTitle>
          <Badge tone="warning" data-testid="wallet-kind">
            {EOA_DEMO_LABEL}
          </Badge>
        </div>
        <CardDescription>
          Sustituto local mientras se integra la smart wallet. La clave se genera en este navegador, no sale de aquí y no se recupera en otro dispositivo. Firmarás que tu comprobación de rostro queda enlazada a esta wallet; no mueve fondos ni cuesta gas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3">
          <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-small text-muted-foreground">Dirección</p>
            <p className="q-mono text-body font-semibold" data-testid="wallet-address">
              {address ? shortHash(address, 10, 8) : "Se crea al continuar"}
            </p>
          </div>
        </div>
        <p className="text-small text-muted-foreground">
          Firma EIP-712 <span className="q-mono">FaceBinding</span> sobre <span className="q-mono">{shortHash(faceBindingHash, 10, 8)}</span>.
        </p>
        {error ? (
          <Alert tone="danger" title="No se pudo usar la wallet">
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
        <Button full className="md:flex-1" onClick={run} loading={busy}>
          <PenLine aria-hidden="true" /> Crear wallet y firmar
        </Button>
      </CardFooter>
    </Card>
  );
}
