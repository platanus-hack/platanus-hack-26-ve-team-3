"use client";

import { useEffect, useState } from "react";
import type { Aggregates } from "@quorum/contracts";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCountdown, formatInt, formatPercent } from "@/lib/client/format";

const HIDDEN_NOTE = "Desglose oculto hasta 5 votos";

/* Paleta categórica sobria (máx. 10 opciones), legible en claro/oscuro. */
const SERIES = ["#182B45", "#147D68", "#B7791F", "#5B7DB1", "#7FAF9D", "#C8A063", "#8C6D9E", "#4A5160", "#9FB5D6", "#C44242"];

function TileShell({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle as="h3" className="text-body font-bold text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">
        {children}
        {note ? <p className="mt-2 text-small text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

export function StatTile({ metric, data }: { metric: "turnout" | "totalVotes" | "leadingShare"; data: Aggregates }) {
  const def = {
    turnout: { title: "Participación", value: formatPercent(data.turnout), note: `${formatInt(data.totalVotes)} de ${formatInt(data.eligible)} elegibles` },
    totalVotes: { title: "Votos incluidos", value: formatInt(data.totalVotes), note: "Sólo agregados; nunca votos individuales" },
    leadingShare: { title: "Opción líder", value: data.leadingShare === null ? "—" : formatPercent(data.leadingShare), note: data.leadingShare === null ? HIDDEN_NOTE : "Proporción de la opción con más votos" },
  }[metric];
  return (
    <TileShell title={def.title} note={def.note}>
      <p className="text-display font-bold tracking-tight">{def.value}</p>
    </TileShell>
  );
}

function hidden(data: Aggregates) {
  return data.options.some((o) => o.count === null);
}

function SrTable({ data }: { data: Aggregates }) {
  return (
    <table className="sr-only">
      <caption>Votos por opción</caption>
      <thead>
        <tr>
          <th scope="col">Opción</th>
          <th scope="col">Votos</th>
        </tr>
      </thead>
      <tbody>
        {data.options.map((o) => (
          <tr key={o.id}>
            <th scope="row">{o.label}</th>
            <td>{o.count === null ? "oculto" : o.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BarTile({ data, orientation }: { data: Aggregates; orientation: "horizontal" | "vertical" }) {
  if (hidden(data)) return <HiddenTile title="Votos por opción" data={data} />;
  const rows = data.options.map((o) => ({ name: o.label, votos: o.count ?? 0 }));
  const height = orientation === "horizontal" ? Math.max(160, rows.length * 44) : 240;
  return (
    <TileShell title="Votos por opción">
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout={orientation === "horizontal" ? "vertical" : "horizontal"} accessibilityLayer margin={{ left: 4, right: 12, top: 4, bottom: 4 }}>
            {orientation === "horizontal" ? (
              <>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="currentColor" />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12 }} stroke="currentColor" />
              </>
            ) : (
              <>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} stroke="currentColor" />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="currentColor" />
              </>
            )}
            <Tooltip cursor={{ fill: "rgba(24,43,69,0.06)" }} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
            <Bar dataKey="votos" radius={4} isAnimationActive={false}>
              {rows.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable data={data} />
    </TileShell>
  );
}

export function DonutTile({ data }: { data: Aggregates }) {
  if (hidden(data)) return <HiddenTile title="Distribución" data={data} />;
  const rows = data.options.map((o) => ({ name: o.label, value: o.count ?? 0 }));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <TileShell title="Distribución">
      <div className="h-56" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" isAnimationActive={false} stroke="var(--color-card)">
              {rows.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-small" aria-hidden="true">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="inline-block size-3 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="flex-1 truncate">{r.name}</span>
            <span className="q-mono">{total ? formatPercent(r.value / total) : "—"}</span>
          </li>
        ))}
      </ul>
      <SrTable data={data} />
    </TileShell>
  );
}

function HiddenTile({ title, data }: { title: string; data: Aggregates }) {
  return (
    <TileShell title={title} note="Con menos de 5 votos no se publica el desglose por opción para proteger la privacidad.">
      <p className="text-heading font-bold">{HIDDEN_NOTE}</p>
      <p className="text-small text-muted-foreground">Votos incluidos hasta ahora: {formatInt(data.totalVotes)}</p>
    </TileShell>
  );
}

export function CountdownTile({ closesAt, status }: { closesAt: string; status: Aggregates["status"] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(closesAt).getTime() - now;
  const closed = status !== "open" || ms <= 0;
  return (
    <TileShell title={closed ? "Estado" : "Cierra en"} note={closed ? "No se aceptan más votos." : "Hora de Caracas"}>
      <p className="text-display font-bold tracking-tight" aria-live="off">
        {closed ? "Cerrada" : formatCountdown(ms)}
      </p>
    </TileShell>
  );
}

const TEXTS: Record<"howToRead" | "privacyNote" | "rankingHint" | "budgetHint", { title: string; body: string }> = {
  howToRead: { title: "Cómo leer esto", body: "Estas cifras son agregados que el servidor publica cada pocos segundos. No muestran votos individuales ni quién votó. El resultado final sólo cuenta cuando el verificador independiente lo confirme." },
  privacyNote: { title: "Privacidad", body: "Nunca se publica la correspondencia entre una persona y su opción. Con menos de 5 votos el desglose se oculta. Esto no elimina riesgos por metadatos." },
  rankingHint: { title: "Orden de preferencia", body: "En esta modalidad las barras muestran menciones por opción, no un ganador. El orden final lo determina el escrutinio verificado." },
  budgetHint: { title: "Presupuesto participativo", body: "Cada barra es el apoyo acumulado por partida. El reparto final depende de las reglas publicadas en el manifiesto." },
};

export function TextTile({ template }: { template: keyof typeof TEXTS }) {
  const t = TEXTS[template];
  return (
    <TileShell title={t.title}>
      <p className="text-body text-muted-foreground">{t.body}</p>
    </TileShell>
  );
}
