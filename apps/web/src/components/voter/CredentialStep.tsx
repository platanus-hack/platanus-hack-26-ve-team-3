"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { shortHash } from "@/lib/client/format";
import { peekIdentity, sealIdentity } from "@/lib/client/identityVault";
import { createBrowserIdentity } from "@/lib/client/zk";
import type { WalletStepResult } from "./wallet";

type Phase = "idle" | "linking" | "generating" | "sealing" | "sending" | "done" | "error";

const phaseText: Record<Phase, string> = {
  idle: "",
  linking: "Enviando la firma de tu wallet para que el servidor la verifique…",
  generating: "Generando tu credencial Semaphore en este navegador…",
  sealing: "Cifrándola con tu wallet y guardándola en este dispositivo…",
  sending: "Enviando sólo el commitment público al servidor…",
  done: "Credencial registrada.",
  error: "",
};

/**
 * Pasos 3–4 de la inscripción v1:
 *  1. `POST /api/voters/:id/wallet { inviteToken, walletAddress, kind, bindingSignature }` con la firma `FaceBinding` que
 *     entregó el WalletStep (si la invitación aún no tiene esa wallet).
 *  2. Identidad Semaphore generada EN EL NAVEGADOR (`@quorum/protocol-adapter`), cifrada con la wallet en localStorage.
 *  3. `POST /api/voters/:id/identity { inviteToken, commitment }`. Al servidor sólo va el commitment.
 */
export function CredentialStep({ electionId, voterId, inviteToken, faceBindingHash, wallet, linkedAddress, onBack, onDone }: { electionId: string; voterId: string; inviteToken: string; faceBindingHash: `0x${string}`; wallet: WalletStepResult; linkedAddress: string | null; onBack: () => void; onDone: (r: { commitment: string; registeredCount: number }) => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [commitment, setCommitment] = useState<string | null>(null);
  const existing = typeof window === "undefined" ? null : peekIdentity(electionId);
  const reusable = existing && existing.address === wallet.address.toLowerCase() ? existing : null;
  const [linked, setLinked] = useState(Boolean(linkedAddress && linkedAddress.toLowerCase() === wallet.address.toLowerCase()));

  async function run() {
    setError(null);
    try {
      if (!linked) {
        setPhase("linking");
        await apiV1.linkWallet(voterId, { inviteToken, walletAddress: wallet.address, kind: wallet.mode, bindingSignature: wallet.signature });
        setLinked(true);
      }
      let c = reusable?.commitment ?? null;
      if (!c) {
        setPhase("generating");
        const id = await createBrowserIdentity();
        setPhase("sealing");
        await sealIdentity(electionId, { voterId, faceBindingHash }, { address: wallet.address, signature: wallet.signature }, id);
        c = id.commitment;
      }
      setCommitment(c);
      setPhase("sending");
      const res = await apiV1.registerIdentity(voterId, { inviteToken, commitment: c });
      if (!res.ok) throw new Error("El servidor no aceptó el commitment.");
      setPhase("done");
      onDone({ commitment: c, registeredCount: res.registeredCount });
    } catch (e) {
      setError(describeError(e));
      setPhase("error");
    }
  }

  const busy = phase === "linking" || phase === "generating" || phase === "sealing" || phase === "sending";

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-title">
          Tu credencial para votar
        </CardTitle>
        <CardDescription>
          Se crea en este dispositivo. Al votar, una prueba demuestra que perteneces al padrón. La prueba no revela quién emitió cada boleta; el servidor ve el contenido de la boleta.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-small">
          Wallet <span className="q-mono">{wallet.address.slice(0, 10)}…</span> ({wallet.mode === "kernel" ? "smart wallet demo" : "wallet demo"}) · {linked ? "enlazada a tu invitación" : "se enlazará al continuar"}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-small text-muted-foreground">
          <li>La clave privada de la credencial queda cifrada con tu wallet en este navegador. Nunca se envía.</li>
          <li>Al servidor sólo va un número público (commitment) que entra en el padrón cuando se abra la votación.</li>
          <li>Debes votar desde este mismo navegador. Si borras sus datos, pierdes la credencial.</li>
        </ul>
        {reusable ? (
          <Alert tone="info" title="Ya tienes una credencial en este navegador">
            Se reenviará su commitment ({shortHash(reusable.commitment, 8, 6)}); no se genera otra.
          </Alert>
        ) : null}
        {commitment ? (
          <div className="rounded-md border border-border bg-muted p-3 text-small">
            <p className="text-muted-foreground">Commitment (público)</p>
            <p className="q-mono break-all font-semibold" data-testid="commitment">
              {commitment}
            </p>
          </div>
        ) : null}
        <p role="status" aria-live="polite" className="text-small font-semibold">
          {phaseText[phase]}
        </p>
        {error ? (
          <Alert tone="danger" title="No se pudo registrar la credencial">
            {error}
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button variant="secondary" onClick={onBack} disabled={busy}>
          Atrás
        </Button>
        <Button full className="md:flex-1" onClick={run} loading={busy}>
          <KeyRound aria-hidden="true" /> {phase === "error" ? "Reintentar" : reusable ? "Enlazar y registrar mi credencial" : "Enlazar wallet y crear credencial"}
        </Button>
      </CardFooter>
    </Card>
  );
}
