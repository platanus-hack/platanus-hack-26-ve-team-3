import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
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
        Vota en segundos.
        <br />
        <span className="text-primary-ink">Verifica siempre.</span>
      </h1>
      <p className="max-w-[38ch] text-heading text-muted-foreground">Cada voto trae una prueba matemática. Cada resultado se recalcula desde cualquier teléfono.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/votaciones" className={cn(buttonVariants({ size: "lg" }))}>
          Mis votaciones <ArrowRight aria-hidden="true" />
        </Link>
      </div>
      <Glass className="max-w-lg px-5 py-4">
        <dl className="grid grid-cols-3 gap-2">
          <StatItem from={0} value={2} label="toques para votar" delay={300} />
          <StatItem from={256} value={0} label="datos biométricos al cerrar" delay={500} />
          <StatItem from={0} value={1} label="voto por persona" delay={700} />
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
