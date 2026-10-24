# Research 04 — Resultados en vivo con UI generativa (Next.js + Vercel + Claude)

Fecha de consulta: 2026-10-24. Versiones verificadas con `npm view`.

## Decisión recomendada
1. **El LLM genera solo un layout (JSON validado con Zod) una vez por votación**, al crearla; se guarda en la BD. No se llama al LLM por refresco ni por viewer.
2. **El servidor inyecta los números**; el layout solo referencia claves (`metric: "turnout"`, `series: "options"`). El modelo nunca ve títulos de opciones ni cifras → sin alucinación y sin prompt injection.
3. **Tiempo real: polling cada 3 s** a un route handler de agregados con `Cache-Control: public, s-maxage=2, stale-while-revalidate=5`. Upgrade natural: Supabase Broadcast si ya usamos Supabase.
4. **Gráficos:** shadcn/ui `chart` (Recharts 3) con `accessibilityLayer` + tabla `sr-only`.
5. Stack: `ai@7.0.152`, `@ai-sdk/react@4.0.156`, `zod@4.6.7`, `next@16.4.3`, `recharts@3.10.1`; modelo Gateway `anthropic/claude-sonnet-5.5` (con punto; `claude-haiku-5.5` sobra para elegir tiles).

## AI SDK 7 — estado
- AI SDK 7.0 (25-jun-2026): `system` → `instructions`; `experimental_output` → `output` (`result.output`); `onStepFinish` → `onStepEnd`.
- **RSC / `streamUI`**: "experimental", desarrollo pausado. No usar.
- **`generateObject`/`streamObject`**: deprecados desde SDK 6 (siguen exportados en 7). Usar `generateText({ output: Output.object({ schema }) })`. Si no valida: `NoObjectGeneratedError` → fallback a layout por defecto.
- **json-render** (vercel-labs, 0.21.3, Apache-2.0): catálogo de componentes + `Renderer`; más potente de lo necesario. Para Quórum basta un esquema Zod de 5 tiles + `switch`. Opción "wow" si sobra tiempo: `@json-render/shadcn`.
- Alternativas (Thesys OpenUI, CopilotKit): sobredimensionadas para un dashboard público sin chat.

## Esquema + generación (servidor)
```ts
import { generateText, Output } from "ai";
import { z } from "zod";
export const Tile = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stat"), metric: z.enum(["turnout", "totalVotes", "leadingShare"]) }),
  z.object({ type: z.literal("bar-chart"), series: z.literal("options"), orientation: z.enum(["horizontal", "vertical"]) }),
  z.object({ type: z.literal("donut"), series: z.literal("options") }),
  z.object({ type: z.literal("countdown") }),
  z.object({ type: z.literal("text"), template: z.enum(["howToRead", "privacyNote", "rankingHint", "budgetHint"]) }),
]);
export const Layout = z.object({ columns: z.enum(["1", "2", "3"]), tiles: z.array(Tile).min(2).max(6) });
export type Layout = z.infer<typeof Layout>;
export async function generateLayout(input: { kind: "yes-no" | "multiple" | "ranking" | "budget"; optionCount: number; durationMin: number }) {
  const { output } = await generateText({
    model: "anthropic/claude-sonnet-5.5",
    instructions: "Eres un diseñador de dashboards de votación. Elige SOLO tiles del esquema. No inventes textos ni números: los datos los inyecta el servidor. yes-no → donut + stat turnout; multiple → bar-chart horizontal; ranking → bar-chart + rankingHint; budget → bar-chart vertical + budgetHint. Siempre incluye countdown.",
    prompt: JSON.stringify(input),
    output: Output.object({ schema: Layout }),
  });
  return output;
}
```

## Renderer (cliente)
```tsx
export type Aggregates = { turnout: number; totalVotes: number; leadingShare: number; closesAt: string; options: { id: string; label: string; count: number }[] };
export function LiveDashboard({ layout, data }: { layout: Layout; data: Aggregates }) {
  return (<div className={`grid gap-4 grid-cols-${layout.columns}`}>{layout.tiles.map((t, i) => {
    switch (t.type) {
      case "stat": return <StatTile key={i} label={t.metric} value={data[t.metric]} />;
      case "bar-chart": return <BarTile key={i} data={data.options} orientation={t.orientation} />;
      case "donut": return <DonutTile key={i} data={data.options} />;
      case "countdown": return <CountdownTile key={i} closesAt={data.closesAt} />;
      case "text": return <TextTile key={i} template={t.template} />;
    }
  })}</div>);
}
```

## Tiempo real (comparativa)
| Opción | Veredicto |
|---|---|
| Polling 3 s + cache CDN | **Recomendado**; cero infra, N viewers comparten una consulta |
| SSE route handler (Node/Fluid) | OK; reconexión a los 300 s; sin fan-out entre instancias |
| Supabase Realtime Broadcast | Si ya hay Supabase; Free 200 conexiones |
| Pusher/Ably | Cuenta extra; 200 conexiones pueden quedar cortas |
| Vercel WebSockets | Overkill; dev local solo con `vc dev` |

```ts
// app/api/elections/[id]/tally/route.ts
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAggregates(id); // SOLO agregados
  return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=5" } });
}
```

## Riesgos
- **Alucinación de números:** imposible por esquema (enums, sin texto libre).
- **Prompt injection:** los títulos de opciones nunca llegan al modelo (solo `{kind, optionCount, durationMin}`).
- **Coste/latencia:** ~1 llamada por votación (~$0.005, 1–3 s). Fallback hard-coded por `kind`; precalentar los 4 layouts en el seed para que la demo no dependa del LLM en vivo.
- **Privacidad:** con <5 votos ocultar desglose por opción, mostrar solo turnout.

## No verificado
`@deprecated` formal en `streamUI`; fecha GA de WebSockets en Vercel; `accessibilityLayer` por defecto en Recharts 3.

## Fuentes
https://vercel.com/blog/ai-sdk-7 · https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0 · https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data · https://ai-sdk.dev/docs/ai-sdk-rsc/overview · https://vercel.com/docs/ai-gateway/sdks-and-apis/ai-sdk · https://vercel.com/ai-gateway/models/claude-sonnet-5.5 · https://github.com/vercel-labs/json-render · https://vercel.com/kb/guide/publish-and-subscribe-to-realtime-data-on-vercel · https://supabase.com/docs/guides/realtime/broadcast · https://ui.shadcn.com/docs/components/chart · https://genai.owasp.org/llmrisk/llm01-prompt-injection/
