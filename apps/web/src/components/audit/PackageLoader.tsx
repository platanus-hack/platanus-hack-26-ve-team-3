"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, FileJson, Link2, Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { describeError } from "@/lib/client/api";
import { loadSource, loadUrl, type LoadedBytes } from "@/lib/client/lab/source";

export type { LoadedBytes };

/**
 * Cuatro formas de traer el paquete público: id de la elección, URL, archivo o pegar el JSON.
 * Siempre entrega BYTES: la huella de entrada es la de lo que llegó, no la de un objeto re-serializado.
 */
export function PackageLoader({ initialId = "", onLoaded, allowFixture }: { initialId?: string; onLoaded: (p: LoadedBytes) => void; allowFixture?: boolean }) {
  const [id, setId] = useState(initialId);
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState<null | "id" | "url" | "fixture">(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function guard(kind: "id" | "url" | "fixture", fn: () => Promise<LoadedBytes>) {
    setError(null);
    setBusy(kind);
    try {
      onLoaded(await fn());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  function byId(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = id.trim();
    if (!trimmed) return setError("Escribe el identificador de la elección.");
    void guard("id", () => loadSource({ kind: "election", id: trimmed }));
  }

  function byUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return setError("Pega la URL del paquete (…/api/elections/:id/artifacts).");
    void guard("url", () => loadUrl(url.trim()));
  }

  async function byFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("El archivo supera 20 MB.");
      onLoaded({ bytes: new Uint8Array(await file.arrayBuffer()), label: `Archivo local: ${file.name}`, isFixture: false, source: null });
    } catch (err) {
      setError(err instanceof Error ? `No se pudo leer el archivo: ${err.message}` : "No se pudo leer el archivo.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function byPaste() {
    if (!pasted.trim()) return setError("Pega el JSON del paquete.");
    setError(null);
    onLoaded({ bytes: new TextEncoder().encode(pasted), label: "JSON pegado", isFixture: false, source: null });
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={byId} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1">
          <Field label="Identificador de la elección" htmlFor="election-id" hint="Se descarga de /api/elections/:id/artifacts">
            <Input id="election-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="p. ej. el-3f9a…" aria-describedby="election-id-hint" autoComplete="off" />
          </Field>
        </div>
        <Button type="submit" loading={busy === "id"}>
          <Search aria-hidden="true" /> Cargar por id
        </Button>
      </form>

      <form onSubmit={byUrl} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1">
          <Field label="O la URL del paquete" htmlFor="package-url">
            <Input id="package-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/api/elections/…/artifacts" autoComplete="off" />
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={busy === "url"}>
          <Link2 aria-hidden="true" /> Descargar
        </Button>
      </form>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label htmlFor="package-file" className="inline-flex min-h-tap cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-4 font-semibold hover:bg-muted focus-within:outline-2 focus-within:outline-ring">
          <FileJson aria-hidden="true" className="size-4" /> Subir paquete JSON
          <input ref={fileRef} id="package-file" type="file" accept="application/json,.json" onChange={byFile} className="sr-only" />
        </label>
        {allowFixture ? (
          <Button variant="ghost" loading={busy === "fixture"} onClick={() => void guard("fixture", () => loadSource({ kind: "fixture" }))}>
            Usar paquete de ejemplo
          </Button>
        ) : null}
      </div>

      <details className="rounded-md border border-border p-3">
        <summary className="min-h-tap cursor-pointer content-center font-semibold">Pegar el JSON del paquete</summary>
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor="package-paste" className="sr-only">
            JSON del paquete
          </label>
          <Textarea id="package-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} className="q-mono text-small" placeholder='{"version":"quorum-audit/1", …}' />
          <Button variant="secondary" onClick={byPaste} className="w-full sm:w-fit">
            <ClipboardPaste aria-hidden="true" /> Usar este JSON
          </Button>
        </div>
      </details>

      {error ? (
        <Alert tone="danger" title="No se pudo cargar el paquete">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
