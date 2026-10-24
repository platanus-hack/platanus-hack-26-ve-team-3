import Link from "next/link";
import { ArrowRight, Calculator, Eye, Fingerprint, QrCode, ReceiptText, ScanFace, ShieldAlert, UserRound } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CheckList } from "@/components/ui/check-list";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";
import { StatItem, StepCard } from "./molecules";
import { GlitchText, Marquee, PhoneVerify, ProofChain } from "./motion";
export { Backdrop } from "@/components/ui/backdrop";

export function Hero() {
  return (
    <section className="q-page-in grid grid-cols-1 items-center gap-10 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-14 lg:pt-10">
      <div className="flex flex-col gap-6">
        <p className="q-eyebrow">Infraestructura de confianza para decisiones colectivas</p>
        <h1 className="font-display text-[2.6rem] font-bold leading-[0.98] tracking-[-0.045em] sm:text-[3.75rem] lg:text-[4.75rem]">
          Nadie tiene que creerle a <span className="text-primary-ink">quien cuenta.</span>
        </h1>
        <p className="max-w-[38ch] text-heading text-muted-foreground">Cada voto trae una prueba matemática. Cada resultado se recalcula desde cualquier teléfono.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/org/new" className={cn(buttonVariants({ size: "lg" }))}>
            Crear votación <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/votaciones" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
            Mis votaciones
          </Link>
        </div>
      </div>
      <ProofChain />
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
        <div className="rounded-xl border border-dashed border-input p-6">
          <p className="flex items-center gap-2 font-semibold text-muted-foreground">
            <UserRound aria-hidden="true" className="size-5" /> Hoy
          </p>
          <CheckList items={today} tone="no" className="mt-4 text-body" />
        </div>
        <div className="rounded-xl bg-navy p-6 text-[#f0eeee] shadow-elevated dark:bg-card">
          <p className="flex items-center gap-2 font-semibold text-accent">
            <Fingerprint aria-hidden="true" className="size-5" /> Con Quórum
          </p>
          <ul className="mt-4 space-y-3 text-body">
            {withQuorum.map((t) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="font-display text-heading font-semibold md:text-title">
        Y cualquier manipulación <GlitchText>se delata sola.</GlitchText>
      </p>
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
      <Glass className="max-w-xl px-5 py-4">
        <dl className="grid grid-cols-3 gap-2">
          <StatItem value="2" label="toques para votar" />
          <StatItem value="0" label="fotos guardadas" />
          <StatItem value="1" label="voto por persona" />
        </dl>
      </Glass>
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
    <section aria-labelledby="recalcula" className="q-reveal grid grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16">
      <div className="flex flex-col gap-5">
        <h2 id="recalcula" className="font-display text-title font-bold tracking-tight md:text-[2.25rem]">
          El resultado se comprueba desde cualquier teléfono.
        </h2>
        <ul className="flex flex-col gap-4">
          {verifyPoints.map((p) => (
            <li key={p.text} className="flex items-start gap-3 text-body">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-foreground [&_svg]:size-5">{p.icon}</span>
              <span className="pt-2">{p.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <PhoneVerify />
    </section>
  );
}

const uses = ["Condominios", "Universidades", "Cooperativas", "Sindicatos", "Juntas vecinales", "Clubes", "Asambleas", "Centros de estudiantes", "Gremios", "Comunidades"];

export function UseCases() {
  return (
    <section aria-labelledby="para-quien" className="q-reveal flex flex-col gap-5">
      <h2 id="para-quien" className="font-display text-title font-bold tracking-tight md:text-[2.25rem]">
        Para cualquier decisión colectiva en Latinoamérica.
      </h2>
      <Marquee items={uses} className="-mx-4 md:mx-0" />
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
        <p className="mt-3 text-body text-[#f0eeee]/70">Lista en minutos. Sin instalar nada.</p>
      </div>
      <Link href="/org/new" className={cn(buttonVariants({ size: "lg" }), "shrink-0")}>
        Crear votación <ArrowRight aria-hidden="true" />
      </Link>
    </section>
  );
}
