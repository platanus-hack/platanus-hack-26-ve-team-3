/**
 * @quorum/notify — adaptador de invitaciones por WhatsApp.
 *
 * Regla de la oficina: nada sale hacia afuera sin aprobación. Por eso los proveedores que
 * envían mensajes reales (`kapso`, `meta`) solo se activan si `INVITE_SEND_APPROVED=true`
 * además de tener credenciales; en cualquier otro caso se cae a `dry-run` y se informa.
 *
 * Nunca registra (log) teléfonos completos ni contenido sensible: solo los últimos 4 dígitos.
 */

export type InviteChannel = "kapso" | "meta" | "wame" | "dry-run";

/** Estado alineado con `Voter.inviteStatus` de @quorum/contracts. */
export type SendStatus = "pending" | "sent" | "failed";

export interface SendResult {
  status: SendStatus;
  /** Enlace a compartir manualmente (solo `wame`). */
  link?: string;
  /** Id del mensaje del proveedor (solo envíos reales). */
  messageId?: string;
  error?: string;
}

export interface NotifyProvider {
  readonly channel: InviteChannel;
  send(to: string, voterName: string, inviteUrl: string): Promise<SendResult>;
}

/** Copy del mensaje (es-VE). Mantener corto: WhatsApp muestra preview del enlace. */
export function buildInviteMessage(voterName: string, inviteUrl: string): string {
  const name = voterName.trim() || "hola";
  return `Hola ${name}, te invitaron a votar en Quórum. Tu enlace único para votar: ${inviteUrl}\nNo lo compartas: es personal y de un solo uso.`;
}

/** Enmascara un teléfono para logs: +58412****1234 → solo últimos 4. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `***${digits.slice(-4)}`;
}

/** Teléfono E.164 sin `+` como lo espera la Cloud API de Meta. */
function toWaNumber(phoneE164: string): string {
  return phoneE164.replace(/^\+/, "").replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// dry-run: registra en consola y devuelve `sent`. Canal por defecto en dev/tests.
// ---------------------------------------------------------------------------
export class DryRunProvider implements NotifyProvider {
  readonly channel: InviteChannel = "dry-run";
  constructor(private readonly log: (line: string) => void = (l) => console.info(l)) {}

  async send(to: string, voterName: string, inviteUrl: string): Promise<SendResult> {
    this.log(`[notify:dry-run] to=${maskPhone(to)} name="${voterName}" url=${inviteUrl}`);
    return { status: "sent", messageId: `dry-run-${Date.now().toString(36)}` };
  }
}

// ---------------------------------------------------------------------------
// wa.me: no envía nada; devuelve un enlace que el organizador abre/copia.
// Respaldo final cuando no hay API (tabla "Plan B" de research/03).
// ---------------------------------------------------------------------------
export class WaMeProvider implements NotifyProvider {
  readonly channel: InviteChannel = "wame";

  async send(to: string, voterName: string, inviteUrl: string): Promise<SendResult> {
    const text = encodeURIComponent(buildInviteMessage(voterName, inviteUrl));
    return { status: "pending", link: `https://wa.me/${toWaNumber(to)}?text=${text}` };
  }
}

// ---------------------------------------------------------------------------
// Kapso: proxy compatible con la Graph API de Meta. Header `X-API-Key`.
// Texto libre (ventana 24 h abierta por el votante, plan B4 opt-in) o template
// `quorum_invite` (botón URL dinámico con el token) si `KAPSO_TEMPLATE=true`.
// ---------------------------------------------------------------------------
export interface KapsoConfig {
  apiKey: string;
  phoneNumberId: string;
  /** Usar template aprobado por Meta en vez de texto libre. */
  useTemplate?: boolean;
  /** Nombre del template; default `quorum_invite`. */
  templateName?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class KapsoProvider implements NotifyProvider {
  readonly channel: InviteChannel = "kapso";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: KapsoConfig) {
    this.baseUrl = cfg.baseUrl ?? "https://api.kapso.ai/meta/whatsapp/v24.0";
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async send(to: string, voterName: string, inviteUrl: string): Promise<SendResult> {
    const body = this.cfg.useTemplate
      ? templateBody(toWaNumber(to), voterName, inviteUrl, this.cfg.templateName ?? "quorum_invite")
      : textBody(toWaNumber(to), buildInviteMessage(voterName, inviteUrl));
    return postMessage(
      this.fetchImpl,
      `${this.baseUrl}/${this.cfg.phoneNumberId}/messages`,
      { "X-API-Key": this.cfg.apiKey, "Content-Type": "application/json" },
      body,
    );
  }
}

// ---------------------------------------------------------------------------
// Meta Cloud API directa (respaldo): mismo cuerpo, auth Bearer.
// ---------------------------------------------------------------------------
export interface MetaCloudConfig {
  accessToken: string;
  phoneNumberId: string;
  useTemplate?: boolean;
  templateName?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class MetaCloudProvider implements NotifyProvider {
  readonly channel: InviteChannel = "meta";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly cfg: MetaCloudConfig) {
    this.baseUrl = cfg.baseUrl ?? "https://graph.facebook.com/v24.0";
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  async send(to: string, voterName: string, inviteUrl: string): Promise<SendResult> {
    const body = this.cfg.useTemplate
      ? templateBody(toWaNumber(to), voterName, inviteUrl, this.cfg.templateName ?? "quorum_invite")
      : textBody(toWaNumber(to), buildInviteMessage(voterName, inviteUrl));
    return postMessage(
      this.fetchImpl,
      `${this.baseUrl}/${this.cfg.phoneNumberId}/messages`,
      { Authorization: `Bearer ${this.cfg.accessToken}`, "Content-Type": "application/json" },
      body,
    );
  }
}

function textBody(to: string, text: string) {
  return { messaging_product: "whatsapp", to, type: "text", text: { body: text, preview_url: true } };
}

/** El template tiene 1 variable en el cuerpo (nombre) y un botón URL `.../v/{{1}}` con el token al final. */
function templateBody(to: string, voterName: string, inviteUrl: string, name: string) {
  const token = inviteUrl.split("/").pop() ?? inviteUrl;
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: "es" },
      components: [
        { type: "body", parameters: [{ type: "text", text: voterName }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: token }] },
      ],
    },
  };
}

async function postMessage(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<SendResult> {
  try {
    const res = await fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { status: "failed", error: `http_${res.status}${detail ? `: ${detail}` : ""}` };
    }
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[] };
    return { status: "sent", messageId: json.messages?.[0]?.id };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : "network_error" };
  }
}

// ---------------------------------------------------------------------------
// Selección por entorno.
// ---------------------------------------------------------------------------
export interface NotifyEnv {
  INVITE_CHANNEL?: string;
  INVITE_SEND_APPROVED?: string;
  KAPSO_API_KEY?: string;
  KAPSO_PHONE_NUMBER_ID?: string;
  KAPSO_TEMPLATE?: string;
  META_ACCESS_TOKEN?: string;
  META_PHONE_NUMBER_ID?: string;
}

export interface ProviderSelection {
  provider: NotifyProvider;
  /** Canal efectivo (puede diferir del pedido si se degradó a dry-run). */
  channel: InviteChannel;
  /** Explicación cuando hubo degradación; `null` si se respetó el canal pedido. */
  note: string | null;
}

function isTrue(v: string | undefined): boolean {
  return v === "true" || v === "1";
}

/**
 * Devuelve el proveedor para `requested` (o `INVITE_CHANNEL`, default `dry-run`).
 * `kapso`/`meta` requieren credenciales y `INVITE_SEND_APPROVED=true`; si falta algo
 * se degrada a `dry-run` y se explica en `note`.
 */
export function createProvider(
  env: NotifyEnv,
  requested?: InviteChannel,
  opts: { fetchImpl?: typeof fetch; log?: (line: string) => void } = {},
): ProviderSelection {
  const channel = requested ?? (env.INVITE_CHANNEL as InviteChannel | undefined) ?? "dry-run";
  const approved = isTrue(env.INVITE_SEND_APPROVED);
  const dry = (note: string): ProviderSelection => ({ provider: new DryRunProvider(opts.log), channel: "dry-run", note });

  switch (channel) {
    case "dry-run":
      return { provider: new DryRunProvider(opts.log), channel, note: null };
    case "wame":
      return { provider: new WaMeProvider(), channel, note: null };
    case "kapso": {
      if (!approved) return dry("INVITE_SEND_APPROVED!=true: envío real no aprobado; se usó dry-run");
      if (!env.KAPSO_API_KEY || !env.KAPSO_PHONE_NUMBER_ID) return dry("Faltan KAPSO_API_KEY/KAPSO_PHONE_NUMBER_ID; se usó dry-run");
      return {
        provider: new KapsoProvider({
          apiKey: env.KAPSO_API_KEY,
          phoneNumberId: env.KAPSO_PHONE_NUMBER_ID,
          useTemplate: isTrue(env.KAPSO_TEMPLATE),
          fetchImpl: opts.fetchImpl,
        }),
        channel,
        note: null,
      };
    }
    case "meta": {
      if (!approved) return dry("INVITE_SEND_APPROVED!=true: envío real no aprobado; se usó dry-run");
      if (!env.META_ACCESS_TOKEN || !env.META_PHONE_NUMBER_ID) return dry("Faltan META_ACCESS_TOKEN/META_PHONE_NUMBER_ID; se usó dry-run");
      return {
        provider: new MetaCloudProvider({
          accessToken: env.META_ACCESS_TOKEN,
          phoneNumberId: env.META_PHONE_NUMBER_ID,
          useTemplate: isTrue(env.KAPSO_TEMPLATE),
          fetchImpl: opts.fetchImpl,
        }),
        channel,
        note: null,
      };
    }
    default:
      return dry(`Canal desconocido "${String(channel)}"; se usó dry-run`);
  }
}
