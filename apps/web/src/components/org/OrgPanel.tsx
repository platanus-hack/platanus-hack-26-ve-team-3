"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, Lock, Send } from "lucide-react";
import type { Aggregates } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { api, artifactsUrl, describeError, type InvitesResponse, type PublicElection } from "@/lib/client/api";
import { appendVoters, loadVoters, rememberElection, type StoredVoter } from "@/lib/client/orgStore";
import { copyText } from "@/lib/client/download";
import { formatDateTime, formatInt, formatPercent, statusLabel } from "@/lib/client/format";
import { cn } from "@/lib/client/cn";

type Channel = "dry-run" | "wame";

export function OrgPanel({ electionId }: { electionId: string }) {
  const [election, setElection] = useState<PublicElection | null>(null);
  const [tally, setTally] = useState<Aggregates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voters, setVoters] = useState<StoredVoter[]>([]);
  const [channel, setChannel] = useState<Channel>("dry-run");
  const [sending, setSending] = useState(false);
  const [inviteResults, setInviteResults] = useState<InvitesResponse["results"] | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [newList, setNewList] = useState("");
  const [adding, setAdding] = useState(false);
  const timer = useRef<number | null>(null);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const e = await api.getElection(electionId);
        if (cancelled) return;
        setElection(e);
        setVoters(loadVoters(electionId));
        rememberElection(e.id, e.title);
        try {
          const t = await api.getTally(electionId);
          if (!cancelled) setTally(t);
        } catch {
          if (!cancelled) setTally(null);
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [electionId, attempt]);

  const load = useCallback(() => {
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible" && election?.status === "open") {
        api.getTally(electionId).then(setTally).catch(() => undefined);
      }
      timer.current = window.setTimeout(tick, 5000);
    };
    timer.current = window.setTimeout(tick, 5000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [electionId, election?.status]);

  async function sendInvites() {
    setInviteError(null);
    setInviteResults(null);
    setSending(true);
    try {
      const res = await api.sendInvites(electionId, { electionId, voterIds: voters.map((v) => v.id), channel });
      setInviteResults(res.results);
    } catch (e) {
      setInviteError(describeError(e));
    } finally {
      setSending(false);
    }
  }

  async function close() {
    setActionError(null);
    setClosing(true);
    try {
      const e = await api.closeElection(electionId);
      setElection(e);
      setConfirmClose(false);
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setClosing(false);
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
      const res = await api.addVoters(electionId, rows);
      appendVoters(electionId, res.voters);
      setVoters(loadVoters(electionId));
      setNewList("");
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
        <ErrorState title="No se pudo cargar el panel" message={error} onRetry={load}>
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

  const isOpen = election.status === "open";
  const closedLike = election.status === "closed" || election.status === "tallying" || election.status === "auditable";

  return (
    <div className="q-container flex flex-col gap-6 py-6 md:py-10">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Panel del organizador</Badge>
          <Badge tone={isOpen ? "success" : "neutral"}>{statusLabel[election.status] ?? election.status}</Badge>
        </div>
        <h1 className="text-title font-bold tracking-tight md:text-display">{election.title}</h1>
        <p className="text-small text-muted-foreground">
          Cierra {formatDateTime(election.endsAt)} · manifiesto <span className="q-mono">{election.manifestHash ? `${election.manifestHash.slice(0, 14)}…` : "sin publicar"}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/e/${encodeURIComponent(electionId)}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            Centro de transparencia
          </Link>
          <Link href={`/e/${encodeURIComponent(electionId)}/live`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
            Resultados en vivo
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h3" className="text-body text-muted-foreground">
              Participación
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-display font-bold">{tally ? formatPercent(tally.turnout) : "—"}</p>
            <p className="text-small text-muted-foreground">{tally ? `${formatInt(tally.totalVotes)} de ${formatInt(tally.eligible)} elegibles` : "Sin agregados todavía"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h3" className="text-body text-muted-foreground">
              Cierre
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-heading font-bold">{closedLike ? "Cerrada" : formatDateTime(election.endsAt)}</p>
            {isOpen ? (
              !confirmClose ? (
                <Button variant="secondary" size="sm" onClick={() => setConfirmClose(true)}>
                  <Lock aria-hidden="true" /> Cerrar elección
                </Button>
              ) : (
                <div className="flex flex-col gap-2 rounded-md border border-danger/50 p-2">
                  <p className="text-small">Cerrar es irreversible y dispara el escrutinio. ¿Confirmas?</p>
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" onClick={close} loading={closing}>
                      Sí, cerrar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmClose(false)} disabled={closing}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h3" className="text-body text-muted-foreground">
              Paquete de auditoría
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-small text-muted-foreground">{closedLike ? "Disponible para el verificador independiente." : "Se completa al cerrar; mientras tanto puede estar parcial."}</p>
            <a href={artifactsUrl(electionId)} download className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "w-fit")}>
              <Download aria-hidden="true" /> Exportar paquete
            </a>
            <Link href={`/audit?id=${encodeURIComponent(electionId)}`} className="text-small underline underline-offset-4">
              Verificar en el auditor
            </Link>
          </CardContent>
        </Card>
      </div>
      {actionError ? (
        <Alert tone="danger" title="La acción falló">
          {actionError}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Invitaciones</CardTitle>
          <CardDescription>
            Los participantes se guardan en este navegador (el contrato no expone una lista). El envío real por WhatsApp requiere aprobación en la oficina; aquí usa <span className="q-mono">dry-run</span> o enlaces <span className="q-mono">wa.me</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {voters.length === 0 ? (
            <EmptyState title="No hay participantes en este navegador">
              Si creaste la votación en otro dispositivo, los enlaces están allí. Puedes agregar más participantes abajo.
            </EmptyState>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Canal" htmlFor="channel">
                  <Select id="channel" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                    <option value="dry-run">dry-run (simulación, sin envío)</option>
                    <option value="wame">wame (enlaces wa.me para copiar)</option>
                  </Select>
                </Field>
                <Button onClick={sendInvites} loading={sending} disabled={!isOpen && election.status !== "draft"}>
                  <Send aria-hidden="true" /> Enviar invitaciones ({voters.length})
                </Button>
              </div>
              <Alert tone="info" title="Envío real pendiente de aprobación">
                Los canales <span className="q-mono">kapso</span> y <span className="q-mono">meta</span> sólo funcionan con credenciales y <span className="q-mono">INVITE_SEND_APPROVED=true</span>, aprobado por una persona.
              </Alert>
              {inviteError ? (
                <Alert tone="danger" title="No se pudieron generar las invitaciones">
                  {inviteError}
                </Alert>
              ) : null}
              <ul className="flex flex-col gap-2">
                {voters.map((v) => {
                  const r = inviteResults?.find((x) => x.voterId === v.id);
                  const link = r?.link ?? v.inviteUrl;
                  return (
                    <li key={v.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{v.displayName}</p>
                        <p className="q-mono truncate text-small text-muted-foreground" title={link}>
                          {link}
                        </p>
                        {r ? (
                          <p className="text-small">
                            Estado: <span className="font-semibold">{r.status}</span>
                            {r.error ? <span className="text-danger-strong"> · {r.error}</span> : null}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => copy(link, v.id)}>
                          <Copy aria-hidden="true" /> {copied === v.id ? "Copiado" : "Copiar enlace"}
                        </Button>
                        <Link href={v.inviteUrl.replace(/^https?:\/\/[^/]+/, "")} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                          Abrir
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer font-semibold">Agregar participantes</summary>
            <div className="mt-3 flex flex-col gap-3">
              <Field label="Una por línea: Nombre, +58412… (teléfono opcional)" htmlFor="newList">
                <Textarea id="newList" value={newList} onChange={(e) => setNewList(e.target.value)} />
              </Field>
              <Button variant="secondary" size="sm" className="w-fit" onClick={addFromList} loading={adding} disabled={!newList.trim()}>
                Registrar
              </Button>
            </div>
          </details>
        </CardContent>
      </Card>

      <p className="sr-only" role="status" aria-live="polite">
        {copied ? "Enlace copiado" : ""}
      </p>
    </div>
  );
}
