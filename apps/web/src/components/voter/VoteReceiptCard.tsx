"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { copyText } from "@/lib/client/download";
import { formatDateTime } from "@/lib/client/format";

/** `at`: hora en que el servidor incluyó el voto (o, si viene del teléfono, cuando se guardó el comprobante). */
export type ReceiptView = { inclusionId: string; nullifier: string; state: "pendiente" | "recibido" | "incluido" | "no verificable"; at?: string | null };

/**
 * Comprobante del votante como ticket térmico que "sale impreso" de una ranura. Muestra estado, hora y el código del
 * comprobante (por debajo, el nullifier de la boleta), que "Comprobar mi voto" usa en la página de transparencia.
 * Después de votar solo se puede comprobar el voto (sin «en vivo»: los resultados se ven al cerrar). NUNCA muestra la opción elegida.
 */
export function VoteReceiptCard({ electionId, receipt, votedAt, title }: { electionId: string; receipt: ReceiptView | null; votedAt?: string | null; title?: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const id = encodeURIComponent(electionId);
  const included = receipt?.state === "incluido";
  const heading = receipt ? (included ? "Tu voto fue contado" : "Tu voto fue recibido") : "Ya votaste";
  async function copy() {
    if (!receipt) return;
    const ok = await copyText(receipt.nullifier);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2500);
  }
  return (
    <section className="flex flex-col items-center gap-6" data-testid="receipt">
      <div className="w-full max-w-[22rem]">
        <div aria-hidden="true" className="relative z-10 h-4 rounded-full bg-gradient-to-b from-[#2b303b] to-[#0d1016] shadow-[inset_0_2px_3px_rgb(255_255_255/0.18),0_8px_16px_-8px_rgb(0_0_0/0.6)]" />
        <div className="-mt-2 overflow-hidden px-3 pb-4">
          <article className="q-print q-ticket relative bg-white px-5 pb-5 pt-7 font-mono text-[0.8125rem] leading-snug text-[#111] shadow-elevated">
            <p className="text-center text-[0.6875rem] tracking-[0.35em]">QUÓRUM</p>
            <h1 className="mt-4 font-display text-[2.5rem] font-bold uppercase leading-[0.9] tracking-[-0.04em]">{heading}</h1>
            <TicketRule />
            {title ? <p className="line-clamp-2 text-center">{title}</p> : null}
            {receipt?.at ? (
              <p className="mt-1 text-center" data-testid="receipt-time">
                {formatDateTime(receipt.at)}
              </p>
            ) : null}
            {!receipt ? (
              <p className="mt-1 text-center" data-testid={votedAt ? "voted-at" : undefined}>
                {votedAt ? `Votaste el ${votedAt}.` : null} Cada persona vota una sola vez.
              </p>
            ) : null}
            <TicketRule />
            <dl className="flex flex-col gap-1 uppercase">
              <div className="flex justify-between gap-4">
                <dt>Estado</dt>
                <dd>{receipt ? (included ? "Contado" : "Recibido") : "Registrado"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Opción</dt>
                <dd>Privada</dd>
              </div>
            </dl>
            {receipt ? (
              <>
                <TicketRule />
                <p className="text-[0.6875rem] uppercase">Código de tu comprobante</p>
                <p className="mt-1 break-all text-[0.6875rem]" data-testid="receipt-inclusion-id">
                  {receipt.nullifier}
                </p>
                <TicketRule />
                <Barcode value={receipt.nullifier} />
              </>
            ) : null}
          </article>
        </div>
      </div>

      <nav className="q-after-print flex w-full flex-col gap-2" aria-label="Después de votar">
        {receipt ? (
          <>
            <Link href={`/e/${id}?comprobar=1#mi-voto`} className={buttonVariants({ size: "lg", full: true })}>
              Comprobar mi voto
            </Link>
            <Button variant="link" className="self-center" onClick={copy}>
              <Copy aria-hidden="true" /> {copied === "ok" ? "Copiado" : copied === "fail" ? "No se copió" : "Copiar código"}
            </Button>
          </>
        ) : null}
        <p role="status" aria-live="polite" className="sr-only">
          {copied === "ok" ? "Código copiado" : copied === "fail" ? "No se pudo copiar" : ""}
        </p>
      </nav>
    </section>
  );
}

function TicketRule() {
  return <hr aria-hidden="true" className="my-3 border-0 border-t border-dashed border-[#111]/40" />;
}

function Barcode({ value }: { value: string }) {
  const digits = Array.from(value.replace(/\D/g, "").slice(0, 48) || "0", Number);
  const bars = digits.reduce<{ x: number; w: number }[]>((acc, d) => {
    const prev = acc.at(-1);
    return [...acc, { x: prev ? prev.x + prev.w + 1 + (d % 2) : 0, w: 1 + (d % 3) }];
  }, []);
  const width = bars.at(-1)!.x + bars.at(-1)!.w;
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${width} 40`} preserveAspectRatio="none" className="h-12 w-full">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="#111" />
      ))}
    </svg>
  );
}
