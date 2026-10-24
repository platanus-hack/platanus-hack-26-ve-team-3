"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { AuditResult } from "@quorum/contracts";
import { ShieldCheck } from "lucide-react";
import { AuditChecklist } from "@/components/AuditChecklist";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states";
import { api, describeError } from "@/lib/client/api";
import { sha256Hex } from "@/lib/client/audit";
import { downloadJson } from "@/lib/client/download";
import { PackageLoader, type LoadedPackage } from "./PackageLoader";

export function AuditVerifier() {
  const params = useSearchParams();
  const [pkg, setPkg] = useState<LoadedPackage | null>(null);
  const [digest, setDigest] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLoaded(p: LoadedPackage) {
    setPkg(p);
    setResult(null);
    setError(null);
    setDigest(await sha256Hex(p.data));
  }

  async function verify() {
    if (!pkg) return;
    setError(null);
    setResult(null);
    setVerifying(true);
    try {
      setResult(await api.auditVerify(pkg.data));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="q-container flex max-w-4xl flex-col gap-6 py-6 md:py-10">
      <header className="flex flex-col gap-2">
        <Badge tone="neutral" className="w-fit">
          Auditor independiente
        </Badge>
        <h1 className="text-title font-bold tracking-tight md:text-display">Verificar escrutinio</h1>
        <p className="max-w-prose text-body text-muted-foreground">
          Carga el paquete público y ejecuta el verificador. El veredicto sale del verificador, no de esta página: si no devuelve <span className="q-mono">valid: true</span>, aquí no verás «verificado».
        </p>
        <Link href="/audit/lab" className="text-small underline underline-offset-4">
          ¿Quieres ver cómo falla? Laboratorio de ataques
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Paquete de auditoría</CardTitle>
          <CardDescription>Pega el id de la elección o sube el JSON descargado.</CardDescription>
        </CardHeader>
        <CardContent>
          <PackageLoader initialId={params.get("id") ?? ""} onLoaded={onLoaded} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Verificación</CardTitle>
          <CardDescription>Se envía el paquete tal cual a <span className="q-mono">POST /api/audit/verify</span>, que delega en el verificador separado.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!pkg ? (
            <EmptyState title="Sin paquete cargado">Carga un paquete en el paso 1 para habilitar la verificación.</EmptyState>
          ) : (
            <>
              <dl className="grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Origen</dt>
                  <dd className="font-semibold">{pkg.label}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">SHA-256 del JSON cargado (local)</dt>
                  <dd className="q-mono break-all font-semibold">{digest ?? "calculando…"}</dd>
                </div>
              </dl>
              <Button size="lg" onClick={verify} loading={verifying} className="w-fit">
                <ShieldCheck aria-hidden="true" /> Verificar escrutinio
              </Button>
            </>
          )}
          {verifying ? (
            <p role="status" aria-live="polite" className="text-small text-muted-foreground">
              Verificando… el resultado puede tardar unos segundos.
            </p>
          ) : null}
          {error ? (
            <Alert tone="danger" title="El verificador no respondió">
              {error} No se puede afirmar nada sobre este escrutinio.
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {result ? <AuditChecklist result={result} onDownload={() => downloadJson(`audit-${result.electionId}-${result.checkedAt.slice(0, 19).replace(/[:T]/g, "-")}.json`, { ...result, inputSha256Local: digest })} /> : null}
    </div>
  );
}
