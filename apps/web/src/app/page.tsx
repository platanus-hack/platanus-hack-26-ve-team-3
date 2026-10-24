import Link from "next/link";
import { ArrowRight, Check, FileCheck2, Minus, ShieldCheck, Vote } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FIXTURE_PACKAGE_ID } from "@/lib/client/fixtures";
import { cn } from "@/lib/client/cn";

const DEMO_ID = process.env.NEXT_PUBLIC_DEMO_ELECTION_ID ?? FIXTURE_PACKAGE_ID;

const pillars = [
  {
    icon: <Vote aria-hidden="true" />,
    title: "Votar",
    body: "Escanea el QR, escribe tu nombre y mira a la cámara. Tu voto lleva una prueba de que estás inscrito.",
  },
  {
    icon: <FileCheck2 aria-hidden="true" />,
    title: "Verificar",
    body: "Recibes un comprobante sin tu opción para confirmar que tu boleta está en el registro.",
  },
  {
    icon: <ShieldCheck aria-hidden="true" />,
    title: "Auditar",
    body: "Cualquiera recalcula el resultado en su navegador. Si alguien lo altera, falla y dice por qué.",
  },
];

/* Ilustración del hero con datos de ejemplo (sin estados de verificación). */
const sample = {
  title: "Fecha de la asamblea anual",
  total: 48,
  eligible: 60,
  options: [
    { label: "Sábado 14", share: 0.62 },
    { label: "Domingo 15", share: 0.38 },
  ],
};

function HeroResults() {
  const [a, b] = sample.options;
  return (
    <Card className="w-full max-w-md rounded-xl border-transparent p-6 shadow-elevated md:p-7" aria-label="Ejemplo de resultados en vivo">
      <Badge tone="primary" className="gap-1.5">
        <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" />
        En vivo
      </Badge>
      <p className="mt-5 text-heading font-semibold">{sample.title}</p>
      <p className="mt-1 text-small text-muted-foreground">Sólo agregados</p>
      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <p className="q-eyebrow">Participación</p>
          <p className="q-num mt-1 text-[2.75rem] font-semibold leading-none">{Math.round((sample.total / sample.eligible) * 100)}%</p>
        </div>
        <p className="q-num text-small text-muted-foreground">
          {sample.total} / {sample.eligible} votos
        </p>
      </div>
      <div className="mt-6 flex items-center gap-3 text-body font-medium" aria-hidden="true">
        <span className="q-num w-10">{Math.round(a.share * 100)}%</span>
        <div className="flex h-3 flex-1 gap-1.5">
          <span className="rounded-full bg-primary" style={{ flexGrow: a.share }} />
          <span className="rounded-full bg-primary-muted" style={{ flexGrow: b.share }} />
        </div>
        <span className="q-num w-10 text-right">{Math.round(b.share * 100)}%</span>
      </div>
      <ul className="mt-5 flex flex-col gap-2.5 border-t border-border pt-5 text-small">
        {sample.options.map((o, i) => (
          <li key={o.label} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn("size-2.5 rounded-full", i === 0 ? "bg-primary" : "bg-primary-muted")} />
            <span className="flex-1">{o.label}</span>
            <span className="q-num font-semibold">{Math.round(o.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Home() {
  return (
    <div className="q-container flex flex-col gap-12 py-10 md:gap-16 md:py-16">
      <section className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="flex flex-col gap-6">
          <Badge tone="primary" className="self-start">
            Votaciones internas verificables
          </Badge>
          <h1 className="font-display text-[2.25rem] font-bold leading-[1.05] tracking-[-0.03em] md:text-[3.5rem]">Vota con una prueba. Verifica el resultado tú mismo.</h1>
          <p className="max-w-prose text-heading text-muted-foreground">Para condominios, universidades y comunidades. Voto privado, resultado comprobable.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href={`/e/${encodeURIComponent(DEMO_ID)}`} className={cn(buttonVariants({ size: "lg" }))}>
              Ver una votación <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/org/new" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
              Crear votación
            </Link>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <HeroResults />
        </div>
      </section>

      <section aria-labelledby="como-funciona" className="flex flex-col gap-6">
        <h2 id="como-funciona" className="text-title font-bold tracking-tight">
          Cómo funciona
        </h2>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {pillars.map((p, i) => (
            <li key={p.title}>
              <Card className="h-full">
                <CardHeader>
                  <div className="mb-3 flex size-11 items-center justify-center rounded-md bg-primary-soft text-primary-soft-foreground [&_svg]:size-5">{p.icon}</div>
                  <CardTitle as="h3">
                    <span className="q-num mr-2 text-subtle">0{i + 1}</span>
                    {p.title}
                  </CardTitle>
                  <CardDescription className="text-body">{p.body}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="limites" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Garantizamos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-body text-muted-foreground [&>li]:flex [&>li]:gap-3 [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:rounded-full [&_svg]:bg-success-soft [&_svg]:p-0.5 [&_svg]:text-success-strong">
              <li><Check aria-hidden="true" />Una persona inscrita, un voto.</li>
              <li><Check aria-hidden="true" />Comprobante que no revela tu opción.</li>
              <li><Check aria-hidden="true" />Resultado que cualquiera puede recalcular.</li>
              <li><Check aria-hidden="true" />Alteraciones detectadas, con causa.</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle id="limites">Límites</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-body text-muted-foreground [&>li]:flex [&>li]:gap-3 [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:rounded-full [&_svg]:bg-muted [&_svg]:p-0.5 [&_svg]:text-muted-foreground">
              <li><Minus aria-hidden="true" />No es para elecciones públicas.</li>
              <li><Minus aria-hidden="true" />La cámara no verifica identidad civil.</li>
              <li><Minus aria-hidden="true" />El servidor ve el contenido de cada boleta.</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
