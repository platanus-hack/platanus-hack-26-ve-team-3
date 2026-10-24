"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { MODE_LABEL, type WalletMode } from "@quorum/wallet";
import { StatusPill } from "@/components/StatusPill";
import { Badge } from "@/components/ui/badge";
import { copyText } from "@/lib/client/download";
import { TechDetails, TechRow } from "./VoterUi";

export type ReceiptView = { inclusionId: string; nullifier: string; index?: number; hash?: string; state: "pendiente" | "recibido" | "incluido" | "no verificable" };

/** Etiqueta del modo de vinculación (siempre dice "demo"). */
export function LinkModeBadge({ mode }: { mode: WalletMode | null }) {
  if (!mode) return <Badge tone="warning">demo · modo de vinculación desconocido (inscripción anterior)</Badge>;
  return (
    <span className="flex flex-col gap-1">
      <Badge tone="warning" className="w-fit" data-testid="link-mode">
        {mode === "kernel" ? "Smart wallet demo · sin gas · Base Sepolia (testnet)" : "Wallet demo (eoa-demo)"}
      </Badge>
      <span className="text-muted-foreground">{MODE_LABEL[mode]}</span>
    </span>
  );
}

/**
 * Comprobante del votante: check grande y "Tu voto fue contado". NUNCA muestra la opción.
 * El código técnico (nullifier = inclusionId) va dentro de "Detalles técnicos"; "Comprobar mi voto" lo usa por debajo.
 */
export function VoteReceiptCard({ electionId, receipt, walletMode, votedAt }: { electionId: string; receipt: ReceiptView | null; walletMode?: WalletMode | null; votedAt?: string | null }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const id = encodeURIComponent(electionId);
  const included = receipt?.state === "incluido";
  async function copy() {
    if (!receipt) return;
    const ok = await copyText(receipt.nullifier);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2500);
  }
  return (
    <section className="flex flex-col items-center gap-5 text-center" data-testid="receipt">
      <CheckCircle2 className="size-24 text-success" aria-hidden="true" strokeWidth={1.75} />
      <div>
        <h1 className="text-display font-bold tracking-tight">{receipt ? (included ? "Tu voto fue contado" : "Tu voto fue recibido") : "Ya votaste"}</h1>
        <p className="mt-2 text-heading text-muted-foreground" data-testid={!receipt && votedAt ? "voted-at" : undefined}>
          {receipt ? "Guardamos tu comprobante en este teléfono. No dice qué opción elegiste." : votedAt ? `Votaste el ${votedAt}. Cada persona vota una sola vez.` : "Cada persona vota una sola vez."}
        </p>
      </div>
      <nav className="flex w-full flex-col gap-2" aria-label="Después de votar">
        <Link href={`/e/${id}/live`} className="inline-flex min-h-14 items-center justify-center rounded-md border border-border bg-card px-4 text-heading font-semibold hover:bg-muted">
          Ver resultados en vivo
        </Link>
        {receipt ? (
          <Link href={`/e/${id}?comprobar=1#mi-voto`} className="inline-flex min-h-14 items-center justify-center rounded-md px-4 text-heading font-semibold text-primary underline underline-offset-4 hover:bg-muted">
            Comprobar mi voto
          </Link>
        ) : null}
      </nav>
      {receipt ? (
        <TechDetails className="w-full text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Estado:</span>
            <StatusPill status={receipt.state} />
          </div>
          <TechRow label="Nullifier (tu código de inclusión)" testId="receipt-inclusion-id">
            {receipt.nullifier}
          </TechRow>
          <TechRow label="Posición en el registro">{typeof receipt.index === "number" ? `#${receipt.index}` : "—"}</TechRow>
          <TechRow label="Hash de la entrada">{receipt.hash ?? "—"}</TechRow>
          <div>
            <p className="text-muted-foreground">Vinculación del teléfono</p>
            <LinkModeBadge mode={walletMode ?? null} />
          </div>
          <p className="text-muted-foreground">Tu boleta llevó una prueba Semaphore v4 (Groth16) generada en este teléfono. La prueba no revela cuál inscrito emitió cada boleta; el servidor ve el contenido de la boleta. El voto no se registra on-chain.</p>
          <button type="button" onClick={copy} className="inline-flex min-h-tap w-fit items-center gap-2 rounded-md border border-border px-3 font-semibold hover:bg-muted [&_svg]:size-4">
            <Copy aria-hidden="true" /> {copied === "ok" ? "Copiado" : copied === "fail" ? "No se pudo copiar" : "Copiar nullifier"}
          </button>
          <p role="status" aria-live="polite" className="sr-only">
            {copied === "ok" ? "Código copiado" : copied === "fail" ? "No se pudo copiar" : ""}
          </p>
        </TechDetails>
      ) : null}
    </section>
  );
}
