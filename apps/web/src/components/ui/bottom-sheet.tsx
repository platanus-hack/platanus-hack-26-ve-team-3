"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/client/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Acción fija abajo (por defecto, «Listo», que cierra la hoja). */
  footer?: React.ReactNode;
  doneLabel?: string;
  testId?: string;
  className?: string;
};

/**
 * Hoja inferior sobre `<dialog>` modal: asa, título centrado y ✕; cierra con «Listo», con Esc o tocando el fondo.
 * El foco va al cuerpo de la hoja (no al ✕) para no pintar un anillo al abrir; Tab entra a los controles.
 */
export function BottomSheet({ open, onClose, title, children, footer, doneLabel = "Listo", testId, className }: Props) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      bodyRef.current?.focus({ preventScroll: true });
    } else if (!open && d.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cn("q-sheet", className)}
      aria-labelledby={titleId}
      data-testid={testId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div aria-hidden="true" className="mx-auto mt-2 h-[0.3rem] w-9 shrink-0 rounded-full bg-input" />
      <div className="grid shrink-0 grid-cols-[3rem_1fr_3rem] items-center px-2 pb-2 pt-1">
        <span />
        <h2 id={titleId} className="text-center text-[1.0625rem] font-bold tracking-[-0.01em]">
          {title}
        </h2>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="grid size-tap place-items-center rounded-full text-foreground hover:bg-muted">
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div ref={bodyRef} tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4 pt-2 outline-none">
        {children}
      </div>
      <div className="shrink-0 border-t border-foreground/5 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {footer ?? (
          <button type="button" onClick={onClose} className="flex min-h-14 w-full items-center justify-center rounded-full bg-primary text-[1.0625rem] font-bold text-primary-foreground shadow-primary hover:bg-primary-hover">
            {doneLabel}
          </button>
        )}
      </div>
    </dialog>
  );
}

/** Título de grupo dentro de una hoja (mayúsculas pequeñas). */
export function SheetGroupTitle({ children, id, as: Tag = "h3" }: { children: React.ReactNode; id?: string; as?: "h3" | "p" | "legend" }) {
  return (
    <Tag id={id} className="px-1 pb-2 text-[0.75rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </Tag>
  );
}

/** Grupo blanco redondeado (estilo ajustes de iOS/Android). */
export function SheetGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[1rem] bg-card shadow-[0_0_0_1px_rgb(17_17_34/0.05)] [&>*+*]:border-t [&>*+*]:border-border", className)}>{children}</div>;
}

export function SheetNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("px-1 pt-2 text-small leading-[1.45] text-muted-foreground", className)}>{children}</p>;
}

/** Control segmentado (radios) de 44 px o más. */
export function Segmented<T extends string>({
  name,
  value,
  onChange,
  choices,
  label,
  labelledBy,
  big,
  columns,
  testId,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  choices: { value: T; label: React.ReactNode }[];
  label?: string;
  labelledBy?: string;
  big?: boolean;
  columns?: number;
  testId?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      data-testid={testId}
      className="grid gap-1 rounded-[0.875rem] bg-foreground/[0.06] p-1"
      style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : { gridAutoFlow: "column", gridAutoColumns: "minmax(0, 1fr)" }}
    >
      {choices.map((c) => (
        <label key={c.value} className="relative">
          <input type="radio" name={name} value={c.value} checked={value === c.value} onChange={() => onChange(c.value)} className="peer absolute size-px opacity-0" />
          <span
            className={cn(
              "grid cursor-pointer place-items-center rounded-[0.65rem] px-1.5 text-center font-semibold leading-tight text-muted-foreground transition-[background-color,color,box-shadow] duration-150 peer-checked:bg-card peer-checked:text-foreground peer-checked:shadow-[0_1px_2px_rgb(17_17_34/0.08),0_4px_10px_-4px_rgb(17_17_34/0.2)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-ring",
              big ? "min-h-14 text-body" : "min-h-tap text-small",
            )}
          >
            {c.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Interruptor accesible (`role="switch"`). */
export function Switch({ id, checked, onChange, label }: { id: string; checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <span className="relative h-[1.9rem] w-[3.1rem] shrink-0">
      <input id={id} type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0" />
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-input transition-colors duration-150 after:absolute after:left-[0.15rem] after:top-[0.15rem] after:size-[1.6rem] after:rounded-full after:bg-white after:shadow-[0_2px_4px_rgb(17_17_34/0.2)] after:transition-transform after:duration-150 peer-checked:bg-success peer-checked:after:translate-x-[1.2rem] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
      />
    </span>
  );
}
