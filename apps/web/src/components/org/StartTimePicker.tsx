"use client";

import { useState } from "react";
import type { ScheduleInput } from "@quorum/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { orgMessage } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { timed, type ClockSample } from "@/lib/client/clock";

/** "HH:MM" de hoy (hora local del teléfono) → ISO; si ya pasó, mañana a esa hora. */
export function isoForTime(hhmm: string, now = new Date()): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/**
 * «Cambiar la hora» del inicio de la votación: atajos grandes y una hora exacta. Llama a `POST /schedule` (solo
 * durante la inscripción; el servidor valida y, si la sala estaba atada a la hora, mueve su cierre con ella).
 */
export function StartTimePicker({ electionId, onDone, record, hasStart }: { electionId: string; onDone: () => void; record?: (s: ClockSample | null) => void; hasStart: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [time, setTime] = useState("");

  async function apply(body: ScheduleInput) {
    setBusy(true);
    setError(null);
    try {
      const { sample } = await timed(() => apiV1.schedule(electionId, body));
      record?.(sample);
      onDone();
    } catch (e) {
      setError(orgMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="start-picker">
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => apply({ inSeconds: 300 })} data-testid="ready-start-in-5">
          En 5 min
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => apply({ inSeconds: 900 })}>
          En 15 min
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => apply({ addSeconds: 300 })} data-testid="ready-start-plus-5">
          +5 min
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <Field label="A una hora exacta" htmlFor={`${electionId}-start-time`}>
          <Input id={`${electionId}-start-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-36" />
        </Field>
        <Button
          variant="secondary"
          disabled={busy || !time}
          onClick={() => {
            const iso = isoForTime(time);
            if (iso) void apply({ votingStartsAt: iso });
          }}
        >
          Usar esta hora
        </Button>
      </div>
      {hasStart ? (
        <Button variant="link" className="self-start" disabled={busy} onClick={() => apply({ votingStartsAt: null })}>
          Sin hora: la abro yo
        </Button>
      ) : null}
      {error ? (
        <Alert tone="danger" title="No se pudo cambiar la hora">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
