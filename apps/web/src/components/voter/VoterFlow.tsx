"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MODE_LABEL } from "@quorum/wallet";
import { Stepper } from "@/components/Stepper";
import { ErrorState, LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { loadReceipt, peekIdentity, type StoredReceipt } from "@/lib/client/identityVault";
import type { InviteResponse as InviteV1 } from "@quorum/contracts";
import type { z } from "zod";
import type { Receipt } from "@quorum/contracts";
type ReceiptV1 = z.infer<typeof Receipt>;
import { CredentialStep } from "./CredentialStep";
import { IdentityStep } from "./IdentityStep";
import { InviteStep, type InviteMode } from "./InviteStep";
import { ProofBallotStep } from "./ProofBallotStep";
import { VoteReceiptCard } from "./VoteReceiptCard";
import { REGISTRATION_STEPS, VOTING_STEPS, type LivenessOutcome } from "./flowTypes";
import { WalletStep, type WalletStepResult } from "./wallet";

/* Human toca window/WebGL: sólo en cliente. */
const LivenessStep = dynamic(() => import("./LivenessStep"), { ssr: false, loading: () => <LoadingState label="Cargando prueba de vida…" /> });

type Step = "invite" | "identity" | "liveness" | "wallet" | "credential" | "registered" | "ballot" | "receipt";
type Local = { identity: ReturnType<typeof peekIdentity>; receipt: StoredReceipt | null };

function deriveMode(invite: InviteV1, local: Local): InviteMode {
  const phase = invite.election.status;
  if (local.receipt) return "already-voted";
  if (phase === "registration") return local.identity && invite.voter.walletAddress !== null ? "registered-waiting" : "register";
  if (phase === "open") return local.identity ? "vote" : "readonly";
  return "readonly";
}

/**
 * Flujo del votante v1 (`/v/[token]`), según la fase:
 * - registration: invitación → datos → rostro → wallet (firma FaceBinding) → enlace + credencial Semaphore → inscrito.
 * - open: invitación → wallet (vuelve a firmar FaceBinding: esa firma abre la credencial) → boleta con prueba → comprobante.
 * - resto: sólo lectura + enlace al centro de transparencia.
 */
export function VoterFlow({ token }: { token: string }) {
  const [invite, setInvite] = useState<InviteV1 | null>(null);
  const [local, setLocal] = useState<Local>({ identity: null, receipt: null });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [step, setStep] = useState<Step>("invite");
  const [displayName, setDisplayName] = useState("");
  const [face, setFace] = useState<LivenessOutcome | null>(null);
  const [wallet, setWallet] = useState<WalletStepResult | null>(null);
  const [registered, setRegistered] = useState<{ commitment: string; registeredCount: number } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptV1 | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiV1
      .getInvite(token)
      .then((data) => {
        if (cancelled) return;
        setInvite(data);
        setDisplayName((n) => n || (data.voter.displayName ?? ""));
        setLocal({ identity: peekIdentity(data.election.id), receipt: loadReceipt(data.election.id) });
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(describeError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  const mode = invite ? deriveMode(invite, local) : null;

  // Inscrito esperando apertura: refrescar la fase cada 5 s (pausa si la pestaña no está visible).
  useEffect(() => {
    if (mode !== "registered-waiting" && step !== "registered") return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setAttempt((a) => a + 1);
    }, 5000);
    return () => clearInterval(t);
  }, [mode, step]);

  const retry = useCallback(() => {
    setLoadError(null);
    setInvite(null);
    setAttempt((a) => a + 1);
  }, []);

  if (loadError) {
    return (
      <Shell steps={null} current={0}>
        <ErrorState title="No se pudo abrir la invitación" message={loadError} onRetry={retry}>
          <Link href="/" className="inline-flex min-h-tap items-center px-2 text-body font-semibold underline underline-offset-4">
            Ir al inicio
          </Link>
        </ErrorState>
      </Shell>
    );
  }
  if (!invite || !mode) {
    return (
      <Shell steps={null} current={0}>
        <LoadingState label="Abriendo tu invitación…" lines={4} />
      </Shell>
    );
  }

  const electionId = invite.election.id;
  const voterId = invite.voter.id;
  const linked = invite.voter.walletAddress ?? null;
  const votingFlow = invite.election.status === "open" || step === "ballot" || step === "receipt";
  const steps = votingFlow ? VOTING_STEPS : REGISTRATION_STEPS;
  const current = Math.max(0, steps.findIndex((s) => s.id === step));
  // faceBindingHash para el WalletStep: el recién emitido (inscripción) o el guardado con la credencial (votación).
  const bindingHash = votingFlow ? (local.identity?.faceBindingHash ?? null) : (face?.faceBindingHash ?? null);

  const storedReceipt = local.receipt;

  const content = (() => {
    switch (step) {
      case "invite":
        if (mode === "already-voted" && storedReceipt) {
          return (
            <div className="flex flex-col gap-4">
              <InviteStep invite={invite} mode={mode} onNext={() => undefined} />
              <VoteReceiptCard electionId={electionId} electionTitle={invite.election.title} receipt={{ ...storedReceipt, state: "recibido" }} />
            </div>
          );
        }
        return <InviteStep invite={invite} mode={mode} onNext={() => setStep(mode === "vote" ? "wallet" : "identity")} />;
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
              setFace(o);
              setStep("wallet");
            }}
          />
        );
      case "wallet":
        if (!bindingHash) return <MissingStep onBack={() => setStep(votingFlow ? "invite" : "liveness")} />;
        return (
          <WalletStep
            electionId={electionId}
            voterId={votingFlow ? (local.identity?.voterId ?? voterId) : voterId}
            faceBindingHash={bindingHash}
            onBack={() => setStep(votingFlow ? "invite" : "liveness")}
            onDone={(r) => {
              setWallet(r);
              setStep(votingFlow ? "ballot" : "credential");
            }}
          />
        );
      case "credential":
        if (!wallet || !face) return <MissingStep onBack={() => setStep("wallet")} />;
        return (
          <CredentialStep
            electionId={electionId}
            voterId={voterId}
            inviteToken={token}
            faceBindingHash={face.faceBindingHash}
            wallet={wallet}
            linkedAddress={linked}
            onBack={() => setStep("wallet")}
            onDone={(r) => {
              setRegistered(r);
              setLocal((l) => ({ ...l, identity: peekIdentity(electionId) }));
              setStep("registered");
            }}
          />
        );
      case "registered":
        return (
          <Card>
            <CardHeader>
              <CardTitle as="h1" className="text-title">
                Inscripción completa
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Alert tone="success" title="Tu credencial está registrada">
                {registered ? `Inscritos hasta ahora: ${registered.registeredCount}. ` : ""}Cuando el organizador congele el padrón y abra la votación, esta página te llevará a la boleta.
              </Alert>
              {invite.election.status === "open" ? (
                <Button full onClick={() => setStep("wallet")}>
                  La votación está abierta: ir a votar
                </Button>
              ) : (
                <p role="status" aria-live="polite" className="text-small text-muted-foreground">
                  Esperando la apertura… (se comprueba cada 5 s)
                </p>
              )}
            </CardContent>
          </Card>
        );
      case "ballot":
        if (!wallet) return <MissingStep onBack={() => setStep("wallet")} />;
        return (
          <ProofBallotStep
            electionId={electionId}
            electionTitle={invite.election.title}
            options={invite.election.options}
            unlock={{ address: wallet.address, signature: wallet.signature }}
            walletLabel={MODE_LABEL[wallet.mode]}
            voterId={voterId}
            inviteToken={token}
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
            <VoteReceiptCard electionId={electionId} electionTitle={invite.election.title} receipt={{ ...receipt, nullifier: receipt.nullifier ?? receipt.inclusionId }} />
            <Link href={`/e/${encodeURIComponent(electionId)}/live`} className="inline-flex min-h-tap items-center justify-center rounded-md border border-border bg-card px-4 font-semibold hover:bg-muted">
              Ver resultados en vivo (sólo agregados)
            </Link>
          </div>
        ) : (
          <MissingStep onBack={() => setStep("ballot")} />
        );
    }
  })();

  return (
    <Shell steps={mode === "readonly" || mode === "already-voted" ? null : steps} current={current}>
      {content}
    </Shell>
  );
}

function Shell({ steps, current, children }: { steps: { id: string; label: string }[] | null; current: number; children: React.ReactNode }) {
  return (
    <div className="q-container q-narrow flex flex-col gap-6 py-6 md:py-10">
      {steps ? <Stepper steps={steps} current={current} /> : null}
      {children}
    </div>
  );
}

function MissingStep({ onBack }: { onBack: () => void }) {
  return (
    <Alert tone="warning" title="Falta un paso anterior">
      <button type="button" onClick={onBack} className="min-h-tap font-semibold underline underline-offset-4">
        Volver
      </button>
    </Alert>
  );
}
