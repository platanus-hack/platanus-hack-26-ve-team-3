"use client";

import { useMemo } from "react";
import { encode } from "uqr";
import { cn } from "@/lib/client/cn";

/** Ruta SVG de los módulos oscuros (un `M x y h1v1h-1z` por módulo). Exportada para test. */
export function qrPath(text: string, border = 2): { size: number; d: string } {
  const qr = encode(text, { ecc: "M", border });
  let d = "";
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.data[y][x]) d += `M${x} ${y}h1v1h-1z`;
  return { size: qr.size, d };
}

/**
 * QR generado en el cliente con `uqr@0.1.2` (versión fija, sin dependencias). Siempre negro sobre blanco con margen
 * (quiet zone) para que lo lea cualquier cámara, también en modo oscuro. El texto se muestra aparte, nunca sólo el QR.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, d } = useMemo(() => qrPath(value), [value]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges" className={cn("block aspect-square shrink-0 bg-white", className)} data-testid="qr" data-qr-value={value}>
      <rect width={size} height={size} fill="#ffffff" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
