"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import { copyText } from "@/lib/client/download";

/**
 * Comprobante v1: el nullifier (= inclusionId) y la posición en el ledger. NUNCA la opción.
 * El nullifier permite comprobar después que la boleta sigue en el paquete publicado ("Mi voto está").
 */
export function VoteReceiptCard({ electionId, electionTitle, receipt }: { electionId: string; electionTitle?: string; receipt: { inclusionId: string; nullifier: string; index?: number; hash?: string; state: "pendiente" | "recibido" | "incluido" | "no verificable" } }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  async function copy() {
    const ok = await copyText(receipt.nullifier);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2500);
  }
  return (
    <Card data-testid="receipt">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Comprobante de inclusión</CardTitle>
          <StatusPill status={receipt.state} />
        </div>
        <CardDescription>{electionTitle ?? electionId}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-small font-semibold text-muted-foreground">Nullifier (tu ID de inclusión)</p>
          <p className="q-mono mt-1 rounded-md border border-border bg-muted p-3 text-small" data-testid="receipt-inclusion-id">
            {receipt.nullifier}
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Posición en el registro</dt>
            <dd className="font-semibold">{typeof receipt.index === "number" ? `#${receipt.index}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Hash de la entrada</dt>
            <dd className="q-mono font-semibold">{receipt.hash ? `${receipt.hash.slice(0, 14)}…` : "—"}</dd>
          </div>
        </dl>
        <p className="text-small text-muted-foreground">Este comprobante no contiene tu opción. Se guardó en este navegador para que puedas comprobar tu boleta al cierre.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={copy}>
            <Copy aria-hidden="true" /> {copied === "ok" ? "Copiado" : copied === "fail" ? "No se pudo copiar" : "Copiar nullifier"}
          </Button>
          <Link href={`/e/${encodeURIComponent(electionId)}#mi-voto`} className="inline-flex min-h-tap items-center gap-2 px-2 text-body font-semibold text-primary underline-offset-4 hover:underline">
            <ExternalLink className="size-4" aria-hidden="true" /> Comprobar &quot;mi voto está&quot;
          </Link>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {copied === "ok" ? "Nullifier copiado al portapapeles" : copied === "fail" ? "No se pudo copiar" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
