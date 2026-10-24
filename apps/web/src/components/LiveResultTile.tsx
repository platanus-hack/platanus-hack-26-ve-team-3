"use client";

import { useEffect, useState } from "react";
/* Agregados con fase v1 (registration/drawn además de las de v0). */
import type { Aggregates } from "@quorum/contracts";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCountdown, formatInt, formatPercent } from "@/lib/client/format";

const HIDDEN_NOTE = "Desglose oculto hasta 5 votos";

/* Paleta categórica desde tokens (--color-chart-1..10), cambia sola con el tema. */
const SERIES = Array.from({ length: 10 }, (_, i) => `var(--color-chart-${i + 1})`);

const TOOLTIP_STYLE = {
  borderRadius: 12,
  fontSize: 13,
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  boxShadow: "var(--shadow-card)",
  color: "var(--color-foreground)",
};
const TICK = { fontSize: 12, fill: "var(--color-muted-foreground)" };

function TileShell({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle as="h3" className="q-eyebrow">
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
    totalVotes: { title: "Votos incluidos", value: formatInt(data.totalVotes), note: "Nunca votos individuales" },
    leadingShare: { title: "Opción líder", value: data.leadingShare === null ? "—" : formatPercent(data.leadingShare), note: data.leadingShare === null ? HIDDEN_NOTE : "Proporción de la opción con más votos" },
  }[metric];
  return (
    <TileShell title={def.title} note={def.note}>
      <p className="q-num text-[2.5rem] font-semibold leading-none">{def.value}</p>
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
  if (orientation === "horizontal") return <BarListTile rows={rows} data={data} />;
  return (
    <TileShell title="Votos por opción">
      <div className="h-60" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} accessibilityLayer margin={{ left: -12, right: 4, top: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-grid)" strokeDasharray="4 4" />
            <XAxis dataKey="name" tick={{ ...TICK, fontSize: 11 }} interval={0} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={TICK} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "var(--color-muted)" }} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="votos" radius={[8, 8, 0, 0]} maxBarSize={48} isAnimationActive={false}>
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
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} cornerRadius={6} isAnimationActive={false} stroke="var(--color-card)" strokeWidth={2}>
              {rows.map((_, i) => (
                <Cell key={i} fill={SERIES[i % SERIES.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-col gap-2 text-small" aria-hidden="true">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="flex-1 truncate">{r.name}</span>
            <span className="q-num font-semibold">{total ? formatPercent(r.value / total) : "—"}</span>
          </li>
        ))}
      </ul>
      <SrTable data={data} />
    </TileShell>
  );
}

/* Ranking con barras de progreso (estilo "contenido por alcance"): etiqueta, conteo y % del total. */
function BarListTile({ rows, data }: { rows: { name: string; votos: number }[]; data: Aggregates }) {
  const total = rows.reduce((a, r) => a + r.votos, 0);
  return (
    <TileShell title="Votos por opción">
      <ul className="flex flex-col gap-4" aria-hidden="true">
        {rows.map((r, i) => {
          const share = total ? r.votos / total : 0;
          return (
            <li key={r.name}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-body font-medium">{r.name}</span>
                <span className="q-num shrink-0 text-small text-muted-foreground">
                  <span className="font-semibold text-foreground">{formatInt(r.votos)}</span> · {total ? formatPercent(share) : "—"}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: SERIES[i % SERIES.length] }} />
              </div>
            </li>
          );
        })}
      </ul>
      <SrTable data={data} />
    </TileShell>
  );
}

function HiddenTile({ title, data }: { title: string; data: Aggregates }) {
  return (
    <TileShell title={title} note="Se muestra desde 5 votos, por privacidad.">
      <p className="text-heading font-semibold">{HIDDEN_NOTE}</p>
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
    <TileShell title={closed ? "Estado" : "Cierra en"} note={closed ? "Ya no se aceptan votos" : "Hora de Caracas"}>
      <p className="q-num text-[2.5rem] font-semibold leading-none" aria-live="off">
        {closed ? "Cerrada" : formatCountdown(ms)}
      </p>
    </TileShell>
  );
}

const TEXTS: Record<"howToRead" | "privacyNote" | "rankingHint" | "budgetHint", { title: string; body: string }> = {
  howToRead: { title: "Cómo leer esto", body: "Totales publicados cada pocos segundos. No muestran quién votó ni votos individuales." },
  privacyNote: { title: "Privacidad", body: "Con menos de 5 votos el desglose se oculta. El servidor ve el contenido de cada boleta." },
  rankingHint: { title: "Orden de preferencia", body: "Las barras muestran menciones por opción. El orden final sale del escrutinio verificado." },
  budgetHint: { title: "Presupuesto participativo", body: "Apoyo acumulado por partida. El reparto sigue las reglas publicadas." },
};

export function TextTile({ template }: { template: keyof typeof TEXTS }) {
  const t = TEXTS[template];
  return (
    <TileShell title={t.title}>
      <p className="text-body text-muted-foreground">{t.body}</p>
    </TileShell>
  );
}
