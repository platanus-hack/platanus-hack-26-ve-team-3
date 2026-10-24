"use client";

/**
 * Herramienta de diagnóstico: muestra qué contiene una credencial NFC (número de serie y registros NDEF).
 * Solo funciona con Web NFC (Chrome en Android, HTTPS). Safari en iPhone no lo permite.
 * Lo leído se queda en esta pantalla y en la consola del navegador: no se envía ni se guarda en el servidor.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LoadingState } from "@/components/states";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
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

const NFC_QUERY = () => "NDEFReader" in window;

export function NfcReader() {
  const [status, setStatus] = useState<string>("Toca «Empezar a leer» y acerca la credencial a la parte de atrás del teléfono.");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [scanning, setScanning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const supported = useSyncExternalStore(
    () => () => undefined,
    NFC_QUERY,
    () => null,
  );

  useEffect(() => () => controller.current?.abort(), []);

  function stop() {
    controller.current?.abort();
    controller.current = null;
    setScanning(false);
    setStatus("Lectura detenida.");
  }

  async function start() {
    if (!supported) return;
    const ac = new AbortController();
    controller.current = ac;
    try {
      const Reader = (window as unknown as { NDEFReader: new () => NdefReaderLike }).NDEFReader;
      const reader = new Reader();
      reader.addEventListener("readingerror", () => setStatus("No se pudo leer la etiqueta. Inténtalo de nuevo."), { signal: ac.signal });
      reader.addEventListener(
        "reading",
        (ev) => {
          const e = ev as NdefReadingEvent;
          const reading: Reading = {
            at: new Date().toLocaleTimeString("es-VE"),
            serialNumber: e.serialNumber || "(sin número de serie)",
            records: e.message.records.map((r) => ({ type: r.recordType, mediaType: r.mediaType, id: r.id, ...decode(r) })),
          };
          setReadings((prev) => [reading, ...prev].slice(0, 10));
          setStatus(`Leída a las ${reading.at}. Puedes acercar otra.`);
        },
        { signal: ac.signal },
      );
      await reader.scan({ signal: ac.signal });
      setScanning(true);
      setStatus("Leyendo… acerca la credencial.");
    } catch {
      controller.current = null;
      setScanning(false);
      setStatus("No se pudo empezar a leer. Revisa que el NFC esté activo.");
    }
  }

  return (
    <div className="q-fade-in q-container q-narrow flex flex-col gap-6 py-8">
      <PageHeader title="Lector NFC" description="Muestra qué guarda una credencial NFC. No se envía ni se guarda." />
      {supported === null ? (
        <LoadingState label="Comprobando el navegador…" lines={1} />
      ) : !supported ? (
        <Alert tone="warning" title="Este navegador no lee NFC">
          Solo funciona en Chrome para Android. En iPhone usa una app como «NFC Tools».
        </Alert>
      ) : (
        <div className="flex flex-col gap-3">
          {scanning ? (
            <Button size="lg" full variant="secondary" onClick={stop} className="min-h-14">
              Detener
            </Button>
          ) : (
            <Button size="lg" full onClick={start} className="min-h-14">
              Empezar a leer
            </Button>
          )}
          <p className="text-body text-muted-foreground" role="status" aria-live="polite">
            {status}
          </p>
        </div>
      )}
      <ul className="flex flex-col gap-4">
        {readings.map((r, i) => (
          <li key={i}>
            <Card className="p-4 text-small">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Hora</dt>
                <dd>{r.at}</dd>
                <dt className="text-muted-foreground">Número de serie</dt>
                <dd className="q-mono break-all">{r.serialNumber}</dd>
                <dt className="text-muted-foreground">Registros</dt>
                <dd>{r.records.length === 0 ? "ninguno" : r.records.length}</dd>
              </dl>
              {r.records.map((rec, j) => (
                <div key={j} className="mt-3 flex flex-col gap-2 rounded-md bg-muted p-3">
                  <p>
                    {rec.type}
                    {rec.mediaType ? ` · ${rec.mediaType}` : ""}
                    {rec.id ? ` · id ${rec.id}` : ""} · {rec.bytes} bytes
                  </p>
                  {rec.text !== undefined ? <p className="q-mono break-all">{rec.text}</p> : null}
                  <Disclosure title="Bytes (hex)" className="bg-card">
                    <p className="q-mono break-all text-[0.6875rem]">{rec.hex || "—"}</p>
                  </Disclosure>
                </div>
              ))}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
