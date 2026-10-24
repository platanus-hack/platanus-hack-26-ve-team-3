"use client";

import { BadgeUrlPrefix, DEFAULT_BADGE_URL_PREFIX, parseBadgeUrl, type BadgeCheck, type EligibilityInput } from "@quorum/contracts";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Disclosure } from "@/components/ui/disclosure";

/** Borrador del selector "¿Quién puede votar?" (D-19). El rostro es obligatorio siempre: aquí no se elige. */
export type EligibilityDraft = { method: "open-alias" | "event-badge"; badgeCheck: BadgeCheck; allowlist: string; prefix: string };
export const DEFAULT_ELIGIBILITY: EligibilityDraft = { method: "event-badge", badgeCheck: "live", allowlist: "", prefix: DEFAULT_BADGE_URL_PREFIX };

const METHODS = [
  { id: "event-badge", label: "Credencial del evento", cost: "Escanean el QR de su credencial. Una por persona.", recommended: true },
  { id: "open-alias", label: "Apodo libre", cost: "Entra quien tenga el código de la sala." },
] as const;

const CHECKS: { id: BadgeCheck; label: string; cost: string }[] = [
  { id: "live", label: "En vivo", cost: "Se consulta la página del evento." },
  { id: "list", label: "Con mi lista", cost: "Pegas los usuarios permitidos. Funciona sin internet." },
  { id: "none", label: "Sin comprobar", cost: "Más rápido, pero menos seguro." },
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
        <legend className="mb-2 text-small font-medium text-muted-foreground">¿Quién puede votar?</legend>
        {METHODS.map((m) => {
          return (
            <label key={m.id} className={`flex min-h-tap cursor-pointer items-start gap-3 rounded-md border bg-card p-4 transition-colors ${value.method === m.id ? "border-foreground shadow-card" : "border-border hover:border-subtle"}`}>
              <input
                type="radio"
                name={`${idPrefix}-method`}
                value={m.id}
                checked={value.method === m.id}
                disabled={disabled}
                onChange={() => onChange({ ...value, method: m.id as EligibilityDraft["method"] })}
                className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  {m.label}
                  {"recommended" in m && m.recommended ? <Badge tone="success">Recomendado</Badge> : null}
                </span>
                <span className="text-small text-muted-foreground">{m.cost}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {value.method === "event-badge" ? (
        <fieldset className="flex flex-col gap-2" disabled={disabled}>
          <ChoiceChips name={`${idPrefix}-check`} legend="¿Cómo se comprueba?" choices={CHECKS.map((c) => ({ value: c.id, label: c.label }))} value={value.badgeCheck} onChange={(v) => onChange({ ...value, badgeCheck: v })} />
          <p className="text-small text-muted-foreground">{CHECKS.find((c) => c.id === value.badgeCheck)?.cost}</p>
          {value.badgeCheck === "list" ? (
            <Field label="Usuarios permitidos (uno por línea)" htmlFor={`${idPrefix}-allowlist`} hint={`${listInfo?.users.length ?? 0} usuarios${listInfo?.bad.length ? ` · ${listInfo.bad.length} no válidos` : ""}. Acepta usuario, @usuario o la URL de la credencial.`}>
              <Textarea id={`${idPrefix}-allowlist`} value={value.allowlist} onChange={(e) => onChange({ ...value, allowlist: e.target.value })} placeholder={"usuario-1\nusuario-2"} rows={4} />
            </Field>
          ) : null}
          <Disclosure title="Avanzado">
            <Field label="Dirección del QR de la credencial" htmlFor={`${idPrefix}-prefix`} hint="Déjalo así si usas la credencial de Platanus Hack.">
              <Input id={`${idPrefix}-prefix`} value={value.prefix} onChange={(e) => onChange({ ...value, prefix: e.target.value })} className="q-mono" />
            </Field>
          </Disclosure>
        </fieldset>
      ) : null}

      <p className="text-small text-muted-foreground">Siempre se comprueba el rostro para evitar duplicados. No guardamos fotos.</p>
    </div>
  );
}
