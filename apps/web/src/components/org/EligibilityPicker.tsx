"use client";

import { BadgeUrlPrefix, DEFAULT_BADGE_URL_PREFIX, parseBadgeUrl, type BadgeCheck, type EligibilityInput } from "@quorum/contracts";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/** Borrador del selector "¿Quién puede votar?" (D-19). El rostro es obligatorio siempre: aquí no se elige. */
export type EligibilityDraft = { method: "open-alias" | "event-badge"; badgeCheck: BadgeCheck; allowlist: string; prefix: string };
export const DEFAULT_ELIGIBILITY: EligibilityDraft = { method: "event-badge", badgeCheck: "live", allowlist: "", prefix: DEFAULT_BADGE_URL_PREFIX };

const METHODS = [
  { id: "event-badge", label: "Credencial del evento", cost: "Cada participante escanea el QR de su credencial: unos segundos por persona y una credencial vale una sola vez.", recommended: true },
  { id: "open-alias", label: "Apodo libre", cost: "Cualquiera con el código de la sala entra con un apodo. No hay que preparar nada, pero entra quien esté en la sala." },
  { id: "list", label: "Lista (correo o cédula)", cost: "Solo las personas de una lista que cargas tú.", soon: true },
] as const;

const CHECKS: { id: BadgeCheck; label: string; cost: string }[] = [
  { id: "live", label: "En vivo, con la página del evento", cost: "El servidor pregunta a la página de la credencial si existe (hasta 3 s la primera vez; luego queda en memoria). Depende de que esa página responda." },
  { id: "list", label: "Con una lista que cargo yo", cost: "No depende de internet. Pega los usuarios de GitHub de los participantes; se guardan cifrados (solo una huella), nunca en claro." },
  { id: "none", label: "Sin comprobar", cost: "Basta con que el QR tenga el formato de la credencial. Más rápido, pero cualquiera que conozca un usuario puede entrar una vez." },
];

/** Usuarios de la lista: uno por línea (o separados por comas/espacios); acepta @usuario o la URL completa de la credencial. */
export function parseAllowlist(text: string, prefix: string): { users: string[]; bad: string[] } {
  const users: string[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const fromUrl = parseBadgeUrl(raw, prefix);
    const u = fromUrl ?? raw.replace(/^@/, "");
    if (/^[A-Za-z0-9-]{1,39}$/.test(u)) users.push(u);
    else bad.push(raw);
  }
  return { users: [...new Set(users.map((u) => u.toLowerCase()))], bad };
}

export function eligibilityInputOf(d: EligibilityDraft): { ok: true; value: EligibilityInput } | { ok: false; error: string } {
  if (d.method === "open-alias") return { ok: true, value: { method: "open-alias" } };
  const prefix = d.prefix.trim() || DEFAULT_BADGE_URL_PREFIX;
  if (!BadgeUrlPrefix.safeParse(prefix).success) return { ok: false, error: "El prefijo de la credencial debe empezar por https:// y terminar en /." };
  if (d.badgeCheck !== "list") return { ok: true, value: { method: "event-badge", badgeCheck: d.badgeCheck, badgeUrlPrefix: prefix } };
  const { users, bad } = parseAllowlist(d.allowlist, prefix);
  if (bad.length) return { ok: false, error: `No parecen usuarios de GitHub: ${bad.slice(0, 3).join(", ")}${bad.length > 3 ? "…" : ""}` };
  if (users.length === 0) return { ok: false, error: "Pega al menos un usuario en la lista." };
  return { ok: true, value: { method: "event-badge", badgeCheck: "list", badgeUrlPrefix: prefix, badgeAllowlist: users } };
}

export const methodLabel: Record<EligibilityDraft["method"], string> = { "event-badge": "Credencial del evento", "open-alias": "Apodo libre" };
export const checkLabel: Record<BadgeCheck, string> = { live: "en vivo", list: "con lista", none: "sin comprobar" };

/** "¿Quién puede votar?" — asistente de creación y tarjeta de la sala. */
export function EligibilityPicker({ value, onChange, disabled, idPrefix = "elig" }: { value: EligibilityDraft; onChange: (d: EligibilityDraft) => void; disabled?: boolean; idPrefix?: string }) {
  const listInfo = value.badgeCheck === "list" ? parseAllowlist(value.allowlist, value.prefix || DEFAULT_BADGE_URL_PREFIX) : null;
  return (
    <div className="flex flex-col gap-4" data-testid="eligibility-picker">
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 text-body font-semibold">¿Quién puede votar?</legend>
        {METHODS.map((m) => {
          const soon = "soon" in m && m.soon;
          return (
            <label key={m.id} className={`flex min-h-tap items-start gap-3 rounded-md border p-3 ${value.method === m.id ? "border-primary bg-muted" : "border-border"} ${soon ? "opacity-60" : "cursor-pointer"}`}>
              <input
                type="radio"
                name={`${idPrefix}-method`}
                value={m.id}
                checked={value.method === m.id}
                disabled={soon || disabled}
                onChange={() => !soon && onChange({ ...value, method: m.id as EligibilityDraft["method"] })}
                className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {m.label}
                  {"recommended" in m && m.recommended ? <Badge tone="success">Recomendado para el evento</Badge> : null}
                  {soon ? <Badge tone="neutral">Próximamente</Badge> : null}
                </span>
                <span className="text-small text-muted-foreground">{m.cost}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {value.method === "event-badge" ? (
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <legend className="mb-1 text-body font-semibold">¿Cómo comprobamos la credencial?</legend>
          {CHECKS.map((c) => (
            <label key={c.id} className="flex min-h-tap cursor-pointer items-start gap-3">
              <input type="radio" name={`${idPrefix}-check`} value={c.id} checked={value.badgeCheck === c.id} onChange={() => onChange({ ...value, badgeCheck: c.id })} className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]" />
              <span className="flex flex-col">
                <span className="font-semibold">{c.label}</span>
                <span className="text-small text-muted-foreground">{c.cost}</span>
              </span>
            </label>
          ))}
          {value.badgeCheck === "list" ? (
            <Field label="Usuarios permitidos (uno por línea)" htmlFor={`${idPrefix}-allowlist`} hint={`${listInfo?.users.length ?? 0} usuarios${listInfo?.bad.length ? ` · ${listInfo.bad.length} no válidos` : ""}. Acepta usuario, @usuario o la URL de la credencial.`}>
              <Textarea id={`${idPrefix}-allowlist`} value={value.allowlist} onChange={(e) => onChange({ ...value, allowlist: e.target.value })} placeholder={"usuario-1\nusuario-2"} rows={4} />
            </Field>
          ) : null}
          <details>
            <summary className="min-h-tap cursor-pointer text-small font-semibold text-primary-ink">Avanzado: dirección de la credencial</summary>
            <Field label="Prefijo de la URL del QR" htmlFor={`${idPrefix}-prefix`} hint="El usuario va justo después. Por defecto, la credencial de Platanus Hack 26 Caracas.">
              <Input id={`${idPrefix}-prefix`} value={value.prefix} onChange={(e) => onChange({ ...value, prefix: e.target.value })} className="q-mono" />
            </Field>
          </details>
        </fieldset>
      ) : null}

      <p className="text-small text-muted-foreground">El rostro se comprueba siempre: impide que una misma persona entre dos veces (o con varias credenciales). No guardamos fotos.</p>
    </div>
  );
}
