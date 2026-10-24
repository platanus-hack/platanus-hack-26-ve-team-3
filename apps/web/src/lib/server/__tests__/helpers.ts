import { MemoryStore, setStoreForTests } from "../store";

type Handler<P> = (req: Request, ctx?: { params: Promise<P> }) => Promise<Response>;

export async function call<P = Record<string, never>>(
  handler: Handler<P>,
  opts: { method?: string; path?: string; body?: unknown; params?: P; headers?: Record<string, string>; rawBody?: string } = {},
) {
  const method = opts.method ?? (opts.body !== undefined || opts.rawBody !== undefined ? "POST" : "GET");
  const init: RequestInit = { method, headers: { "content-type": "application/json", ...(opts.headers ?? {}) } };
  if (opts.rawBody !== undefined) init.body = opts.rawBody;
  else if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  const req = new Request(`http://localhost:3000${opts.path ?? "/api"}`, init);
  const res = await handler(req, opts.params ? { params: Promise.resolve(opts.params) } : undefined);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, headers: res.headers, json: json as any };
}

export function freshStore() {
  const store = new MemoryStore();
  setStoreForTests(store);
  return store;
}

export function sampleElection(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    title: "Fecha de la asamblea del condominio Los Samanes (ficticio)",
    description: "Elección de prueba; opciones neutrales.",
    kind: "multiple",
    options: [
      { id: "sab", label: "Sábado 10:00" },
      { id: "dom", label: "Domingo 10:00" },
      { id: "mie", label: "Miércoles 19:00" },
    ],
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 3_600_000).toISOString(),
    ...overrides,
  };
}

export function descriptor(seed = 1, dims = 128): number[] {
  // Determinista por seed; parecido a un embedding normalizado.
  let x = seed * 9301 + 49297;
  return Array.from({ length: dims }, () => {
    x = (x * 233280 + 1) % 2147483647;
    return (x / 2147483647) * 2 - 1;
  });
}
