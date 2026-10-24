"use client";

import { useRef, useState } from "react";
import { FileJson, Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, describeError } from "@/lib/client/api";

export type LoadedPackage = { source: "id" | "file" | "fixture"; label: string; data: unknown };

/** Pegar id de elección o subir el JSON del paquete. Devuelve el paquete cargado al padre. */
export function PackageLoader({ initialId = "", onLoaded, allowFixture, onFixture }: { initialId?: string; onLoaded: (p: LoadedPackage) => void; allowFixture?: boolean; onFixture?: () => void }) {
  const [id, setId] = useState(initialId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function byId(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = id.trim();
    if (!trimmed) return setError("Escribe el identificador de la elección.");
    setError(null);
    setLoading(true);
    try {
      const data = await api.getArtifacts(trimmed);
      onLoaded({ source: "id", label: `Paquete de ${trimmed}`, data });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function byFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("El archivo supera 20 MB.");
      const text = await file.text();
      const data: unknown = JSON.parse(text);
      onLoaded({ source: "file", label: file.name, data });
    } catch (err) {
      setError(err instanceof Error ? `No se pudo leer el JSON: ${err.message}` : "No se pudo leer el archivo.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={byId} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1">
          <Field label="Identificador de la elección" htmlFor="election-id" hint="Descarga el paquete publicado en /api/elections/:id/artifacts">
            <Input id="election-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="p. ej. el-3f9a…" aria-describedby="election-id-hint" />
          </Field>
        </div>
        <Button type="submit" loading={loading}>
          <Search aria-hidden="true" /> Cargar por id
        </Button>
      </form>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="package-file" className="inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-4 font-semibold hover:bg-muted">
          <FileJson aria-hidden="true" className="size-4" /> Subir paquete JSON
        </label>
        <input ref={fileRef} id="package-file" type="file" accept="application/json,.json" onChange={byFile} className="sr-only" />
        {allowFixture && onFixture ? (
          <Button variant="ghost" onClick={onFixture}>
            Usar paquete de ejemplo (fixture)
          </Button>
        ) : null}
      </div>
      {error ? (
        <Alert tone="danger" title="No se pudo cargar el paquete">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
