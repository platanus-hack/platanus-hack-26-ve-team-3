"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Stepper } from "@/components/Stepper";
import { ReceiptCard } from "@/components/ReceiptCard";
import { ErrorState, LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { api, describeError, type InviteResponse } from "@/lib/client/api";
import { privyAppId } from "@/lib/client/wallet";
import type { VoteSigner } from "@/lib/client/vote";
import type { Receipt } from "@/lib/client/types";
import { InviteStep } from "./InviteStep";
import { IdentityStep } from "./IdentityStep";
import { DemoWalletStep } from "./DemoWalletStep";
import { BallotStep } from "./BallotStep";
import { VOTER_STEPS, type LivenessOutcome, type VoterStepId } from "./flowTypes";

/* Human y Privy tocan window/WebGL: sólo en cliente. */
const LivenessStep = dynamic(() => import("./LivenessStep"), { ssr: false, loading: () => <LoadingState label="Cargando prueba de vida…" /> });
const PrivyWalletStep = dynamic(() => import("./PrivyWalletStep"), { ssr: false, loading: () => <LoadingState label="Cargando proveedor de wallets…" /> });
const PrivyShell = dynamic(() => import("./PrivyShell"), { ssr: false });

export function VoterFlow({ token }: { token: string }) {
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<VoterStepId>("invite");
  const [displayName, setDisplayName] = useState("");
  const [liveness, setLiveness] = useState<LivenessOutcome | null>(null);
  const [signer, setSigner] = useState<VoteSigner | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .getInvite(token)
      .then((data) => {
        if (cancelled) return;
        setInvite(data);
        setDisplayName(data.voter.displayName ?? "");
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const load = useCallback(() => {
    setLoadError(null);
    setInvite(null);
    setAttempt((a) => a + 1);
  }, []);

  const stepIndex = VOTER_STEPS.findIndex((s) => s.id === step);

  const content = (() => {
    if (loadError) {
      return (
        <ErrorState title="No se pudo abrir la invitación" message={loadError} onRetry={load}>
          <Link href="/" className="inline-flex min-h-tap items-center px-2 text-body font-semibold underline underline-offset-4">
            Ir al inicio
          </Link>
        </ErrorState>
      );
    }
    if (!invite) return <LoadingState label="Abriendo tu invitación…" lines={4} />;

    const voterId = invite.voter.id;
    const linked = invite.voter.walletAddress ?? null;

    switch (step) {
      case "invite":
        return <InviteStep invite={invite} onNext={() => setStep("identity")} />;
      case "identity":
        return (
          <IdentityStep
            initialName={displayName}
            onBack={() => setStep("invite")}
            onNext={({ displayName: n }) => {
              setDisplayName(n);
              setStep("liveness");
            }}
          />
        );
      case "liveness":
        return (
          <LivenessStep
            voterId={voterId}
            inviteToken={token}
            onBack={() => setStep("identity")}
            onNext={(o) => {
              setLiveness(o);
              setStep("wallet");
            }}
          />
        );
      case "wallet": {
        const next = (s: VoteSigner) => {
          setSigner(s);
          setStep("ballot");
        };
        if (privyAppId) {
          return (
            <PrivyShell appId={privyAppId}>
              <PrivyWalletStep voterId={voterId} inviteToken={token} linkedAddress={linked} onBack={() => setStep("liveness")} onNext={next} />
            </PrivyShell>
          );
        }
        return <DemoWalletStep voterId={voterId} inviteToken={token} linkedAddress={linked} onBack={() => setStep("liveness")} onNext={next} />;
      }
      case "ballot":
        if (!signer || !liveness) {
          return (
            <Alert tone="warning" title="Faltan pasos">
              Completa la prueba de vida y la wallet antes de votar.
            </Alert>
          );
        }
        return (
          <BallotStep
            electionId={invite.election.id}
            electionTitle={invite.election.title}
            options={invite.election.options}
            signer={signer}
            liveness={liveness}
            onBack={() => setStep("wallet")}
            onDone={(r) => {
              setReceipt(r);
              setStep("receipt");
            }}
          />
        );
      case "receipt":
        return receipt ? (
          <div className="flex flex-col gap-4">
            <ReceiptCard receipt={receipt} electionTitle={invite.election.title} />
            <Link href={`/e/${encodeURIComponent(invite.election.id)}/live`} className="inline-flex min-h-tap items-center justify-center rounded-md border border-border bg-card px-4 font-semibold hover:bg-muted">
              Ver resultados en vivo (sólo agregados)
            </Link>
          </div>
        ) : (
          <Alert tone="warning" title="Sin comprobante">
            No hay un comprobante en esta sesión.
          </Alert>
        );
    }
  })();

  return (
    <div className="q-container q-narrow flex flex-col gap-6 py-6 md:py-10">
      <Stepper steps={VOTER_STEPS} current={Math.max(0, stepIndex)} />
      {content}
    </div>
  );
}
