/**
 * Diagnóstico mínimo para el ensayo con teléfonos reales: en qué paso va la cámara o la vinculación y cuánto tarda.
 * Va a los logs del servidor (`/api/client-log`). Nunca lleva imagen, descriptor, nombre, token ni dirección: solo
 * etapa, tiempos, un mensaje corto y el navegador.
 */
export function clientLog(stage: string, data: Record<string, string | number | boolean | undefined> = {}): void {
  try {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const body = JSON.stringify({ stage, ...clean, ua: navigator.userAgent.slice(0, 160) });
    if (!navigator.sendBeacon?.("/api/client-log", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/client-log", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => undefined);
    }
  } catch {
    /* el diagnóstico nunca rompe el flujo */
  }
}

/** Mensaje de error corto y sin datos personales: sin direcciones/hashes (0x…), tokens largos ni correos; ≤ 80 caracteres. */
export function shortError(e: unknown): string {
  const raw = e instanceof Error ? `${e.name === "Error" ? "" : `${e.name}: `}${e.message}` : String(e);
  return raw
    .replace(/0x[0-9a-fA-F]{6,}/g, "0x…")
    .replace(/[A-Za-z0-9_-]{24,}/g, "…")
    .replace(/\S+@\S+/g, "…")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
