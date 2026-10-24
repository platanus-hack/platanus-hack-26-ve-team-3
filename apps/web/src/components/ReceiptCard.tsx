"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/StatusPill";
import type { Receipt } from "@/lib/client/types";
import { copyText } from "@/lib/client/download";
import { formatDateTime } from "@/lib/client/format";

/** Recibo compartible: muestra `inclusionId`, estado y fechas. NUNCA la opción elegida. */
export function ReceiptCard({ receipt, electionTitle }: { receipt: Receipt; electionTitle?: string }) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  async function copy() {
    const ok = await copyText(receipt.inclusionId);
    setCopied(ok ? "ok" : "fail");
    setTimeout(() => setCopied(null), 2500);
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Comprobante de inclusión</CardTitle>
          <StatusPill status={receipt.state} />
        </div>
        <CardDescription>{electionTitle ?? receipt.electionId}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-small font-semibold text-muted-foreground">ID de inclusión</p>
          <p className="q-mono mt-1 rounded-md border border-border bg-muted p-3 text-body" aria-label="ID de inclusión">
            {receipt.inclusionId}
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Recibido</dt>
            <dd className="font-semibold">{formatDateTime(receipt.receivedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Incluido en la urna</dt>
            <dd className="font-semibold">{receipt.includedAt ? formatDateTime(receipt.includedAt) : "Aún no (pendiente)"}</dd>
          </div>
        </dl>
        <p className="text-small text-muted-foreground">
          Este comprobante no contiene tu opción. Puedes compartirlo: sólo prueba que una boleta con este ID fue {receipt.includedAt ? "incluida" : "recibida"}.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={copy}>
            <Copy aria-hidden="true" /> {copied === "ok" ? "Copiado" : copied === "fail" ? "No se pudo copiar" : "Copiar ID"}
          </Button>
          <Link href={`/e/${encodeURIComponent(receipt.electionId)}`} className="inline-flex min-h-tap items-center gap-2 px-2 text-body font-semibold text-primary underline-offset-4 hover:underline">
            <ExternalLink className="size-4" aria-hidden="true" /> Centro de transparencia
          </Link>
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {copied === "ok" ? "ID copiado al portapapeles" : copied === "fail" ? "No se pudo copiar" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
