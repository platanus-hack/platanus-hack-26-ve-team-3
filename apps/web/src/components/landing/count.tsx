"use client";

import { useEffect, useRef } from "react";

export function CountTo({ from, to, ms = 1400, delay = 300 }: { from: number; to: number; ms?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let start = 0;
    el.textContent = String(from);
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(Math.max((t - start - delay) / ms, 0), 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = String(to);
    };
  }, [from, to, ms, delay]);

  return (
    <>
      <span ref={ref} aria-hidden="true">
        {to}
      </span>
      <span className="sr-only">{to}</span>
    </>
  );
}
