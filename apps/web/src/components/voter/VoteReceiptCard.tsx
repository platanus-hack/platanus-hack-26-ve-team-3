"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Copy } from "lucide-react";
import { copyText } from "@/lib/client/download";
import { formatDateTime } from "@/lib/client/format";

/** `at`: hora en que el servidor incluyó el voto (o, si viene del teléfono, cuando se guardó el comprobante). */
export type ReceiptView = { inclusionId: string; nullifier: string; state: "pendiente" | "recibido" | "incluido" | "no verificable"; at?: string | null };

/**
 * Comprobante del votante, sin jerga (pedido de producto): check grande, "Tu voto fue contado", la hora,
 * "Comprobar mi voto" y "Ver resultados". El código del comprobante (por debajo, el nullifier de la boleta) se puede
 * copiar; "Comprobar mi voto" lo usa en la página de transparencia, donde sí están los detalles técnicos.
 * NUNCA muestra la opción elegida.
 */
export function VoteReceiptCard({ electionId, receipt, votedAt }: { electionId: string; receipt: ReceiptView | null; votedAt?: string | null }) {
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
        {receipt?.at ? (
          <p className="mt-2 text-heading font-semibold" data-testid="receipt-time">
            {formatDateTime(receipt.at)}
          </p>
        ) : null}
        <p className="mt-2 text-heading text-muted-foreground" data-testid={!receipt && votedAt ? "voted-at" : undefined}>
          {receipt ? "Guardamos tu comprobante en este teléfono. No dice qué opción elegiste." : votedAt ? `Votaste el ${votedAt}. Cada persona vota una sola vez.` : "Cada persona vota una sola vez."}
        </p>
      </div>
      <nav className="flex w-full flex-col gap-2" aria-label="Después de votar">
        {receipt ? (
          <Link href={`/e/${id}?comprobar=1#mi-voto`} className="inline-flex min-h-14 items-center justify-center rounded-full bg-primary px-4 text-heading font-semibold text-primary-foreground shadow-primary hover:bg-primary-hover">
            Comprobar mi voto
          </Link>
        ) : null}
        <Link href={`/e/${id}/live`} className="inline-flex min-h-14 items-center justify-center rounded-md border border-border bg-card px-4 text-heading font-semibold hover:bg-muted">
          Ver resultados
        </Link>
      </nav>
      {receipt ? (
        <div className="flex w-full flex-col gap-2 rounded-md border border-border bg-card p-3 text-left text-base">
          <p className="text-muted-foreground">Código de tu comprobante</p>
          <p className="q-mono break-all text-small font-semibold" data-testid="receipt-inclusion-id">
            {receipt.nullifier}
          </p>
          <button type="button" onClick={copy} className="inline-flex min-h-tap w-fit items-center gap-2 rounded-md border border-border px-3 font-semibold hover:bg-muted [&_svg]:size-4">
            <Copy aria-hidden="true" /> {copied === "ok" ? "Copiado" : copied === "fail" ? "No se pudo copiar" : "Copiar código"}
          </button>
          <p role="status" aria-live="polite" className="sr-only">
            {copied === "ok" ? "Código copiado" : copied === "fail" ? "No se pudo copiar" : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}
