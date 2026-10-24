"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AuditChecklist } from "@/components/AuditChecklist";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { FIXTURE_PACKAGE_ID, FIXTURE_PACKAGE_URL } from "@/lib/client/fixtures";
import { formatDateTime, formatInt, formatPercent, kindLabel } from "@/lib/client/format";
import { hasAuditPackage, phaseLabel } from "@/lib/client/phases";
import { basescanTxUrl } from "@/lib/client/room";
import type { Aggregates as AggregatesV1, AuditResponse as StoredAudit, Election as ElectionV1 } from "@quorum/contracts";
import { MyVoteCheck } from "./MyVoteCheck";
import { PhaseTimeline } from "./PhaseTimeline";
import { VerifyNowPanel, type PackageSource, type VerifiedPackage } from "./VerifyNowPanel";
import { ActionBar, PageHeader } from "@/components/ui/page-header";
import { ProgressRow } from "@/components/ui/progress-row";
import { Stat, StatGrid } from "@/components/ui/stat";
import { CheckList } from "@/components/ui/check-list";


type Fixture = { election: ElectionV1; tally: AggregatesV1 };

async function loadFixture(): Promise<Fixture> {
  const res = await fetch(FIXTURE_PACKAGE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const pkg = (await res.json()) as { electionId: string; manifest: { title: string; kind: ElectionV1["kind"]; options: { id: string; label: string }[]; startsAt: string; endsAt: string }; manifestHash: string; groupRoot: string; commitments: string[]; tally: { counts: number[]; total: number } };
  const m = pkg.manifest;
  return {
    election: { id: pkg.electionId, title: m.title, description: "Paquete de ejemplo con 3 boletas reales.", kind: m.kind, options: m.options, status: "auditable", protocol: "semaphore-ledger", eligibilityIssuerId: "fixture", organizerId: "fixture", layout: null, manifestHash: pkg.manifestHash, startsAt: m.startsAt, endsAt: m.endsAt, groupRoot: pkg.groupRoot, candidates: [] },
    tally: {
      electionId: pkg.electionId,
      turnout: pkg.tally.total / pkg.commitments.length,
      totalVotes: pkg.tally.total,
      eligible: pkg.commitments.length,
      leadingShare: null,
      closesAt: m.endsAt,
      status: "auditable",
      options: m.options.map((o, i) => ({ id: o.id, label: o.label, count: pkg.tally.total < 5 ? null : (pkg.tally.counts[i] ?? 0) })),
    },
  };
}

/**
 * Centro público de transparencia v1: fase, agregados (sin listas nominales), manifiesto, "Verificar ahora" en el
 * navegador, "Mi voto está" y enlace al sorteo. Si el id es el del paquete fixture y la API no responde, usa el fixture.
 */
export function TransparencyCenter({ electionId }: { electionId: string }) {
  const [election, setElection] = useState<ElectionV1 | null>(null);
  const [tally, setTally] = useState<AggregatesV1 | null>(null);
  const [serverAudit, setServerAudit] = useState<StoredAudit | null>(null);
  const [isFixture, setIsFixture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [verified, setVerified] = useState<VerifiedPackage | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const e = await apiV1.getElection(electionId);
        if (cancelled) return;
        setElection(e);
        const [t, a] = await Promise.allSettled([apiV1.getTally(electionId), hasAuditPackage(e.status) ? apiV1.getAudit(electionId) : Promise.reject(new Error("sin paquete"))]);
        if (cancelled) return;
        setTally(t.status === "fulfilled" ? t.value : null);
        setServerAudit(a.status === "fulfilled" ? a.value : null);
      } catch (err) {
        if (cancelled) return;
        if (electionId === FIXTURE_PACKAGE_ID) {
          try {
            const f = await loadFixture();
            if (cancelled) return;
            setElection(f.election);
            setTally(f.tally);
            setIsFixture(true);
          } catch {
            setError(describeError(err));
          }
        } else setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [electionId, attempt]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  if (loading) {
    return (
      <div className="q-container py-10">
        <LoadingState label="Cargando centro de transparencia…" lines={5} />
      </div>
    );
  }
  if (error || !election) {
    return (
      <div className="q-container py-10">
        <ErrorState title="No encontramos esta votación" message={error ?? "Sin datos"} onRetry={load}>
          <Link href="/" className="inline-flex min-h-tap items-center px-2 font-semibold underline underline-offset-4">
            Ir al inicio
          </Link>
        </ErrorState>
      </div>
    );
  }

  const hidden = tally?.options.some((o) => o.count === null) ?? false;
  const auditable = hasAuditPackage(election.status);
  const source: PackageSource = isFixture ? { kind: "fixture", url: FIXTURE_PACKAGE_URL, label: "fixture · simulación" } : { kind: "api", electionId };

  return (
    <div className="q-fade-in q-container flex flex-col gap-6 py-6 md:py-10">
      <PageHeader title={election.title} description={election.description || undefined}>
        {isFixture ? <Badge tone="warning" className="self-start">Datos de ejemplo: el servidor no respondió</Badge> : null}
        <PhaseTimeline phase={election.status} />
        <ActionBar>
          <Link href={`/e/${encodeURIComponent(electionId)}/live`} className={cn(buttonVariants({ variant: "soft" }))}>
            En vivo
          </Link>
          {election.status === "drawn" || (election.candidates?.length ?? 0) > 0 ? (
            <Link href={`/e/${encodeURIComponent(electionId)}/draw`} className={cn(buttonVariants({ variant: "soft" }))}>
              Sorteo
            </Link>
          ) : null}
        </ActionBar>
      </PageHeader>

      {election.status === "failed" ? (
        serverAudit ? (
          <AuditChecklist result={serverAudit.auditResult} runtime="servidor" title="El verificador rechazó el paquete publicado" />
        ) : (
          <Alert tone="danger" title="Fallo detectado">
            El verificador rechazó el paquete de esta votación, pero no se pudo leer su resultado (GET /audit). Verifícalo tú abajo.
          </Alert>
        )
      ) : null}

      {auditable ? (
        <VerifyNowPanel source={source} serverAudit={serverAudit} onVerified={setVerified} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Verificar ahora</CardTitle>
            <CardDescription>El paquete de auditoría se publica al cerrar la votación. Fase actual: {phaseLabel[election.status]}.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {!isFixture ? <MyVoteCheck electionId={electionId} verified={verified} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cifras agregadas</CardTitle>
            <CardDescription>Nunca votos individuales ni listas de votantes.</CardDescription>
          </CardHeader>
          <CardContent>
            {tally ? (
              <div className="flex flex-col gap-6">
                <StatGrid>
                  <Stat label="Participación" value={formatPercent(tally.turnout)} />
                  <Stat label="Boletas" value={formatInt(tally.totalVotes)} hint={`de ${formatInt(tally.eligible)}`} />
                </StatGrid>
                {hidden ? (
                  <p className="text-body">Desglose oculto hasta 5 votos.</p>
                ) : (
                  <ul className="flex flex-col gap-4">
                    {tally.options.map((o, i) => (
                      <li key={o.id}>
                        <ProgressRow label={o.label} value={<span className="font-semibold text-foreground">{formatInt(o.count)}</span>} share={tally.totalVotes ? (o.count ?? 0) / tally.totalVotes : 0} delay={i * 80} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-small text-muted-foreground">Aún no hay agregados publicados.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manifiesto y padrón</CardTitle>
            <CardDescription>Huellas que fijan la pregunta, las opciones y quién puede votar.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-small">
              <div>
                <dt className="text-muted-foreground">Hash del manifiesto</dt>
                <dd className="q-mono break-all font-semibold" data-testid="manifest-hash">
                  {election.manifestHash ?? "Aún no publicado (borrador)"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Raíz del padrón (groupRoot)</dt>
                <dd className="q-mono break-all font-semibold">{election.groupRoot ?? "Se fija al abrir la votación"}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd className="font-semibold">{kindLabel[election.kind] ?? election.kind}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Protocolo</dt>
                  <dd className="q-mono font-semibold">{election.protocol ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Abre</dt>
                  <dd className="font-semibold">{formatDateTime(election.startsAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Cierra</dt>
                  <dd className="font-semibold">{formatDateTime(election.endsAt)}</dd>
                </div>
              </div>
              <div>
                <dt className="text-muted-foreground">Opciones</dt>
                <dd>
                  <ol className="mt-1 list-decimal pl-5">
                    {election.options.map((o) => (
                      <li key={o.id}>{o.label}</li>
                    ))}
                  </ol>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ancla on-chain</dt>
                <dd className="q-mono break-all" data-testid="anchor-tx">
                  {election.anchor?.txHash ? (
                    (() => {
                      const url = basescanTxUrl(election.anchor.chainId, election.anchor.txHash);
                      return url ? (
                        <>
                          Base Sepolia ·{" "}
                          <a href={url} target="_blank" rel="noreferrer" className="underline underline-offset-4" data-testid="anchor-explorer-link">
                            {election.anchor.txHash}
                          </a>
                          <span className="ml-2 font-sans text-small text-muted-foreground">(ver en el explorador de la red)</span>
                        </>
                      ) : (
                        `Base Sepolia · ${election.anchor.txHash}`
                      );
                    })()
                  ) : (
                    "Sin ancla publicada"
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Qué garantiza y qué no</CardTitle>
            <CardDescription>Protocolo semaphore-ledger.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 text-small md:grid-cols-2">
            <div>
              <p className="mb-3 font-semibold">Se puede comprobar</p>
              <CheckList
                items={[
                  "Cada boleta prueba que viene de alguien del padrón, sin decir de quién.",
                  "Un inscrito, un voto.",
                  "Cualquiera reproduce el recuento.",
                  "Tu comprobante confirma que tu boleta está en el registro.",
                ]}
              />
            </div>
            <div>
              <p className="mb-3 font-semibold">No se garantiza</p>
              <CheckList
                tone="no"
                items={[
                  "Que el servidor no vea la opción de cada boleta.",
                  "Que el padrón sea correcto: lo define el organizador. La cámara no impide todos los duplicados.",
                  "Que no falten boletas, si no hay ancla on-chain.",
                  "La clave del votante vive solo en su navegador (wallet en Base Sepolia testnet); si se borra, no puede votar.",
                  "«Verificado» sólo lo muestra el verificador, nunca el servidor.",
                ]}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
