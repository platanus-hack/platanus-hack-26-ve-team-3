"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Copy, Download, KeyRound, Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { PhaseTimeline } from "@/components/election/PhaseTimeline";
import { describeError, type InvitesResponse } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { copyText } from "@/lib/client/download";
import { formatDateTime, formatInt, formatPercent } from "@/lib/client/format";
import { appendVoters, consumeTokenReveal, loadOrgToken, loadVoters, rememberElection, saveOrgToken, type StoredVoter } from "@/lib/client/orgStore";
import { hasAuditPackage, nextOrganizerAction, phaseLabel } from "@/lib/client/phases";
import type { Aggregates as AggregatesV1, Election as ElectionV1, VotersListResponse as VotersListV1 } from "@quorum/contracts";
import { CandidatesList } from "./CandidatesEditor";
import { RoomCard, openProjector } from "@/components/room/RoomCard";

type Channel = "dry-run" | "wame";
const stateLabel = { invited: "Invitado", registered: "Inscrito", voted: "Votó" } as const;

/**
 * Panel del organizador v1: fase actual y UN botón por fase (abrir inscripción → congelar padrón y abrir votación →
 * cerrar → sorteo), participantes con su estado (sólo con el token del organizador), invitaciones y candidatos.
 */
export function OrgPanel({ electionId }: { electionId: string }) {
  const [election, setElection] = useState<ElectionV1 | null>(null);
  const [tally, setTally] = useState<AggregatesV1 | null>(null);
  const [voters, setVoters] = useState<NonNullable<VotersListV1["voters"]> | null>(null);
  const [counts, setCounts] = useState<VotersListV1["counts"] | null>(null);
  const [votersError, setVotersError] = useState<string | null>(null);
  const [localVoters, setLocalVoters] = useState<StoredVoter[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [reveal, setReveal] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel>("dry-run");
  const [sending, setSending] = useState(false);
  const [inviteResults, setInviteResults] = useState<InvitesResponse["results"] | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [newList, setNewList] = useState("");
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Token del organizador: se lee de sessionStorage y, la primera vez tras crear la elección, se muestra con "guárdalo".
  useEffect(() => {
    // consumeTokenReveal va DENTRO del timeout: en desarrollo (StrictMode) el efecto se monta dos veces y el primer
    // timeout se cancela; así el token se marca como mostrado una sola vez y realmente se muestra.
    const timer = window.setTimeout(() => {
      const t = loadOrgToken(electionId);
      const first = consumeTokenReveal(electionId);
      setToken(t);
      if (first && t) setReveal(t);
      setLocalVoters(loadVoters(electionId));
    }, 0);
    return () => clearTimeout(timer);
  }, [electionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const e = await apiV1.getElection(electionId);
        if (cancelled) return;
        setElection(e);
        rememberElection(e.id, e.title);
        const [t, v] = await Promise.allSettled([apiV1.getTally(electionId), apiV1.listVoters(electionId)]);
        if (cancelled) return;
        setTally(t.status === "fulfilled" ? t.value : null);
        if (v.status === "fulfilled") {
          setVoters(v.value.voters ?? null);
          setCounts(v.value.counts ?? null);
          setVotersError(null);
        } else {
          setVoters(null);
          setVotersError(describeError(v.reason));
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [electionId, attempt, token]);

  // Refresco cada 5 s mientras hay actividad (inscripción o votación abierta).
  useEffect(() => {
    if (election?.status !== "registration" && election?.status !== "open") return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") setAttempt((a) => a + 1);
    }, 5000);
    return () => clearInterval(t);
  }, [election?.status]);

  const reload = useCallback(() => {
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  function applyToken() {
    const t = tokenInput.trim();
    if (!t) return;
    saveOrgToken(electionId, t);
    consumeTokenReveal(electionId);
    setToken(t);
    setTokenInput("");
  }

  async function act() {
    if (!election) return;
    const action = nextOrganizerAction(election.status, { candidates: (election.candidates?.length ?? 0) });
    if (!action) return;
    setActing(true);
    setActionError(null);
    try {
      if (action.id === "publish") setElection(await apiV1.publish(electionId));
      else if (action.id === "open") setElection(await apiV1.open(electionId));
      else if (action.id === "close") setElection(await apiV1.close(electionId));
      else await apiV1.draw(electionId);
      setConfirming(false);
      reload();
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setActing(false);
    }
  }

  async function sendInvites() {
    setInviteError(null);
    setInviteResults(null);
    setSending(true);
    try {
      const ids = voters?.map((v) => v.id) ?? localVoters.map((v) => v.id);
      const res = await apiV1.sendInvites(electionId, { electionId, voterIds: ids, channel });
      setInviteResults(res.results);
    } catch (e) {
      setInviteError(describeError(e));
    } finally {
      setSending(false);
    }
  }

  async function addFromList() {
    const rows = newList
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, phone] = l.split(/[,;\t]/).map((s) => s?.trim() ?? "");
        return phone ? { displayName: name, phoneE164: phone } : { displayName: name };
      })
      .filter((p) => p.displayName);
    if (rows.length === 0) return;
    setAdding(true);
    setActionError(null);
    try {
      const res = await apiV1.addVoters(electionId, rows);
      appendVoters(electionId, res.voters);
      setLocalVoters(loadVoters(electionId));
      setNewList("");
      reload();
    } catch (e) {
      setActionError(describeError(e));
    } finally {
      setAdding(false);
    }
  }

  async function copy(text: string, key: string) {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  if (error) {
    return (
      <div className="q-container py-10">
        <ErrorState title="No se pudo cargar el panel" message={error} onRetry={reload}>
          <Link href="/org/new" className="inline-flex min-h-tap items-center px-2 font-semibold underline underline-offset-4">
            Crear una votación
          </Link>
        </ErrorState>
      </div>
    );
  }
  if (!election) {
    return (
      <div className="q-container py-10">
        <LoadingState label="Cargando panel del organizador…" lines={5} />
      </div>
    );
  }

  const phase = election.status;
  const action = nextOrganizerAction(phase, { candidates: (election.candidates?.length ?? 0) });
  const shownCounts = counts ?? (voters ? { invited: voters.filter((v) => v.state === "invited").length, registered: voters.filter((v) => v.state === "registered").length, voted: voters.filter((v) => v.state === "voted").length } : null);
  const canAddVoters = phase === "draft" || phase === "registration";
  const inviteLinkFor = (id: string) => inviteResults?.find((r) => r.voterId === id)?.link ?? localVoters.find((v) => v.id === id)?.inviteUrl ?? null;

  return (
    <div className="q-container flex flex-col gap-6 py-6 md:py-10">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Panel del organizador</Badge>
          <Badge tone={phase === "failed" ? "danger" : "neutral"}>{phaseLabel[phase]}</Badge>
        </div>
        <h1 className="text-title font-bold tracking-tight md:text-display">{election.title}</h1>
        <p className="text-small text-muted-foreground">
          Cierra {formatDateTime(election.endsAt)} · manifiesto <span className="q-mono">{election.manifestHash ? `${election.manifestHash.slice(0, 14)}…` : "sin publicar"}</span>
        </p>
        <PhaseTimeline phase={phase} />
        <div className="flex flex-wrap gap-2">
          <Link href={`/e/${encodeURIComponent(electionId)}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            Centro de transparencia
          </Link>
          <Link href={`/e/${encodeURIComponent(electionId)}/live`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            Resultados en vivo
          </Link>
          <Button variant="secondary" size="sm" onClick={() => openProjector(electionId)}>
            Proyectar
          </Button>
        </div>
      </header>

      {reveal ? (
        <Alert tone="warning" title="Tu token de organizador: guárdalo">
          <p>Se muestra una sola vez. Sin él no podrás abrir, cerrar ni sortear desde otro navegador. Se guarda sólo en esta pestaña.</p>
          <p className="q-mono mt-2 break-all rounded-md border border-border bg-card p-2 text-foreground" data-testid="org-token">
            {reveal}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => copy(reveal, "token")}>
              <Copy aria-hidden="true" /> {copied === "token" ? "Copiado" : "Copiar token"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReveal(null)}>
              Ya lo guardé
            </Button>
          </div>
        </Alert>
      ) : null}

      {!token ? (
        <Card>
          <CardHeader>
            <CardTitle>Token del organizador</CardTitle>
            <CardDescription>Las acciones del organizador exigen el token que recibiste al crear la votación. Sólo se guarda en esta pestaña.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Token" htmlFor="org-token-input">
              <Input id="org-token-input" type="password" autoComplete="off" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} className="q-mono" />
            </Field>
            <Button onClick={applyToken} disabled={!tokenInput.trim()}>
              <KeyRound aria-hidden="true" /> Usar token
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-body text-muted-foreground">
              Participación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-display font-bold">{tally ? formatPercent(tally.turnout) : "—"}</p>
            <p className="text-small text-muted-foreground">{tally ? `${formatInt(tally.totalVotes)} boletas de ${formatInt(tally.eligible)} en el padrón` : "Sin agregados todavía"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-body text-muted-foreground">
              Inscripción
            </CardTitle>
          </CardHeader>
          <CardContent>
            {shownCounts ? (
              <dl className="grid grid-cols-3 gap-2 text-center text-small">
                {(["invited", "registered", "voted"] as const).map((k) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{stateLabel[k]}</dt>
                    <dd className="text-heading font-bold">{formatInt(shownCounts[k])}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-small text-muted-foreground">{token ? "No se pudo leer la lista de participantes." : "Requiere el token del organizador."}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-body text-muted-foreground">
              Siguiente paso
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {action ? (
              !confirming ? (
                <Button onClick={() => setConfirming(true)} disabled={!token} data-testid="phase-action">
                  {action.label}
                </Button>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-danger/50 p-2">
                  <p className="text-small">{action.confirm} ¿Confirmas?</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" size="sm" onClick={act} loading={acting}>
                      Sí, {action.label.toLowerCase()}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={acting}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <p className="text-small text-muted-foreground">
                {phase === "auditable" && (election.candidates?.length ?? 0) === 0
                  ? "Auditable. No hay proyectos postulados: no hay sorteo."
                  : phase === "drawn"
                    ? "Sorteo realizado."
                    : phase === "failed"
                      ? "La verificación del paquete falló: el resultado se publica con el error."
                      : `Fase ${phaseLabel[phase].toLowerCase()}: no hay acción pendiente.`}
              </p>
            )}
            {!token && action ? <p className="text-small text-muted-foreground">Necesitas el token del organizador.</p> : null}
            {hasAuditPackage(phase) ? (
              <div className="flex flex-col gap-1 text-small">
                <a href={`/api/elections/${encodeURIComponent(electionId)}/artifacts`} download className="inline-flex min-h-tap items-center gap-2 font-semibold underline underline-offset-4">
                  <Download className="size-4" aria-hidden="true" /> Exportar paquete de auditoría
                </a>
                <Link href={`/e/${encodeURIComponent(electionId)}#verificar`} className="inline-flex min-h-tap items-center underline underline-offset-4">
                  Verificar en el navegador
                </Link>
              </div>
            ) : null}
            {phase === "drawn" ? (
              <Link href={`/e/${encodeURIComponent(electionId)}/draw`} className="inline-flex min-h-tap items-center text-small underline underline-offset-4">
                Ver sorteo y recomputarlo
              </Link>
            ) : null}
          </CardContent>
        </Card>
      </div>
      {actionError ? (
        <Alert tone="danger" title="La acción falló">
          {actionError}
        </Alert>
      ) : null}

      {phase === "registration" ? <RoomCard electionId={electionId} hasToken={Boolean(token)} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Proyectos postulados al sorteo</CardTitle>
          <CardDescription>
            Fijados en el manifiesto al crear la votación (no se pueden editar).{" "}
            {election.winnersCountFromResult ? "La opción ganadora fija cuántos se financian; el sorteo verificable elige cuáles." : "El sorteo verificable elige los ganadores."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CandidatesList candidates={election.candidates ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Participantes e invitaciones</CardTitle>
          <CardDescription>
            Sólo tú ves esta lista (requiere token). La vista pública muestra sólo agregados. El envío real por WhatsApp requiere aprobación; aquí usa <span className="q-mono">dry-run</span> o <span className="q-mono">wa.me</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {votersError && token ? (
            <Alert tone="warning" title="No se pudo leer GET /voters">
              {votersError}
            </Alert>
          ) : null}
          {voters && voters.length === 0 ? <EmptyState title="Aún no hay participantes">Agrégalos abajo, uno por línea.</EmptyState> : null}
          {voters && voters.length > 0 ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Canal" htmlFor="channel">
                  <Select id="channel" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                    <option value="dry-run">dry-run (simulación, sin envío)</option>
                    <option value="wame">wame (enlaces wa.me para copiar)</option>
                  </Select>
                </Field>
                <Button onClick={sendInvites} loading={sending} disabled={phase !== "registration" && phase !== "draft"}>
                  <Send aria-hidden="true" /> Enviar invitaciones ({voters.length})
                </Button>
              </div>
              {inviteError ? (
                <Alert tone="danger" title="No se pudieron generar las invitaciones">
                  {inviteError}
                </Alert>
              ) : null}
              <ul className="flex flex-col gap-2" data-testid="voters-list">
                {voters.map((v) => {
                  const link = inviteLinkFor(v.id);
                  return (
                    <li key={v.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{v.displayName}</p>
                        <p className="text-small">
                          <Badge tone={v.state === "voted" ? "success" : v.state === "registered" ? "neutral" : "warning"}>{stateLabel[v.state]}</Badge>
                        </p>
                        {link ? (
                          <p className="q-mono truncate text-small text-muted-foreground" title={link}>
                            {link}
                          </p>
                        ) : null}
                      </div>
                      {link ? (
                        <Button variant="secondary" size="sm" onClick={() => copy(link, v.id)}>
                          <Copy aria-hidden="true" /> {copied === v.id ? "Copiado" : "Copiar enlace"}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
          {canAddVoters ? (
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer font-semibold">Agregar participantes</summary>
              <div className="mt-3 flex flex-col gap-3">
                <Field label="Una por línea: Nombre, +58412… (teléfono opcional)" htmlFor="newList">
                  <Textarea id="newList" value={newList} onChange={(e) => setNewList(e.target.value)} />
                </Field>
                <Button variant="secondary" size="sm" className="w-fit" onClick={addFromList} loading={adding} disabled={!newList.trim() || !token}>
                  Registrar
                </Button>
              </div>
            </details>
          ) : (
            <p className="text-small text-muted-foreground">El padrón está congelado: no se pueden agregar participantes.</p>
          )}
        </CardContent>
      </Card>

      <p className="sr-only" role="status" aria-live="polite">
        {copied ? "Copiado al portapapeles" : ""}
      </p>
    </div>
  );
}
