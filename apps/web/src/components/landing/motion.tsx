"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";

const REDUCED = "(prefers-reduced-motion: reduce)";

function useReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

function useLoop(steps: number, ms: number, reduced: boolean, finalStep: number) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setStep((s) => (s + 1) % steps), ms);
    return () => clearInterval(t);
  }, [steps, ms, reduced]);
  return reduced ? finalStep : step;
}

const ROWS = [
  { n: 1287, hash: "0x9f3a…c21e", forged: "0x9f3a…c21e" },
  { n: 1288, hash: "0x41bd…07a9", forged: "0x41bd…07a9" },
  { n: 1289, hash: "0xe27c…5b13", forged: "0x0000…ffff" },
  { n: 1290, hash: "0x7a08…d4c6", forged: "0x7a08…d4c6" },
];
const TAMPERED = 2;

export function ProofChain({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const step = useLoop(12, 750, reduced, 5);
  const shown = Math.min(step, ROWS.length);
  const tamper = step >= 6 && step <= 9;

  return (
    <Glass strong className={cn("w-full overflow-hidden rounded-xl p-5 shadow-elevated md:p-6", className)} aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-small font-semibold text-primary-ink">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          Registro público
        </span>
        <span className="q-num text-small text-muted-foreground">{ROWS.length} votos</span>
      </div>

      <ol className="relative mt-4 flex flex-col gap-2">
        <span className="absolute bottom-3 left-[1.375rem] top-3 w-px bg-border" />
        {ROWS.map((r, i) => {
          const visible = i < shown;
          const bad = tamper && i === TAMPERED;
          return (
            <li
              key={r.n}
              className={cn(
                "relative flex items-center gap-3 rounded-md border bg-card px-3 py-2.5 transition-all duration-500",
                visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                bad ? "q-shake border-danger bg-danger-soft" : "border-border",
              )}
            >
              <span className={cn("relative z-10 grid size-5 shrink-0 place-items-center rounded-full", bad ? "bg-danger text-white" : "bg-success-soft text-success-strong")}>
                {bad ? <X className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
              </span>
              <span className="q-num text-small font-semibold">#{r.n}</span>
              <span className={cn("text-small", bad ? "font-semibold text-danger-strong" : "text-muted-foreground")}>{bad ? "alterado" : "voto + prueba"}</span>
              <span className={cn("q-mono ml-auto text-[0.6875rem]", bad ? "text-danger-strong line-through" : "text-subtle")}>{bad ? r.forged : r.hash}</span>
            </li>
          );
        })}
      </ol>

      <div
        className={cn(
          "mt-4 flex items-center gap-2 rounded-md px-3 py-2.5 text-small font-semibold transition-colors duration-300",
          tamper ? "bg-danger text-white" : shown === ROWS.length ? "bg-success-soft text-success-strong" : "bg-muted text-muted-foreground",
        )}
      >
        {tamper ? <ShieldAlert className="size-4 shrink-0" /> : <Check className="size-4 shrink-0" strokeWidth={3} />}
        {tamper ? "Fallo detectado: alguien alteró el voto #1289" : shown === ROWS.length ? "Recalculado en tu teléfono: coincide" : "Recibiendo votos…"}
      </div>
    </Glass>
  );
}

const CHECKS = ["Formato del paquete", "Padrón publicado", "Pruebas de cada voto", "Un voto por persona", "Recuento"];

export function PhoneVerify({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const step = useLoop(CHECKS.length + 4, 650, reduced, CHECKS.length + 1);
  const done = Math.min(step, CHECKS.length);
  const finished = step > CHECKS.length;

  return (
    <div className={cn("mx-auto w-full max-w-[17rem] rounded-[2.5rem] border-[10px] border-[#111122] bg-card p-4 shadow-elevated dark:border-[#2e2e44]", className)} aria-hidden="true">
      <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-muted" />
      <p className="q-eyebrow">Verificador</p>
      <p className="mt-1 text-heading font-semibold">Comprobando…</p>
      <ul className="mt-4 flex flex-col gap-2.5">
        {CHECKS.map((c, i) => (
          <li key={c} className="flex items-center gap-2 text-small">
            <span className={cn("grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300", i < done ? "bg-success text-white" : "bg-muted")}>
              {i < done ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <span className={i < done ? "text-foreground" : "text-subtle"}>{c}</span>
          </li>
        ))}
      </ul>
      <div className={cn("mt-5 rounded-md p-3 text-center transition-all duration-500", finished ? "scale-100 bg-success-soft opacity-100" : "scale-95 bg-muted opacity-60")}>
        <p className="q-num text-title font-semibold text-success-strong">{finished ? "Coincide" : "…"}</p>
        <p className="text-small text-muted-foreground">con el resultado publicado</p>
      </div>
    </div>
  );
}

export function Marquee({ items, className }: { items: string[]; className?: string }) {
  const row = [...items, ...items];
  return (
    <div className={cn("relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_10%,#000_90%,transparent)]", className)}>
      <p className="sr-only">{items.join(", ")}</p>
      <div className="q-marquee flex w-max gap-3" aria-hidden="true">
        {row.map((it, i) => (
          <span key={i} className="whitespace-nowrap rounded-full border border-border bg-card px-4 py-2 text-body font-medium">
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GlitchText({ children }: { children: string }) {
  return (
    <span className="q-glitch" data-text={children}>
      {children}
    </span>
  );
}
