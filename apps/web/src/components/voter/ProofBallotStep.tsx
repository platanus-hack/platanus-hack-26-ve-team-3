"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Ballot } from "@/components/Ballot";
import { StatusPill } from "@/components/StatusPill";
import { ApiClientError, describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { openIdentity, saveReceipt, type WalletUnlock } from "@/lib/client/identityVault";
import type { Option } from "@/lib/client/types";
import type { ReceiptV1 } from "@/lib/client/v1";
import { proveBallot } from "@/lib/client/zk";

type SendPhase = "idle" | "preparando" | "enviando" | "recibido" | "incluido" | "error";

const ORDER = ["preparando", "enviando", "recibido", "incluido"] as const;

function explain(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/NOT_IN_GROUP/.test(msg)) return "Tu credencial no está en el padrón congelado de esta votación (¿te inscribiste después de que se abrió?). No puedes votar con ella.";
  if (e instanceof ApiClientError) return describeError(e);
  return msg;
}

/**
 * Boleta v1: el navegador genera la prueba Semaphore (`castBallot` del adaptador, artefactos en /zk) y envía
 * `POST /vote { proof }`. Estados honestos: preparando → enviando → recibido → incluido.
 * Sin registro on-chain del voto (threat model C2). "Ya voté" se declara después en una petición separada.
 */
export function ProofBallotStep({ electionId, electionTitle, options, unlock, walletLabel, voterId, inviteToken, onBack, onDone }: { electionId: string; electionTitle: string; options: Option[]; unlock: WalletUnlock; walletLabel: string; voterId: string; inviteToken: string; onBack: () => void; onDone: (r: ReceiptV1) => void }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [phase, setPhase] = useState<SendPhase>("idle");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const chosenIndex = options.findIndex((o) => o.id === choice);
  const chosen = chosenIndex >= 0 ? options[chosenIndex] : null;

  async function send() {
    if (!chosen) return;
    setError(null);
    try {
      setPhase("preparando");
      setDetail("Abriendo tu credencial con la wallet…");
      const id = await openIdentity(electionId, unlock);
      setDetail("Descargando el padrón congelado…");
      const roll = await apiV1.getRoll(electionId);
      setDetail("Generando la prueba en tu navegador (puede tardar unos segundos en el teléfono)…");
      const { proof, nullifier, ms } = await proveBallot({ privateKey: id.privateKey, commitments: roll.commitments, electionId, optionIndex: chosenIndex });


      setPhase("enviando");
      setDetail(`Prueba generada en ${ms} ms. Enviando al servidor…`);
      const receipt = await apiV1.vote(electionId, { proof });
      if (receipt.nullifier !== nullifier) throw new Error("El servidor devolvió un recibo con otro nullifier: no coincide con tu prueba.");
      saveReceipt(electionId, { inclusionId: receipt.inclusionId, nullifier: receipt.nullifier, index: receipt.index });
      // "Ya voté": petición separada y sin datos de la boleta; si falla, el voto ya está incluido igual.
      void apiV1.markVoted(voterId, inviteToken).catch(() => undefined);
      setPhase(receipt.state === "incluido" ? "incluido" : "recibido");
      setDetail(receipt.state === "incluido" ? "Tu boleta está en el registro (ledger)." : "El servidor la recibió; aún no confirma la inclusión.");
      onDone(receipt);
    } catch (e) {
      setError(explain(e));
      setPhase("error");
    }
  }

  const sending = phase === "preparando" || phase === "enviando";

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-title">
          Boleta
        </CardTitle>
        <CardDescription>{electionTitle}</CardDescription>
        <div className="mt-1 flex flex-wrap gap-2">
          <Badge tone="warning">{walletLabel}</Badge>
          <Badge tone="neutral">Prueba Semaphore v4 en tu navegador</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!confirming ? (
          <Ballot title="Elige una opción" options={options} value={choice} onChange={setChoice} disabled={sending} />
        ) : (
          <div className="rounded-md border border-primary bg-muted p-4">
            <p className="text-small text-muted-foreground">Vas a enviar esta opción. Una credencial vale una sola boleta: no podrás cambiarla.</p>
            <p className="mt-1 text-heading font-bold">{chosen?.label}</p>
          </div>
        )}
        <p className="text-small text-muted-foreground">La prueba no revela quién emitió cada boleta; el servidor ve el contenido de la boleta. El voto no se registra on-chain desde tu wallet.</p>
        {phase !== "idle" && phase !== "error" ? (
          <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-md border border-border p-3" data-testid="send-status">
            <div className="flex items-center gap-2">
              {sending ? <span className="q-spinner" aria-hidden="true" /> : null}
              <StatusPill status={phase === "preparando" || phase === "enviando" ? "pendiente" : phase} />
              <span className="text-small font-semibold">{phase}</span>
            </div>
            <p className="text-small text-muted-foreground">{detail}</p>
            <ol className="flex flex-wrap gap-1 text-small" aria-hidden="true">
              {ORDER.map((p, i) => (
                <li key={p} className={`rounded-full border px-2 py-0.5 ${ORDER.indexOf(phase as (typeof ORDER)[number]) >= i ? "border-success bg-success-soft text-success-strong" : "border-border text-subtle"}`}>
                  {p}
                </li>
              ))}
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
            <Button full className="md:flex-1" variant="success" onClick={send} loading={sending} disabled={phase === "incluido" || phase === "recibido"}>
              {phase === "error" ? "Reintentar envío" : "Enviar mi voto"}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
