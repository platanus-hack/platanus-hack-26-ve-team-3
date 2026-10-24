import Link from "next/link";
import { ArrowRight, FileCheck2, ShieldCheck, Vote } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fixtureElection } from "@/lib/client/fixtures";
import { cn } from "@/lib/client/cn";

const DEMO_ID = process.env.NEXT_PUBLIC_DEMO_ELECTION_ID ?? fixtureElection.id;

const pillars = [
  {
    icon: <Vote aria-hidden="true" />,
    title: "Votar",
    body: "Invitación por WhatsApp, prueba de vida en el navegador (modo demo) y una wallet embebida que firma tu boleta. Sin criptomonedas ni instalaciones.",
  },
  {
    icon: <FileCheck2 aria-hidden="true" />,
    title: "Verificar",
    body: "Recibes un ID de inclusión que prueba que tu boleta entró en la urna sin revelar tu opción. Resultados en vivo sólo con agregados.",
  },
  {
    icon: <ShieldCheck aria-hidden="true" />,
    title: "Auditar",
    body: "Un verificador independiente revisa el paquete publicado. Si alguien altera un total o un artefacto, falla con causa concreta.",
  },
];

export default function Home() {
  return (
    <div className="q-container flex flex-col gap-12 py-10 md:gap-16 md:py-16">
      <section className="flex flex-col gap-6 md:max-w-3xl">
        <p className="text-small font-semibold uppercase tracking-wide text-success-strong">Votaciones internas · demostración</p>
        <h1 className="text-display font-bold tracking-tight md:text-[2.75rem] md:leading-[1.1]">Tu decisión es privada. El resultado es verificable.</h1>
        <p className="max-w-prose text-heading text-muted-foreground">Votaciones internas con evidencia pública del escrutinio. Nadie necesita confiar ciegamente en un dashboard.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={`/e/${encodeURIComponent(DEMO_ID)}`} className={cn(buttonVariants({ size: "lg" }))}>
            Explorar una elección demo <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/org/new" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
            Crear votación
          </Link>
        </div>
        <p className="text-small text-muted-foreground">
          La elección demo es ficticia (<span className="q-mono">fixture</span>): fecha de asamblea del «Condominio Los Samanes». Sin personas, partidos ni procesos reales.
        </p>
      </section>

      <section aria-labelledby="como-funciona" className="flex flex-col gap-6">
        <h2 id="como-funciona" className="text-title font-bold tracking-tight">
          Votar · Verificar · Auditar
        </h2>
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {pillars.map((p, i) => (
            <li key={p.title}>
              <Card className="h-full">
                <CardHeader>
                  <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-neutral-soft text-primary [&_svg]:size-5">{p.icon}</div>
                  <CardTitle as="h3">
                    <span className="q-mono mr-2 text-small text-subtle">{i + 1}</span>
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
            <CardTitle>Qué sí prometemos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-body text-muted-foreground">
              <li>Elegibilidad por invitación y una boleta firmada por participante.</li>
              <li>Comprobante de inclusión que no revela la opción.</li>
              <li>Paquete de evidencias que un verificador separado puede revisar.</li>
              <li>Detección de totales alterados o artefactos ausentes, con causa.</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle id="limites">Qué no prometemos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-5 text-body text-muted-foreground">
              <li>No es un sistema para elecciones públicas ni está certificado.</li>
              <li>La prueba de vida es un modo demo, no una verificación de identidad civil.</li>
              <li>No garantiza resistencia a coerción ni anonimato absoluto frente a metadatos.</li>
              <li>«Verificado» sólo aparece cuando el verificador independiente lo confirma.</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
