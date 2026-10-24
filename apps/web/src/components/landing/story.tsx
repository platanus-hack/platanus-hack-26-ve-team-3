"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/client/cn";
import { Stage, StepIcon, STEPS } from "./flow";

const DESKTOP = "(min-width: 1024px)";
const SCREENS = STEPS.length + 1;

export function HeroStory({ copy, visual }: { copy: React.ReactNode; visual: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = outer.current;
      if (!el || !window.matchMedia(DESKTOP).matches) return setActive(-1);
      const rect = el.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const progress = span > 0 ? Math.min(Math.max(-rect.top / span, 0), 0.999) : 0;
      setActive(Math.floor(progress * SCREENS) - 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  const goTo = (i: number) => {
    const el = outer.current;
    if (!el) return;
    const span = el.offsetHeight - window.innerHeight;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + span * ((i + 1.5) / SCREENS), behavior: "smooth" });
  };

  return (
    <div ref={outer} className="relative lg:h-[700vh]">
      <section className="q-page-in grid grid-cols-1 items-center gap-12 pt-4 lg:sticky lg:top-16 lg:h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-14 lg:pt-0">
        <div>
          {copy}
          <ol className="mt-10 hidden gap-2 lg:flex" aria-label="Cómo funciona">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => goTo(i)} aria-label={s.title} aria-current={i === active ? "step" : undefined} className="rounded-full">
                  <StepIcon step={i} active={active} />
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid">
          <Layer on={active < 0}>{visual}</Layer>
          <Layer on={active >= 0} hidden>
            {active >= 0 ? <Stage step={active} header /> : null}
          </Layer>
        </div>
      </section>

      <ol className="sr-only hidden lg:block">
        {STEPS.map((s) => (
          <li key={s.id}>
            {s.title}: {s.body} {s.how.join(" ")}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Layer({ on, hidden = false, children }: { on: boolean; hidden?: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={hidden || undefined}
      className={cn(
        "col-start-1 row-start-1 transition-[opacity,transform,visibility] duration-500 ease-out",
        on ? "visible translate-y-0 opacity-100" : "invisible pointer-events-none -translate-y-3 opacity-0",
        hidden && "hidden lg:block",
      )}
    >
      {children}
    </div>
  );
}
