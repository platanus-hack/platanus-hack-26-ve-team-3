"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { CreateElectionInput } from "@quorum/contracts";
import { Stepper } from "@/components/Stepper";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, describeError } from "@/lib/client/api";
import { appendVoters, rememberElection } from "@/lib/client/orgStore";
import { kindLabel } from "@/lib/client/format";

const STEPS = [
  { id: "question", label: "Pregunta y opciones" },
  { id: "voters", label: "Participantes" },
  { id: "review", label: "Revisar y publicar" },
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
  const [kind, setKind] = useState<CreateElectionInput["kind"]>("multiple");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(new Date(Date.now() + 2 * 3600 * 1000)));

  // Paso 2
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

  function validateStep1(): string | null {
    if (title.trim().length < 3) return "El título necesita al menos 3 caracteres.";
    if (cleanOptions.length < 2) return "Necesitas al menos 2 opciones.";
    if (cleanOptions.length > 10) return "Máximo 10 opciones.";
    if (new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length) return "Hay opciones repetidas.";
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return "El cierre debe ser posterior a la apertura.";
    return null;
  }
  function validateStep2(): string | null {
    if (cleanParticipants.length === 0) return "Agrega al menos un participante.";
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
      setProgress("Creando la elección…");
      const input: CreateElectionInput = {
        title: title.trim(),
        description: description.trim(),
        kind,
        options: cleanOptions.map((label, i) => ({ id: slug(label, i), label })),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      };
      const election = await api.createElection(input);
      rememberElection(election.id, election.title);

      setProgress(`Registrando ${cleanParticipants.length} participantes…`);
      const res = await api.addVoters(
        election.id,
        cleanParticipants.map((p) => (p.phoneE164 ? { displayName: p.displayName, phoneE164: p.phoneE164 } : { displayName: p.displayName })),
      );
      appendVoters(election.id, res.voters);

      setProgress("Publicando (manifiesto + layout)…");
      await api.publishElection(election.id);
      router.push(`/org/${encodeURIComponent(election.id)}`);
    } catch (e) {
      setError(describeError(e));
      setPublishing(false);
      setProgress(null);
    }
  }

  return (
    <div className="q-container flex max-w-3xl flex-col gap-6 py-6 md:py-10">
      <header>
        <h1 className="text-title font-bold tracking-tight md:text-display">Crear votación</h1>
        <p className="mt-1 text-body text-muted-foreground">Tres pasos. Es una demostración: usa un título y opciones neutrales, nunca procesos políticos reales.</p>
      </header>
      <Stepper steps={STEPS} current={step} />

      {step === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Pregunta y opciones</CardTitle>
            <CardDescription>Qué se decide y entre qué alternativas.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field label="Título de la votación" htmlFor="title" hint="Ejemplo: Fecha de la asamblea anual — Condominio Los Samanes (ficticio)">
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required aria-describedby="title-hint" />
            </Field>
            <Field label="Descripción (opcional)" htmlFor="description">
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
            </Field>
            <Field label="Tipo" htmlFor="kind">
              <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value as CreateElectionInput["kind"])}>
                {(["yes-no", "multiple", "ranking", "budget"] as const).map((k) => (
                  <option key={k} value={k}>
                    {kindLabel[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-small font-semibold">Opciones (2 a 10)</legend>
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <label htmlFor={`opt-${i}`} className="sr-only">
                    Opción {i + 1}
                  </label>
                  <Input id={`opt-${i}`} value={o} onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} maxLength={120} placeholder={`Opción ${i + 1}`} />
                  <Button variant="ghost" aria-label={`Quitar opción ${i + 1}`} onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))} disabled={options.length <= 2}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              ))}
              <Button variant="secondary" size="sm" className="w-fit" onClick={() => setOptions((p) => [...p, ""])} disabled={options.length >= 10}>
                <Plus aria-hidden="true" /> Agregar opción
              </Button>
            </fieldset>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Apertura" htmlFor="startsAt">
                <Input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </Field>
              <Field label="Cierre" htmlFor="endsAt">
                <Input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </Field>
            </div>
            {stepError ? (
              <Alert tone="danger" title="Revisa el formulario">
                {stepError}
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button full onClick={next}>
              Continuar
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Participantes elegibles</CardTitle>
            <CardDescription>Nombre y teléfono opcional (formato internacional). El teléfono sólo se usa para invitar; nunca se publica.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
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
                  <Button variant="ghost" aria-label={`Quitar participante ${i + 1}`} onClick={() => setParticipants((prev) => prev.filter((_, j) => j !== i))} disabled={participants.length <= 1} className="row-start-1 col-start-2 sm:col-start-3">
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" className="w-fit" onClick={() => setParticipants((p) => [...p, { displayName: "", phoneE164: "" }])}>
              <Plus aria-hidden="true" /> Agregar participante
            </Button>
            <Field label="Pegar lista (una por línea: Nombre, +58412…)" htmlFor="pasted" hint="Usa nombres ficticios en la demo.">
              <Textarea id="pasted" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"Vecina A, +584121111111\nVecino B"} />
            </Field>
            <Button variant="secondary" size="sm" className="w-fit" onClick={importPasted} disabled={!pasted.trim()}>
              Importar lista
            </Button>
            <p className="text-small text-muted-foreground">{cleanParticipants.length} participantes listos.</p>
            {stepError ? (
              <Alert tone="danger" title="Revisa los participantes">
                {stepError}
              </Alert>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button variant="secondary" onClick={() => setStep(0)}>
              Atrás
            </Button>
            <Button full className="md:flex-1" onClick={next}>
              Continuar
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Revisar y publicar</CardTitle>
            <CardDescription>Al publicar se calcula el manifiesto (hash de título, opciones y fechas) y se abre la votación.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-3 text-small sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Título</dt>
                <dd className="text-heading font-bold">{title}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tipo</dt>
                <dd className="font-semibold">{kindLabel[kind]}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Participantes</dt>
                <dd className="font-semibold">{cleanParticipants.length}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Opciones</dt>
                <dd>
                  <ol className="mt-1 list-decimal pl-5">
                    {cleanOptions.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ol>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Apertura</dt>
                <dd className="font-semibold">{new Date(startsAt).toLocaleString("es-VE")}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cierre</dt>
                <dd className="font-semibold">{new Date(endsAt).toLocaleString("es-VE")}</dd>
              </div>
            </dl>
            <div className="rounded-md border border-border bg-muted p-3">
              <Checkbox
                id="ack"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                label={<span>Entiendo que esto es una <strong>demostración</strong>: el padrón lo define esta lista, la prueba de vida no está certificada y el resultado sólo es confiable cuando lo confirme el verificador independiente.</span>}
              />
            </div>
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
          </CardContent>
          <CardFooter>
            <Button variant="secondary" onClick={() => setStep(1)} disabled={publishing}>
              Atrás
            </Button>
            <Button full className="md:flex-1" variant="success" onClick={publish} loading={publishing} disabled={!acknowledged}>
              Publicar votación
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  );
}
