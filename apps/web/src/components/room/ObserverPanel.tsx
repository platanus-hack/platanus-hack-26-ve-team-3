import Link from "next/link";
import { Eye, Radio, ShieldQuestion, Shuffle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ObserverPanel({ electionId, hasDraw = false, bare = false }: { electionId: string; hasDraw?: boolean; bare?: boolean }) {
  const id = encodeURIComponent(electionId);
  const items = [
    { href: `/e/${id}/live`, icon: <Radio aria-hidden="true" />, title: "Ver en vivo", body: "Participación y conteo por opción." },
    { href: `/e/${id}#verificar`, icon: <ShieldQuestion aria-hidden="true" />, title: "Comprobar el resultado", body: "Al cierre, compruébalo desde tu teléfono." },
    ...(hasDraw ? [{ href: `/e/${id}/draw`, icon: <Shuffle aria-hidden="true" />, title: "Ver el sorteo", body: "Comprueba quién ganó." }] : []),
  ];
  return (
    <Card data-testid="observer-mode">
      {bare ? null : (
        <CardHeader>
          <div className="flex items-center gap-2 text-muted-foreground [&_svg]:size-5">
            <Eye aria-hidden="true" />
            <span className="q-eyebrow">Sin votar</span>
          </div>
          <CardTitle as="h2">Sigue la votación</CardTitle>
          <CardDescription>No necesitas inscribirte para comprobar el resultado.</CardDescription>
        </CardHeader>
      )}
      <CardContent className={bare ? "pt-5 md:pt-6" : undefined}>
        <ul className="flex flex-col gap-2">
          {items.map((it) => (
            <li key={it.href}>
              <Link href={it.href} className="flex min-h-tap items-start gap-3 rounded-md border border-border bg-card p-3 hover:bg-muted [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0">
                {it.icon}
                <span>
                  <span className="block font-semibold">{it.title}</span>
                  <span className="block text-small text-muted-foreground">{it.body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
