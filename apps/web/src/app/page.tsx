import { Backdrop, TrustFlow } from "@/components/landing/organisms";
import { HeroMotion } from "@/components/landing/HeroMotion";

export default function Home() {
  return (
    <div className="relative isolate overflow-x-clip">
      <Backdrop />
      <div className="q-container flex flex-col gap-16 py-8 md:gap-24 md:py-14 lg:pt-0">
        <HeroMotion />
        <TrustFlow />
      </div>
    </div>
  );
}
