"use client";

/**
 * Herramienta de diagnóstico: muestra qué contiene una credencial NFC (número de serie y registros NDEF).
 * Solo funciona con Web NFC (Chrome en Android, HTTPS). Safari en iPhone no lo permite.
 * Lo leído se queda en esta pantalla y en la consola del navegador: no se envía ni se guarda en el servidor.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

type NdefRecord = { recordType: string; mediaType?: string; id?: string; encoding?: string; lang?: string; data?: DataView };
type NdefReadingEvent = Event & { serialNumber: string; message: { records: NdefRecord[] } };
type NdefReaderLike = EventTarget & { scan: (opts?: { signal?: AbortSignal }) => Promise<void> };

type Reading = { at: string; serialNumber: string; records: { type: string; mediaType?: string; id?: string; text?: string; hex: string; bytes: number }[] };

function decode(r: NdefRecord): { text?: string; hex: string; bytes: number } {
  const dv = r.data;
  if (!dv) return { hex: "", bytes: 0 };
  const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
  let text: string | undefined;
  if (r.recordType === "text" || r.recordType === "url" || r.recordType === "absolute-url" || r.mediaType?.startsWith("text/") || r.mediaType === "application/json") {
    text = new TextDecoder(r.encoding || "utf-8").decode(bytes);
  } else {
    const t = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (/^[\x20-\x7e -￿\s]*$/.test(t)) text = t;
  }
  return { text, hex, bytes: bytes.length };
}

export function NfcReader() {
  const [status, setStatus] = useState<string>("Toca «Empezar a leer» y acerca la credencial a la parte de atrás del teléfono.");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [scanning, setScanning] = useState(false);
  const supported = typeof window !== "undefined" && "NDEFReader" in window;

  async function start() {
    if (!supported) return;
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NdefReaderLike }).NDEFReader;
      const reader = new Reader();
      await reader.scan();
      setScanning(true);
      setStatus("Leyendo… acerca la credencial.");
      reader.addEventListener("readingerror", () => setStatus("No se pudo leer la etiqueta. Puede no tener datos NDEF o estar protegida. Intenta de nuevo."));
      reader.addEventListener("reading", (ev) => {
        const e = ev as NdefReadingEvent;
        const reading: Reading = {
          at: new Date().toLocaleTimeString("es-VE"),
          serialNumber: e.serialNumber || "(sin número de serie)",
          records: e.message.records.map((r) => ({ type: r.recordType, mediaType: r.mediaType, id: r.id, ...decode(r) })),
        };
        console.log("[nfc]", reading);
        setReadings((prev) => [reading, ...prev].slice(0, 10));
        setStatus(`Leída a las ${reading.at}. Puedes acercar otra.`);
      });
    } catch (err) {
      setStatus(`No se pudo iniciar la lectura: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="q-fade-in q-container max-w-xl py-8">
      <PageHeader title="Lector NFC" description="Muestra qué guarda una credencial NFC. No se envía ni se guarda." />
      {!supported ? (
        <div className="mt-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm" role="alert">
          Este navegador no puede leer NFC. Web NFC solo funciona en <strong>Chrome para Android</strong>. En iPhone, Safari no lo permite: usa una app como «NFC Tools» para ver el contenido.
        </div>
      ) : (
        <>
          <Button size="lg" full onClick={start} disabled={scanning} className="mt-6 min-h-14">
            {scanning ? "Leyendo…" : "Empezar a leer"}
          </Button>
          <p className="mt-3 text-base" role="status" aria-live="polite">{status}</p>
        </>
      )}
      <ul className="mt-6 space-y-4">
        {readings.map((r, i) => (
          <li key={i} className="rounded-lg border p-4 text-sm">
            <p><strong>Hora:</strong> {r.at}</p>
            <p className="break-all"><strong>Número de serie (UID):</strong> {r.serialNumber}</p>
            <p><strong>Registros NDEF:</strong> {r.records.length === 0 ? "ninguno" : r.records.length}</p>
            {r.records.map((rec, j) => (
              <div key={j} className="mt-2 rounded bg-muted p-2">
                <p>Tipo: {rec.type}{rec.mediaType ? ` · ${rec.mediaType}` : ""}{rec.id ? ` · id ${rec.id}` : ""} · {rec.bytes} bytes</p>
                {rec.text !== undefined ? <p className="mt-1 break-all font-mono">{rec.text}</p> : null}
                <details className="mt-1"><summary>Bytes (hex)</summary><p className="break-all font-mono text-xs">{rec.hex || "—"}</p></details>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
