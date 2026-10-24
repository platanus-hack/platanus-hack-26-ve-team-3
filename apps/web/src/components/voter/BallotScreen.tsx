"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { z } from "zod";
import type { Receipt } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiClientError, voterMessage } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { openIdentity, saveReceipt } from "@/lib/client/identityVault";
import { legacyUnlock } from "@/lib/client/linkPhone";
import type { Option } from "@/lib/client/types";
import { proveBallot } from "@/lib/client/zk";

type ReceiptV1 = z.infer<typeof Receipt>;
type Phase = "idle" | "sending" | "error";

function explain(e: unknown): { message: string; alreadyVoted: boolean } {
  const msg = e instanceof Error ? e.message : String(e);
  if (/NOT_IN_GROUP/.test(msg)) return { message: "Este teléfono se vinculó después de que empezó la votación, así que no puede votar en ella.", alreadyVoted: false };
  if (e instanceof ApiClientError && e.code === "already_voted") return { message: "Ya votaste en esta votación.", alreadyVoted: true };
  return { message: voterMessage(e), alreadyVoted: false };
}

/**
 * La boleta: una sola pantalla. Tocar una opción la marca y aparece abajo un único botón "Votar: <opción>"
 * (esa es la confirmación). Al votar, el navegador abre la inscripción guardada (clave del dispositivo, sin interacción),
 * genera la prueba Semaphore con /zk y envía `POST /vote { proof }`. "Ya voté" va después en otra petición.
 * Sin registro on-chain del voto (threat model C2).
 */
export function BallotScreen({ electionId, electionTitle, options, voterId, inviteToken, onDone, onAlreadyVoted }: { electionId: string; electionTitle: string; options: Option[]; voterId: string; inviteToken: string; onDone: (r: ReceiptV1) => void; onAlreadyVoted: () => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<{ message: string; alreadyVoted: boolean } | null>(null);
  const chosen = choice !== null ? options[choice] : null;
  const sending = phase === "sending";

  async function send() {
    if (choice === null) return;
    setError(null);
    setPhase("sending");
    try {
      setDetail("Preparando…");
      const id = await openIdentity(electionId, { legacyUnlock: (info) => legacyUnlock(info, electionId) });
      // D-23: la prueba se genera contra el grupo VIGENTE. Si entra mucha gente mientras tanto (raíz fuera de la
      // ventana), el servidor responde `stale_root` y se reintenta solo con el grupo nuevo.
      let receipt: ReceiptV1 | null = null;
      let nullifier = "";
      for (let attempt = 0; receipt === null; attempt++) {
        const roll = await apiV1.getRoll(electionId);
        setDetail("Preparando tu voto en este teléfono (unos segundos)…");
        const proved = await proveBallot({ privateKey: id.privateKey, commitments: roll.commitments, electionId, optionIndex: choice });
        nullifier = proved.nullifier;
        setDetail("Enviando…");
        try {
          receipt = await apiV1.vote(electionId, { proof: proved.proof });
        } catch (err) {
          if (attempt < 2 && err instanceof ApiClientError && err.code === "stale_root") continue;
          throw err;
        }
      }
      if (receipt.nullifier !== nullifier) throw new Error("El servidor devolvió un comprobante que no coincide con tu voto.");
      saveReceipt(electionId, { inclusionId: receipt.inclusionId, nullifier, index: receipt.index, hash: receipt.hash, state: receipt.state === "incluido" ? "incluido" : "recibido" });
      // "Ya voté": petición separada y sin datos de la boleta; si falla, el voto ya está incluido igual.
      void apiV1.markVoted(voterId, inviteToken).catch(() => undefined);
      onDone(receipt);
    } catch (e) {
      const x = explain(e);
      setError(x);
      setPhase("error");
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-28" data-testid="ballot">
      <header>
        <p className="text-base font-semibold text-muted-foreground">Tu voto</p>
        <h1 className="line-clamp-3 text-title font-bold leading-tight">{electionTitle}</h1>
      </header>
      <fieldset disabled={sending} role="radiogroup" aria-label="Opciones" className="flex flex-col gap-2">
        <legend className="sr-only">Elige una opción</legend>
        {options.map((opt, i) => {
          const selected = choice === i;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                setChoice(i);
                setError(null);
                setPhase("idle");
              }}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-md border-2 px-4 text-left text-heading font-semibold transition-[background-color,border-color,box-shadow] duration-150 disabled:opacity-60",
                selected ? "border-primary bg-primary text-primary-foreground shadow-primary" : "border-border bg-card shadow-card hover:border-primary/40",
              )}
            >
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-primary-foreground" : "border-subtle")} aria-hidden="true">
                {selected ? <Check className="size-4" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">{opt.label}</span>
            </button>
          );
        })}
      </fieldset>
      {error ? (
        <Alert tone={error.alreadyVoted ? "info" : "danger"} title={error.alreadyVoted ? "Ya votaste" : "No se pudo enviar tu voto"}>
          {error.message}
          {error.alreadyVoted ? (
            <button type="button" onClick={onAlreadyVoted} className="mt-1 block min-h-tap font-semibold underline underline-offset-4">
              Ver mi comprobante
            </button>
          ) : null}
        </Alert>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {chosen && !sending ? `Elegiste ${chosen.label}` : sending ? "Enviando tu voto" : ""}
      </p>
      {chosen ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-[40rem]">
            {sending ? (
              <p role="status" aria-live="polite" className="mb-2 text-center text-base text-muted-foreground" data-testid="send-status">
                {detail}
              </p>
            ) : null}
            <Button size="lg" full className="min-h-14 text-title" onClick={send} loading={sending} data-testid="vote-button">
              {sending ? "Enviando tu voto…" : phase === "error" ? `Intentar de nuevo: ${chosen.label}` : `Votar: ${chosen.label}`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
