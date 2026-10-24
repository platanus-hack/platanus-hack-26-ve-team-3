/**
 * Layout generativo de resultados en vivo (D-06): el LLM elige tiles, NUNCA cifras ni textos.
 * Al modelo solo se le envía `{ kind, optionCount, durationMin }` — nunca título, opciones ni votos.
 * Sin `AI_GATEWAY_API_KEY` se usa un layout fijo por `kind`.
 */
import { LiveLayout, type Election, type ElectionKind } from "@quorum/contracts";
import { env } from "./env";

export const DEFAULT_LAYOUTS: Record<ElectionKind, LiveLayout> = {
  "yes-no": {
    columns: "2",
    tiles: [
      { type: "stat", metric: "turnout" },
      { type: "donut", series: "options" },
      { type: "countdown" },
      { type: "text", template: "privacyNote" },
    ],
  },
  multiple: {
    columns: "3",
    tiles: [
      { type: "stat", metric: "turnout" },
      { type: "stat", metric: "leadingShare" },
      { type: "countdown" },
      { type: "bar-chart", series: "options", orientation: "horizontal" },
      { type: "text", template: "howToRead" },
    ],
  },
  ranking: {
    columns: "2",
    tiles: [
      { type: "stat", metric: "totalVotes" },
      { type: "bar-chart", series: "options", orientation: "vertical" },
      { type: "text", template: "rankingHint" },
      { type: "countdown" },
    ],
  },
  budget: {
    columns: "2",
    tiles: [
      { type: "stat", metric: "turnout" },
      { type: "bar-chart", series: "options", orientation: "horizontal" },
      { type: "text", template: "budgetHint" },
      { type: "countdown" },
    ],
  },
};

export interface LayoutHints {
  kind: ElectionKind;
  optionCount: number;
  durationMin: number;
}

export function layoutHints(election: Pick<Election, "kind" | "options" | "startsAt" | "endsAt">): LayoutHints {
  const ms = Date.parse(election.endsAt) - Date.parse(election.startsAt);
  return { kind: election.kind, optionCount: election.options.length, durationMin: Math.max(1, Math.round(ms / 60000)) };
}

export function defaultLayout(kind: ElectionKind): LiveLayout {
  return structuredClone(DEFAULT_LAYOUTS[kind]);
}

const INSTRUCTIONS = `Eres el diseñador del tablero de resultados en vivo de una votación.
Elige una grilla de tiles (2 a 6) para mostrar agregados. No conoces ni debes inventar cifras,
títulos u opciones: solo recibes el tipo de votación, cuántas opciones hay y la duración en minutos.
Reglas: incluye siempre un "countdown"; para "yes-no" prefiere "donut"; para "multiple" con más de 4 opciones
prefiere "bar-chart" horizontal; para "ranking" incluye el texto "rankingHint"; para "budget" incluye "budgetHint".
Nunca repitas el mismo tile de texto. Devuelve solo el objeto.`;

/**
 * Genera el layout con AI Gateway (`anthropic/claude-haiku-5.5`) si hay clave; valida con Zod y
 * cae al default si falla cualquier cosa (red, parseo, validación, timeout).
 */
export async function generateLayout(hints: LayoutHints, opts: { timeoutMs?: number } = {}): Promise<{ layout: LiveLayout; source: "llm" | "default" }> {
  const apiKey = env.aiGatewayKey;
  if (!apiKey) return { layout: defaultLayout(hints.kind), source: "default" };
  try {
    const { generateText, Output, createGateway } = await import("ai");
    const gateway = createGateway({ apiKey });
    const result = await generateText({
      model: gateway("anthropic/claude-haiku-5.5"),
      instructions: INSTRUCTIONS,
      prompt: JSON.stringify(hints),
      output: Output.object({ schema: LiveLayout }),
      timeout: opts.timeoutMs ?? 8000,
      maxRetries: 1,
    });
    const parsed = LiveLayout.safeParse(result.output);
    if (!parsed.success) return { layout: defaultLayout(hints.kind), source: "default" };
    return { layout: parsed.data, source: "llm" };
  } catch (err) {
    console.warn("[layout] LLM falló, usando default:", err instanceof Error ? err.message : String(err));
    return { layout: defaultLayout(hints.kind), source: "default" };
  }
}

/** Layout guardado en la elección si es válido; si no, default por `kind`. */
export function layoutOf(election: Election): LiveLayout {
  const parsed = LiveLayout.safeParse(election.layout);
  return parsed.success ? parsed.data : defaultLayout(election.kind);
}
