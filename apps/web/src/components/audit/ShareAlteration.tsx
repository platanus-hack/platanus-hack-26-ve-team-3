"use client";

import { useEffect, useState } from "react";
import { Copy, Download, QrCode } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Disclosure } from "@/components/ui/disclosure";
import { Button } from "@/components/ui/button";
import { copyText, downloadBytes } from "@/lib/client/download";
import type { AlterationId, AnchorMode } from "@/lib/client/lab/catalog";
import { embeddedUrl, recipeUrl, type ShareSource } from "@/lib/client/lab/share";

/**
 * "Compartir alteración": receta corta (QR) + enlace autónomo opcional + descarga de la copia.
 * Sin backend nuevo: el teléfono reproduce la copia desde el original público y comprueba la huella.
 */
export function ShareAlteration({
  source,
  alteration,
  anchor,
  digest,
  plainBytes,
  alteredBytes,
}: {
  source: ShareSource | null;
  alteration: AlterationId;
  anchor: AnchorMode;
  digest: string;
  /** Bytes de la copia SIN ancla simulada (para el enlace autónomo). */
  plainBytes: Uint8Array;
  /** Bytes EXACTOS que se verificaron (misma huella). */
  alteredBytes: Uint8Array;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState<string | null | "too-big">(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const recipe = source ? recipeUrl(origin, { source, alteration, anchor, digest }) : null;

  useEffect(() => {
    let alive = true;
    if (!open) return;
    if (recipe) {
      void import("qrcode").then((QR) => QR.toString(recipe, { type: "svg", errorCorrectionLevel: "M", margin: 2 })).then((svg) => alive && setQr(svg));
    }
    void embeddedUrl(origin, plainBytes, alteration).then((u) => alive && setEmbedded(u ?? "too-big"));
    return () => {
      alive = false;
    };
  }, [open, recipe, origin, plainBytes, alteration]);

  async function copy(text: string, what: string) {
    setCopied((await copyText(text)) ? what : null);
  }

  return (
    <section aria-labelledby="share-h" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 id="share-h" className="text-heading font-bold">
        Compartir alteración
      </h3>
      <p className="text-small text-muted-foreground">El público verifica esta copia alterada en su teléfono. El original no cambia.</p>
      {!open ? (
        <Button onClick={() => setOpen(true)} className="w-full sm:w-fit" data-testid="share-open">
          <QrCode aria-hidden="true" /> Compartir alteración
        </Button>
      ) : (
        <div className="flex flex-col gap-4" data-testid="share-panel">
          {recipe ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <div className="w-full max-w-72 rounded-md bg-white p-2 sm:w-72" aria-label="Código QR con el enlace a la copia alterada" role="img">
                {qr ? <div className="[&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="aspect-square animate-pulse bg-muted" />}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <p className="text-small">
                  Enlace corto: el teléfono descarga el paquete original público, aplica la misma alteración y comprueba que su copia tiene la huella{" "}
                  <span className="q-mono font-semibold">{digest.replace(/^sha256:/, "").slice(0, 16)}…</span> antes de verificarla.
                </p>
                <a href={recipe} className="q-mono break-all text-small underline underline-offset-4" data-testid="share-recipe-url">
                  {recipe}
                </a>
                <Button variant="secondary" onClick={() => copy(recipe, "receta")} className="w-full sm:w-fit">
                  <Copy aria-hidden="true" /> {copied === "receta" ? "Enlace copiado" : "Copiar enlace"}
                </Button>
              </div>
            </div>
          ) : (
            <Alert tone="warning" title="Sin enlace corto">
              El paquete se cargó desde un archivo o JSON pegado: no hay un original público del que partir. Usa el enlace autónomo o descarga la copia.
            </Alert>
          )}
          {anchor === "sim" ? (
            <p className="text-small text-warning-strong">
              La receta incluye el modo «ancla simulada» (<span className="font-semibold">simulación</span>): el teléfono simula el acta a partir del original que descarga.
            </p>
          ) : null}
          <Disclosure title="Más opciones" className="text-body" bodyClassName="flex flex-col gap-2" testId="share-more">
            {embedded === null ? (
              <p className="text-small text-muted-foreground">Preparando enlace autónomo…</p>
            ) : embedded === "too-big" ? (
              <p className="text-small text-muted-foreground">El paquete es demasiado grande para ir dentro de un enlace; usa el enlace corto o la descarga.</p>
            ) : (
              <Button variant="ghost" onClick={() => copy(embedded, "autonomo")} className="w-full justify-start sm:w-fit" data-testid="share-embedded">
                <Copy aria-hidden="true" /> {copied === "autonomo" ? "Enlace autónomo copiado" : "Copiar enlace autónomo"}
              </Button>
            )}
            <Button variant="ghost" onClick={() => downloadBytes(`copia-alterada-${alteration}.json`, alteredBytes)} className="w-full justify-start sm:w-fit">
              <Download aria-hidden="true" /> Descargar la copia alterada (JSON)
            </Button>
          </Disclosure>
        </div>
      )}
    </section>
  );
}
