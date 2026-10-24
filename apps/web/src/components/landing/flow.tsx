"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Blocks, Check, Fingerprint, ListChecks, ScanFace, ShieldCheck, Wallet, X } from "lucide-react";
import { Glass } from "@/components/ui/glass";
import { cn } from "@/lib/client/cn";

const STEP_MS = 3600;
const REDUCED = "(prefers-reduced-motion: reduce)";

const STEPS = [
  {
    id: "rostro",
    icon: ScanFace,
    title: "Rostro",
    body: "Tu cara se vuelve 256 números. La foto no sale del teléfono.",
    how: ["Prueba de vida: giras la cabeza.", "Se compara con los ya inscritos: si se parece a uno, se rechaza.", "Se guarda cifrado (AES-256-GCM) y se borra al abrir la votación."],
  },
  {
    id: "cuenta",
    icon: Wallet,
    title: "Cuenta",
    body: "Tu teléfono crea tu cuenta y firma: este rostro, esta cuenta.",
    how: ["Firma EIP-712 del vínculo rostro ↔ cuenta.", "El servidor comprueba la firma antes de inscribirte."],
  },
  {
    id: "padron",
    icon: ListChecks,
    title: "Padrón",
    body: "Tu credencial queda en tu teléfono. Al abrir, el padrón se sella.",
    how: ["Credencial Semaphore cifrada con una llave que no sale del teléfono.", "Al padrón solo va su compromiso público.", "Al abrir: árbol Merkle sellado y rostros borrados."],
  },
  {
    id: "voto",
    icon: Fingerprint,
    title: "Voto",
    body: "Tu teléfono prueba que estás en el padrón y que votas una vez, sin revelar quién eres.",
    how: ["Prueba de conocimiento cero (Groth16).", "Nullifier único por persona y votación: un segundo voto se rechaza.", "La opción no va cifrada: se ve qué se votó, no quién."],
  },
  {
    id: "cadena",
    icon: Blocks,
    title: "Cadena",
    body: "Cada voto se encadena al anterior. Al cerrar, la huella final se ancla en blockchain.",
    how: ["Cada entrada lleva el sha256 de la anterior.", "Borrar o mover un voto rompe la cadena.", "Ancla: la huella final queda en Base."],
  },
  {
    id: "verifica",
    icon: ShieldCheck,
    title: "Verifica",
    body: "Cualquier teléfono recalcula todo. Si algo cambió, falla y dice dónde.",
    how: ["Revisa pruebas, nullifiers, cadena, padrón, recuento y ancla.", "El veredicto sale del verificador, no de nuestro servidor."],
  },
] as const;

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

export function TrustFlow() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const playing = !reduced && !paused && inView;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), STEP_MS);
    return () => clearTimeout(t);
  }, [active, playing]);

  const pick = (i: number) => {
    setActive(i);
    setPaused(true);
  };

  return (
    <section ref={ref} aria-labelledby="como-funciona" className="q-reveal flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="q-eyebrow">Cómo funciona</p>
        <h2 id="como-funciona" className="font-display text-title font-bold tracking-tight md:text-[2.25rem]">
          Del rostro a la prueba.
        </h2>
      </div>

      <div className="flex flex-col gap-4 lg:hidden">
        <StepRail active={active} onPick={pick} />
        <Stage step={active} header playing={playing} />
      </div>

      <div className="hidden gap-10 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <ol className="relative flex flex-col self-start">
          <span aria-hidden="true" className="absolute bottom-6 left-[1.4375rem] top-6 w-0.5 rounded-full bg-border" />
          <span
            aria-hidden="true"
            className="absolute left-[1.4375rem] top-6 w-0.5 rounded-full bg-primary transition-[height] duration-700 ease-out"
            style={{ height: `calc((100% - 3rem) * ${active / (STEPS.length - 1)})` }}
          />
          {STEPS.map((s, i) => {
            const on = i === active;
            return (
              <li key={s.id} className="relative">
                <button
                  type="button"
                  aria-current={on ? "step" : undefined}
                  onClick={() => pick(i)}
                  className={cn("flex w-full items-start gap-4 rounded-lg p-1.5 pr-3 text-left transition-colors duration-300", on ? "bg-card shadow-card" : "hover:bg-card/60")}
                >
                  <StepIcon step={i} active={active} />
                  <span className="flex min-w-0 flex-1 flex-col py-2">
                    <span className={cn("font-semibold", on ? "text-foreground" : "text-muted-foreground")}>{s.title}</span>
                    <span className={cn("grid transition-[grid-template-rows,opacity] duration-500", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                      <span className="overflow-hidden text-small text-muted-foreground">{s.body}</span>
                    </span>
                    {on && playing ? <Timer key={active} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="sticky top-24 self-start">
          <Stage step={active} />
        </div>
      </div>
    </section>
  );
}

function StepIcon({ step, active }: { step: number; active: number }) {
  const Icon = STEPS[step].icon;
  const on = step === active;
  return (
    <span
      className={cn(
        "relative z-10 grid size-11 shrink-0 place-items-center rounded-full border-2 transition-colors duration-300 [&_svg]:size-5",
        on ? "border-primary bg-primary text-primary-foreground" : step < active ? "border-primary bg-card text-primary-ink" : "border-border bg-card text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" />
    </span>
  );
}

function StepRail({ active, onPick }: { active: number; onPick: (i: number) => void }) {
  return (
    <ol className="relative flex justify-between">
      <span aria-hidden="true" className="absolute left-5 right-5 top-[1.375rem] h-0.5 rounded-full bg-border" />
      <span
        aria-hidden="true"
        className="absolute left-5 top-[1.375rem] h-0.5 rounded-full bg-primary transition-[width] duration-700 ease-out"
        style={{ width: `calc((100% - 2.5rem) * ${active / (STEPS.length - 1)})` }}
      />
      {STEPS.map((s, i) => (
        <li key={s.id}>
          <button type="button" aria-label={s.title} aria-current={i === active ? "step" : undefined} onClick={() => onPick(i)} className="rounded-full">
            <StepIcon step={i} active={active} />
          </button>
        </li>
      ))}
    </ol>
  );
}

function Timer() {
  return (
    <span aria-hidden="true" className="mt-2 block h-0.5 overflow-hidden rounded-full bg-muted">
      <span className="q-flow-timer block h-full bg-primary" style={{ animationDuration: `${STEP_MS}ms` }} />
    </span>
  );
}

function Stage({ step, header = false, playing = false }: { step: number; header?: boolean; playing?: boolean }) {
  const s = STEPS[step];
  return (
    <Glass strong className="relative overflow-hidden rounded-xl shadow-elevated">
      <div key={step} className="flex flex-col">
        {header ? (
          <div className="px-5 pt-5" aria-live="polite">
            <p className="q-eyebrow">
              Paso {step + 1} de {STEPS.length}
            </p>
            <h3 className="mt-1 text-heading font-semibold">{s.title}</h3>
            <p className="mt-1 text-small text-muted-foreground">{s.body}</p>
            {playing ? <Timer key={step} /> : null}
          </div>
        ) : null}
        <div className="flex min-h-[14rem] flex-col gap-4 p-5 md:p-7 lg:min-h-[19rem]" aria-hidden="true">
          {step === 0 ? <FaceStage /> : step === 1 ? <AccountStage /> : step === 2 ? <RollStage /> : step === 3 ? <VoteStage /> : step === 4 ? <ChainStage /> : <VerifyStage />}
        </div>
        <div className="border-t border-border bg-card/70 p-5 md:px-7">
          <p className="q-eyebrow">Por dentro</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {s.how.map((h, i) => (
              <li key={h} className="q-flow-in flex gap-2 text-small text-foreground" style={{ animationDelay: `${600 + i * 180}ms` }}>
                <span aria-hidden="true" className="mt-[0.4rem] size-1.5 shrink-0 rounded-full bg-primary" />
                {h}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Glass>
  );
}

function In({ i = 0, className, children }: { i?: number; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("q-flow-in", className)} style={{ animationDelay: `${i * 220}ms` }}>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="q-eyebrow">{children}</p>;
}

const DESCRIPTOR = ["0.128", "-0.482", "0.331", "0.047", "-0.215", "0.692", "-0.103", "0.274", "-0.388", "0.156", "0.019", "-0.547"];

function FaceStage() {
  return (
    <>
      <In>
        <Label>En tu teléfono</Label>
      </In>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <In i={1} className="relative grid size-28 shrink-0 place-items-center">
          <span className="q-flow-ring absolute inset-0 rounded-full border-[3px] border-primary" />
          <span className="absolute inset-2 rounded-full border border-dashed border-input" />
          <ScanFace className="size-12 text-primary-ink" strokeWidth={1.5} />
        </In>
        <div className="grid w-full grid-cols-4 gap-1.5">
          {DESCRIPTOR.map((n, i) => (
            <In key={n} i={2 + i * 0.35} className="q-num rounded bg-muted px-1.5 py-1 text-center text-[0.75rem] text-foreground">
              {n}
            </In>
          ))}
        </div>
      </div>
      <In i={7} className="mt-auto flex flex-wrap gap-2">
        <Chip tone="ok">256 números</Chip>
        <Chip>Sin foto</Chip>
        <Chip>1 rostro = 1 inscripción</Chip>
      </In>
    </>
  );
}

function AccountStage() {
  return (
    <>
      <In>
        <Label>Vínculo firmado</Label>
      </In>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <In i={1} className="flex flex-1 items-center gap-3 rounded-lg border border-border bg-card p-3">
          <ScanFace className="size-6 shrink-0 text-primary-ink" />
          <span className="min-w-0">
            <span className="block text-small text-muted-foreground">Rostro</span>
            <span className="q-mono block truncate text-small font-semibold">0x41bd…07a9</span>
          </span>
        </In>
        <In i={2} className="flex justify-center">
          <span className="q-flow-link h-6 w-0.5 rounded-full bg-primary sm:h-0.5 sm:w-10" />
        </In>
        <In i={3} className="flex flex-1 items-center gap-3 rounded-lg border border-border bg-card p-3">
          <Wallet className="size-6 shrink-0 text-primary-ink" />
          <span className="min-w-0">
            <span className="block text-small text-muted-foreground">Cuenta</span>
            <span className="q-mono block truncate text-small font-semibold">0x7a08…d4c6</span>
          </span>
        </In>
      </div>
      <In i={5} className="mt-auto">
        <Chip tone="ok">
          <Check className="size-3.5" strokeWidth={3} /> Firma válida
        </Chip>
      </In>
    </>
  );
}

const LEAVES = [20, 60, 100, 140, 180, 220, 260, 300];
const MIDS = [40, 120, 200, 280];
const PAIRS = [80, 240];

function RollStage() {
  return (
    <>
      <In>
        <Label>Padrón sellado</Label>
      </In>
      <In i={6} className="flex justify-center">
        <span className="q-mono rounded-full bg-primary px-3 py-1 text-small font-semibold text-primary-foreground">raíz 0xe27c…5b13</span>
      </In>
      <In i={1} className="-mt-4 flex justify-center">
        <svg viewBox="0 0 320 136" className="w-full max-w-md" role="presentation">
          <g className="stroke-border" strokeWidth="1.5" fill="none">
            {LEAVES.map((x, k) => (
              <line key={`l${x}`} x1={x} y1={108} x2={MIDS[k >> 1]} y2={70} />
            ))}
            {MIDS.map((x, k) => (
              <line key={`m${x}`} x1={x} y1={70} x2={PAIRS[k >> 1]} y2={36} />
            ))}
            {PAIRS.map((x) => (
              <line key={`p${x}`} x1={x} y1={36} x2={160} y2={0} />
            ))}
          </g>
          {LEAVES.map((x, k) => (
            <rect key={x} x={x - 11} y={98} width={22} height={22} rx={6} className="q-flow-in fill-card stroke-input" strokeWidth="1.5" style={{ animationDelay: `${300 + k * 60}ms` }} />
          ))}
          {MIDS.map((x) => (
            <circle key={x} cx={x} cy={70} r={5} className="q-flow-in fill-primary-ink/70" style={{ animationDelay: "900ms" }} />
          ))}
          {PAIRS.map((x) => (
            <circle key={x} cx={x} cy={36} r={6} className="q-flow-in fill-primary-ink" style={{ animationDelay: "1100ms" }} />
          ))}
        </svg>
      </In>
      <In i={7} className="mt-auto flex flex-wrap gap-2">
        <Chip tone="ok">Padrón cerrado</Chip>
        <Chip tone="danger">Rostros borrados</Chip>
      </In>
    </>
  );
}

function VoteStage() {
  return (
    <>
      <In>
        <Label>Prueba generada en tu teléfono</Label>
      </In>
      <div className="flex flex-col gap-2">
        {["Está en el padrón", "Vota una sola vez", "Sin revelar quién es"].map((t, i) => (
          <In key={t} i={1 + i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-success-soft text-success-strong">
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <span className="text-body font-medium">{t}</span>
          </In>
        ))}
      </div>
      <In i={4} className="flex items-center gap-3 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2.5">
        <X className="size-4 shrink-0 text-danger-strong" strokeWidth={3} />
        <span className="min-w-0 text-small text-danger-strong">
          Mismo nullifier <span className="q-mono font-semibold">0x2f9c…</span>: segundo voto rechazado
        </span>
      </In>
    </>
  );
}

const BLOCKS = ["#1287", "#1288", "#1289", "#1290"];

function ChainStage() {
  return (
    <>
      <In>
        <Label>Registro encadenado</Label>
      </In>
      <div className="flex flex-wrap items-center gap-1.5">
        {BLOCKS.map((b, i) => (
          <In key={b} i={1 + i * 0.6} className="flex items-center gap-1.5">
            <span className="q-num rounded-md border border-border bg-card px-2.5 py-2 text-small font-semibold">{b}</span>
            {i < BLOCKS.length - 1 ? <span className="h-0.5 w-3 rounded-full bg-primary" /> : null}
          </In>
        ))}
      </div>
      <In i={4} className="flex items-center gap-3 rounded-lg bg-navy p-4 text-[#f0eeee] dark:bg-background">
        <Blocks className="size-6 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="block text-small text-[#f0eeee]/80">Al cerrar · huella final en blockchain</span>
          <span className="q-mono block truncate text-small font-semibold">0x9f3a…c21e</span>
        </span>
      </In>
      <In i={5} className="mt-auto">
        <Chip>Si alguien borra un voto, la huella no coincide</Chip>
      </In>
    </>
  );
}

const CHECKS = ["Padrón", "Cadena", "Pruebas", "Un voto por persona", "Recuento", "Ancla"];

function VerifyStage() {
  return (
    <>
      <In>
        <Label>Recalculado en cualquier teléfono</Label>
      </In>
      <div className="grid grid-cols-2 gap-2">
        {CHECKS.map((c, i) => (
          <In key={c} i={1 + i * 0.5} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-success text-white">
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span className="text-small font-medium">{c}</span>
          </In>
        ))}
      </div>
      <In i={5} className="mt-auto flex flex-wrap items-center gap-2">
        <Chip tone="ok">
          <ShieldCheck className="size-3.5" /> Coincide
        </Chip>
        <Chip tone="danger">
          <X className="size-3.5" strokeWidth={3} /> Si no: falla y dice dónde
        </Chip>
      </In>
    </>
  );
}

function Chip({ tone = "neutral", children }: { tone?: "neutral" | "ok" | "danger"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-small font-semibold",
        tone === "ok" ? "border-success/40 bg-success-soft text-success-strong" : tone === "danger" ? "border-danger/40 bg-danger-soft text-danger-strong" : "border-border bg-card text-foreground",
      )}
    >
      {children}
    </span>
  );
}
