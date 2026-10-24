"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, FileJson, Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/client/cn";
import { Field, Input, Textarea } from "@/components/ui/input";
import { describeError } from "@/lib/client/api";
import { loadSource, loadUrl, type LoadedBytes } from "@/lib/client/lab/source";

export type { LoadedBytes };

/**
 * Formas de traer el paquete público: id o URL, archivo, ejemplo o pegar el JSON.
 * Siempre entrega BYTES: la huella de entrada es la de lo que llegó, no la de un objeto re-serializado.
 */
export function PackageLoader({ initialId = "", onLoaded, allowFixture }: { initialId?: string; onLoaded: (p: LoadedBytes) => void; allowFixture?: boolean }) {
  const [id, setId] = useState(initialId);
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

  function byIdOrUrl(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = id.trim();
    if (!trimmed) return setError("Escribe el id de la votación o la URL del paquete.");
    if (/^https?:\/\//i.test(trimmed)) void guard("url", () => loadUrl(trimmed));
    else void guard("id", () => loadSource({ kind: "election", id: trimmed }));
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
      <form onSubmit={byIdOrUrl} className="flex flex-col gap-3" noValidate>
        <Field label="Id o URL del paquete" htmlFor="election-id">
          <Input id="election-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="Ej.: el-3f9a…" autoComplete="off" />
        </Field>
        <Button type="submit" full loading={busy === "id" || busy === "url"}>
          <Search aria-hidden="true" /> Cargar
        </Button>
      </form>

      <Disclosure title="Otras formas" bodyClassName="flex flex-col gap-3">
        <label htmlFor="package-file" className={cn(buttonVariants({ variant: "secondary", full: true }), "focus-within:ring-4 focus-within:ring-ring/25")}>
          <FileJson aria-hidden="true" /> Subir paquete JSON
          <input ref={fileRef} id="package-file" type="file" accept="application/json,.json" onChange={byFile} className="sr-only" />
        </label>
        {allowFixture ? (
          <Button variant="ghost" full loading={busy === "fixture"} onClick={() => void guard("fixture", () => loadSource({ kind: "fixture" }))}>
            Usar paquete de ejemplo
          </Button>
        ) : null}
        <Disclosure title="Pegar el JSON del paquete" bodyClassName="flex flex-col gap-2">
          <label htmlFor="package-paste" className="sr-only">
            JSON del paquete
          </label>
          <Textarea id="package-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} spellCheck={false} className="q-mono text-small" placeholder='{"version":"quorum-audit/1", …}' />
          <Button variant="secondary" onClick={byPaste} full>
            <ClipboardPaste aria-hidden="true" /> Usar este JSON
          </Button>
        </Disclosure>
      </Disclosure>

      {error ? (
        <Alert tone="danger" title="No se pudo cargar el paquete">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
