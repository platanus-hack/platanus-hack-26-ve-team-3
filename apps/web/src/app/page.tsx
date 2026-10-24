import { Backdrop, FinalCta, Hero, HowItWorks, Promise } from "@/components/landing/organisms";

export default function Home() {
  return (
    <div className="relative isolate overflow-x-clip">
      <Backdrop />
      <div className="q-container flex flex-col gap-16 py-8 md:gap-24 md:py-14">
        <Hero />
        <HowItWorks />
        <Promise />
        <FinalCta />
      </div>
    </div>
  );
}
