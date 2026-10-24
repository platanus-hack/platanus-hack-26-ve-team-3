import Link from "next/link";
import { ArrowRight, Calculator, Check, Eye, Fingerprint, Lock, QrCode, ReceiptText, ScanFace, ShieldAlert, UserRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CheckList } from "@/components/ui/check-list";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";
import { FloatingChip, ResultsPreview, StatItem, StepCard } from "./molecules";
export { Backdrop } from "@/components/ui/backdrop";

export function Hero() {
  return (
    <section className="q-page-in grid grid-cols-1 items-center gap-12 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:pt-10">
      <div className="flex flex-col gap-6">
        <p className="q-eyebrow">Infraestructura de confianza para decisiones colectivas</p>
        <h1 className="font-display text-[2.6rem] font-bold leading-[0.98] tracking-[-0.045em] sm:text-[3.75rem] lg:text-[4.5rem]">
          Nadie tiene que creerle a <span className="text-primary-ink">quien cuenta.</span>
        </h1>
        <p className="max-w-[38ch] text-heading text-muted-foreground">Cada voto trae una prueba matemática. Cada resultado se recalcula desde cualquier teléfono.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/org/new" className={cn(buttonVariants({ size: "lg" }))}>
            Crear votación <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/votaciones" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "border-glass-border bg-glass backdrop-blur-xl")}>
            Mis votaciones
          </Link>
        </div>
        <Glass className="max-w-lg px-5 py-4">
          <dl className="grid grid-cols-3 gap-2">
            <StatItem value="2" label="toques para votar" />
            <StatItem value="0" label="fotos guardadas" />
            <StatItem value="1" label="voto por persona" />
          </dl>
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

const today = ["Actas que nadie puede revisar.", "Un resultado que depende de una persona.", "Sospechas que nadie puede probar."];
const withQuorum = ["Cada voto trae su prueba.", "Cualquiera recalcula el resultado.", "Una alteración falla con causa."];

export function Problem() {
  return (
    <section aria-labelledby="problema" className="q-reveal flex flex-col gap-5">
      <h2 id="problema" className="font-display text-title font-bold tracking-tight md:text-[2.25rem]">
        Hoy, alguien cuenta y los demás le creen.
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <Glass className="rounded-xl p-6">
          <p className="flex items-center gap-2 font-semibold text-muted-foreground">
            <UserRound aria-hidden="true" className="size-5" /> Hoy
          </p>
          <CheckList items={today} tone="no" className="mt-4 text-body" />
        </Glass>
        <Glass strong className="rounded-xl p-6">
          <p className="flex items-center gap-2 font-semibold text-primary-ink">
            <Fingerprint aria-hidden="true" className="size-5" /> Con Quórum
          </p>
          <CheckList items={withQuorum} className="mt-4 text-body" />
        </Glass>
      </div>
    </section>
  );
}

const steps = [
  { icon: <QrCode aria-hidden="true" />, title: "Entra", body: "Escanea el QR y mira a la cámara." },
  { icon: <ScanFace aria-hidden="true" />, title: "Vota", body: "Elige tu opción. Dos toques." },
  { icon: <ReceiptText aria-hidden="true" />, title: "Comprueba", body: "Tu comprobante prueba que tu voto está, sin revelar cuál fue." },
];

export function HowItWorks() {
  return (
    <section aria-labelledby="como-funciona" className="q-reveal flex flex-col gap-5">
      <h2 id="como-funciona" className="font-display text-title font-bold tracking-tight md:text-[2.25rem]">
        Así de simple
      </h2>
      <ol className="flex flex-col gap-3 md:grid md:grid-cols-3 md:gap-4">
        {steps.map((s, i) => (
          <li key={s.title}>
            <StepCard n={i + 1} icon={s.icon} title={s.title} body={s.body} className="h-full" />
          </li>
        ))}
      </ol>
    </section>
  );
}

const verifyPoints = [
  { icon: <Calculator aria-hidden="true" />, text: "Tu teléfono repite el conteo con los datos públicos." },
  { icon: <Eye aria-hidden="true" />, text: "No necesitas confiar en nuestro servidor." },
  { icon: <ShieldAlert aria-hidden="true" />, text: "Si alguien cambia un voto, falla y dice dónde." },
];

export function Recalculate() {
  return (
    <section aria-labelledby="recalcula" className="q-reveal flex flex-col gap-5">
      <h2 id="recalcula" className="font-display text-title font-bold tracking-tight md:text-[2.25rem]">
        El resultado se comprueba desde cualquier teléfono.
      </h2>
      <ul className="flex flex-col gap-3 md:grid md:grid-cols-3 md:gap-4">
        {verifyPoints.map((p) => (
          <li key={p.text}>
            <Glass className="flex h-full items-start gap-3 rounded-xl p-5 text-body">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-foreground [&_svg]:size-5">{p.icon}</span>
              <span className="pt-2">{p.text}</span>
            </Glass>
          </li>
        ))}
      </ul>
    </section>
  );
}

const uses = ["Condominios", "Universidades", "Cooperativas", "Sindicatos", "Juntas vecinales", "Clubes", "Asambleas", "Centros de estudiantes"];

export function UseCases() {
  return (
    <section aria-labelledby="para-quien" className="q-reveal flex flex-col gap-5">
      <h2 id="para-quien" className="font-display text-title font-bold tracking-tight md:text-[2.25rem]">
        Para cualquier decisión colectiva en Latinoamérica.
      </h2>
      <ul className="flex flex-wrap gap-2">
        {uses.map((u) => (
          <li key={u} className="rounded-full border border-border bg-card px-4 py-2 text-body font-medium">
            {u}
          </li>
        ))}
      </ul>
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
    <section className="q-reveal relative isolate flex flex-col items-start gap-6 overflow-hidden rounded-xl bg-navy px-6 py-12 text-[#f0eeee] shadow-elevated md:flex-row md:items-center md:justify-between md:px-10 md:py-14 dark:bg-card">
      <div aria-hidden="true" className="q-grid-bg absolute inset-0 -z-10 opacity-40" />
      <div>
        <h2 className="font-display text-[2rem] font-bold leading-[1.05] tracking-tight md:text-[2.75rem]">Que el resultado hable por sí mismo.</h2>
        <p className="mt-3 text-body text-[#f0eeee]/80">Lista en minutos. Sin instalar nada.</p>
      </div>
      <Link href="/org/new" className={cn(buttonVariants({ size: "lg" }), "shrink-0")}>
        Crear votación <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
