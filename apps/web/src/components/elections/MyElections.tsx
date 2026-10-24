"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import type { ElectionStatus } from "@quorum/contracts";
import { EmptyState, LoadingState } from "@/components/states";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { apiV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { myElections, type MyElection } from "@/lib/client/myElections";
import { phaseLabel } from "@/lib/client/phases";

type Row = MyElection & { status: ElectionStatus | null };

const ACTIVE = new Set<ElectionStatus>(["draft", "registration", "open"]);

function cta(r: Row): { label: string; href: string; primary: boolean } {
  const id = encodeURIComponent(r.electionId);
  if (r.role === "organizer") return { label: "Administrar", href: r.href, primary: r.status !== null && ACTIVE.has(r.status) };
  if (r.status === "open") return { label: "Votar", href: r.href, primary: true };
  if (r.status === "registration") return { label: "Continuar", href: r.href, primary: true };
  return { label: "Ver resultado", href: `/e/${id}`, primary: false };
}

function ElectionRow({ row }: { row: Row }) {
  const action = cta(row);
  const active = row.status !== null && ACTIVE.has(row.status);
  return (
    <li>
      <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-elevated sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <span aria-hidden="true" className={cn("size-2 rounded-full", active ? "bg-success" : "bg-subtle")} />
              {row.status ? phaseLabel[row.status] : "No disponible"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{row.role === "organizer" ? "Organizas" : "Participas"}</span>
          </p>
          <p className="mt-1 line-clamp-2 font-semibold">{row.title || "Votación"}</p>
        </div>
        {row.status ? (
          <Link href={action.href} className={cn(buttonVariants({ variant: action.primary ? "primary" : "secondary", size: "sm" }), "shrink-0 self-start sm:self-auto")}>
            {action.label}
            {action.primary ? <ArrowRight aria-hidden="true" /> : null}
          </Link>
        ) : null}
      </Card>
    </li>
  );
}

function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean.length >= 4) router.push(`/j/${clean}`);
      }}
    >
      <div className="flex-1">
        <Field label="Código de sala" htmlFor="room-code">
          <Input id="room-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="K7M3QP" autoCapitalize="characters" autoComplete="off" maxLength={10} className="q-mono uppercase tracking-[0.2em]" />
        </Field>
      </div>
      <Button type="submit" disabled={clean.length < 4}>
        Entrar
      </Button>
    </form>
  );
}

export function MyElections({ demoHref }: { demoHref: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mine = myElections();
    Promise.allSettled(mine.map((m) => apiV1.getElection(m.electionId))).then((res) => {
      if (cancelled) return;
      setRows(
        mine.map((m, i) => {
          const r = res[i];
          return r.status === "fulfilled" ? { ...m, title: r.value.title, status: r.value.status } : { ...m, status: null };
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = rows?.filter((r) => r.status && ACTIVE.has(r.status)) ?? [];
  const past = rows?.filter((r) => !r.status || !ACTIVE.has(r.status)) ?? [];

  return (
    <div className="q-fade-in q-container flex max-w-2xl flex-col gap-8 py-6 md:py-10">
      <PageHeader title="Mis votaciones" description="Las que abriste o en las que participas desde este dispositivo." />

      <Card className="p-5">
        <JoinByCode />
      </Card>

      {rows === null ? <LoadingState label="Cargando tus votaciones…" lines={3} /> : null}

      {rows !== null && rows.length === 0 ? (
        <EmptyState
          title="Aún no tienes votaciones aquí"
          action={
            <Link href={demoHref} className={buttonVariants({ variant: "secondary" })}>
              Ver un ejemplo
            </Link>
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
