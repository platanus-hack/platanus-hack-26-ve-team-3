"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { api, describeError } from "@/lib/client/api";
import { getOrCreateDemoSigner } from "@/lib/client/wallet";
import type { VoteSigner } from "@/lib/client/vote";
import { shortHash } from "@/lib/client/format";

/** Wallet demo local (sin Privy): cuenta viem efímera en sessionStorage. */
export function DemoWalletStep({ voterId, inviteToken, linkedAddress, onBack, onNext }: { voterId: string; inviteToken: string; linkedAddress: string | null; onBack: () => void; onNext: (s: VoteSigner) => void }) {
  // Este paso sólo se monta en el cliente tras interacción (nunca en SSR): la clave se crea al montar.
  const [signer] = useState<VoteSigner | null>(() => (typeof window === "undefined" ? null : getOrCreateDemoSigner()));
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyLinkedElsewhere = Boolean(linkedAddress && signer && linkedAddress.toLowerCase() !== signer.address.toLowerCase());
  const alreadyLinkedHere = Boolean(linkedAddress && signer && linkedAddress.toLowerCase() === signer.address.toLowerCase());

  async function link() {
    if (!signer) return;
    setError(null);
    if (alreadyLinkedHere) return onNext(signer);
    setLinking(true);
    try {
      await api.linkWallet(voterId, { inviteToken, walletAddress: signer.address });
      onNext(signer);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setLinking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle as="h1" className="text-title">
            Tu wallet para firmar
          </CardTitle>
          <Badge tone="warning">Wallet demo local (sin Privy)</Badge>
        </div>
        <CardDescription>No hay proveedor de wallets configurado (NEXT_PUBLIC_PRIVY_APP_ID). Se generó una clave efímera en este navegador; nunca sale de aquí y se borra al cerrar la pestaña.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {signer ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3">
            <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-small text-muted-foreground">Dirección</p>
              <p className="q-mono text-body font-semibold" title={signer.address}>
                {shortHash(signer.address, 10, 8)}
              </p>
            </div>
          </div>
        ) : (
          <div className="q-skeleton h-14" aria-hidden="true" />
        )}
        {alreadyLinkedElsewhere ? (
          <Alert tone="warning" title="Esta invitación ya tiene una wallet enlazada">
            Se enlazó desde otra sesión ({shortHash(linkedAddress, 8, 6)}). El servidor rechazará una segunda wallet; vuelve a abrir el enlace en el navegador original.
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" title="No se pudo enlazar la wallet">
            {error}
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button variant="secondary" onClick={onBack} disabled={linking}>
          Atrás
        </Button>
        <Button full className="md:flex-1" onClick={link} loading={linking} disabled={!signer || alreadyLinkedElsewhere}>
          {alreadyLinkedHere ? "Continuar" : "Enlazar wallet y continuar"}
        </Button>
      </CardFooter>
    </Card>
  );
}
