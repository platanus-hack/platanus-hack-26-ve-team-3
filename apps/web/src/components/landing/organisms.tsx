import Link from "next/link";
import { ArrowRight, Check, Lock, QrCode, ReceiptText, ScanFace } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CheckList } from "@/components/ui/check-list";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";
import { FloatingChip, ResultsPreview, StatItem, StepCard } from "./molecules";

export function Backdrop() {
  return <div aria-hidden="true" className="q-grid-bg pointer-events-none absolute inset-x-0 top-0 -z-10 h-[44rem]" />;
}

export function Hero() {
  return (
    <section className="q-page-in grid grid-cols-1 items-center gap-12 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:pt-10">
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-[2.75rem] font-bold leading-[0.98] tracking-[-0.04em] sm:text-[3.75rem] lg:text-[4.5rem]">
          Vota en segundos.
          <br />
          <span className="text-primary-ink">Verifica siempre.</span>
        </h1>
        <p className="max-w-[34ch] text-heading text-muted-foreground">Votaciones para tu comunidad con voto privado y un resultado que cualquiera puede recalcular.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/org/new" className={cn(buttonVariants({ size: "lg" }))}>
            Crear votación <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/votaciones" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "border-glass-border bg-glass backdrop-blur-xl")}>
            Mis votaciones
          </Link>
        </div>
        <Glass className="grid max-w-lg grid-cols-3 gap-2 px-5 py-4">
          <StatItem value="2" label="toques para votar" />
          <StatItem value="0" label="fotos guardadas" />
          <StatItem value="1" label="voto por persona" />
        </Glass>
      </div>

      <div className="relative mx-auto w-full max-w-sm px-3 pb-6 pt-8 lg:max-w-none">
        <FloatingChip icon={<Check className="text-success-strong" aria-hidden="true" />} className="-top-1 left-0">
          Voto contado
        </FloatingChip>
        <ResultsPreview />
        <FloatingChip icon={<Lock className="text-primary-ink" aria-hidden="true" />} className="-bottom-1 right-0">
          Opción privada
        </FloatingChip>
      </div>
    </section>
  );
}

const steps = [
  { icon: <QrCode aria-hidden="true" />, title: "Entra", body: "Escanea el QR y escribe tu nombre." },
  { icon: <ScanFace aria-hidden="true" />, title: "Vota", body: "Mira a la cámara y elige. Dos toques." },
  { icon: <ReceiptText aria-hidden="true" />, title: "Comprueba", body: "Tu comprobante prueba que tu voto está, sin revelar cuál fue." },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="como-funciona" className="q-reveal flex flex-col gap-5">
      <h2 id="como-funciona" className="font-display text-title font-bold tracking-tight md:text-[2rem]">
        Así de simple
      </h2>
      <ol className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        {steps.map((s, i) => (
          <li key={s.title} className="w-[78%] shrink-0 snap-start md:w-auto">
            <StepCard n={i + 1} icon={s.icon} title={s.title} body={s.body} className="h-full" />
          </li>
        ))}
      </ol>
    </section>
  );
}

const promises = ["Una persona inscrita, un voto.", "Comprobante que no revela tu opción.", "Resultado que cualquiera puede recalcular.", "Alteraciones detectadas, con causa."];
const limits = ["No es para elecciones públicas.", "La cámara no verifica identidad civil.", "El servidor ve el contenido de cada boleta."];

export function Promise() {
  return (
    <section aria-labelledby="garantias" className="q-reveal">
      <Glass className="grid grid-cols-1 gap-8 rounded-xl p-6 md:grid-cols-2 md:p-8">
        <div>
          <h2 id="garantias" className="text-heading font-semibold">
            Garantizamos
          </h2>
          <CheckList items={promises} className="mt-4 text-body" />
        </div>
        <div>
          <h2 className="text-heading font-semibold">Límites</h2>
          <CheckList items={limits} tone="no" className="mt-4 text-body" />
        </div>
      </Glass>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="q-reveal flex flex-col items-start gap-6 rounded-xl border border-white/10 bg-[#111122] px-6 py-10 text-white md:flex-row md:items-center md:justify-between md:px-10 md:py-12">
      <div>
        <h2 className="font-display text-[1.75rem] font-bold leading-tight tracking-tight md:text-[2.25rem]">Tu próxima votación, verificable.</h2>
        <p className="mt-2 text-body text-white/65">Lista en minutos. Sin instalar nada.</p>
      </div>
      <Link href="/org/new" className={cn(buttonVariants({ size: "lg" }), "shrink-0 shadow-none")}>
        Crear votación <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
