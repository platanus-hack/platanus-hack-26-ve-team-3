# Research 03 — Kapso (WhatsApp API) para invitaciones de Quórum

Fecha de consulta: 2026-10-24. `kapso.ai` redirige a `kapso.com`; docs en `docs.kapso.ai`.

## Qué es
Startup chilena (2024, Andrés Matte, ex partner de Platanus Ventures), Meta Business Partner, capa "WhatsApp for developers" sobre la Cloud API de Meta. Sponsor de Platanus Hack Bogotá 2026; **no aparece como sponsor de Caracas** y no hay créditos publicados para este hackathon (preguntar en sitio).

## Oferta verificada
- Proxy compatible con Meta Graph: `https://api.kapso.ai/meta/whatsapp/v24.0/{phone_number_id}/messages` (texto, media, templates, botones, listas, Flows). Header `X-API-Key`.
- Platform API `https://api.kapso.ai/platform/v1` (números, webhooks, broadcasts, contactos).
- Inbox, Workflows, Agentes IA, Broadcasts.
- MCP: `https://api.kapso.ai/mcp` (proyecto) y `https://docs.kapso.ai/mcp` (docs).
- CLI `@kapso/cli` 0.19.2 · SDK TS `@kapso/whatsapp-cloud-api` 0.4.0 · skills `npx skills add gokapso/agent-skills`.
- Sandbox compartido (solo 1 destinatario, sin templates) + **número US pre-verificado gratis** (Instant setup, ~5 min).
- Docs índice: https://docs.kapso.ai/llms.txt · OpenAPI: https://docs.kapso.ai/api/meta/whatsapp/openapi-whatsapp.yaml · AGENTS.md: https://kapso.com/AGENTS.md

## Planes
| Plan | Precio | Mensajes/mes | Números |
|---|---|---|---|
| Free | $0 | 2.000 | 1 + sandbox, $2 créditos |
| Pro | $25 | 100.000 | 3 |
| Platform | $299 | 1.000.000 | 50 |
Tarifas de template de Meta aparte. Sign up: https://app.kapso.ai/users/sign_up · API key: Integrations → API keys.

## Endpoints
- Texto (ventana 24 h abierta por el usuario): `POST /{phone_number_id}/messages` `{"messaging_product":"whatsapp","to":"58412...","type":"text","text":{"body":"...","preview_url":true}}`
- Template con botón URL dinámico (inicia conversación): crear en `POST /{waba_id}/message_templates` con `BUTTONS[{type:"URL",url:"https://quorum.app/v/{{1}}",example:["abc"]}]` (1 variable, solo al final). Enviar con `components:[{type:"button",sub_type:"url",index:"0",parameters:[{type:"text",text:"<token>"}]}]`.
- Webhooks: `POST https://api.kapso.ai/platform/v1/whatsapp/phone_numbers/{id}/webhooks` con eventos `whatsapp.message.received|delivered|read|failed`. Verificar `X-Webhook-Signature` (HMAC-SHA256 hex del body), dedupe `X-Idempotency-Key`, responder 200 en <10 s, envelope batch (`body.batch === true`).

```ts
const BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";
const headers = { "X-API-Key": process.env.KAPSO_API_KEY!, "Content-Type": "application/json" };
export async function sendInvite(to: string, voterName: string, token: string) {
  const body = { messaging_product: "whatsapp", to, type: "template",
    template: { name: "quorum_invite", language: { code: "es" }, components: [
      { type: "body", parameters: [{ type: "text", text: voterName }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: token }] } ] } };
  const r = await fetch(`${BASE}/${process.env.KAPSO_PHONE_NUMBER_ID}/messages`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return (await r.json()).messages[0].id as string;
}
export async function sendLink(to: string, url: string) {
  const body = { messaging_product: "whatsapp", to, type: "text", text: { body: `Tu enlace único para votar: ${url}`, preview_url: true } };
  const r = await fetch(`${BASE}/${process.env.KAPSO_PHONE_NUMBER_ID}/messages`, { method: "POST", headers, body: JSON.stringify(body) });
  return (await r.json()).messages?.[0]?.id;
}
```

## Requisitos de Meta (Kapso no los elimina)
- Cuenta de Facebook + Business Portfolio + WABA (se crean en el embedded signup). Sitio web HTTPS público.
- Business Verification **no obligatoria**: sin verificar, 250 conversaciones iniciadas por el negocio / 24 h (suficiente).
- **Templates obligatorios** para iniciar conversación; aprobación de Meta "hasta 24 h", más en cuentas nuevas. Usar categoría UTILITY.
- Número gratis es US (+1); no hay números venezolanos por esta vía.

## Riesgo crítico y plan recomendado (B4, sin template)
La aprobación del template no la controlamos. Enviarlo a aprobación en los primeros 30 min y, mientras, usar el flujo **opt-in**: el organizador comparte `https://wa.me/<numero_kapso>?text=QUORUM%20<id_votacion>` → el votante lo envía → se abre ventana de 24 h → webhook `whatsapp.message.received` → respondemos con texto + link mágico único. Mantiene eventos delivered/read para el panel. Si el template se aprueba, pasar a push directo.

## Plan B comparado
| Opción | Setup | Destinatarios | Comentario |
|---|---|---|---|
| Kapso Free + Instant setup | 15–30 min + template 0–24 h | 250/24 h | Recomendado |
| Meta Cloud API directo (test number) | 20–40 min | máx. 5 números | Solo para pruebas |
| Twilio Sandbox | 10 min | cada votante hace `join <code>` | Incómodo, consola legacy |
| Links `wa.me` + copiar | 0 min | ilimitado | Sin webhooks; respaldo final |

## Uso desde Claude Code
```bash
claude mcp add --transport http kapso https://api.kapso.ai/mcp --header "X-API-Key: $KAPSO_API_KEY"
claude mcp add --transport http kapso-docs https://docs.kapso.ai/mcp
```

## No verificado
Sponsors/créditos para Caracas; límite "5 destinatarios" literal en docs de Meta; si el número US gratis permite templates sin depósito; latencia real de aprobación del template.
