/**
 * Webhook de Kapso — plan B4 (opt-in) de research/03:
 * el votante envía "QUORUM <electionId>" al número de Kapso → evento `whatsapp.message.received`
 * → creamos/encontramos al votante por teléfono y le respondemos con su enlace único (vía provider;
 * en dev es dry-run, nunca un WhatsApp real sin INVITE_SEND_APPROVED=true).
 *
 * Seguridad: `X-Webhook-Signature` = HMAC-SHA256 hex del body crudo con `KAPSO_WEBHOOK_SECRET`.
 * Dedupe por `X-Idempotency-Key`. Soporta envelope batch (`body.batch === true` → `body.events`).
 *
 * La forma exacta del evento de Kapso no está verificada en research/03; se leen varias rutas
 * (`data.message.text.body`, `data.text.body`, Meta `entry[].changes[].value.messages[]`).
 */
import type { Voter } from "@quorum/contracts";
import { hmacSha256Hex, randomId, randomToken, safeEqualHex } from "./crypto";
import { inviteVoter, selectProvider } from "./invites";
import { getStore } from "./store";

const OPT_IN = /^\s*QUORUM\s+(\S+)/i;
const seenKeys = new Set<string>();

export interface Incoming {
  from: string;
  text: string;
  profileName?: string;
}

function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && k in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[k];
    else return undefined;
  }
  return cur;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function verifyKapsoSignature(secret: string, rawBody: string, header: string | null): boolean {
  const sig = (header ?? "").trim().replace(/^sha256=/, "");
  return safeEqualHex(hmacSha256Hex(secret, rawBody), sig);
}

/** `true` si la clave ya se vio (duplicado). Memoria acotada. */
export function seenIdempotencyKey(key: string | null): boolean {
  if (!key) return false;
  if (seenKeys.has(key)) return true;
  seenKeys.add(key);
  if (seenKeys.size > 5000) seenKeys.delete(seenKeys.values().next().value as string);
  return false;
}

export function unwrapBatch(body: unknown): Record<string, unknown>[] {
  if (body && typeof body === "object" && (body as { batch?: boolean }).batch === true) {
    const events = (body as { events?: unknown }).events;
    if (Array.isArray(events)) return events as Record<string, unknown>[];
  }
  return [body as Record<string, unknown>];
}

/** Extrae mensajes de texto entrantes de un evento (varias formas posibles). */
export function extractIncoming(event: Record<string, unknown>): Incoming[] {
  const type = asString(event.event) ?? asString(event.type);
  if (type && type !== "whatsapp.message.received") return [];
  const out: Incoming[] = [];
  const data = (event.data ?? event.payload ?? event) as Record<string, unknown>;

  const direct = asString(get(data, ["message", "text", "body"])) ?? asString(get(data, ["text", "body"])) ?? asString(data.text);
  const from = asString(get(data, ["message", "from"])) ?? asString(data.from) ?? asString(get(data, ["contact", "phone_number"]));
  if (direct && from) out.push({ from, text: direct, profileName: asString(get(data, ["contact", "name"])) ?? asString(get(data, ["profile", "name"])) });

  // Forma Meta Cloud API: entry[].changes[].value.messages[]
  const entries = Array.isArray(data.entry) ? (data.entry as unknown[]) : [];
  for (const entry of entries) {
    const changes = Array.isArray(get(entry, ["changes"])) ? (get(entry, ["changes"]) as unknown[]) : [];
    for (const change of changes) {
      const value = get(change, ["value"]) as Record<string, unknown> | undefined;
      const messages = Array.isArray(value?.messages) ? (value.messages as unknown[]) : [];
      const contacts = Array.isArray(value?.contacts) ? (value.contacts as unknown[]) : [];
      for (const m of messages) {
        const text = asString(get(m, ["text", "body"]));
        const f = asString(get(m, ["from"]));
        if (text && f) out.push({ from: f, text, profileName: asString(get(contacts[0], ["profile", "name"])) });
      }
    }
  }
  return out;
}

function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}

export async function handleOptIn(msg: Incoming): Promise<"sent" | "ignored" | "failed"> {
  const match = OPT_IN.exec(msg.text);
  if (!match) return "ignored";
  const electionId = match[1];
  const phone = toE164(msg.from);
  if (!phone) return "ignored";
  const store = await getStore();
  const election = await store.getElection(electionId);
  if (!election || (election.status !== "open" && election.status !== "draft")) return "ignored";

  let voter = await store.getVoterByPhone(electionId, phone);
  if (!voter) {
    voter = {
      id: randomId("vt"),
      electionId,
      displayName: (msg.profileName ?? "Votante WhatsApp").slice(0, 80),
      phoneE164: phone,
      inviteToken: randomToken(),
      inviteStatus: "pending",
      walletAddress: null,
      livenessPassedAt: null,
      credentialIssuedAt: null,
      votedAt: null,
    } satisfies Voter;
    await store.putVoter(voter);
  }
  const { provider } = selectProvider();
  const r = await inviteVoter(provider, voter);
  return r.status === "failed" ? "failed" : "sent";
}
