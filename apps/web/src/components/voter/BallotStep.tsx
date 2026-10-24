"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Ballot } from "@/components/Ballot";
import { StatusPill } from "@/components/StatusPill";
import { api, describeError } from "@/lib/client/api";
import { buildVoteMessage, nonceToBytes32, toSignedVoteBody, type VoteSigner } from "@/lib/client/vote";
import type { Option, Receipt } from "@/lib/client/types";
import type { LivenessOutcome } from "./flowTypes";

type SendPhase = "idle" | "preparando" | "enviando" | "recibido" | "incluido" | "error";

const phaseLabel: Record<Exclude<SendPhase, "idle" | "error">, string> = {
  preparando: "Preparando: construyendo y firmando tu boleta…",
  enviando: "Enviando al servidor…",
  recibido: "Confirmación recibida. Esperando inclusión en la urna…",
  incluido: "Boleta incluida en la urna.",
};

export function BallotStep({ electionId, electionTitle, options, signer, liveness, onBack, onDone }: { electionId: string; electionTitle: string; options: Option[]; signer: VoteSigner; liveness: LivenessOutcome; onBack: () => void; onDone: (r: Receipt) => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<SendPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const chosen = options.find((o) => o.id === choice) ?? null;
  const { normalized } = nonceToBytes32(liveness.voteNonce);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  async function send() {
    if (!chosen) return;
    setError(null);
    try {
      setPhase("preparando");
      const message = buildVoteMessage({ electionId, optionId: chosen.id, voter: signer.address, nonce: liveness.voteNonce });
      const signature = await signer.signTypedData(message);
      setPhase("enviando");
      const receipt = await api.vote(electionId, toSignedVoteBody(message, signature, chosen.id));
      setPhase("recibido");
      if (receipt.includedAt || receipt.state === "incluido") {
        setPhase("incluido");
        onDone(receipt);
        return;
      }
      // Polling corto del recibo hasta ver `incluido` (máx. ~30 s); si no, entregamos el recibo tal cual (estado honesto).
      let attempts = 0;
      const poll = async () => {
        attempts += 1;
        try {
          const r = await api.getReceipt(electionId, receipt.inclusionId);
          if (r.includedAt || r.state === "incluido") {
            setPhase("incluido");
            onDone(r);
            return;
          }
          if (attempts >= 10) return onDone(r);
        } catch {
          if (attempts >= 10) return onDone(receipt);
        }
        pollRef.current = window.setTimeout(() => void poll(), 3000);
      };
      pollRef.current = window.setTimeout(() => void poll(), 3000);
    } catch (e) {
      setError(describeError(e));
      setPhase("error");
    }
  }

  const sending = phase === "preparando" || phase === "enviando" || phase === "recibido";

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-title">
          Boleta
        </CardTitle>
        <CardDescription>{electionTitle}</CardDescription>
        <div className="mt-1 flex flex-wrap gap-2">
          <Badge tone="neutral">Firma: {signer.label}</Badge>
          <Badge tone={liveness.mode === "enrolled" ? "success" : "warning"}>{liveness.mode === "enrolled" ? "Prueba de vida: demo completada" : "Sin prueba de vida (demo)"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {liveness.mode === "skipped" ? (
          <Alert tone="warning" title="Limitación">
            Continuaste sin prueba de vida ({liveness.reason}). El nonce lo generó tu navegador, no el servidor: el servidor puede rechazar esta boleta.
          </Alert>
        ) : null}
        {normalized ? (
          <Alert tone="info" title="Nota técnica">
            El nonce recibido no tenía formato bytes32; se normalizó con keccak256 para la firma EIP-712.
          </Alert>
        ) : null}
        {!confirming ? (
          <Ballot title="Elige una opción" options={options} value={choice} onChange={setChoice} disabled={sending} />
        ) : (
          <div className="rounded-md border border-primary bg-muted p-4">
            <p className="text-small text-muted-foreground">Vas a enviar esta opción. No podrás cambiarla después.</p>
            <p className="mt-1 text-heading font-bold">{chosen?.label}</p>
          </div>
        )}
        <p className="text-small text-muted-foreground">
          Modo <span className="q-mono">integrity-demo</span>: la boleta viaja firmada con un compromiso (hash) de tu opción. Mientras no haya motor criptográfico (ADR-001) esto no es cifrado; el servidor no guarda tu opción junto a tu identidad, pero la privacidad no es criptográfica.
        </p>
        {phase !== "idle" && phase !== "error" ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              {phase !== "incluido" ? <span className="q-spinner" aria-hidden="true" /> : null}
              <StatusPill status={phase === "preparando" || phase === "enviando" ? "pendiente" : phase} />
            </div>
            <p className="text-small text-muted-foreground">{phaseLabel[phase]}</p>
            <ol className="flex flex-wrap gap-1 text-small" aria-hidden="true">
              {(["preparando", "enviando", "recibido", "incluido"] as const).map((p, i) => {
                const order = ["preparando", "enviando", "recibido", "incluido"];
                const done = order.indexOf(phase) >= i;
                return (
                  <li key={p} className={`rounded-full border px-2 py-0.5 ${done ? "border-success bg-success-soft text-success-strong" : "border-border text-subtle"}`}>
                    {p}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {error ? (
          <Alert tone="danger" title="No se pudo enviar la boleta">
            {error}
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter>
        {!confirming ? (
          <>
            <Button variant="secondary" onClick={onBack}>
              Atrás
            </Button>
            <Button full className="md:flex-1" onClick={() => setConfirming(true)} disabled={!chosen}>
              Revisar y confirmar
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={sending}>
              Cambiar opción
            </Button>
            <Button full className="md:flex-1" variant="success" onClick={send} loading={sending} disabled={phase === "incluido"}>
              {phase === "error" ? "Reintentar envío" : "Enviar mi voto"}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
