/** Formateo es-VE, zona America/Caracas. */
const LOCALE = "es-VE";
const TZ = "America/Caracas";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d);
}

/** Sólo la fecha (sin hora): se usa con `votedAt` para no exponer la hora del voto (correlación hora ↔ boleta). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "long", timeZone: TZ }).format(d);
}

export function formatPercent(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: digits }).format(v);
}

export function formatInt(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat(LOCALE).format(v);
}

export function shortHash(h: string | null | undefined, head = 10, tail = 6): string {
  if (!h) return "—";
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "Cerrada";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${m}:${String(sec).padStart(2, "0")} min`;
}

export const statusLabel: Record<string, string> = {
  draft: "Borrador",
  open: "Abierta",
  closed: "Cerrada",
  tallying: "Contando votos",
  auditable: "Resultado publicado",
  failed: "Falló la comprobación",
};

export const kindLabel: Record<string, string> = {
  "yes-no": "Sí / No",
  multiple: "Opción múltiple",
  ranking: "Orden de preferencia",
  budget: "Presupuesto",
};
