import type { Change } from "@/lib/client/lab/alter";

/** Diff legible de lo alterado: qué tocó el jurado y qué rehízo el "atacante" para disimular. */
export function AlterationDiff({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return <p className="text-small text-muted-foreground">Sin cambios: es el paquete original.</p>;
  const tamper = changes.filter((c) => c.kind === "tamper");
  const recomputed = changes.filter((c) => c.kind === "recomputed");
  return (
    <div className="flex flex-col gap-3" data-testid="alteration-diff">
      <DiffList title="Lo que alteró el jurado" items={tamper} tone="danger" />
      {recomputed.length ? <DiffList title="Lo que se recalculó para disimular" items={recomputed} tone="neutral" /> : null}
    </div>
  );
}

function DiffList({ title, items, tone }: { title: string; items: Change[]; tone: "danger" | "neutral" }) {
  return (
    <section>
      <h4 className="mb-1.5 text-small font-bold">{title}</h4>
      <ul className="flex flex-col gap-2">
        {items.map((c) => (
          <li key={c.path} className={tone === "danger" ? "rounded-md border border-danger/40 p-2" : "rounded-md border border-border p-2"}>
            <p className="q-mono text-small font-semibold break-all">{c.path}</p>
            <p className="q-mono text-small break-all">
              <span className="sr-only">antes: </span>
              <del className="text-danger-strong decoration-2">− {c.before}</del>
            </p>
            <p className="q-mono text-small break-all">
              <span className="sr-only">después: </span>
              <ins className="text-success-strong no-underline">+ {c.after}</ins>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
