"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { Wallet } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/states";
import { api, describeError } from "@/lib/client/api";
import { typedDataFor, type VoteSigner } from "@/lib/client/vote";
import { shortHash } from "@/lib/client/format";
import type { Address, Hex } from "viem";

/**
 * Wallet embebida con Privy (email/SMS) + smart wallet. Se renderiza sólo dentro de PrivyProvider + SmartWalletsProvider.
 * Cargado con dynamic(..., { ssr: false }).
 */
export default function PrivyWalletStep({ voterId, inviteToken, linkedAddress, onBack, onNext }: { voterId: string; inviteToken: string; linkedAddress: string | null; onBack: () => void; onNext: (s: VoteSigner) => void }) {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { client } = useSmartWallets();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = (client?.account?.address ?? null) as Address | null;
  const mismatch = Boolean(linkedAddress && address && linkedAddress.toLowerCase() !== address.toLowerCase());

  async function link() {
    if (!client || !address) return;
    setError(null);
    setLinking(true);
    try {
      if (!linkedAddress) await api.linkWallet(voterId, { inviteToken, walletAddress: address });
      const signer: VoteSigner = {
        address,
        kind: "privy-smart-wallet",
        label: "Smart wallet (Privy)",
        signTypedData: async (message) => (await client.signTypedData({ ...typedDataFor(message), account: client.account })) as Hex,
      };
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
          <Badge tone="success">Smart wallet embebida (Privy)</Badge>
        </div>
        <CardDescription>Inicia sesión con tu correo o SMS. Se crea una wallet sin semilla ni gas; sólo firma tu boleta.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!ready ? <LoadingState label="Conectando con el proveedor de wallets…" lines={2} /> : null}
        {ready && !authenticated ? (
          <Button onClick={() => login({ loginMethods: ["email", "sms"] })} full>
            Iniciar sesión (correo o SMS)
          </Button>
        ) : null}
        {ready && authenticated ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted p-3">
            <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-small text-muted-foreground">{user?.email?.address ?? user?.phone?.number ?? "Sesión iniciada"}</p>
              <p className="q-mono text-body font-semibold" title={address ?? undefined}>
                {address ? shortHash(address, 10, 8) : "Creando smart wallet…"}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Salir
            </Button>
          </div>
        ) : null}
        {mismatch ? (
          <Alert tone="warning" title="Esta invitación ya tiene otra wallet enlazada">
            Enlazada: {shortHash(linkedAddress, 8, 6)}. Inicia sesión con la misma cuenta que usaste la primera vez.
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
        <Button full className="md:flex-1" onClick={link} loading={linking} disabled={!authenticated || !address || mismatch}>
          {linkedAddress ? "Continuar" : "Enlazar wallet y continuar"}
        </Button>
      </CardFooter>
    </Card>
  );
}
