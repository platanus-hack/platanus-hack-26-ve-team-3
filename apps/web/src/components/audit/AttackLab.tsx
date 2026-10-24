"use client";

import { useState } from "react";
import type { AuditResult } from "@quorum/contracts";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { AuditChecklist } from "@/components/AuditChecklist";
import { Alert } from "@/components/ui/alert";
import { Badge, FixtureTag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states";
import { api, describeError } from "@/lib/client/api";
import { alterationLabel, applyAlteration, sha256Hex, type Alteration, type AlterationReport } from "@/lib/client/audit";
import { fixtureAuditPackage } from "@/lib/client/fixtures";
import { downloadJson } from "@/lib/client/download";
import { PackageLoader, type LoadedPackage } from "./PackageLoader";

const ALTERATIONS: Alteration[] = ["tampered-total", "missing-artifact", "wrong-manifest"];

export function AttackLab() {
  const [original, setOriginal] = useState<LoadedPackage | null>(null);
  const [originalDigest, setOriginalDigest] = useState<string | null>(null);
  const [alteration, setAlteration] = useState<Alteration>("tampered-total");
  const [altered, setAltered] = useState<{ data: unknown; report: AlterationReport; digest: string } | null>(null);
  const [results, setResults] = useState<{ original: AuditResult | null; altered: AuditResult | null }>({ original: null, altered: null });
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLoaded(p: LoadedPackage) {
    setOriginal(p);
    setAltered(null);
    setResults({ original: null, altered: null });
    setError(null);
    setOriginalDigest(await sha256Hex(p.data));
  }

  async function prepare() {
    if (!original) return;
    const { altered: data, report } = applyAlteration(original.data, alteration);
    setAltered({ data, report, digest: await sha256Hex(data) });
    setResults({ original: null, altered: null });
    setError(null);
  }

  async function verifyBoth() {
    if (!original || !altered) return;
    setError(null);
    setVerifying(true);
    try {
      const [o, a] = await Promise.allSettled([api.auditVerify(original.data), api.auditVerify(altered.data)]);
      setResults({ original: o.status === "fulfilled" ? o.value : null, altered: a.status === "fulfilled" ? a.value : null });
      const failed = [o, a].find((r) => r.status === "rejected");
      if (failed && failed.status === "rejected") setError(describeError(failed.reason));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="q-container flex max-w-4xl flex-col gap-6 py-6 md:py-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge tone="warning">Laboratorio de ataques · sólo demostración</Badge>
        </div>
        <h1 className="text-title font-bold tracking-tight md:text-display">¿Qué pasa si alguien altera el paquete?</h1>
        <p className="max-w-prose text-body text-muted-foreground">
          Se altera una <strong>copia en memoria</strong> del paquete; el original nunca cambia. Luego el verificador independiente explica por qué falla.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Paquete original</CardTitle>
          <CardDescription>Por id, por archivo o con el paquete de ejemplo etiquetado fixture.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PackageLoader onLoaded={onLoaded} allowFixture onFixture={() => onLoaded({ source: "fixture", label: "Paquete de ejemplo (fixture)", data: fixtureAuditPackage })} />
          {original ? (
            <dl className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 text-small sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Origen</dt>
                <dd className="flex items-center gap-2 font-semibold">
                  {original.label} {original.source === "fixture" ? <FixtureTag /> : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">SHA-256 (local)</dt>
                <dd className="q-mono break-all font-semibold">{originalDigest ?? "…"}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Alteración</CardTitle>
          <CardDescription>Elige qué manipular en la copia.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <fieldset className="grid grid-cols-1 gap-2 md:grid-cols-3" disabled={!original}>
            <legend className="sr-only">Tipo de alteración</legend>
            {ALTERATIONS.map((a) => (
              <label key={a} htmlFor={`alt-${a}`} className={`flex min-h-tap cursor-pointer items-start gap-3 rounded-md border p-3 ${alteration === a ? "border-primary ring-2 ring-ring/40" : "border-border hover:bg-muted"} ${!original ? "opacity-60" : ""}`}>
                <input id={`alt-${a}`} type="radio" name="alteration" value={a} checked={alteration === a} onChange={() => setAlteration(a)} className="mt-1 size-5 accent-[var(--color-primary)]" />
                <span>
                  <span className="block font-semibold">{alterationLabel[a].title}</span>
                  <span className="block text-small text-muted-foreground">{alterationLabel[a].body}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <Button variant="secondary" onClick={prepare} disabled={!original} className="w-fit">
            <FlaskConical aria-hidden="true" /> Crear copia alterada
          </Button>
          {altered ? (
            <div className="rounded-md border border-warning/50 bg-warning-soft p-3 text-small">
              <p className="font-semibold">Cambio aplicado en la copia</p>
              <dl className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
                <dt className="text-muted-foreground">Ruta</dt>
                <dd className="q-mono">{altered.report.path}</dd>
                <dt className="text-muted-foreground">Antes</dt>
                <dd className="q-mono">{String(altered.report.before ?? "(ausente)")}</dd>
                <dt className="text-muted-foreground">Después</dt>
                <dd className="q-mono">{String(altered.report.after ?? "(eliminado)")}</dd>
                <dt className="text-muted-foreground">SHA-256 copia</dt>
                <dd className="q-mono break-all">{altered.digest}</dd>
              </dl>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={() => downloadJson("paquete-alterado.json", altered.data)}>
                  Descargar copia alterada
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Verificar original y copia</CardTitle>
          <CardDescription>Ambos se envían al mismo verificador. Compara los veredictos.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!altered ? (
            <EmptyState title="Sin copia alterada">Crea la copia en el paso 2.</EmptyState>
          ) : (
            <Button size="lg" onClick={verifyBoth} loading={verifying} className="w-fit">
              <ShieldCheck aria-hidden="true" /> Verificar ambos
            </Button>
          )}
          {error ? (
            <Alert tone="danger" title="El verificador no respondió para al menos un paquete">
              {error}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {results.original || results.altered ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section aria-labelledby="res-orig" className="flex flex-col gap-2">
            <h2 id="res-orig" className="text-heading font-bold">
              Original
            </h2>
            {results.original ? <AuditChecklist result={results.original} onDownload={() => downloadJson("audit-original.json", results.original)} /> : <Alert tone="warning" title="Sin veredicto">El verificador no devolvió resultado para el original.</Alert>}
          </section>
          <section aria-labelledby="res-alt" className="flex flex-col gap-2">
            <h2 id="res-alt" className="text-heading font-bold">
              Copia alterada ({alterationLabel[alteration].title.toLowerCase()})
            </h2>
            {results.altered ? <AuditChecklist result={results.altered} onDownload={() => downloadJson("audit-alterado.json", results.altered)} /> : <Alert tone="warning" title="Sin veredicto">El verificador no devolvió resultado para la copia.</Alert>}
          </section>
        </div>
      ) : null}
    </div>
  );
}
