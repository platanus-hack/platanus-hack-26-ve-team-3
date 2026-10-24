import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CheckList } from "@/components/ui/check-list";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";
import { FloatingChip, ResultsPreview, StatItem } from "./molecules";
export { TrustFlow } from "./flow";
import { HeroStory } from "./story";
export { Backdrop } from "@/components/ui/backdrop";

export function Hero() {
  return <HeroStory copy={<HeroCopy />} visual={<HeroVisual />} />;
}

function HeroCopy() {
  return (
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
  );
}

function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-sm px-3 pb-6 pt-8 lg:max-w-none">
      <FloatingChip icon={<Check className="text-success-strong" aria-hidden="true" />} className="-top-1 left-0">
        Voto contado
      </FloatingChip>
      <ResultsPreview />
      <FloatingChip icon={<Lock className="text-primary-ink" aria-hidden="true" />} className="-bottom-1 right-0">
        Opción privada
      </FloatingChip>
    </div>
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
