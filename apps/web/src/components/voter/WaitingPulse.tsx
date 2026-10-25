import { Users, Vote } from "lucide-react";
import { cn } from "@/lib/client/cn";
import { formatStartTime } from "@/lib/client/clock";

/** Título de la espera (exportado para los tests y los E2E). */
export const WAITING_TITLE = "En espera para iniciar la votación";

/** Modo continuo (D-22): cuántas personas faltan para K, con el "ahora X de K" a la vista. */
export function waitingContinuousText(k: number, size: number): string {
  const missing = Math.max(0, k - size);
  return `${missing === 1 ? "Falta 1 persona" : `Faltan ${missing} personas`} para habilitar el voto (ahora ${size} de ${k})`;
}

/** Modo con fases: hora programada o la abre el organizador. */
export function waitingPhasedText(startsAt: string | null | undefined): string {
  return startsAt ? `Empieza a las ${formatStartTime(startsAt)}` : "El organizador la abrirá";
}

type Props = {
  className?: string;
  /** Debajo del dato: cuenta regresiva, aviso de K, "Deja esta página abierta…". */
  children?: React.ReactNode;
} & ({ mode: "continuous"; k: number; size: number | null } | { mode: "phased"; startsAt: string | null | undefined });

/**
 * Espera animada: ondas concéntricas naranjas que pulsan desde un icono central (solo CSS, `q-pulse` en globals.css;
 * apagadas con `prefers-reduced-motion`), el título "En espera para iniciar la votación" y el dato honesto de qué se
 * espera. Nada aquí afirma anonimato ni identidad verificada: solo cuántas personas faltan o a qué hora empieza.
 */
export function WaitingPulse(props: Props) {
  const Icon = props.mode === "continuous" ? Users : Vote;
  const loading = props.mode === "continuous" && props.size === null;
  const detail = props.mode === "continuous" ? (props.size === null ? "Comprobando cuántas personas hay inscritas…" : waitingContinuousText(props.k, props.size)) : waitingPhasedText(props.startsAt);
  return (
    <section className={cn("flex w-full flex-col items-center gap-4 text-center", props.className)} data-testid="waiting-pulse" data-mode={props.mode}>
      <div className="q-pulse relative grid size-40 place-items-center" aria-hidden="true">
        <span className="q-wave" />
        <span className="q-wave" />
        <span className="q-wave" />
        <span className="relative z-10 grid size-20 place-items-center rounded-full bg-primary text-primary-foreground shadow-primary">
          <Icon className="size-10" strokeWidth={1.75} />
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-title font-bold leading-tight tracking-tight">{WAITING_TITLE}</h1>
        <p role="status" aria-live="polite" className={cn("text-heading", loading ? "inline-flex items-center justify-center gap-2 text-muted-foreground" : "font-semibold")} data-testid="waiting-pulse-detail">
          {loading ? <span className="q-spinner" aria-hidden="true" /> : null}
          {detail}
        </p>
      </div>
      {props.children}
    </section>
  );
}
