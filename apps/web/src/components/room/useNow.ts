"use client";

import { useEffect, useState } from "react";

/** Reloj para cuentas regresivas. `null` hasta montar (evita desajustes de hidratación). */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [intervalMs]);
  return now;
}

/** "4:07" / "1 h 05 min" hasta `iso`; "0:00" si ya pasó. */
export function remaining(iso: string | null | undefined, now: number | null): string | null {
  if (!iso || now === null) return null;
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms)) return null;
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m}:${String(sec).padStart(2, "0")}`;
}
