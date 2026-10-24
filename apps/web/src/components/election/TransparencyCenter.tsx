"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Aggregates } from "@quorum/contracts";
import { Badge, FixtureTag } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, LoadingState } from "@/components/states";
import { api, artifactsUrl, describeError, type PublicElection } from "@/lib/client/api";
import { fixtureAggregates, fixtureElection } from "@/lib/client/fixtures";
import { formatDateTime, formatInt, formatPercent, kindLabel, statusLabel } from "@/lib/client/format";
import { cn } from "@/lib/client/cn";

/**
 * Centro público de transparencia: agregados, manifiesto, quién certificó elegibilidad y límites.
 * Si el id es el de la elección fixture y la API no responde, muestra el fixture etiquetado.
 */
export function TransparencyCenter({ electionId }: { electionId: string }) {
  const [election, setElection] = useState<PublicElection | null>(null);
  const [tally, setTally] = useState<Aggregates | null>(null);
  const [isFixture, setIsFixture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const e = await api.getElection(electionId);
        if (cancelled) return;
        setElection(e);
        try {
          const t = await api.getTally(electionId);
          if (!cancelled) setTally(t);
        } catch {
          if (!cancelled) setTally(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (electionId === fixtureElection.id) {
          setElection(fixtureElection);
          setTally(fixtureAggregates);
          setIsFixture(true);
        } else {
          setError(describeError(err));
        }
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
        <ErrorState title="No encontramos esta elección" message={error ?? "Sin datos"} onRetry={load}>
          <Link href="/" className="inline-flex min-h-tap items-center px-2 font-semibold underline underline-offset-4">
            Ir al inicio
          </Link>
        </ErrorState>
      </div>
    );
  }

  const hidden = tally?.options.some((o) => o.count === null) ?? false;

  return (
    <div className="q-container flex flex-col gap-6 py-6 md:py-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Centro de transparencia</Badge>
          <Badge tone={election.status === "open" ? "success" : "neutral"}>{statusLabel[election.status] ?? election.status}</Badge>
          {isFixture ? <FixtureTag>fixture · API sin respuesta</FixtureTag> : null}
        </div>
        <h1 className="text-title font-bold tracking-tight md:text-display">{election.title}</h1>
        {election.description ? <p className="max-w-prose text-body text-muted-foreground">{election.description}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Link href={`/e/${encodeURIComponent(electionId)}/live`} className={cn(buttonVariants({ variant: "primary" }))}>
            Resultados en vivo
          </Link>
          <Link href={`/audit?id=${encodeURIComponent(electionId)}`} className={cn(buttonVariants({ variant: "secondary" }))}>
            Verificar escrutinio
          </Link>
          {!isFixture ? (
            <a href={artifactsUrl(electionId)} className={cn(buttonVariants({ variant: "secondary" }))} download>
              Descargar paquete de auditoría
            </a>
          ) : null}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Cifras agregadas</CardTitle>
            <CardDescription>Nunca votos individuales ni listas nominales.</CardDescription>
          </CardHeader>
          <CardContent>
            {tally ? (
              <dl className="grid grid-cols-2 gap-3 text-small">
                <div>
                  <dt className="text-muted-foreground">Participación</dt>
                  <dd className="text-heading font-bold">{formatPercent(tally.turnout)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Votos incluidos</dt>
                  <dd className="text-heading font-bold">
                    {formatInt(tally.totalVotes)} <span className="text-small font-normal text-muted-foreground">de {formatInt(tally.eligible)}</span>
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Por opción</dt>
                  <dd>
                    {hidden ? (
                      <p className="text-body">Desglose oculto hasta 5 votos.</p>
                    ) : (
                      <ul className="mt-1 flex flex-col gap-1">
                        {tally.options.map((o) => (
                          <li key={o.id} className="flex justify-between gap-2 border-b border-border py-1 last:border-0">
                            <span>{o.label}</span>
                            <span className="q-mono font-semibold">{formatInt(o.count)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-small text-muted-foreground">Aún no hay agregados publicados para esta elección.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manifiesto</CardTitle>
            <CardDescription>Hash canónico de título, opciones y fechas. Cualquier cambio lo invalida.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3 text-small">
              <div>
                <dt className="text-muted-foreground">Hash del manifiesto</dt>
                <dd className="q-mono break-all font-semibold">{election.manifestHash ?? "Aún no publicado (borrador)"}</dd>
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
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Elegibilidad</CardTitle>
            <CardDescription>Quién certificó el padrón y cómo se invitó.</CardDescription>
          </CardHeader>
          <CardContent className="text-small">
            <dl className="flex flex-col gap-2">
              <div>
                <dt className="text-muted-foreground">Certificó elegibilidad</dt>
                <dd className="q-mono font-semibold">{election.eligibilityIssuerId ?? "No declarado"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Padrón</dt>
                <dd>Lista cerrada cargada por el organizador; una invitación de un solo uso por participante. Quórum no verifica identidad civil.</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Prueba de vida</dt>
                <dd>Modo demo en el navegador, no certificada. Nunca se guardan imágenes.</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Límites conocidos</CardTitle>
            <CardDescription>Lo que esta demostración no garantiza.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-small text-muted-foreground">
              <li>No es un sistema electoral certificado ni apto para procesos públicos.</li>
              <li>Modo <span className="q-mono">integrity-demo</span>: el verificador comprueba integridad y coherencia; no hay cifrado ni pruebas ZK hasta que se integre un motor (ADR-001).</li>
              <li>La privacidad depende de que el servidor no guarde identidad junto a opción; no se protege contra metadatos ni coerción.</li>
              <li>«Verificado» sólo aparece cuando el verificador independiente devuelve <span className="q-mono">valid: true</span>.</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
