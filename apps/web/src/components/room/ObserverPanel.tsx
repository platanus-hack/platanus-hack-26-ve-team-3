import Link from "next/link";
import { Eye, Radio, ShieldQuestion, Shuffle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Modo observador: quien no consiguió lugar (sala llena, cerrada, expirada o votación ya abierta) puede seguir todo
 * sin votar: agregados en vivo, verificar el escrutinio en su propio navegador y recomputar el sorteo.
 */
export function ObserverPanel({ electionId }: { electionId: string }) {
  const id = encodeURIComponent(electionId);
  const items = [
    { href: `/e/${id}/live`, icon: <Radio aria-hidden="true" />, title: "Ver en vivo", body: "Participación y, por lotes de 5 boletas, el conteo por opción." },
    { href: `/e/${id}#verificar`, icon: <ShieldQuestion aria-hidden="true" />, title: "Verificar el escrutinio", body: "Al cierre, tu teléfono descarga el paquete y corre el verificador." },
    { href: `/e/${id}/draw`, icon: <Shuffle aria-hidden="true" />, title: "Recomputar el sorteo", body: "Recalcula los ganadores desde la semilla pública." },
  ];
  return (
    <Card data-testid="observer-mode">
      <CardHeader>
        <div className="flex items-center gap-2 text-muted-foreground [&_svg]:size-5">
          <Eye aria-hidden="true" />
          <span className="text-small font-semibold uppercase tracking-wide">Modo observador</span>
        </div>
        <CardTitle as="h2">Sigue la votación sin votar</CardTitle>
        <CardDescription>No necesitas inscribirte para comprobar el resultado.</CardDescription>
      </CardHeader>
      <CardContent>
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
