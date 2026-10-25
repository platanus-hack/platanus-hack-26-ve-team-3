"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, CalendarClock, Check, ChevronRight, Clock, Gift, GripVertical, IdCard, Link2, List, ListOrdered, Plus, ScanFace, Send, ShieldCheck, SlidersHorizontal, ThumbsUp, UserRound, X } from "lucide-react";
import type { Candidate, VotingMode } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BottomSheet, Segmented, SheetGroup, SheetGroupTitle, SheetNote, Switch } from "@/components/ui/bottom-sheet";
import { Field, Input, Textarea } from "@/components/ui/input";
import { LogoMark } from "@/components/ui/logo";
import { orgMessage } from "@/lib/client/api";
import { apiV1, type CreateElectionV1 } from "@/lib/client/apiV1";
import { cn } from "@/lib/client/cn";
import { appendVoters, rememberElection, saveOrgToken } from "@/lib/client/orgStore";
import { roomApi } from "@/lib/client/room";
import { CandidatesEditor } from "./CandidatesEditor";
import { CONTINUOUS_ROOM } from "./ContinuousCard";
import { checkLabel, DEFAULT_ELIGIBILITY, eligibilityInputOf, methodLabel, parseAllowlist, type EligibilityDraft } from "./EligibilityPicker";

/* ---------- Modelo ---------- */

type Template = "yes-no" | "count" | "options";
const TEMPLATES: { value: Template; label: string; icon: typeof ThumbsUp; options: string[] }[] = [
  { value: "yes-no", label: "Sí / No", icon: ThumbsUp, options: ["Sí", "No"] },
  { value: "count", label: "1 a 5", icon: ListOrdered, options: ["1", "2", "3", "4", "5"] },
  { value: "options", label: "Varias opciones", icon: List, options: ["", ""] },
];

type Duration = "15m" | "30m" | "2h" | "1d" | "custom";
const DURATIONS: { value: Duration; label: string; ms: number }[] = [
  { value: "15m", label: "15 min", ms: 15 * 60_000 },
  { value: "30m", label: "30 min", ms: 30 * 60_000 },
  { value: "2h", label: "2 horas", ms: 2 * 3_600_000 },
  { value: "1d", label: "1 día", ms: 24 * 3_600_000 },
  { value: "custom", label: "Personalizado", ms: 0 },
];

/** Sala que se abre al publicar (con fases): tope y minutos de inscripción. El inicio queda al cierre de la sala. */
export const PUBLISH_ROOM = { maxSeats: 60, expiresInMin: 15 } as const;
const MAX_OPTIONS = 10;
const TITLE_MAX = 160;
const LETTERS = "ABCDEFGHIJ";

type Opt = { key: number; label: string };
type Participant = { displayName: string; phoneE164: string };

const slug = (s: string, i: number) =>
  `opt-${i + 1}-${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24)}`;

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseParticipants(text: string): Participant[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, phone] = l.split(/[,;\t]/).map((x) => x?.trim() ?? "");
      return { displayName: name, phoneE164: phone ?? "" };
    })
    .filter((p) => p.displayName);
}

/** Texto completo de «Quién vota» (lo leen los lectores de pantalla y los tests: `review-eligibility`). */
export function eligibilitySummary(d: EligibilityDraft): string {
  return `${methodLabel[d.method]}${d.method === "event-badge" ? ` (comprobación ${checkLabel[d.badgeCheck]})` : ""} + rostro`;
}

/* ---------- Pantalla ---------- */

/**
 * «Nueva votación» en una sola pantalla: la pantalla ES la boleta que verán los votantes (WYSIWYG). Plantillas de un
 * toque, pregunta como titular editable, opciones como filas de boleta, ajustes en una barra de propiedades que abre
 * hojas inferiores y «Publicar y compartir» fijo abajo.
 * Publicar = crear + invitados (si hay) + publicar + abrir la sala (60 lugares, 15 min; el inicio queda al cierre de la
 * sala) y llevar a `/org/<id>/listo`. Si un paso falla, reintentar retoma desde ese paso (no crea otra votación).
 */
export function ElectionComposer() {
  const router = useRouter();
  const uid = useId();
  const nextKey = useRef(3);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [template, setTemplate] = useState<Template>("options");
  const [options, setOptions] = useState<Opt[]>([
    { key: 1, label: "" },
    { key: 2, label: "" },
  ]);
  const [duration, setDuration] = useState<Duration>("2h");
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(new Date(Date.now() + 2 * 3_600_000)));
  const [eligibility, setEligibility] = useState<EligibilityDraft>(DEFAULT_ELIGIBILITY);
  const [votingMode, setVotingMode] = useState<VotingMode>("phased");
  const [pasted, setPasted] = useState("");
  const [drawOn, setDrawOn] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [winnersRule, setWinnersRule] = useState<"fixed" | "fromResult">("fromResult");
  const [winnersCount, setWinnersCount] = useState("1");
  const [sheet, setSheet] = useState<null | "duration" | "who" | "advanced">(null);

  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);
  /** Pasos ya hechos (para reintentar sin duplicar la votación). */
  const done = useRef<{ id?: string; voters?: boolean; published?: boolean }>({});

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const dragKey = useRef<number | null>(null);

  const cleanOptions = useMemo(() => options.map((o) => o.label.trim()).filter(Boolean), [options]);
  const participants = useMemo(() => parseParticipants(pasted), [pasted]);
  const activeCandidates = drawOn ? candidates : [];
  const optionValues = useMemo(() => {
    const vals = cleanOptions.map((o) => (/^\d+$/.test(o) ? Number(o) : NaN));
    return vals.every((v) => Number.isInteger(v)) ? vals : null;
  }, [cleanOptions]);
  const allow = eligibility.method === "event-badge" && eligibility.badgeCheck === "list" ? parseAllowlist(eligibility.allowlist, eligibility.prefix || DEFAULT_ELIGIBILITY.prefix) : null;

  const titleOk = title.trim().length >= 3;
  const ready = titleOk && cleanOptions.length >= 2;
  const durationLabel = duration === "custom" ? `hasta ${new Date(customEnd).toLocaleString("es-VE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : DURATIONS.find((d) => d.value === duration)!.label;
  const whoShort = eligibility.method === "event-badge" ? "Credencial + rostro" : "Apodo + rostro";
  const missing = !titleOk ? "Escribe la pregunta para publicar" : cleanOptions.length < 2 ? "Agrega al menos 2 opciones" : null;

  // El titular crece con el texto (respaldo de `field-sizing: content` para Safari).
  useLayoutEffect(() => {
    const t = titleRef.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [title]);

  useEffect(() => {
    if (showDesc) descRef.current?.focus();
  }, [showDesc]);

  function applyTemplate(t: Template) {
    setTemplate(t);
    const base = TEMPLATES.find((x) => x.value === t)!.options;
    setOptions(base.map((label) => ({ key: nextKey.current++, label })));
  }

  function editOption(key: number, label: string) {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, label } : o)));
    setTemplate("options");
  }

  function addOption() {
    if (options.length >= MAX_OPTIONS) return;
    const key = nextKey.current++;
    setOptions((prev) => [...prev, { key, label: "" }]);
    setTemplate("options");
    window.setTimeout(() => document.getElementById(`${uid}-opt-${key}`)?.focus(), 0);
  }

  function removeOption(key: number) {
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((o) => o.key !== key)));
    setTemplate("options");
  }

  function move(key: number, to: number) {
    setOptions((prev) => {
      const from = prev.findIndex((o) => o.key === key);
      const target = Math.max(0, Math.min(prev.length - 1, to));
      if (from === -1 || from === target) return prev;
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(target, 0, it);
      return next;
    });
  }

  /* Arrastrar con el asa (ratón y dedo): la posición es cuántas filas (sin la arrastrada) quedan por encima del puntero. */
  function onGripDown(e: React.PointerEvent<HTMLButtonElement>, key: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragKey.current = key;
    setDragging(key);
  }
  function onGripMove(e: React.PointerEvent<HTMLButtonElement>) {
    const key = dragKey.current;
    if (key === null || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-opt-row]")).filter((r) => r.dataset.optRow !== String(key));
    const to = rows.filter((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2 < e.clientY;
    }).length;
    move(key, to);
  }
  function onGripUp() {
    dragKey.current = null;
    setDragging(null);
  }

  function validate(): string | null {
    if (!titleOk) return "La pregunta necesita al menos 3 caracteres.";
    if (cleanOptions.length < 2) return "Necesitas al menos 2 opciones.";
    if (cleanOptions.length > MAX_OPTIONS) return `Máximo ${MAX_OPTIONS} opciones.`;
    if (new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length) return "Hay opciones repetidas.";
    if (duration === "custom" && !(new Date(customEnd).getTime() > Date.now())) return "La hora de cierre debe ser en el futuro.";
    if (activeCandidates.length > 0 && winnersRule === "fromResult" && !optionValues) return "Para que la opción ganadora fije cuántos proyectos ganan, cada opción debe ser un número (p. ej. 1 a 5).";
    if (activeCandidates.length > 0 && winnersRule === "fixed") {
      const n = Number(winnersCount);
      if (!Number.isInteger(n) || n < 1 || n > activeCandidates.length) return `El número de ganadores debe estar entre 1 y ${activeCandidates.length}.`;
    }
    const el = eligibilityInputOf(eligibility);
    if (!el.ok) return el.error;
    if (participants.length > 500) return "Máximo 500 invitados por lote.";
    const bad = participants.find((p) => p.phoneE164 && !/^\+[1-9]\d{6,14}$/.test(p.phoneE164));
    if (bad) return `Teléfono inválido para «${bad.displayName}»: usa formato internacional, p. ej. +584121234567.`;
    return null;
  }

  async function publish() {
    if (publishing) return;
    if (!ready) {
      setNudge(missing);
      if (!titleOk) titleRef.current?.focus();
      else document.getElementById(`${uid}-opt-${options.find((o) => !o.label.trim())?.key ?? options[0].key}`)?.focus();
      return;
    }
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setNudge(null);
    setPublishing(true);
    try {
      let id = done.current.id;
      if (!id) {
        setProgress("Creando la votación…");
        const el = eligibilityInputOf(eligibility);
        if (!el.ok) throw new Error(el.error);
        const now = Date.now();
        const ends = duration === "custom" ? new Date(customEnd) : new Date(now + DURATIONS.find((d) => d.value === duration)!.ms);
        const input: CreateElectionV1 = {
          eligibility: el.value,
          title: title.trim(),
          description: description.trim(),
          kind: template === "yes-no" ? "yes-no" : "multiple",
          options: cleanOptions.map((label, i) => ({ id: slug(label, i), label })),
          startsAt: new Date(now).toISOString(),
          endsAt: ends.toISOString(),
          votingMode,
          ...(activeCandidates.length > 0
            ? winnersRule === "fromResult" && optionValues
              ? { candidates: activeCandidates, winnersCountFromResult: true, optionValues }
              : { candidates: activeCandidates, winnersCountFromResult: false, winnersCount: Number(winnersCount) }
            : {}),
        };
        const election = await apiV1.createElection(input);
        id = election.id;
        done.current.id = id;
        rememberElection(election.id, election.title);
        // Token del organizador (se devuelve una sola vez): sessionStorage; «Listo» lo muestra una vez con «guárdalo».
        if (election.organizerToken) saveOrgToken(election.id, election.organizerToken);
      }
      if (participants.length > 0 && !done.current.voters) {
        setProgress(`Registrando ${participants.length} invitados…`);
        const res = await apiV1.addVoters(
          id,
          participants.map((p) => (p.phoneE164 ? { displayName: p.displayName, phoneE164: p.phoneE164 } : { displayName: p.displayName })),
        );
        appendVoters(id, res.voters);
        done.current.voters = true;
      }
      if (!done.current.published) {
        setProgress(votingMode === "continuous" ? "Abriendo la votación…" : "Abriendo la inscripción…");
        await apiV1.publish(id);
        done.current.published = true;
      }
      setProgress("Abriendo la sala…");
      // Si la sala falla, la votación ya está publicada: «Listo» ofrece abrirla de nuevo.
      await roomApi.open(id, votingMode === "continuous" ? { ...CONTINUOUS_ROOM } : { ...PUBLISH_ROOM }).catch(() => undefined);
      router.push(`/org/${encodeURIComponent(id)}/listo`);
    } catch (e) {
      setError(orgMessage(e));
      setPublishing(false);
      setProgress(null);
    }
  }

  const summary = (
    <p className="flex flex-wrap items-center justify-center gap-x-2 text-small font-medium text-muted-foreground lg:justify-start" aria-live="polite" data-testid="publish-summary">
      {progress ? (
        <span role="status" className="inline-flex items-center gap-2">
          <span className="q-spinner" aria-hidden="true" /> {progress}
        </span>
      ) : ready ? (
        <>
          <b className="font-semibold text-foreground">{cleanOptions.length} opciones</b>
          <Dot />
          {durationLabel}
          <Dot />
          {whoShort.toLowerCase()}
        </>
      ) : (
        <span className={nudge ? "font-semibold text-warning-strong" : undefined}>{missing}</span>
      )}
    </p>
  );

  return (
    <div data-focus-screen className="q-depth min-h-dvh">
      {/* Barra superior enfocada (sin la cabecera del sitio) */}
      <header className="sticky top-0 z-30 border-b border-foreground/[0.06] bg-background/80 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto grid min-h-14 max-w-[72rem] grid-cols-[3rem_1fr_3rem] items-center px-1 lg:min-h-16 lg:grid-cols-[1fr_auto] lg:px-8">
          <Link href="/votaciones" aria-label="Cancelar y salir" className="grid size-tap place-items-center rounded-full text-foreground hover:bg-foreground/5 lg:hidden">
            <X className="size-5" aria-hidden="true" />
          </Link>
          <h1 className="text-center text-body font-bold tracking-[-0.01em] lg:hidden">Nueva votación</h1>
          <nav aria-label="Ruta" className="hidden items-center gap-2.5 font-semibold lg:flex">
            <Link href="/" className="inline-flex min-h-tap items-center gap-2.5">
              <LogoMark size={26} />
              <span>Quórum</span>
            </Link>
            <span className="text-input" aria-hidden="true">
              /
            </span>
            <Link href="/votaciones" className="inline-flex min-h-tap items-center font-medium text-muted-foreground hover:text-foreground">
              Mis votaciones
            </Link>
            <span className="text-input" aria-hidden="true">
              /
            </span>
            <span aria-current="page">Nueva</span>
          </nav>
          <Link href="/votaciones" className="hidden min-h-tap items-center rounded-full px-4 text-small font-semibold hover:bg-muted lg:inline-flex">
            Cancelar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-[72rem] px-4 pb-44 pt-5 lg:px-8 lg:pb-16 lg:pt-10">
        <div className="mb-8 hidden lg:block">
          <h1 className="font-display text-[2.25rem] font-bold leading-[1.1] tracking-[-0.035em]">Nueva votación</h1>
          <p className="mt-2 text-[1rem] text-muted-foreground">Escribe la boleta tal como la verá la gente. Al publicar, tienes el QR para compartir.</p>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,38rem)_minmax(0,1fr)] lg:items-start lg:gap-16">
          <section className="flex min-w-0 flex-col gap-4" aria-label="Editor de la boleta">
            {/* Plantillas */}
            <div role="group" aria-label="Plantillas" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                const on = template === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => applyTemplate(t.value)}
                    className={cn(
                      "inline-flex min-h-tap shrink-0 items-center gap-1.5 rounded-full border px-[0.5625rem] text-small font-semibold transition-[background-color,border-color] duration-150",
                      on ? "border-primary-ink bg-primary-ink text-white shadow-[0_8px_18px_-10px_rgb(0_68_102/0.7)] dark:text-background" : "border-foreground/[0.12] bg-card/70 text-foreground hover:bg-card",
                    )}
                  >
                    <Icon className={cn("size-3.5", on ? "" : "text-primary-ink")} aria-hidden="true" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* La boleta */}
            <article className="relative rounded-[1.5rem] bg-card px-5 pb-2 pt-5 shadow-[0_1px_0_rgb(17_17_34/0.04),0_1px_3px_rgb(17_17_34/0.06),0_24px_48px_-24px_rgb(0_68_102/0.28)] ring-1 ring-foreground/[0.06] lg:px-7 lg:pb-3 lg:pt-7">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                  <i aria-hidden="true" className="size-2 rounded-full bg-accent shadow-[0_0_0_3px_var(--q-orange-soft)]" />
                  Boleta
                </span>
                <span className="text-[0.75rem] text-subtle">Así la verán</span>
              </div>
              <div className="-mx-2 rounded-md px-2 py-1 transition-colors duration-150 focus-within:bg-primary-soft">
                <label htmlFor={`${uid}-title`} className="sr-only">
                  Pregunta de la votación
                </label>
                <textarea
                  ref={titleRef}
                  id={`${uid}-title`}
                  rows={1}
                  maxLength={TITLE_MAX}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setNudge(null);
                  }}
                  placeholder="¿Qué se vota?"
                  aria-invalid={nudge && !titleOk ? true : undefined}
                  className="q-headline-input block min-h-[1.14em] w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-display text-[1.75rem] font-bold leading-[1.14] tracking-[-0.03em] text-foreground outline-none placeholder:text-[#8a8890] focus-visible:outline-none lg:text-[2rem]"
                />
              </div>
              <p className={cn("text-right text-[0.75rem] font-semibold text-warning-strong", title.length > 140 ? "block" : "hidden")} aria-live="polite">
                {title.length > 140 ? `${TITLE_MAX - title.length} caracteres disponibles` : ""}
              </p>
              {showDesc || description ? (
                <div className="mt-2">
                  <label htmlFor={`${uid}-desc`} className="sr-only">
                    Descripción
                  </label>
                  <textarea
                    ref={descRef}
                    id={`${uid}-desc`}
                    rows={2}
                    maxLength={2000}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Contexto para quien vota (opcional)"
                    className="q-headline-input block w-full resize-none rounded-md border-0 bg-muted/60 px-3 py-2 text-body text-foreground outline-none placeholder:text-[#8a8890] focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setShowDesc(true)} className="inline-flex min-h-tap items-center gap-1.5 p-0 text-small font-semibold text-subtle hover:text-foreground">
                  <AlignLeft className="size-[0.95rem]" aria-hidden="true" /> Añadir descripción
                </button>
              )}

              <p id={`${uid}-opts-label`} className="mt-2 border-b border-border pb-2 text-small font-semibold text-muted-foreground">
                Elige una opción
              </p>
              <ul ref={listRef} aria-labelledby={`${uid}-opts-label`}>
                {options.map((o, i) => {
                  const letter = LETTERS[i] ?? String(i + 1);
                  return (
                    <li
                      key={o.key}
                      data-opt-row={o.key}
                      className={cn("flex min-h-14 items-center gap-2.5 border-b border-border transition-colors focus-within:border-primary-ink", dragging === o.key && "bg-primary-soft/60")}
                    >
                      <span aria-hidden="true" className="size-5 shrink-0 rounded-full border-2 border-[#b9b7bf]" />
                      <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono text-[0.75rem] text-subtle">
                        {letter}
                      </span>
                      <input
                        id={`${uid}-opt-${o.key}`}
                        value={o.label}
                        onChange={(e) => editOption(o.key, e.target.value)}
                        maxLength={120}
                        placeholder={`Opción ${i + 1}`}
                        aria-label={`Opción ${letter}`}
                        data-testid={`option-input-${i}`}
                        className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[1.0625rem] font-semibold text-foreground outline-none placeholder:font-medium placeholder:text-[#8a8890] focus-visible:outline-none"
                      />
                      <button
                        type="button"
                        aria-label={`Mover opción ${letter} (flechas arriba y abajo)`}
                        onPointerDown={(e) => onGripDown(e, o.key)}
                        onPointerMove={onGripMove}
                        onPointerUp={onGripUp}
                        onPointerCancel={onGripUp}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            move(o.key, i + (e.key === "ArrowUp" ? -1 : 1));
                          }
                        }}
                        className="grid h-tap w-7 shrink-0 cursor-grab touch-none place-items-center text-[#8a8890] active:cursor-grabbing"
                      >
                        <GripVertical className="size-[1.05rem]" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar opción ${letter}`}
                        onClick={() => removeOption(o.key)}
                        disabled={options.length <= 2}
                        className="-mr-2.5 grid size-tap shrink-0 place-items-center rounded-full text-subtle hover:bg-muted hover:text-foreground disabled:opacity-35"
                      >
                        <X className="size-[1.05rem]" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {options.length < MAX_OPTIONS ? (
                <button type="button" onClick={addOption} className="flex min-h-14 w-full items-center gap-2.5 text-left text-[1rem] font-semibold text-primary-ink">
                  <span aria-hidden="true" className="grid size-5 place-items-center rounded-full border-[1.5px] border-dashed border-current">
                    <Plus className="size-3" strokeWidth={2.5} />
                  </span>
                  <span aria-hidden="true" className="w-4" />
                  Agregar opción
                </button>
              ) : (
                <p className="py-4 text-small text-muted-foreground">Máximo {MAX_OPTIONS} opciones.</p>
              )}
            </article>

            {/* Barra de propiedades */}
            <div role="group" aria-label="Ajustes" className="flex items-stretch overflow-hidden rounded-full bg-card shadow-[0_0_0_1px_rgb(17_17_34/0.07),0_8px_20px_-12px_rgb(17_17_34/0.3)] lg:self-start">
              <PropButton onClick={() => setSheet("duration")} testId="duration-segment">
                <Clock className="size-4 text-primary-ink" aria-hidden="true" />
                <span>
                  <span className="sr-only">Duración: </span>
                  {durationLabel}
                </span>
              </PropButton>
              <PropButton onClick={() => setSheet("who")} grow testId="who-segment">
                <IdCard className="size-4 shrink-0 text-primary-ink" aria-hidden="true" />
                <span aria-hidden="true" className="truncate">
                  {whoShort}
                </span>
                <span className="sr-only" data-testid="review-eligibility">
                  {eligibilitySummary(eligibility)}
                </span>
              </PropButton>
              <PropButton onClick={() => setSheet("advanced")} ariaLabel="Ajustes avanzados" icon testId="advanced-segment">
                <SlidersHorizontal className="size-4 text-primary-ink" aria-hidden="true" />
              </PropButton>
            </div>

            {error ? (
              <Alert tone="danger" title="No se pudo publicar">
                {error}
              </Alert>
            ) : null}

            {/* Barra inferior fija (estática en escritorio) */}
            <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-b from-background/0 via-background/90 via-25% to-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 lg:static lg:bg-none lg:p-0 lg:pt-3">
              <div className="mx-auto flex max-w-[36rem] flex-col gap-2.5 lg:max-w-none">
                {summary}
                <button
                  type="button"
                  data-testid="publish"
                  aria-disabled={!ready || publishing}
                  aria-busy={publishing || undefined}
                  onClick={publish}
                  className={cn(
                    "flex min-h-14 w-full items-center justify-center gap-2.5 rounded-full text-[1.0625rem] font-bold tracking-[-0.01em] transition-colors",
                    ready ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_14px_28px_-14px_rgb(255_113_78/0.9)] hover:bg-primary-hover" : "cursor-not-allowed bg-[#e2dfdf] text-[#66646e] dark:bg-muted dark:text-muted-foreground",
                    publishing && "cursor-progress opacity-80",
                  )}
                >
                  {publishing ? <span className="q-spinner" aria-hidden="true" /> : null}
                  Publicar y compartir
                  {!publishing ? <Send className="size-[1.125rem]" aria-hidden="true" /> : null}
                </button>
              </div>
            </div>
          </section>

          <VoterPreview title={title.trim()} options={cleanOptions} />
        </div>
      </div>

      {/* Hoja: duración */}
      <BottomSheet open={sheet === "duration"} onClose={() => setSheet(null)} title="Duración" testId="duration-sheet">
        <fieldset>
          <SheetGroupTitle as="legend">Cuánto dura la votación</SheetGroupTitle>
          <Segmented name={`${uid}-duration`} big columns={3} value={duration} onChange={setDuration} choices={DURATIONS.map((d) => ({ value: d.value, label: d.label }))} label="Duración" />
          {duration === "custom" ? (
            <div className="mt-3">
              <Field label="Cierra" htmlFor={`${uid}-ends`}>
                <Input id={`${uid}-ends`} type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </Field>
            </div>
          ) : null}
          <SheetNote>
            Cuenta desde que publicas, con la inscripción incluida: la sala abre {PUBLISH_ROOM.expiresInMin} min y la votación empieza al cerrarla.
          </SheetNote>
        </fieldset>
      </BottomSheet>

      {/* Hoja: quién vota */}
      <BottomSheet open={sheet === "who"} onClose={() => setSheet(null)} title="Quién vota" testId="who-sheet">
        <fieldset className="flex flex-col gap-2" data-testid="eligibility-picker">
          <SheetGroupTitle as="legend">Cómo entra la gente</SheetGroupTitle>
          <WhoCard
            name={`${uid}-who`}
            checked={eligibility.method === "event-badge"}
            onChange={() => setEligibility({ ...eligibility, method: "event-badge" })}
            icon={<IdCard className="size-5" aria-hidden="true" />}
            title="Credencial del evento"
            badge="Recomendado"
            text="Escanean el QR de su credencial. Una por persona."
          />
          <WhoCard
            name={`${uid}-who`}
            checked={eligibility.method === "open-alias"}
            onChange={() => setEligibility({ ...eligibility, method: "open-alias" })}
            icon={<UserRound className="size-5" aria-hidden="true" />}
            title="Apodo libre"
            text="Entra quien tenga el código de la sala."
          />
        </fieldset>
        <TrustNote icon={<ScanFace className="size-[1.125rem] shrink-0" aria-hidden="true" />}>En los dos casos se comprueba el rostro para evitar duplicados. No guardamos fotos.</TrustNote>
      </BottomSheet>

      {/* Hoja: avanzado */}
      <BottomSheet open={sheet === "advanced"} onClose={() => setSheet(null)} title="Avanzado" testId="advanced-sheet">
        <section>
          <SheetGroupTitle>
            <label htmlFor={`${uid}-adv-desc`}>Descripción</label>
          </SheetGroupTitle>
          <textarea
            id={`${uid}-adv-desc`}
            rows={2}
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexto para quien vota (opcional)"
            className="w-full resize-none rounded-[1rem] border-0 bg-card px-3.5 py-3 text-body text-foreground shadow-[0_0_0_1px_rgb(17_17_34/0.05)] outline-none placeholder:text-[#8a8890] focus-visible:shadow-[0_0_0_2px_var(--color-ring),0_0_0_6px_rgb(0_68_102/0.15)]"
          />
        </section>

        {eligibility.method === "event-badge" ? (
          <section>
            <SheetGroupTitle id={`${uid}-chk-h`}>Comprobación de credencial</SheetGroupTitle>
            <Segmented
              name={`${uid}-check`}
              labelledBy={`${uid}-chk-h`}
              value={eligibility.badgeCheck}
              onChange={(v) => setEligibility({ ...eligibility, badgeCheck: v })}
              choices={[
                { value: "live", label: "En vivo" },
                { value: "list", label: "Con lista" },
                { value: "none", label: "Sin comprobar" },
              ]}
              testId="badge-check"
            />
            <SheetGroup className="mt-3">
              <RowDisclosure label="Prefijo del QR" value={<span className="font-mono">{eligibility.prefix.replace(/^https:\/\//, "")}</span>}>
                <Field label="Dirección del QR de la credencial" htmlFor={`${uid}-prefix`} hint="Déjalo así si usas la credencial de Platanus Hack.">
                  <Input id={`${uid}-prefix`} value={eligibility.prefix} onChange={(e) => setEligibility({ ...eligibility, prefix: e.target.value })} className="q-mono" />
                </Field>
              </RowDisclosure>
              <RowDisclosure label="Lista permitida" value={allow ? `${allow.users.length} usuarios` : "Vacía"} open={eligibility.badgeCheck === "list"}>
                {eligibility.badgeCheck === "list" ? (
                  <Field
                    label="Usuarios permitidos (uno por línea)"
                    htmlFor={`${uid}-allowlist`}
                    hint={`${allow?.users.length ?? 0} usuarios${allow?.bad.length ? ` · ${allow.bad.length} no válidos` : ""}. Acepta usuario, @usuario o la URL de la credencial.`}
                  >
                    <Textarea id={`${uid}-allowlist`} rows={4} value={eligibility.allowlist} onChange={(e) => setEligibility({ ...eligibility, allowlist: e.target.value })} placeholder={"usuario-1\nusuario-2"} />
                  </Field>
                ) : (
                  <p className="text-small text-muted-foreground">Elige «Con lista» para pegar los usuarios permitidos.</p>
                )}
              </RowDisclosure>
            </SheetGroup>
            <SheetNote>«En vivo» consulta la página del evento. «Con lista» funciona sin internet. «Sin comprobar» es más rápido, pero menos seguro.</SheetNote>
          </section>
        ) : null}

        <section>
          <SheetGroupTitle id={`${uid}-mode-h`}>Cuándo se vota</SheetGroupTitle>
          <Segmented
            name={`${uid}-mode`}
            labelledBy={`${uid}-mode-h`}
            value={votingMode}
            onChange={setVotingMode}
            choices={[
              { value: "phased", label: "Con hora de inicio" },
              { value: "continuous", label: "Al instante" },
            ]}
            testId="voting-mode-picker"
          />
          <SheetNote>
            {votingMode === "phased" ? "Primero se inscriben todos; la votación empieza al cerrar la inscripción o cuando la abras." : "Se inscriben y votan en el momento. La sala sigue abierta mientras se vota."}
          </SheetNote>
        </section>

        <section>
          <SheetGroupTitle>Invitaciones</SheetGroupTitle>
          <SheetGroup>
            <RowDisclosure icon={<Link2 className="size-4" aria-hidden="true" />} label="Invitar por enlace" value={participants.length ? `${participants.length} ${participants.length === 1 ? "persona" : "personas"}` : "Nadie aún"}>
              <Field label="Pegar lista (una por línea: Nombre, +58412…)" htmlFor={`${uid}-pasted`}>
                <Textarea id={`${uid}-pasted`} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"Vecina A, +584121111111\nVecino B"} />
              </Field>
              <p className="mt-2 text-small text-muted-foreground" aria-live="polite">
                {participants.length} invitados listos.
              </p>
            </RowDisclosure>
          </SheetGroup>
          <SheetNote>Nombre y teléfono opcional. El teléfono nunca se publica.</SheetNote>
        </section>

        <section>
          <SheetGroupTitle>Sorteo de proyectos</SheetGroupTitle>
          <SheetGroup>
            <div className="flex min-h-13 items-center gap-3 px-4 py-2">
              <span className="grid size-[1.875rem] shrink-0 place-items-center rounded-sm bg-primary-soft text-primary-ink">
                <Gift className="size-4" aria-hidden="true" />
              </span>
              <label htmlFor={`${uid}-draw`} className="min-w-0 flex-1 font-semibold">
                Sortear proyectos al cerrar
              </label>
              <Switch id={`${uid}-draw`} checked={drawOn} onChange={setDrawOn} />
            </div>
            {drawOn ? (
              <div className="flex flex-col gap-3 p-4">
                <p className="text-small text-muted-foreground">Al cerrar se sortean los ganadores. Nadie puede saber el resultado antes.</p>
                <CandidatesEditor candidates={candidates} onChange={setCandidates} />
              </div>
            ) : null}
          </SheetGroup>
          {drawOn && candidates.length > 0 ? (
            <div className="mt-3 flex flex-col gap-3">
              <Segmented
                name={`${uid}-rule`}
                label="Cuántos ganan"
                value={winnersRule}
                onChange={setWinnersRule}
                choices={[
                  { value: "fromResult", label: "Según el resultado" },
                  { value: "fixed", label: "Número fijo" },
                ]}
              />
              {winnersRule === "fixed" ? (
                <Field label="Ganadores" htmlFor={`${uid}-winners`}>
                  <Input id={`${uid}-winners`} inputMode="numeric" value={winnersCount} onChange={(e) => setWinnersCount(e.target.value)} className="w-28" />
                </Field>
              ) : (
                <SheetNote className="pt-0">Ganan tantos proyectos como diga la opción ganadora (las opciones deben ser números).</SheetNote>
              )}
            </div>
          ) : null}
        </section>

        <TrustNote icon={<ShieldCheck className="size-[1.125rem] shrink-0" aria-hidden="true" />}>El padrón lo define esta lista; el resultado vale cuando lo confirma el verificador.</TrustNote>
      </BottomSheet>
    </div>
  );
}

/* ---------- Piezas ---------- */

function Dot() {
  return <span aria-hidden="true" className="size-[3px] rounded-full bg-current opacity-60" />;
}

function PropButton({ children, onClick, grow, icon, ariaLabel, testId }: { children: React.ReactNode; onClick: () => void; grow?: boolean; icon?: boolean; ariaLabel?: string; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={ariaLabel}
      title={ariaLabel}
      data-testid={testId}
      className={cn(
        "inline-flex min-h-tap min-w-0 items-center gap-1.5 whitespace-nowrap px-3 text-small font-semibold text-foreground hover:bg-muted focus-visible:rounded-full focus-visible:outline-offset-[-3px] [&+&]:border-l [&+&]:border-border",
        grow && "flex-1 justify-start lg:flex-none",
        icon && "w-12 justify-center px-0",
      )}
    >
      {children}
    </button>
  );
}

function WhoCard({ name, checked, onChange, icon, title, badge, text }: { name: string; checked: boolean; onChange: () => void; icon: React.ReactNode; title: string; badge?: string; text: string }) {
  return (
    <label
      className={cn(
        "relative flex cursor-pointer items-start gap-3.5 rounded-[1rem] bg-card p-4 transition-shadow has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-ring",
        checked ? "shadow-[0_0_0_2px_var(--color-primary-ink),0_10px_24px_-14px_rgb(0_68_102/0.6)]" : "shadow-[0_0_0_1px_rgb(17_17_34/0.06)]",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="absolute size-px opacity-0" aria-label={title} />
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-ink">{icon}</span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5 font-semibold">
          {title}
          {badge ? <Badge tone="success" className="px-2 py-0 text-[0.6875rem] font-bold">{badge}</Badge> : null}
        </span>
        <span className="text-small text-muted-foreground">{text}</span>
      </span>
      <span aria-hidden="true" className={cn("ml-auto grid size-6 shrink-0 place-items-center rounded-full border-2", checked ? "border-primary-ink bg-primary-ink text-white" : "border-input")}>
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
    </label>
  );
}

function TrustNote({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[1rem] bg-success-soft px-4 py-3.5 text-small font-medium leading-[1.45] text-success-strong">
      {icon}
      <span>{children}</span>
    </div>
  );
}

/** Fila de ajustes con valor y chevron que despliega su editor (como en iOS/Android, sin salir de la hoja). */
function RowDisclosure({ label, value, icon, children, open }: { label: string; value: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="group" open={open}>
      <summary className="flex min-h-13 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        {icon ? <span className="grid size-[1.875rem] shrink-0 place-items-center rounded-sm bg-primary-soft text-primary-ink">{icon}</span> : null}
        <span className="min-w-0 flex-1 font-semibold">{label}</span>
        <span className="max-w-[9.5rem] truncate text-small text-muted-foreground">{value}</span>
        <ChevronRight className="size-4 shrink-0 text-[#b9b7bf] transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4 pt-1">{children}</div>
    </details>
  );
}

/** Vista previa en escritorio: teléfono con la boleta del votante (mismo aspecto que `BallotScreen`). Decorativa. */
function VoterPreview({ title, options }: { title: string; options: string[] }) {
  const shown = options.length ? options : ["", ""];
  return (
    <aside aria-label="Vista previa" className="sticky top-24 hidden flex-col items-center gap-6 lg:flex">
      <div className="flex items-center justify-between self-stretch text-[0.75rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">
        <span>Vista del votante</span>
        <span className="inline-flex items-center gap-1.5 font-semibold normal-case tracking-normal text-success-strong">
          <i aria-hidden="true" className="size-2 rounded-full bg-success" />
          En vivo
        </span>
      </div>
      <div aria-hidden="true" className="relative w-[19.5rem] rounded-[3rem] bg-[#16161f] p-[0.6rem] shadow-[0_0_0_1px_#2b2b38,0_0_0_2px_#0b0b12,0_40px_80px_-30px_rgb(17_17_34/0.55)]">
        <span className="absolute -left-[3px] top-28 h-14 w-[3px] rounded-l-sm bg-[#2b2b38]" />
        <span className="absolute -right-[3px] top-36 h-20 w-[3px] rounded-r-sm bg-[#2b2b38]" />
        <div className="relative flex h-[39rem] flex-col overflow-hidden rounded-[2.45rem] bg-[#f0eeee] text-[#111122]">
          <span className="absolute left-1/2 top-[0.6rem] z-10 h-[1.6rem] w-[5.75rem] -translate-x-1/2 rounded-full bg-[#05050a]" />
          <div className="flex h-11 items-center justify-between px-6 pt-3 text-[0.8125rem] font-bold">
            <span>9:41</span>
            <span className="flex items-center gap-[0.3rem]">
              <i className="block h-[5px] w-[3px] rounded-[1px] bg-[#111122]" />
              <i className="block h-[7px] w-[3px] rounded-[1px] bg-[#111122]" />
              <i className="block h-[9px] w-[3px] rounded-[1px] bg-[#111122]" />
              <i className="ml-1 block h-[9px] w-5 rounded-[3px] bg-[#111122]" />
            </span>
          </div>
          <div className="flex items-center gap-1.5 border-b border-[#111122]/[0.06] px-4 py-2 font-display text-[1rem] font-semibold">
            <LogoMark size={20} knockout="#f0eeee" /> Quórum
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-hidden px-3.5 py-4">
            <p className="text-[0.6875rem] text-[#55535c]">Paso 2 de 2 · Tu voto</p>
            <div className="flex flex-col gap-2 rounded-[1rem] bg-white p-3.5 shadow-card">
              <p className={cn("font-display text-[1.0625rem] font-bold leading-[1.18] tracking-[-0.02em]", !title && "text-[#8a8890]")}>{title || "¿Qué se vota?"}</p>
              <p className="mt-1 text-[0.75rem] font-semibold text-[#55535c]">Elige una opción</p>
              <div className="flex flex-col gap-2">
                {shown.map((o, i) =>
                  o ? (
                    <div key={`${i}-${o}`} className="flex min-h-10 items-center gap-2 rounded-[0.625rem] border border-[#e0dddd] px-2.5 text-[0.875rem] font-semibold">
                      <i className="size-[0.95rem] shrink-0 rounded-full border-2 border-[#b9b7bf]" />
                      <em className="font-mono text-[0.625rem] not-italic text-[#66646e]">{LETTERS[i]}</em>
                      <span className="truncate">{o}</span>
                    </div>
                  ) : (
                    <div key={`ghost-${i}`} className="min-h-10 rounded-[0.625rem] border border-dashed border-[#cdcacb]" />
                  ),
                )}
              </div>
            </div>
            <span className="mt-auto grid min-h-10 place-items-center rounded-full bg-[#111122] text-[0.8125rem] font-bold text-white">Votar</span>
          </div>
          <div className="mx-auto mb-[0.6rem] mt-2 h-[0.3rem] w-28 rounded-full bg-[#111122]" />
        </div>
      </div>
      <p className="flex items-center gap-2 text-small text-muted-foreground">
        <CalendarClock className="size-4" aria-hidden="true" /> Al publicar tendrás el QR y el código de la sala.
      </p>
    </aside>
  );
}
