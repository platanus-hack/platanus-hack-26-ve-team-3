"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { AuditChecklist } from "@/components/AuditChecklist";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { describeError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { downloadJson } from "@/lib/client/download";
import { FIXTURE_PACKAGE_ID, FIXTURE_PACKAGE_URL } from "@/lib/client/fixtures";
import { formatDateTime, kindLabel, shortHash } from "@/lib/client/format";
import { hasAuditPackage, hasDraw, phaseLabel } from "@/lib/client/phases";
import { basescanTxUrl } from "@/lib/client/room";
import type { BrowserVerification } from "@/lib/client/zk";
import { MIN_VOTES_FOR_BREAKDOWN, type Aggregates as AggregatesV1, type AuditResponse as StoredAudit, type Election as ElectionV1 } from "@quorum/contracts";
import { AnonymityCard } from "./AnonymityCard";
import { MyVoteCheck } from "./MyVoteCheck";
import { PhaseTimeline } from "./PhaseTimeline";
import { normalizeDigest, VerifyNowPanel, type PackageSource, type VerifiedPackage } from "./VerifyNowPanel";
import { ActionBar, PageHeader } from "@/components/ui/page-header";
import { CheckList } from "@/components/ui/check-list";
import { ResultsCard } from "@/components/results/ResultsCard";
import { WinnerScreen } from "@/components/results/WinnerScreen";
import { Disclosure } from "@/components/ui/disclosure";

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
      options: m.options.map((o, i) => ({ id: o.id, label: o.label, count: pkg.tally.total < MIN_VOTES_FOR_BREAKDOWN ? null : (pkg.tally.counts[i] ?? 0) })),
    },
  };
}

/**
 * Centro público de transparencia v1. Orden (cerrada): verificación en el navegador que arranca sola → tarjeta compacta
 * (veredicto, huella, sello) → resultado (`WinnerScreen`, misma carta que /live y el panel) → «¿Está mi voto?» (plegado
 * salvo `?comprobar=1`) → «Más detalles» (plegado: comprobaciones completas, resultado del servidor, totales, paquete
 * para la CLI, grupo de anonimato, huellas, qué garantiza). Abierta: estado, resultados en vivo, «¿Está mi voto?» y
 * «Más detalles». Sin listas nominales. Si el id es el del paquete fixture y la API no responde, usa el fixture.
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
  const [run, setRun] = useState<BrowserVerification | null>(null);
  // `?comprobar=1#mi-voto` (desde el comprobante): «¿Está mi voto?» abierto y comprobando solo. Solo se usa tras cargar
  // (nunca en el marcado de carga que se hidrata), así que leer `window` en el inicializador no desalinea nada.
  const [comprobar] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("comprobar") === "1");

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
        <LoadingState label="Cargando…" lines={5} />
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

  const closed = hasAuditPackage(election.status);
  const source: PackageSource = isFixture ? { kind: "fixture", url: FIXTURE_PACKAGE_URL, label: "fixture · simulación" } : { kind: "api", electionId };
  const browserResult = run?.ok ? run.result : null;
  // El veredicto de la carta del ganador: primero el verificador de este navegador; si aún no terminó, el guardado por el servidor.
  const auditForWinner = browserResult ?? serverAudit?.auditResult ?? null;
  const auditSource = browserResult ? "tu teléfono" : serverAudit?.auditResult ? "el servidor" : null;
  const byId = new Map(election.options.map((o) => [o.id, o]));
  const withPhotos = tally ? tally.options.map((o) => ({ ...o, subtitle: byId.get(o.id)?.subtitle, image: byId.get(o.id)?.image })) : [];
  const digestMatchesServer = browserResult && serverAudit?.packageDigest ? normalizeDigest(serverAudit.packageDigest) === normalizeDigest(browserResult.inputArtifactDigest) : null;
  const anchorUrl = election.anchor?.txHash ? basescanTxUrl(election.anchor.chainId, election.anchor.txHash) : null;

  return (
    <div className="q-fade-in q-container flex flex-col gap-5 py-6 md:py-10">
      <PageHeader title={election.title} description={election.description || undefined}>
        {isFixture ? <Badge tone="warning" className="self-start">Datos de ejemplo: el servidor no respondió</Badge> : null}
        <PhaseTimeline phase={election.status} continuous={election.votingMode === "continuous"} hasDraw={hasDraw(election)} />
        <ActionBar>
          <Link href={`/e/${encodeURIComponent(electionId)}/live`} className={cn(buttonVariants({ variant: "soft" }))}>
            En vivo
          </Link>
          {election.status === "drawn" ? (
            <Link href={`/e/${encodeURIComponent(electionId)}/draw`} className={cn(buttonVariants({ variant: "soft" }))}>
              Sorteo
            </Link>
          ) : null}
        </ActionBar>
      </PageHeader>

      {/* 1. Cerrada: la verificación en el navegador arranca sola; tarjeta compacta al terminar. */}
      {closed ? <VerifyNowPanel source={source} serverAudit={serverAudit} anchor={election.anchor ?? null} autoStart onVerified={setVerified} onRun={setRun} /> : null}

      {election.status === "failed" ? (
        <Alert tone="danger" title="Fallo detectado">
          El verificador rechazó el paquete de esta votación: no hay resultado que declarar. Las comprobaciones están arriba y en «Más detalles».
        </Alert>
      ) : null}

      {/* 2. Resultado: misma carta que /live y el panel; «Resultado verificado» solo con valid === true del verificador. */}
      {closed && election.status !== "failed" && tally ? (
        <div className="flex flex-col gap-2">
          <WinnerScreen electionId={electionId} status={tally.status} options={withPhotos} totalVotes={tally.totalVotes} audit={auditForWinner} className="gap-5 py-6 md:py-10" />
          <p className="text-small text-muted-foreground" data-testid="winner-source">
            {auditSource ? `Veredicto: verificador ejecutado en ${auditSource}.` : "Veredicto pendiente: sin respuesta del verificador."}
          </p>
        </div>
      ) : null}

      {/* 2b. Abierta: sin resultados en vivo para el votante (se publican al cerrar; la cabina tampoco los muestra). */}
      {!closed && election.status !== "draft" ? (
        <div className="rounded-xl border border-border bg-card p-5" data-testid="results-at-close">
          <p className="text-heading font-semibold">Los resultados se publican al cerrar la votación.</p>
          <p className="mt-1 text-small text-muted-foreground">Mientras tanto, aquí puedes comprobar que tu boleta está en el registro.</p>
        </div>
      ) : null}
      {!closed ? (
        <p className="text-small text-muted-foreground" data-testid="verify-later">
          La verificación en tu teléfono se activa al cerrar la votación, cuando se publica el paquete de auditoría. Fase actual: {phaseLabel[election.status]}.
        </p>
      ) : null}

      {/* 3. ¿Está mi voto? (plegado salvo que se venga del comprobante). */}
      {!isFixture ? (
        <div id="mi-voto" className="scroll-mt-4">
          <Disclosure title={<span className="text-heading font-semibold">¿Está mi voto?</span>} defaultOpen={comprobar} testId="my-vote-disclosure" className="bg-card text-body" bodyClassName="p-4">
            <MyVoteCheck electionId={electionId} verified={verified} anchor={election.anchor ?? null} frame="plain" />
          </Disclosure>
        </div>
      ) : null}

      {/* 4. Todo lo demás, plegado. */}
      <Disclosure title={<span className="text-heading font-semibold">Más detalles</span>} testId="more-details" className="bg-card text-body" bodyClassName="flex flex-col gap-4 p-4">
        {browserResult ? (
          <AuditChecklist result={browserResult} runtime="navegador" title="Las comprobaciones de tu teléfono" verdictTestId="audit-verdict-detail" onDownload={() => downloadJson(`verificacion-${browserResult.electionId}.json`, browserResult)} />
        ) : null}
        {browserResult && serverAudit?.packageDigest ? (
          <Alert tone={digestMatchesServer ? "info" : "warning"} title={digestMatchesServer ? "Mismo paquete que verificó el servidor" : "Paquete distinto al que verificó el servidor"}>
            El servidor publicó su propio resultado sobre <span className="q-mono">{shortHash(serverAudit.packageDigest, 14, 8)}</span>
            {digestMatchesServer ? "; coincide con lo que tú descargaste." : `; tú verificaste ${shortHash(browserResult.inputArtifactDigest, 14, 8)}. Confía en tu verificación, no en la del servidor.`}
          </Alert>
        ) : null}
        {serverAudit ? <AuditChecklist result={serverAudit.auditResult} runtime="servidor" title={election.status === "failed" ? "El verificador rechazó el paquete publicado" : "Resultado guardado por el servidor"} verdictTestId="audit-verdict-server" /> : null}

        {closed && tally ? <ResultsCard options={tally.options} totalVotes={tally.totalVotes} eligible={tally.eligible} turnout={tally.turnout} live={false} statusLabel={phaseLabel[tally.status]} title="Totales publicados" /> : null}

        {source.kind === "api" && closed ? (
          <a href={`/api/elections/${encodeURIComponent(source.electionId)}/artifacts`} download className="inline-flex min-h-tap w-fit items-center gap-2 text-small font-semibold underline underline-offset-4">
            <Download className="size-4" aria-hidden="true" /> Descargar el paquete para verificarlo con la CLI
          </a>
        ) : null}

        {election.votingMode === "continuous" && election.status !== "draft" ? <AnonymityCard electionId={electionId} k={election.minAnonymitySet ?? 5} closed={closed} /> : null}

        <Card>
          <CardHeader>
            <CardTitle>La votación</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-small">
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd className="font-semibold">{kindLabel[election.kind] ?? election.kind}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Protocolo</dt>
                  <dd className="q-mono font-semibold">{election.protocol ?? "—"}</dd>
                </div>
              </div>
              <div>
                <dt className="text-muted-foreground">Hash del manifiesto</dt>
                <dd className="q-mono break-all font-semibold" data-testid="manifest-hash">
                  {election.manifestHash ?? "Aún no publicado (borrador)"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Huella del padrón</dt>
                <dd className="q-mono break-all font-semibold">{election.groupRoot ?? (election.votingMode === "continuous" ? "Crece con cada inscripción; la final se publica al cerrar" : "Se fija al abrir la votación")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sello del registro en la cadena</dt>
                <dd className="q-mono break-all" data-testid="anchor-tx">
                  {election.anchor?.txHash ? (
                    anchorUrl ? (
                      <>
                        Base Sepolia ·{" "}
                        <a href={anchorUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4" data-testid="anchor-explorer-link">
                          {election.anchor.txHash}
                        </a>
                      </>
                    ) : (
                      `Cadena ${election.anchor.chainId} · ${election.anchor.txHash}`
                    )
                  ) : (
                    "Sin sello publicado"
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qué garantiza y qué no</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  "Que no falten boletas, si no hay registro público externo.",
                  "La clave del votante vive solo en su navegador; si la borra, no puede votar.",
                  "«Verificado» sólo lo muestra el verificador, nunca el servidor.",
                ]}
              />
            </div>
          </CardContent>
        </Card>
      </Disclosure>
    </div>
  );
}
