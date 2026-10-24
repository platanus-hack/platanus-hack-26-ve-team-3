# Contrato de API (v0, H+1) — fuente de verdad para frontend y backend

Tipos en `packages/contracts/src/index.ts`. Todos los inputs se validan con Zod; errores con forma `ApiError`.

| Método y ruta | Entrada | Salida | Notas |
|---|---|---|---|
| `POST /api/elections` | `CreateElectionInput` | `Election` (status `draft`) | `layout` se genera en `publish` |
| `GET /api/elections/:id` | — | `Election` (campos públicos) | |
| `POST /api/elections/:id/publish` | — | `Election` (status `open`, `manifestHash`, `layout`) | manifiesto = hash canónico de título/opciones/fechas |
| `POST /api/elections/:id/voters` | `{ voters: [{ displayName, phoneE164? }] }` | `{ voters: [{ id, displayName, inviteToken, inviteUrl }] }` | `inviteUrl = APP_URL + /v/ + token` |
| `POST /api/elections/:id/invites` | `InviteRequest` | `{ results: [{ voterId, status, link?, error? }] }` | canal `dry-run` por defecto; `kapso`/`meta` solo si env + `INVITE_SEND_APPROVED=true`; `wame` devuelve link `wa.me` |
| `GET /api/invite/:token` | — | `{ election: { id, title, kind, options, status, endsAt }, voter: { id, displayName, walletAddress, livenessPassedAt, votedAt } }` | 404 si no existe; no devuelve teléfono |
| `POST /api/face/enroll` | `FaceEnrollInput` | `{ ok, voteNonce }` | guarda descriptor cifrado/ofuscado ligado a `voterId`; nunca imágenes |
| `POST /api/face/verify` | `FaceVerifyInput` | `FaceVerifyResult` | similitud coseno; umbral env `FACE_THRESHOLD` (default 0.6); emite `voteNonce` 2 min |
| `POST /api/voters/:id/wallet` | `{ inviteToken, walletAddress }` | `Voter` (sin teléfono) | enlaza wallet; una sola vez |
| `POST /api/elections/:id/vote` | `SignedVote` | `Receipt` | verifica EIP-712 con viem `verifyTypedData` (ERC-1271/6492), consume nonce, rechaza duplicado/cerrada/no elegible; guarda boleta SIN `voterId` |
| `GET /api/elections/:id/receipt/:inclusionId` | — | `Receipt` | no revela opción |
| `GET /api/elections/:id/tally` | — | `Aggregates` | solo agregados; `count: null` por opción si `< 5` votos; `Cache-Control: public, s-maxage=2` |
| `GET /api/elections/:id/layout` | — | `LiveLayout` | del LLM (AI Gateway `anthropic/claude-haiku-5.5`) si hay `AI_GATEWAY_API_KEY`; si no, default por `kind` |
| `POST /api/elections/:id/close` | — | `Election` (status `closed` → `tallying` → `auditable`) | dispara tally del motor (stub hasta ADR-001) |
| `GET /api/elections/:id/artifacts` | — | paquete de auditoría JSON | manifiesto, boletas/commitments, resultado, versiones, checksums; sin PII |
| `POST /api/audit/verify` | `{ package }` | `AuditResult` | llama a `apps/verifier` cuando exista; mientras, `valid:false` con `unsupportedGuarantees:["verifier-not-integrated"]` (nunca fingir) |

## Variables de entorno (`apps/web/.env.example`, sin valores)
`APP_URL`, `INVITE_CHANNEL=dry-run`, `INVITE_SEND_APPROVED=false`, `KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `NEXT_PUBLIC_CHAIN_ID=84532`, `BASE_SEPOLIA_RPC`, `AI_GATEWAY_API_KEY`, `FACE_THRESHOLD=0.6`, `DATA_DIR=.data`

## Rutas de UI
`/` landing · `/org/new` wizard · `/org/[id]` panel · `/v/[token]` flujo del votante (invitación → datos → consentimiento → prueba de vida → wallet → boleta → recibo) · `/e/[id]/live` resultados en vivo · `/e/[id]` centro de transparencia · `/audit` auditor independiente · `/audit/lab` laboratorio de ataques
