"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionDock } from "@/components/ui/action-dock";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Disclosure } from "@/components/ui/disclosure";
import { Stepper } from "@/components/Stepper";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { describeError } from "@/lib/client/api";
import { apiV1, type CreateElectionV1 } from "@/lib/client/apiV1";
import { appendVoters, rememberElection, saveOrgToken } from "@/lib/client/orgStore";
import { kindLabel } from "@/lib/client/format";
import type { Candidate } from "@quorum/contracts";
import { CandidatesEditor, CandidatesList } from "./CandidatesEditor";
import { checkLabel, DEFAULT_ELIGIBILITY, EligibilityPicker, eligibilityInputOf, methodLabel, type EligibilityDraft } from "./EligibilityPicker";
import { PageHeader } from "@/components/ui/page-header";

const STEPS = [
  { id: "question", label: "Pregunta" },
  { id: "voters", label: "Quién vota" },
  { id: "review", label: "Publicar" },
];

type Template = "yes-no" | "options" | "count";
const TEMPLATES: { value: Template; label: string }[] = [
  { value: "options", label: "Varias opciones" },
  { value: "yes-no", label: "Sí / No" },
  { value: "count", label: "Número del 1 al 5" },
];

type Duration = "30m" | "2h" | "1d" | "1w" | "custom";
const DURATIONS: { value: Duration; label: string; ms: number }[] = [
  { value: "30m", label: "30 min", ms: 30 * 60_000 },
  { value: "2h", label: "2 horas", ms: 2 * 3_600_000 },
  { value: "1d", label: "1 día", ms: 24 * 3_600_000 },
  { value: "1w", label: "1 semana", ms: 7 * 24 * 3_600_000 },
  { value: "custom", label: "Elegir fechas", ms: 0 },
];

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

export function ElectionWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Paso 1
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<CreateElectionV1["kind"]>("multiple");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [template, setTemplate] = useState<Template>("options");
  const [duration, setDuration] = useState<Duration>("2h");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 2 * 3600 * 1000)));
  // Sorteo verificable (D-12): candidatos y regla de N ganadores. Se fijan en el manifiesto al crear.
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [winnersRule, setWinnersRule] = useState<"fixed" | "fromResult">("fromResult");
  const [winnersCount, setWinnersCount] = useState("1");

  // Paso 2 — D-19: ¿quién puede votar? (credencial del evento por defecto) + invitados opcionales
  const [eligibility, setEligibility] = useState<EligibilityDraft>(DEFAULT_ELIGIBILITY);
  const [participants, setParticipants] = useState<Participant[]>([{ displayName: "", phoneE164: "" }]);
  const [pasted, setPasted] = useState("");

  // Paso 3
  const [acknowledged, setAcknowledged] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const cleanOptions = useMemo(() => options.map((o) => o.trim()).filter(Boolean), [options]);
  const cleanParticipants = useMemo(() => participants.map((p) => ({ displayName: p.displayName.trim(), phoneE164: p.phoneE164.trim() })).filter((p) => p.displayName), [participants]);

  /** Con "según la opción ganadora", cada opción debe ser un número entero (p. ej. 1..5 proyectos). */
  const optionValues = useMemo(() => {
    const vals = cleanOptions.map((o) => (/^\d+$/.test(o) ? Number(o) : NaN));
    return vals.every((v) => Number.isInteger(v)) ? vals : null;
  }, [cleanOptions]);

  function applyTemplate(t: Template) {
    setTemplate(t);
    if (t === "yes-no") {
      setKind("yes-no");
      setOptions(["Sí", "No"]);
    } else if (t === "count") {
      setKind("multiple");
      setOptions(["1", "2", "3", "4", "5"]);
    } else {
      setKind("multiple");
      setOptions(["", ""]);
    }
  }

  function schedule(): { starts: Date; ends: Date } {
    if (duration === "custom") return { starts: new Date(startsAt), ends: new Date(endsAt) };
    const now = new Date();
    return { starts: now, ends: new Date(now.getTime() + DURATIONS.find((d) => d.value === duration)!.ms) };
  }

  function validateStep1(): string | null {
    if (title.trim().length < 3) return "El título necesita al menos 3 caracteres.";
    if (cleanOptions.length < 2) return "Necesitas al menos 2 opciones.";
    if (cleanOptions.length > 10) return "Máximo 10 opciones.";
    if (new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length) return "Hay opciones repetidas.";
    if (duration === "custom" && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return "El cierre debe ser posterior a la apertura.";
    if (candidates.length > 0 && winnersRule === "fromResult" && !optionValues) return "Para que la opción ganadora fije cuántos proyectos se financian, cada opción debe ser un número (p. ej. 1, 2, 3, 4, 5).";
    if (candidates.length > 0 && winnersRule === "fixed") {
      const n = Number(winnersCount);
      if (!Number.isInteger(n) || n < 1 || n > candidates.length) return `El número de ganadores debe estar entre 1 y ${candidates.length}.`;
    }
    return null;
  }
  function validateStep2(): string | null {
    const el = eligibilityInputOf(eligibility);
    if (!el.ok) return el.error;
    // Con credencial del evento la gente entra por la sala: los invitados por enlace son opcionales.
    if (cleanParticipants.length === 0 && eligibility.method !== "event-badge") return "Agrega al menos un participante.";
    if (cleanParticipants.length > 500) return "Máximo 500 participantes por lote.";
    const bad = cleanParticipants.find((p) => p.phoneE164 && !/^\+[1-9]\d{6,14}$/.test(p.phoneE164));
    if (bad) return `Teléfono inválido para «${bad.displayName}»: usa formato internacional, p. ej. +584121234567.`;
    return null;
  }

  function next() {
    const err = step === 0 ? validateStep1() : step === 1 ? validateStep2() : null;
    setStepError(err);
    if (!err) setStep((s) => Math.min(2, s + 1));
  }

  function importPasted() {
    const rows = pasted
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, phone] = l.split(/[,;\t]/).map((s) => s?.trim() ?? "");
        return { displayName: name, phoneE164: phone ?? "" };
      })
      .filter((p) => p.displayName);
    if (rows.length === 0) return setStepError("No se detectaron filas. Usa «Nombre, +58412…» por línea.");
    setParticipants((prev) => [...prev.filter((p) => p.displayName.trim()), ...rows]);
    setPasted("");
    setStepError(null);
  }

  async function publish() {
    setError(null);
    setPublishing(true);
    try {
      setProgress("Creando la votación…");
      const el = eligibilityInputOf(eligibility);
      if (!el.ok) throw new Error(el.error);
      const input: CreateElectionV1 = {
        eligibility: el.value,
        title: title.trim(),
        description: description.trim(),
        kind,
        options: cleanOptions.map((label, i) => ({ id: slug(label, i), label })),
        startsAt: schedule().starts.toISOString(),
        endsAt: schedule().ends.toISOString(),
        ...(candidates.length > 0
          ? winnersRule === "fromResult" && optionValues
            ? { candidates, winnersCountFromResult: true, optionValues }
            : { candidates, winnersCountFromResult: false, winnersCount: Number(winnersCount) }
          : {}),
      };
      const election = await apiV1.createElection(input);
      rememberElection(election.id, election.title);
      // Token del organizador (se devuelve una sola vez): sessionStorage; el panel lo muestra una vez con "guárdalo".
      if (election.organizerToken) saveOrgToken(election.id, election.organizerToken);

      if (cleanParticipants.length > 0) {
        setProgress(`Registrando ${cleanParticipants.length} participantes…`);
        const res = await apiV1.addVoters(
          election.id,
          cleanParticipants.map((p) => (p.phoneE164 ? { displayName: p.displayName, phoneE164: p.phoneE164 } : { displayName: p.displayName })),
        );
        appendVoters(election.id, res.voters);
      }

      setProgress("Abriendo la inscripción…");
      await apiV1.publish(election.id);
      router.push(`/org/${encodeURIComponent(election.id)}`);
    } catch (e) {
      setError(describeError(e));
      setPublishing(false);
      setProgress(null);
    }
  }

  const durationLabel = duration === "custom" ? `${new Date(startsAt).toLocaleString("es-VE")} → ${new Date(endsAt).toLocaleString("es-VE")}` : `${DURATIONS.find((d) => d.value === duration)!.label} desde que publicas`;

  return (
    <div className="q-fade-in q-container flex max-w-2xl flex-col gap-6 py-6 md:py-10">
      <PageHeader title="Crear votación" />
      <Stepper steps={STEPS} current={step} />

      {step === 0 ? (
        <section className="q-fade-in flex flex-col gap-6" aria-labelledby="step-question">
          <h2 id="step-question" className="sr-only">
            Pregunta
          </h2>
          <Field label="Título de la votación" htmlFor="title" hint="Ej.: ¿Qué día hacemos la asamblea?">
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required aria-describedby="title-hint" className="min-h-13 text-heading" />
          </Field>

          <ChoiceChips name="template" legend="Tipo de respuesta" choices={TEMPLATES} value={template} onChange={applyTemplate} />

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-small font-medium text-muted-foreground">Opciones</legend>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <label htmlFor={`opt-${i}`} className="sr-only">
                  Opción {i + 1}
                </label>
                <Input id={`opt-${i}`} value={o} onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} maxLength={120} placeholder={`Opción ${i + 1}`} />
                <Button variant="ghost" size="sm" className="size-tap shrink-0 px-0" aria-label={`Quitar opción ${i + 1}`} onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} disabled={options.length <= 2}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setOptions((p) => [...p, ""])} disabled={options.length >= 10}>
              <Plus aria-hidden="true" /> Agregar opción
            </Button>
          </fieldset>

          <ChoiceChips name="duration" legend="¿Cuánto dura?" choices={DURATIONS} value={duration} onChange={setDuration} />
          {duration === "custom" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Apertura" htmlFor="startsAt">
                <Input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </Field>
              <Field label="Cierre" htmlFor="endsAt">
                <Input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
            </div>
          ) : null}

          <Disclosure title="Más ajustes" bodyClassName="flex flex-col gap-5" className="bg-card">
            <Field label="Descripción (opcional)" htmlFor="description">
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
            </Field>
            <Field label="Tipo" htmlFor="kind">
              <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value as CreateElectionV1["kind"])}>
                {(["yes-no", "multiple", "ranking", "budget"] as const).map((k) => (
                  <option key={k} value={k}>
                    {kindLabel[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-body font-semibold">Sorteo de proyectos</legend>
              <p className="text-small text-muted-foreground">Al cerrar se sortean los ganadores. Nadie conoce la semilla antes.</p>
              <CandidatesEditor candidates={candidates} onChange={setCandidates} />
              {candidates.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <label className="flex min-h-tap items-center gap-2 text-body">
                    <input type="radio" name="winnersRule" checked={winnersRule === "fromResult"} onChange={() => setWinnersRule("fromResult")} className="size-5 accent-[var(--color-primary)]" />
                    La opción ganadora define cuántos ganan
                  </label>
                  <label className="flex min-h-tap items-center gap-2 text-body">
                    <input type="radio" name="winnersRule" checked={winnersRule === "fixed"} onChange={() => setWinnersRule("fixed")} className="size-5 accent-[var(--color-primary)]" />
                    Número fijo de ganadores
                  </label>
                  {winnersRule === "fixed" ? (
                    <Field label="Ganadores" htmlFor="winnersCount">
                      <Input id="winnersCount" inputMode="numeric" value={winnersCount} onChange={(e) => setWinnersCount(e.target.value)} className="w-28" />
                    </Field>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          </Disclosure>

          {stepError ? (
            <Alert tone="danger" title="Revisa la pregunta">
              {stepError}
            </Alert>
          ) : null}
          <ActionDock>
            <Button size="lg" full onClick={next}>
              Continuar
            </Button>
          </ActionDock>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="q-fade-in flex flex-col gap-6" aria-labelledby="step-voters">
          <h2 id="step-voters" className="sr-only">
            Quién vota
          </h2>
          <EligibilityPicker value={eligibility} onChange={setEligibility} />

          <Disclosure title={`Invitar por enlace${eligibility.method === "event-badge" ? " (opcional)" : ""}`} defaultOpen={eligibility.method !== "event-badge"} bodyClassName="flex flex-col gap-4" className="bg-card">
            <p className="text-muted-foreground">Nombre y teléfono opcional. El teléfono nunca se publica.</p>
            <ul className="flex flex-col gap-2">
              {participants.map((p, i) => (
                <li key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <label htmlFor={`p-name-${i}`} className="sr-only">
                      Nombre del participante {i + 1}
                    </label>
                    <Input id={`p-name-${i}`} placeholder="Nombre" value={p.displayName} onChange={(e) => setParticipants((prev) => prev.map((x, j) => (j === i ? { ...x, displayName: e.target.value } : x)))} maxLength={80} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor={`p-phone-${i}`} className="sr-only">
                      Teléfono del participante {i + 1} (opcional)
                    </label>
                    <Input id={`p-phone-${i}`} placeholder="+58412… (opcional)" inputMode="tel" value={p.phoneE164} onChange={(e) => setParticipants((prev) => prev.map((x, j) => (j === i ? { ...x, phoneE164: e.target.value } : x)))} />
                  </div>
                  <Button variant="ghost" size="sm" aria-label={`Quitar participante ${i + 1}`} onClick={() => setParticipants((prev) => prev.filter((_, j) => j !== i))} disabled={participants.length <= 1} className="row-start-1 col-start-2 size-tap px-0 sm:col-start-3">
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="w-fit" onClick={() => setParticipants((p) => [...p, { displayName: "", phoneE164: "" }])}>
              <Plus aria-hidden="true" /> Agregar persona
            </Button>
            <Field label="Pegar lista (una por línea: Nombre, +58412…)" htmlFor="pasted">
              <Textarea id="pasted" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"Vecina A, +584121111111\nVecino B"} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="secondary" size="sm" onClick={importPasted} disabled={!pasted.trim()}>
                Importar lista
              </Button>
              <p className="text-small text-muted-foreground">{cleanParticipants.length} participantes listos.</p>
            </div>
          </Disclosure>

          {stepError ? (
            <Alert tone="danger" title="Revisa quién vota">
              {stepError}
            </Alert>
          ) : null}
          <ActionDock>
            <Button variant="secondary" size="lg" onClick={() => setStep(0)}>
              Atrás
            </Button>
            <Button size="lg" className="flex-1" onClick={next}>
              Continuar
            </Button>
          </ActionDock>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="q-fade-in flex flex-col gap-6" aria-labelledby="step-review">
          <h2 id="step-review" className="sr-only">
            Publicar
          </h2>
          <Card className="overflow-hidden">
            <CardHeader className="bg-muted/60">
              <p className="q-eyebrow">Así la verán</p>
              <CardTitle as="h3" className="text-title">
                {title}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 pt-5 md:pt-6">
              {cleanOptions.map((o) => (
                <div key={o} className="flex min-h-12 items-center gap-3 rounded-md border border-border px-4 font-medium">
                  <span aria-hidden="true" className="size-5 shrink-0 rounded-full border-2 border-subtle" />
                  {o}
                </div>
              ))}
            </CardContent>
          </Card>

          <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border/70 bg-card text-body shadow-card">
            <div className="flex justify-between gap-4 px-5 py-3.5">
              <dt className="text-muted-foreground">Duración</dt>
              <dd className="text-right font-medium">{durationLabel}</dd>
            </div>
            <div className="flex justify-between gap-4 px-5 py-3.5">
              <dt className="text-muted-foreground">Quién vota</dt>
              <dd className="text-right font-medium" data-testid="review-eligibility">
                {methodLabel[eligibility.method]}
                {eligibility.method === "event-badge" ? ` (comprobación ${checkLabel[eligibility.badgeCheck]})` : ""} + rostro
              </dd>
            </div>
            <div className="flex justify-between gap-4 px-5 py-3.5">
              <dt className="text-muted-foreground">Invitados por enlace</dt>
              <dd className="font-medium">{cleanParticipants.length}</dd>
            </div>
            {candidates.length > 0 ? (
              <div className="flex flex-col gap-2 px-5 py-3.5">
                <dt className="text-muted-foreground">Sorteo · {winnersRule === "fromResult" ? "ganan tantos como diga la opción ganadora" : `${winnersCount} ganadores`}</dt>
                <dd>
                  <CandidatesList candidates={candidates} />
                </dd>
              </div>
            ) : null}
          </dl>

          <Checkbox
            id="ack"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            label={<span>Entiendo que el padrón lo define esta lista y que el resultado vale cuando lo confirma el verificador.</span>}
          />
          {progress ? (
            <p role="status" aria-live="polite" className="flex items-center gap-2 text-small">
              <span className="q-spinner" aria-hidden="true" /> {progress}
            </p>
          ) : null}
          {error ? (
            <Alert tone="danger" title="No se pudo publicar">
              {error}
            </Alert>
          ) : null}
          <ActionDock>
            <Button variant="secondary" size="lg" onClick={() => setStep(1)} disabled={publishing}>
              Atrás
            </Button>
            <Button size="lg" className="flex-1" onClick={publish} loading={publishing} disabled={!acknowledged}>
              Publicar votación
            </Button>
          </ActionDock>
        </section>
      ) : null}
    </div>
  );
}
