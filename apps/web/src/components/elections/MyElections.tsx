"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ElectionStatus } from "@quorum/contracts";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { ApiClientError } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { myElections, type MyElection } from "@/lib/client/myElections";
import { loadOrgToken } from "@/lib/client/orgStore";
import { ownsInvite, readLocal } from "@/lib/client/voterAccess";
import { phaseLabel } from "@/lib/client/phases";

type Row = MyElection & { status: ElectionStatus; voted: boolean };

const ACTIVE = new Set<ElectionStatus>(["draft", "registration", "open"]);

async function validate(m: MyElection): Promise<Row | null> {
  if (m.role === "organizer") {
    if (!loadOrgToken(m.electionId)) return null;
    const [list, election] = await Promise.all([apiV1.listVoters(m.electionId), apiV1.getElection(m.electionId)]);
    return "voters" in list && Array.isArray(list.voters) ? { ...m, title: election.title, status: election.status, voted: false } : null;
  }
  const invite = await apiV1.getInvite(m.href.slice("/v/".length));
  const local = readLocal(invite.election.id, invite.voter.id);
  if (invite.election.id !== m.electionId || !ownsInvite(invite, local)) return null;
  return { ...m, title: invite.election.title, status: invite.election.status, voted: Boolean(local.receipt) };
}

function cta(r: Row): { label: string; href: string; primary: boolean } {
  const id = encodeURIComponent(r.electionId);
  if (r.role === "organizer") return { label: "Administrar", href: r.href, primary: ACTIVE.has(r.status) };
  if (r.voted) return { label: "Comprobar mi voto", href: `/e/${id}?comprobar=1#mi-voto`, primary: false };
  if (r.status === "open") return { label: "Votar", href: r.href, primary: true };
  if (r.status === "registration") return { label: "Continuar", href: r.href, primary: true };
  return { label: "Ver resultado", href: `/e/${id}`, primary: false };
}

function ElectionRow({ row }: { row: Row }) {
  const action = cta(row);
  const active = ACTIVE.has(row.status);
  return (
    <li>
      <Link href={action.href} className="group block rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25">
        <Card className="flex items-center gap-4 p-4 transition-shadow group-hover:shadow-elevated">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <span aria-hidden="true" className={cn("size-2 rounded-full", active ? "bg-success" : "bg-subtle")} />
                {row.voted ? "Ya votaste" : phaseLabel[row.status]}
              </span>
              <span aria-hidden="true">·</span>
              <span>{row.role === "organizer" ? "Organizas" : "Participas"}</span>
            </p>
            <p className="mt-1 line-clamp-2 font-semibold">{row.title || "Votación"}</p>
          </div>
          <span className={cn("inline-flex shrink-0 items-center gap-1 text-small font-semibold", action.primary ? "text-primary-ink" : "text-muted-foreground")}>
            {action.label}
            <ChevronRight aria-hidden="true" className="size-4" />
          </span>
        </Card>
      </Link>
    </li>
  );
}

function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 4) router.push(`/j/${clean}`);
      }}
    >
      <div className="flex-1">
        <Field label="Código de sala" htmlFor="room-code">
          <Input id="room-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ej.: K7M3QP" autoCapitalize="characters" autoComplete="off" maxLength={10} className="q-mono uppercase tracking-[0.2em] placeholder:normal-case placeholder:tracking-normal" />
        </Field>
      </div>
      <Button type="submit" variant="secondary" full className="sm:w-auto" disabled={clean.length < 4}>
        Entrar
      </Button>
    </form>
  );
}

export function MyElections({ demoHref }: { demoHref: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const mine = myElections();
    Promise.allSettled(mine.map(validate)).then((res) => {
      if (cancelled) return;
      const failedNetwork = res.filter((r) => r.status === "rejected" && r.reason instanceof ApiClientError && (r.reason.code === "network" || r.reason.code === "unavailable")).length;
      setOffline(mine.length > 0 && failedNetwork === mine.length);
      setRows(res.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : [])));
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const active = rows?.filter((r) => ACTIVE.has(r.status) && !r.voted) ?? [];
  const past = rows?.filter((r) => !ACTIVE.has(r.status) || r.voted) ?? [];

  return (
    <div className="q-fade-in q-container flex max-w-2xl flex-col gap-8 py-6 md:py-10">
      <PageHeader title="Mis votaciones" description="Las que abriste en este teléfono." />

      <Card className="p-5">
        <JoinByCode />
      </Card>

      {rows === null ? <LoadingState label="Cargando tus votaciones…" lines={3} /> : null}

      {offline ? (
        <ErrorState
          title="No pudimos cargar tus votaciones"
          message="Revisa tu conexión."
          onRetry={() => {
            setRows(null);
            setAttempt((a) => a + 1);
          }}
        />
      ) : null}

      {rows !== null && rows.length === 0 && !offline ? (
        <EmptyState
          title="Aún no tienes votaciones aquí"
          action={
            <div className="flex flex-col items-center gap-1">
              <Link href={demoHref} className={buttonVariants()}>
                Ver un ejemplo
              </Link>
            </div>
          }
        >
          Entra con el código de tu sala o con el enlace que te enviaron.
        </EmptyState>
      ) : null}

      {active.length > 0 ? (
        <section aria-labelledby="activas" className="flex flex-col gap-3">
          <h2 id="activas" className="q-eyebrow">
            Activas
          </h2>
          <ul className="flex flex-col gap-3">
            {active.map((r) => (
              <ElectionRow key={`${r.role}:${r.electionId}`} row={r} />
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-labelledby="anteriores" className="flex flex-col gap-3">
          <h2 id="anteriores" className="q-eyebrow">
            Anteriores
          </h2>
          <ul className="flex flex-col gap-3">
            {past.map((r) => (
              <ElectionRow key={`${r.role}:${r.electionId}`} row={r} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
