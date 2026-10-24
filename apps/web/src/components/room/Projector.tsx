"use client";

import { useCallback, useEffect, useState } from "react";
import type { RoomStatus } from "@quorum/contracts";
import { StatusPill } from "@/components/StatusPill";
import { request } from "@/lib/client/api";
import { apiV1 } from "@/lib/client/apiV1";
import { formatInt, formatPercent, shortHash } from "@/lib/client/format";
import { saveOrgToken, loadOrgToken } from "@/lib/client/orgStore";
import { phaseLabel } from "@/lib/client/phases";
import { anchorModeText, auditTriState, checkTriState, leadingOption, LooseAudit, takeTokenFromHash } from "@/lib/client/projector";
import { basescanTxUrl, roomApi } from "@/lib/client/room";
import { VotersListResponse as VotersListV1, type Aggregates as AggregatesV1, type DrawResponse as DrawInfo, type Election as ElectionV1 } from "@quorum/contracts";
import { QrCode } from "./QrCode";
import { remaining, useNow } from "./useNow";

const FAST_MS = 2000;
const ELECTION_MS = 4000;

const checkLabel: Record<string, string> = {
  package_schema: "Formato",
  manifest_hash: "Manifiesto",
  group_root: "Padrón",
  chain_integrity: "Cadena",
  proofs_valid: "Pruebas",
  nullifiers_unique: "Un voto por inscrito",
  tally_matches: "Recuento",
  anchor_matches: "Ancla on-chain",
  draw_matches: "Sorteo",
};

/** Pantalla grande para la sala: legible desde la última fila, alto contraste fijo (no sigue el tema), sin scroll. */
export function Projector({ electionId }: { electionId: string }) {
  const now = useNow(1000);
  const [origin, setOrigin] = useState<string>("");
  const [hasToken, setHasToken] = useState(false);
  const [election, setElection] = useState<ElectionV1 | null>(null);
  const [room, setRoom] = useState<RoomStatus | null>(null);
  const [counts, setCounts] = useState<VotersListV1["counts"] | null>(null);
  const [tally, setTally] = useState<AggregatesV1 | null>(null);
  const [audit, setAudit] = useState<LooseAudit | null>(null);
  const [auditMissing, setAuditMissing] = useState(false);
  const [draw, setDraw] = useState<DrawInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  // Token del organizador: llega en el fragmento (#t=…) desde el panel; se guarda en sessionStorage y se borra de la URL.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const fromHash = takeTokenFromHash(window.location, (u) => window.history.replaceState(null, "", u));
      if (fromHash) saveOrgToken(electionId, fromHash);
      setHasToken(Boolean(loadOrgToken(electionId)));
      setOrigin(window.location.origin);
    }, 0);
    return () => clearTimeout(t);
  }, [electionId]);

  const loadElection = useCallback(async () => {
    try {
      setElection(await apiV1.getElection(electionId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [electionId]);

  useEffect(() => {
    const first = window.setTimeout(() => void loadElection(), 0);
    const t = window.setInterval(() => void loadElection(), ELECTION_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [loadElection]);

  const phase = election?.status ?? null;

  // Poll rápido según la fase: sala + inscritos en registration; agregados desde open.
  useEffect(() => {
    if (!phase) return;
    let cancelled = false;
    const tick = async () => {
      try {
        if (phase === "registration" || phase === "draft") {
          const [r, v] = await Promise.all([roomApi.status(electionId), request(`/api/elections/${encodeURIComponent(electionId)}/voters`, undefined, VotersListV1).catch(() => null)]);
          if (cancelled) return;
          setRoom(r);
          if (v?.counts) setCounts(v.counts);
        } else {
          const t = await apiV1.getTally(electionId);
          if (cancelled) return;
          setTally(t);
        }
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), FAST_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [phase, electionId, hasToken]);

  // Resultado del verificador y sorteo: una vez por fase.
  useEffect(() => {
    if (phase !== "auditable" && phase !== "drawn" && phase !== "failed") return;
    let cancelled = false;
    request(`/api/elections/${encodeURIComponent(electionId)}/audit`, undefined, LooseAudit)
      .then((a) => !cancelled && (setAudit(a), setAuditMissing(false)))
      .catch(() => !cancelled && setAuditMissing(true));
    if (phase === "drawn")
      apiV1
        .getDraw(electionId)
        .then((d) => !cancelled && setDraw(d))
        .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [phase, electionId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-white text-[#0B1626]" data-testid="projector" data-phase={phase ?? "loading"}>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 md:flex-nowrap border-b-4 border-[#0B1626] px-[3vw] py-[1.6vh]">
        <h1 className="min-w-0 truncate text-[clamp(1.5rem,3.2vw,3.5rem)] font-extrabold leading-tight">{election?.title ?? "Cargando…"}</h1>
        <div className="flex shrink-0 items-center gap-4">
          {phase ? <span className="rounded-full border-4 border-[#0B1626] px-5 py-1 text-[clamp(1rem,1.8vw,2rem)] font-bold">{phaseLabel[phase]}</span> : null}
          {stale ? <span className="text-[clamp(0.9rem,1.2vw,1.4rem)] font-bold text-[#8A1F1F]">sin conexión: último dato</span> : null}
        </div>
      </header>

      <main className="flex min-h-0 flex-1 items-start overflow-auto px-[3vw] py-[3vh] md:items-stretch md:overflow-hidden">
        {error && !election ? <Big title="No se pudo cargar la votación" body={error} /> : null}
        {!election && !error ? <Big title="Cargando…" /> : null}
        {election && (phase === "registration" || phase === "draft") ? <RegistrationView election={election} room={room} counts={counts} hasToken={hasToken} now={now} /> : null}
        {election && tally && (phase === "open" || phase === "closed" || phase === "tallying") ? <LiveView tally={tally} phase={phase} electionId={electionId} origin={origin} now={now} /> : null}
        {election && tally && (phase === "auditable" || phase === "failed") ? <ResultView election={election} tally={tally} audit={audit} auditMissing={auditMissing} electionId={electionId} origin={origin} /> : null}
        {election && phase === "drawn" ? <DrawnView election={election} tally={tally} audit={audit} draw={draw} electionId={electionId} origin={origin} /> : null}
      </main>
      <footer className="hidden items-center justify-between md:flex gap-4 border-t-2 border-[#0B1626]/30 px-[3vw] py-[1vh] text-[clamp(0.85rem,1.1vw,1.25rem)] font-semibold text-[#2C3A4E]">
        <span>Quórum · el resultado lo confirma el verificador independiente, no el organizador.</span>
        <span>Sin datos individuales: sólo agregados.</span>
      </footer>
    </div>
  );
}

function Big({ title, body }: { title: string; body?: string }) {
  return (
    <div className="m-auto text-center">
      <p className="text-[clamp(2rem,5vw,5rem)] font-extrabold">{title}</p>
      {body ? <p className="mt-4 text-[clamp(1rem,2vw,2rem)]">{body}</p> : null}
    </div>
  );
}

function RegistrationView({ election, room, counts, hasToken, now }: { election: ElectionV1; room: RoomStatus | null; counts: VotersListV1["counts"] | null; hasToken: boolean; now: number | null }) {
  const left = room?.open ? remaining(room.expiresAt, now) : null;
  const joinUrl = room?.joinUrl ?? null;
  const ready = counts?.withIdentity ?? counts?.registered ?? null;
  return (
    <div className="flex w-full flex-col gap-6 md:grid md:min-h-0 md:grid-cols-[auto_1fr] md:items-center md:gap-[4vw]">
      <div className="flex min-h-0 flex-col items-center gap-[1.5vh]">
        {room?.open && joinUrl ? (
          <>
            <QrCode value={joinUrl} label={`Código QR para entrar a la sala: ${joinUrl}`} className="size-[min(84vw,62vh)] md:size-[min(62vh,44vw)] border-[6px] border-[#0B1626]" />
            <p className="q-mono max-w-[84vw] md:max-w-[min(62vh,44vw)] break-all text-center text-[clamp(1rem,1.7vw,2rem)] font-bold" data-testid="projector-join-url">
              {joinUrl}
            </p>
          </>
        ) : (
          <div className="flex size-[min(84vw,62vh)] md:size-[min(62vh,44vw)] items-center justify-center border-[6px] border-dashed border-[#0B1626]/40 p-8 text-center text-[clamp(1.1rem,2vw,2.2rem)] font-bold">
            {!room ? "Cargando sala…" : !room.open ? (room.closedReason === "expired" ? "La sala expiró" : room.closedReason === "election-opened" ? "La votación comenzó" : room.maxSeats === null ? "La sala aún no está abierta" : "La sala está cerrada") : !hasToken ? "Abre el proyector desde el panel del organizador para mostrar el QR" : "Cargando QR…"}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-[3vh]">
        <p className="text-[clamp(1.5rem,3vw,3.5rem)] font-bold leading-tight" data-testid="projector-instruction">
          {election.eligibility?.method === "event-badge" ? "Escanea este código y luego tu credencial" : "Escanea con tu teléfono para votar"}
        </p>
        {room?.roomCode ? (
          <p className="text-[clamp(1.2rem,2.2vw,2.6rem)] font-semibold">
            o entra y escribe el código{" "}
            <span className="q-mono rounded-lg bg-[#0B1626] px-4 py-1 text-[clamp(2rem,5vw,6rem)] font-extrabold tracking-[0.2em] text-white" data-testid="projector-code">
              {room.roomCode}
            </span>
          </p>
        ) : null}
        <div aria-live="polite">
          <p className="text-[clamp(3rem,9vw,11rem)] font-extrabold leading-none tabular-nums" data-testid="projector-seats">
            {room ? formatInt(room.seatsTaken) : "—"}
            <span className="text-[0.45em] font-bold"> de {room?.maxSeats !== null && room?.maxSeats !== undefined ? formatInt(room.maxSeats) : "—"} inscritos</span>
          </p>
          {ready !== null ? <p className="mt-2 text-[clamp(1.1rem,2vw,2.4rem)] font-semibold">{formatInt(ready)} ya vincularon su teléfono</p> : null}
        </div>
        {left ? (
          <p className="text-[clamp(1.4rem,3vw,3.6rem)] font-bold tabular-nums" data-testid="projector-countdown">
            La entrada cierra en {left}
          </p>
        ) : null}
        <p className="text-[clamp(1rem,1.5vw,1.8rem)] text-[#2C3A4E]">Entras con un nombre o apodo. El descriptor facial (demo) se borra al abrir la votación.</p>
        {election.status === "draft" ? <p className="text-[clamp(1rem,1.5vw,1.8rem)] font-bold">La inscripción todavía no abre.</p> : null}
      </div>
    </div>
  );
}

function Bars({ tally, highlight }: { tally: AggregatesV1; highlight?: string | null }) {
  const total = tally.options.reduce((s, o) => s + (o.count ?? 0), 0);
  const max = Math.max(1, ...tally.options.map((o) => o.count ?? 0));
  return (
    <ul className="flex min-h-0 flex-col justify-center gap-[1.2vh]" data-testid="projector-bars">
      {tally.options.map((o) => (
        <li key={o.id} className="grid grid-cols-[minmax(6rem,22%)_1fr_auto] items-center gap-4">
          <span className="truncate text-[clamp(1.1rem,2.2vw,2.6rem)] font-bold">
            {o.label}
            {highlight === o.id ? " ★" : ""}
          </span>
          <span className="h-[clamp(1rem,3.6vh,3rem)] rounded-md bg-[#E3E7EE]">
            <span className="block h-full rounded-md bg-[#182B45]" style={{ width: `${((o.count ?? 0) / max) * 100}%` }} />
          </span>
          <span className="min-w-[5ch] text-right text-[clamp(1.1rem,2.2vw,2.6rem)] font-extrabold tabular-nums">
            {o.count === null ? "—" : `${formatInt(o.count)}${total ? ` · ${formatPercent(o.count / total)}` : ""}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function LiveView({ tally, phase, electionId, origin, now }: { tally: AggregatesV1; phase: string; electionId: string; origin: string; now: number | null }) {
  const hasBreakdown = tally.options.some((o) => o.count !== null);
  const left = phase === "open" ? remaining(tally.closesAt, now) : null;
  const liveUrl = origin ? `${origin}/e/${encodeURIComponent(electionId)}/live` : null;
  return (
    <div className="flex w-full flex-col gap-6 md:grid md:min-h-0 md:grid-cols-[1fr_auto] md:gap-[4vw]">
      <div className="flex min-h-0 flex-col gap-[3vh]">
        <div aria-live="polite">
          <p className="text-[clamp(1.2rem,2.2vw,2.6rem)] font-bold">Participación</p>
          <p className="text-[clamp(3rem,9vw,11rem)] font-extrabold leading-none tabular-nums" data-testid="projector-turnout">
            {formatInt(tally.totalVotes)}
            <span className="text-[0.45em] font-bold">
              {" "}
              de {formatInt(tally.eligible)} · {formatPercent(tally.turnout)}
            </span>
          </p>
        </div>
        {hasBreakdown ? (
          <Bars tally={tally} />
        ) : (
          <p className="text-[clamp(1.3rem,2.6vw,3rem)] font-bold" data-testid="projector-batch-note">
            El conteo por opción aparece cuando el servidor lo publica (por lotes de 5 boletas).
          </p>
        )}
        {phase === "open" && left ? <p className="text-[clamp(1.3rem,2.6vw,3rem)] font-bold tabular-nums">Cierra en {left}</p> : null}
        {phase !== "open" ? <p className="text-[clamp(1.3rem,2.6vw,3rem)] font-bold">Votación cerrada: generando el paquete de auditoría y corriendo el verificador…</p> : null}
      </div>
      {liveUrl ? <PhoneQr url={liveUrl} caption="Síguelo en tu teléfono" /> : null}
    </div>
  );
}

function PhoneQr({ url, caption }: { url: string; caption: string }) {
  return (
    <div className="flex flex-col items-center gap-2 self-center">
      <QrCode value={url} label={`${caption}: ${url}`} className="size-[min(60vw,34vh)] md:size-[min(34vh,24vw)] border-4 border-[#0B1626]" />
      <p className="text-center text-[clamp(1.1rem,2vw,2.2rem)] font-extrabold">{caption}</p>
      <p className="q-mono max-w-[80vw] md:max-w-[min(34vh,24vw)] break-all text-center text-[clamp(0.8rem,1vw,1.2rem)]">{url}</p>
    </div>
  );
}

function VerifierBlock({ election, audit, auditMissing }: { election: ElectionV1; audit: LooseAudit | null; auditMissing: boolean }) {
  const tx = election.anchor?.txHash ?? null;
  const txUrl = tx && election.anchor ? basescanTxUrl(election.anchor.chainId, tx) : null;
  if (!audit) {
    return (
      <div className="flex flex-col gap-2" data-testid="projector-verifier">
        <StatusPill status="no verificable" size="lg" className="w-fit text-[clamp(1rem,1.8vw,2rem)]" />
        <p className="text-[clamp(1rem,1.6vw,1.8rem)] font-semibold">{auditMissing ? "No hay resultado del verificador publicado." : "Leyendo el resultado del verificador…"}</p>
      </div>
    );
  }
  const a = audit.auditResult;
  const { overall, partial } = auditTriState(a);
  const anchorText = anchorModeText(audit.anchorStatus);
  return (
    <div className="flex min-h-0 flex-col gap-[1.2vh]" data-testid="projector-verifier">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={overall} size="lg" className="text-[clamp(1.1rem,2.2vw,2.6rem)] [&_svg]:size-[1.2em]" />
        {partial ? <span className="rounded-full border-2 border-[#B7791F] bg-[#FFF4E0] px-3 py-1 text-[clamp(0.9rem,1.4vw,1.6rem)] font-bold text-[#6B4410]">parcial: hay comprobaciones no evaluadas</span> : null}
      </div>
      <p className="text-[clamp(0.9rem,1.3vw,1.5rem)]">
        Verificador {a.verifierVersion ?? "(sin versión)"} ejecutado en el servidor · entrada <span className="q-mono font-bold">{shortHash(a.inputArtifactDigest ?? audit.packageDigest, 16, 6)}</span>
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-[clamp(0.85rem,1.2vw,1.4rem)]">
        {a.checks.map((c) => {
          const s = checkTriState(c);
          return (
            <li key={c.name} className="flex items-center gap-2">
              <span className="font-extrabold" aria-hidden="true">
                {s === "verificado" ? "✓" : s === "fallo detectado" ? "✗" : "?"}
              </span>
              <span>
                {checkLabel[c.name] ?? c.name}: <strong>{s}</strong>
              </span>
            </li>
          );
        })}
      </ul>
      {tx ? (
        <p className="text-[clamp(0.9rem,1.3vw,1.5rem)]">
          Ancla en Base: {txUrl ? <a href={txUrl} target="_blank" rel="noreferrer" className="q-mono font-bold underline">{shortHash(tx, 12, 8)}</a> : <span className="q-mono font-bold">{shortHash(tx, 12, 8)}</span>}
        </p>
      ) : anchorText ? (
        <p className="text-[clamp(0.85rem,1.2vw,1.4rem)] text-[#2C3A4E]">Ancla: {anchorText}</p>
      ) : null}
    </div>
  );
}

function ResultView({ election, tally, audit, auditMissing, electionId, origin }: { election: ElectionV1; tally: AggregatesV1; audit: LooseAudit | null; auditMissing: boolean; electionId: string; origin: string }) {
  const lead = leadingOption(tally.options);
  const verifyUrl = origin ? `${origin}/e/${encodeURIComponent(electionId)}#verificar` : null;
  return (
    <div className="flex w-full flex-col gap-6 md:grid md:min-h-0 md:grid-cols-[1fr_auto] md:gap-[4vw]">
      <div className="flex min-h-0 flex-col gap-[2.5vh]">
        <p className="text-[clamp(1.6rem,3.6vw,4.4rem)] font-extrabold leading-tight" data-testid="projector-result">
          {lead ? `Resultado publicado: ${lead.label}` : "Resultado publicado"}
          <span className="block text-[0.5em] font-bold">
            {formatInt(tally.totalVotes)} boletas de {formatInt(tally.eligible)} en el padrón
          </span>
        </p>
        <Bars tally={tally} highlight={lead?.id} />
        <VerifierBlock election={election} audit={audit} auditMissing={auditMissing} />
      </div>
      {verifyUrl ? <PhoneQr url={verifyUrl} caption="Verifícalo en tu teléfono" /> : null}
    </div>
  );
}

function DrawnView({ election, tally, audit, draw, electionId, origin }: { election: ElectionV1; tally: AggregatesV1 | null; audit: LooseAudit | null; draw: DrawInfo | null; electionId: string; origin: string }) {
  const drawUrl = origin ? `${origin}/e/${encodeURIComponent(electionId)}/draw` : null;
  const labels = new Map((draw?.candidates ?? election.candidates ?? []).map((c) => [c.id, c.label]));
  const winners = draw?.winners ?? election.draw?.winners ?? [];
  const lead = tally ? leadingOption(tally.options) : null;
  return (
    <div className="flex w-full flex-col gap-6 md:grid md:min-h-0 md:grid-cols-[1fr_auto] md:gap-[4vw]">
      <div className="flex min-h-0 flex-col gap-[2.5vh]">
        <p className="text-[clamp(1.2rem,2.2vw,2.6rem)] font-bold">
          Sorteo verificable{lead ? ` · opción ganadora: ${lead.label}` : ""}
          {tally ? ` · ${formatInt(tally.totalVotes)} boletas` : ""}
        </p>
        {winners.length ? (
          <ol className="flex flex-col gap-[1.5vh]" data-testid="projector-winners">
            {winners.map((w, i) => (
              <li key={w} className="flex items-baseline gap-4 text-[clamp(1.8rem,4.2vw,5rem)] font-extrabold leading-tight">
                <span className="tabular-nums text-[#147D68]">{i + 1}.</span>
                <span>{labels.get(w) ?? w}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[clamp(1.4rem,3vw,3.4rem)] font-bold">Leyendo el sorteo…</p>
        )}
        {draw ? (
          <p className="text-[clamp(0.9rem,1.3vw,1.5rem)]">
            Semilla <span className="q-mono font-bold">{shortHash(draw.seed, 14, 6)}</span> = f(hash final del registro <span className="q-mono font-bold">{shortHash(draw.finalHash, 10, 6)}</span>) · {draw.method ?? "método publicado"}
          </p>
        ) : null}
        <VerifierBlock election={election} audit={audit} auditMissing={false} />
      </div>
      {drawUrl ? <PhoneQr url={drawUrl} caption="Recompútalo en tu teléfono" /> : null}
    </div>
  );
}
