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

## Integración del motor (crypto) — Plan A `semaphore-ledger` (2026-10-24)

Código en `packages/protocol-adapter` (servidor y navegador) y `apps/verifier` (`verifyPackage`). Formato y garantías en `docs/ADR-001-voting-engine.md`. El servidor **nunca** recibe la clave privada Semaphore; solo commitments y pruebas.

### Cambios de contrato
| Ruta | Antes | Ahora |
|---|---|---|
| `POST /api/voters/:id/credential` (nuevo) | — | `{ inviteToken, commitment }` → `Voter`. Guarda `commitment` (string decimal) ligado al `voterId` **solo hasta `publish`**; en el paquete público va la lista de commitments sin ids. Una sola vez por votante. |
| `POST /api/elections/:id/publish` | fija `manifestHash` | además construye el padrón: `groupRoot = groupRoot(commitments)` (orden = orden de registro, se congela), guarda `commitments[]`, `scope = electionScope(id)` y crea el ledger `createLedger(id, groupRoot)`. Desde aquí no se admiten más commitments (un commitment nuevo cambia la raíz ⇒ nueva elección). Responde `Election` + `{ groupRoot, scope, merkleTreeDepth: 10 }`. |
| `GET /api/elections/:id/roll` (nuevo, público) | — | `{ groupRoot, commitments[], merkleTreeDepth }`: el navegador lo necesita para generar la prueba. Sin nombres. |
| `POST /api/elections/:id/vote` | `SignedVote` con `plainChoice` | `{ proof: SemaphoreProof }` (`{ merkleTreeDepth, merkleTreeRoot, message, nullifier, scope, points[8] }`). El servidor llama `await appendBallot(ledger, proof, election.groupRoot)` y mapea `LedgerRejection.code` → `ApiError.code`: `DOUBLE_VOTE`→`already_voted`; `WRONG_ROOT`/`WRONG_SCOPE`/`WRONG_DEPTH`/`INVALID_PROOF`→`not_eligible`; elección no `open`→`closed`. Responde `Receipt` con `inclusionId = proof.nullifier` y `state: "incluido"` (la entrada ya tiene `hash`). **No se guarda `voterId` junto a la boleta**; `votedAt` del `Voter` solo se marca si el cliente lo pide con su `inviteToken` (hecho de haber votado, no qué). La firma EIP-712 pasa a ser opcional: la prueba ya demuestra elegibilidad y unicidad. |
| `GET /api/elections/:id/receipt/:inclusionId` | — | busca `nullifier === inclusionId` en el ledger; devuelve `idx`, `hash`, `includedAt`. No revela `message`. |
| `GET /api/elections/:id/tally` | — | `tally(ledger, options.length)` mapeado a `Aggregates` (regla `< 5` votos ⇒ `count:null` se mantiene). |
| `POST /api/elections/:id/close` | stub | 1) status `closed`; 2) `t = tally(ledger, n)`; 3) opcional ancla (abajo); 4) `pkg = buildAuditPackage({ electionId, manifest, commitments, ledger, tally: t, anchor })`; 5) `result = await verifyPackage(pkg, { anchorRpcUrl: process.env.BASE_SEPOLIA_RPC })`; 6) si `result.valid` → `auditable`, si no → `failed`, y se publica igualmente el `AuditResult` (nunca ocultar). Guardar `pkg` como artefacto inmutable (JSON) y su `sha256`. |
| `GET /api/elections/:id/artifacts` | — | devuelve el `pkg` JSON tal cual se guardó (`Content-Type: application/json`, `ETag` = sha256). |
| `POST /api/audit/verify` | `valid:false` + `verifier-not-integrated` | `import { verifyPackage } from "@quorum/verifier"`; `return verifyPackage(body.package, { anchorRpcUrl: process.env.BASE_SEPOLIA_RPC, inputArtifactDigest: "sha256:" + sha256(bodyBytes) })`. Devuelve el `AuditResult` íntegro: la UI muestra `checks[].reason` y `unsupportedGuarantees`, nunca solo `valid`. |

### Manifiesto canónico (`ElectionManifest` del adaptador)
`{ electionId, title, kind, options:[{id,label}], startsAt, endsAt, protocol:"semaphore-ledger", merkleTreeDepth:10, label:"fixture"|"simulación"|"real" }` → `manifestHash = manifestHash(manifest)` (SHA-256 del JSON canónico; la misma función vive en el verificador). Cualquier cambio posterior ⇒ `manifest_hash` falla.

### Navegador del votante (`/v/[token]`)
1. `const id = createVoterIdentity()` → guardar `id.privateKey` en `localStorage` (clave por `electionId`); enviar solo `id.commitment` a `/credential`.
2. Tras `publish`: `GET /roll` → `castBallot(privateKey, commitments, electionId, optionIndex, browserArtifacts())` (artefactos en `/zk/semaphore-10.{wasm,zkey}`; copiarlos con `pnpm --filter @quorum/protocol-adapter copy-artifacts`, 4,2 MB; ~0,4 s en Node, estimar 1–3 s en móvil, sin medir).
3. `POST /vote { proof }` → guardar `Receipt`; el recibo del votante es su `nullifier`: puede buscarlo en `artifacts` y comprobar que está en el ledger.
4. `castBallot` importa `@semaphore-protocol/core` (snarkjs + WASM): cargarla con `dynamic import` en un componente cliente para no meterla en el bundle inicial.

### Ancla (opcional; requiere decisión humana: clave con ETH en Base Sepolia)
En `close`, antes de construir el paquete final: `anchorOnBaseSepolia({ finalHash: finalHash(ledger), groupRoot, tallyHash: tallyHash(t), electionId }, ORGANIZER_PRIVATE_KEY, BASE_SEPOLIA_RPC)` → `anchor = { chainId: 84532, txHash }`. Sin clave: `anchor = null` y el verificador lo declara `no evaluado`. EAS detrás de `QUORUM_EAS_ENABLED=true` + `QUORUM_EAS_SCHEMA_UID` (ver ADR-001).

### Variables de entorno nuevas
`BASE_SEPOLIA_RPC` (ya listada), `ORGANIZER_PRIVATE_KEY` (solo servidor, nunca en git), `QUORUM_EAS_ENABLED=false`, `QUORUM_EAS_SCHEMA_UID`.

# Contrato v1 (fase 2, H+4) — inscripción, voto Semaphore, verificación en la app, sorteo

Decisiones D-09..D-12 en `docs/DECISIONS.md`. Cambios sobre v0:

## Estados de la elección
`draft → registration → open → closed → tallying → auditable → drawn` (`ElectionStatus` en contracts). `publish` pasa a `registration`; nuevo `POST /api/elections/:id/open` congela el padrón (`groupRoot` de los `commitment` inscritos) y pasa a `open`; `close` → `tallying` → `auditable` (genera paquete y corre `verifyPackage`); `POST /api/elections/:id/draw` → `drawn`.

## Elección
- `Election` gana: `phase`/`status` nuevos, `groupRoot: string|null`, `winnersCountFromResult: boolean` (true en la demo: la opción ganadora es un número 1..5), `candidates: {id, label, amount?}[]` (proyectos postulados al sorteo), `draw: {seed, winners: string[], method: "keccak256(finalHash)|fisher-yates"}|null`, `anchor: {chainId, txHash}|null`, `registryAddress: string|null`.
- `GET /api/elections/:id/voters` → `{ voters: [{ id, displayName, state: "invited"|"registered"|"voted", walletAddress }] }` (sin teléfono).

## Inscripción (registration)
1. `GET /api/invite/:token` igual.
2. `POST /api/face/enroll` `{voterId, inviteToken, descriptor, consent}` → **dedupe 1:N**: compara contra todos los descriptores inscritos en la misma elección; si similitud ≥ umbral responde `409 {code:"duplicate_identity"}`. Umbral por defecto según el modelo (dimensiones del descriptor): 256 (insightface, el actual) → 0.70; otro (faceres, 1024) → 0.75; `FACE_DEDUPE_THRESHOLD` lo fija para todos. Un descriptor de distinta longitud que los ya inscritos en la elección → `400 invalid_input` ("recarga la página"): no se puede comparar y aceptarlo saltaría el dedupe. Si pasa: guarda cifrado y devuelve `{ ok, faceBindingHash, voteNonce }` donde `faceBindingHash = keccak256(electionId | voterId | sha256(descriptorCifrado))`.
3. `POST /api/voters/:id/wallet` `{ inviteToken, walletAddress, kind: "kernel"|"eoa-demo", bindingSignature }` → la wallet firma EIP-712 `FaceBinding{ electionId, voterId, faceBindingHash, wallet }` (tipos en contracts `FaceBindingTypes`); servidor verifica (ERC-1271/6492 por RPC si `kind=kernel`), guarda y marca `registered`.
4. `POST /api/voters/:id/identity` `{ inviteToken, commitment }` → guarda el `commitment` Semaphore (identidad generada en el navegador y guardada en `localStorage` cifrada con la wallet). Responde `{ ok, registeredCount }`.

## Voto (open)
`POST /api/elections/:id/vote` `{ proof: SemaphoreProof, onchain?: { txHash } }` → servidor valida con `appendBallot` del adaptador (raíz, nullifier, prueba), opcionalmente verifica `txHash` en Base Sepolia (evento `Cast(electionId, commitment)` del contrato `QuorumRegistry`), devuelve `Receipt { inclusionId, nullifier, index, txHash? , state: "incluido" }`. Ya no existe `plainChoice`. El `message` de la prueba es el índice de opción.
`GET /api/elections/:id/ledger` → ledger público (sin PII) para que el votante compruebe su `nullifier` desde la app.

## Cierre y verificación en la app
- `POST /close` → genera paquete (`buildAuditPackage`), ancla si hay `ORGANIZER_PRIVATE_KEY`+`BASE_SEPOLIA_RPC`, guarda `anchor`, corre `verifyPackage` (de `@quorum/verifier`) y guarda `AuditResult`; status `auditable`.
- `GET /api/elections/:id/audit` → `AuditResult` guardado + `packageDigest`. `POST /api/audit/verify` `{package}` → `verifyPackage` real (el usuario puede re-verificar desde el navegador con su copia).
- UI `/e/[id]`: botón **Verificar ahora** que descarga el paquete y ejecuta `verifyPackage` **en el navegador** (bundle del verificador) y muestra checks; comprobar "mi voto está": input de `nullifier` o lectura de `localStorage`.

## Sorteo verificable (drawn)
- `POST /api/elections/:id/draw` (organizador, solo en `auditable`): `N = opción ganadora` (si `winnersCountFromResult`) o `winnersCount` fijo; `seed = keccak256(finalHash)`; selección determinista Fisher-Yates sobre `candidates` ordenados por `id` con PRNG `keccak256(seed, i)`; guarda `draw`. Implementado en `packages/protocol-adapter/src/draw.ts` (`drawWinners(candidates, n, finalHash)`) y verificado por `apps/verifier` como check `draw_matches` cuando el paquete trae `draw`.
- `GET /api/elections/:id/draw` → `{ seed, n, winners, candidates, finalHash }`; UI muestra la animación del sorteo y el botón "Recomputar sorteo" (en navegador).

## Smart wallet gasless (cliente)
`packages/wallet` (`@quorum/wallet`): `createKernelWallet({ projectId })` con `@zerodev/sdk` + `@zerodev/ecdsa-validator`, signer = clave viem local (`localStorage`, etiquetado demo), bundler/paymaster `https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/84532`; `signTypedData`, `sendSponsored({to, data})`. Si falta `NEXT_PUBLIC_ZERODEV_PROJECT_ID` → `eoa-demo` (viem) con etiqueta visible. Contrato `contracts/QuorumRegistry.sol` mínimo (`cast(bytes32 electionId, bytes32 commitment)` + evento) compilado con solc-js, deploy script con viem (`scripts/deploy-registry.ts`, requiere clave con ETH de faucet).

## Env nuevas
`NEXT_PUBLIC_ZERODEV_PROJECT_ID`, `NEXT_PUBLIC_REGISTRY_ADDRESS`, `ORGANIZER_PRIVATE_KEY`, `FACE_DEDUPE_THRESHOLD` (opcional; por defecto 0.70 con 256 dimensiones, 0.75 con otras), `NEXT_PUBLIC_DEMO_ELECTION_ID`.

## Contrato v1 — implementado (feat/phase2-engine, 2026-10-24) · diferencias que la UI debe conocer
- `POST /api/elections` acepta además `candidates[]`, `winnersCountFromResult`, `optionValues[]` (un valor por opción) o `winnersCount`; responde `Election` + **`organizerToken`** (una sola vez; el servidor guarda solo su sha256).
- **Auth del organizador** (`Authorization: Bearer <organizerToken>`, 401 si falta): `publish`, `POST/GET voters`, `invites`, `open`, `close`, `POST draw`. `GET /voters` sin token → `{ counts: { total, invited, registered, withIdentity, voted } }`; con token → `{ voters: [{id, displayName, state, walletAddress, hasIdentity}], counts }`.
- `publish` → `registration` (ya no `open`). `manifestHash` = SHA-256 (hex con `0x`) del `ElectionManifest` del adaptador, que incluye `drawRule { candidates, winnersCount, tieBreak:"lowest" }`.
- `POST /api/face/enroll` → `{ ok, faceBindingHash, voteNonce }` o `409 {code:"duplicate_identity"}`; solo en `registration`. `POST /api/face/verify` exige `inviteToken` y responde `{ ok, voteNonce, mode }` (sin similitud).
- `POST /api/voters/:id/wallet` `{ inviteToken, walletAddress, kind, bindingSignature }`: firma EIP-712 `FaceBinding` con dominio `{name:"Quorum", version:"1", chainId:84532, verifyingContract:0x0…0}` (igual a `@quorum/wallet`). Con `BASE_SEPOLIA_RPC` usa `publicClient.verifyTypedData` (EOA/1271/6492); sin RPC solo `eoa-demo` (kernel → 503).
- `POST /api/voters/:id/identity` `{ inviteToken, commitment }` (tras la wallet) → `201 { ok, registeredCount }`.
- `POST /api/elections/:id/open` (organizador) congela el padrón y **borra las plantillas faciales**. `GET /api/elections/:id/roll` → `{ frozen, groupRoot, scope, merkleTreeDepth, commitments }`.
- `POST /api/elections/:id/vote` `{ proof }` → `201 Receipt { inclusionId = nullifier, nullifier, index, hash, state:"incluido" }`. Errores: 400 codificación no canónica/opción fuera de rango; 403 `not_eligible` (raíz/scope/prueba); 409 `already_voted` / `closed`. **`onchain` → 400 `onchain_not_supported`** (decisión de José, "solo ancla on-chain": el único registro on-chain es el ancla del organizador al cierre).
- `POST /api/voters/:id/voted { inviteToken }` (nuevo, opcional): autodeclaración para el estado "voted"; enviarlo en una petición separada del voto.
- `GET /api/elections/:id/ledger` → mientras `open` **sin entradas** (`count`, `finalHash`, `proofsPublished:false`); desde `closed` entradas completas. El votante comprueba su inclusión con `GET /receipt/:nullifier`.
- `POST /close` → `auditable` o **`failed`** (si el verificador rechaza; el `AuditResult` se publica igual). `GET /api/elections/:id/audit` → `{ auditResult, packageDigest, anchorStatus }`. `GET /artifacts` devuelve los bytes exactos con `ETag` = digest.
- `POST /draw` (organizador, solo `auditable`) → `drawn`; `GET /draw` → `{ seed, n, winners, method, finalHash, candidates, tieBreak }`. El paquete pasa a incluir `draw` y el verificador añade `draw_matches`; nuevo check `commitments_unique`.

## Sala abierta (asamblea abierta) — `feat/p2-sala-abierta`
Para la demo: todo el público vota desde su teléfono. El organizador abre una sala en `registration`, el proyector muestra el QR de `joinUrl` y un contador en vivo. Esquemas en `packages/contracts` (`OpenRoomInput`, `RoomStatus`, `OpenRoomResult`, `RoomPublicInfo`, `JoinRoomInput`, `JoinRoomResult`). Lógica en `apps/web/src/lib/server/rooms.ts`.

| Método y ruta | Auth | Entrada | Salida | Errores |
|---|---|---|---|---|
| `POST /api/elections/:id/room` | Bearer organizador | `{ maxSeats: 1..500, expiresInMin: 1..180 }` | `201` (sala nueva) o `200` (ya había una abierta: mismo `roomCode`, nuevos tope/expiración) → `{ open, seatsTaken, maxSeats, expiresAt, closedReason, roomCode, joinUrl }` | 401 sin Bearer · 400 rango o `maxSeats < seatsTaken` · 409 `closed` si no está en `registration` |
| `DELETE /api/elections/:id/room` | Bearer | — | `200 RoomStatus` (`open:false`, `closedReason:"manual"`). Idempotente | 401 |
| `GET /api/elections/:id/room` | público | — | `{ open, seatsTaken, maxSeats, expiresAt, closedReason }` (+ `roomCode`, `joinUrl` con Bearer). Sin sala: `{ open:false, seatsTaken, maxSeats:null, expiresAt:null, closedReason:null }`. `Cache-Control: public, s-maxage=2` | 404 elección |
| `GET /api/rooms/:roomCode` | público | — | `{ electionId, title, open, seatsTaken, maxSeats, expiresAt, closedReason }` (para `/j/<roomCode>` antes de unirse; el código es case-insensitive) | 404 |
| `POST /api/rooms/:roomCode/join` | público, rate limit por IP (`ROOM_JOIN_RATE_PER_MIN`, default 30/min) | `{ displayName }` alias libre | `201 { electionId, voterId, displayName, inviteToken, inviteUrl }` — el `inviteToken` se entrega **una sola vez**; seguir a `inviteUrl` (`/v/<token>`) | 400 `invalid_input` alias · 404 sala · 409 `room_full` · 410 `room_closed` (cerrada, expirada, reemplazada o votación ya abierta) · 429 |

- `roomCode`: 6 caracteres de `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sin 0/O/1/I/L). `joinUrl = APP_URL + /j/ + roomCode`.
- `closedReason`: `null` (abierta) · `"manual"` (DELETE o sala reemplazada) · `"expired"` · `"election-opened"`.
- `seatsTaken` = votantes con `source:"room"` de la elección (todas sus salas); el tope `maxSeats` se aplica a ese total.
- Alias (`RoomAlias`): NFC, espacios colapsados, 1..32 caracteres, solo letras/números/espacios y `. ' _ -`, al menos una letra o número, **menos de 7 dígitos** (nunca teléfono ni documento). Nunca se pide teléfono.
- El votante creado lleva `source:"room"`, `inviteStatus:"claimed"`, sin `phoneE164`. Desde ahí, flujo normal: `POST /api/face/enroll` (dedupe 1:N → `409 duplicate_identity`: el control "una persona = un lugar", **modo demo**) → `POST /api/voters/:id/wallet` (FaceBinding) → `POST /api/voters/:id/identity`.
- `POST /open` cierra la sala (`closedReason:"election-opened"`) y fija `rollPolicy`. El organizador ve `source` en `GET /voters` (Bearer).
- **Paquete de auditoría**: si la elección tuvo sala, `rollPolicy = { kind:"open-room", maxSeats, joined, enrolled, eligibility:"face-dedupe-demo", note:"censo abierto en sala: la elegibilidad depende de la deduplicación facial demo, no de un padrón" }` a nivel raíz (sin alias ni ids). Está **fuera de `manifestHash`/`checksums`** (la sala se abre después de publicar): es una declaración del organizador. El verificador no la comprueba y la muestra en `unsupportedGuarantees` como `censo-abierto-en-sala: …`.
- **Hallazgo A6**: el opt-in de WhatsApp (`QUORUM <id>`) ya **no crea votantes**; solo reenvía el enlace a quien el organizador cargó con ese teléfono. La sala es la única vía abierta: explícita, activada por el organizador, con tope y expiración.
- Seed: `pnpm --filter @quorum/web seed:demo -- --reset --room [--seats 60] [--minutes 15]` imprime `roomCode` y `joinUrl`.

### Credencial del evento (D-19) — `feat/credencial-qr`
Método de elegibilidad por votación (`Election.eligibility`, aditivo y opcional; ausente = `open-alias`). Esquemas en `packages/contracts` (`EligibilityMethod`, `BadgeCheck`, `Eligibility`, `EligibilityInput`, `JoinBadgeInput`, `parseBadgeUrl`, `DEFAULT_BADGE_URL_PREFIX`). Lógica en `apps/web/src/lib/server/badge.ts`. **El rostro es obligatorio en todos los métodos**: el votante creado por credencial sigue `face/enroll` (dedupe 1:N) → `wallet` (FaceBinding con el `faceBindingHash` del rostro, sin cambios) → `identity`.

| Método y ruta | Auth | Entrada | Salida | Errores |
|---|---|---|---|---|
| `POST /api/elections` | público | además `eligibility?: { method, badgeUrlPrefix?, badgeCheck?, badgeAllowlist? }` | `Election` con `eligibility` público `{ method, badgeCheck, badgeUrlPrefix, allowlistCount? }` (nunca los usuarios) | 400 `method:"list"` (próximamente) o `badgeCheck:"list"` sin usuarios |
| `PUT /api/elections/:id/eligibility` | Bearer organizador | `EligibilityInput` | `200 Election` | 401 · 400 · 409 `closed` si el padrón está congelado o **ya entró alguien por la sala** (`source` room/badge) |
| `GET /api/rooms/:roomCode` | público | — | además `eligibility?: { method, badgeUrlPrefix? }` | — |
| `POST /api/rooms/:roomCode/join-badge` | público, rate limit por IP (`BADGE_JOIN_RATE_PER_MIN` → `ROOM_JOIN_RATE_PER_MIN` → 30/min, × `QUORUM_RATELIMIT_SCALE`) | `{ badgeUrl }` (texto leído del QR, ≤300) | `201 { electionId, voterId, displayName:"Participante", inviteToken, inviteUrl }` (como `join`; token una sola vez) | 400 `badge_invalid` "Ese QR no es una credencial de Platanus Hack." · 400 `invalid_input` (la votación no usa credenciales) · 404 `badge_unknown` "No encontramos esta credencial en el evento." · 404 sala · 409 `badge_used` "Esta credencial ya se usó en esta votación." · 409 `room_full` · 410 `room_closed` · 429 · 503 consulta en vivo sin respuesta (la credencial NO queda gastada) |

- Patrón **exacto**: `^<badgeUrlPrefix>([A-Za-z0-9-]{1,39})$` (prefijo escapado; por defecto `https://hack.platan.us/26-ve/id/`; espacios al borde se recortan). El usuario se normaliza a minúsculas.
- `badgeCheck` (default `live`): `live` → `HEAD <prefijo><usuario>` (GET si 405/501), tiempo límite 3 s, 2xx = existe, 404/410 = no existe, otro/timeout = 503; caché en memoria (positivos 6 h, negativos 2 min) y una sola petición en vuelo por URL. `list` → HMAC del usuario dentro de la lista del organizador. `none` → solo el patrón.
- Se guarda **solo** `badgeHash = HMAC-SHA256(clave, "badge|<electionId>|<usuario>")` en `badgeUses` (`{ electionId, badgeHash, usedAt }`, **sin voterId**) y la lista como `badgeAllowlists[electionId] = [badgeHash…]`. Clave: `BADGE_KEY`; si falta, `HMAC(FACE_KEY, "quorum-badge-key-v1")`; en producción sin ninguna → 503.
- La admisión reutiliza la de la sala (mismo lock, tope `maxSeats`, expiración, sala reemplazada). `seatsTaken` cuenta `source` `room` y `badge`. Con `event-badge`, `POST /join` (apodo) → 400.
- `Voter.source` y `VoterSummary.source` admiten `"badge"`.
- **Paquete de auditoría**: con `event-badge`, `rollPolicy = { kind:"event-badge", maxSeats, check, face:"full", joined, enrolled, eligibility:"badge-once+face-dedupe-demo", note }` con `note` = "credencial del evento + rostro: la credencial demuestra que es participante del evento y se usa una sola vez; el rostro impide que una misma persona use varias credenciales. El QR de la credencial no es secreto (el usuario está impreso): no prueba que quien lo escanea sea su titular". Sin usuarios ni HMAC. El verificador acepta ambas formas (`discriminatedUnion` estricta: `face` distinto de `"full"` → `package_schema` falla) y la declara como `credencial-de-evento: …` en `unsupportedGuarantees`.

## Inicio programado de la votación — `feat/espera-cuenta`
Hoy la votación la abre el organizador; ahora además puede **programarla**. Esquemas en `packages/contracts` (`Election.votingStartsAt`, `ElectionResponse`, `ServerNow`, `OpenRoomInput.votingStartsAt|votingStartsInSec`, `RoomStatus.votingStartsAt|serverNow`, `ScheduleInput`, `ScheduleResult`, `InviteResponse.election.votingStartsAt|serverNow`). Lógica: `apps/web/src/lib/server/engine.ts` (`scheduleDue`, `syncSchedule`, `openElection({auto})`), `rooms.ts` (`openRoom`, `setSchedule`) y `schedule.ts` (helpers por votante/token/sala).

| Método y ruta | Auth | Entrada | Salida | Errores |
|---|---|---|---|---|
| `POST /api/elections/:id/room` | Bearer | `{ maxSeats, expiresInMin, votingStartsAt?: ISO \| null, votingStartsInSec?: 10..604800 }` (no ambos) | como antes + `votingStartsAt`, `serverNow`. **Ausente** = cierre de la sala (`expiresAt`), salvo que ya hubiera una hora propia distinta del cierre de la sala vigente (se respeta); `null` = sin hora (a mano) | 400 hora pasada, > 7 días o ambos campos |
| `POST /api/elections/:id/schedule` | Bearer | uno de: `{ votingStartsAt: ISO \| null }` · `{ inSeconds: 10..604800 }` ("Empezar en 5 min" = 300, reloj del servidor) · `{ addSeconds: -3600..86400, ≠0 }` ("+5 min" = 300; suma a la hora vigente o, sin hora, a ahora) | `200 { electionId, status, votingStartsAt, serverNow }`. Si la sala sigue abierta y su cierre estaba atado a la hora de inicio, el cierre se mueve con ella | 401 · 400 (hora pasada: para empezar ya usar `POST /open`; > 7 días; cuerpo inválido) · 409 `closed` fuera de `registration` |
| `GET /api/elections/:id` | público | — | `Election` + `votingStartsAt` + **`serverNow`** | 404 |
| `GET /api/elections/:id/room`, `GET /api/rooms/:roomCode` | público | — | + `votingStartsAt`, `serverNow` (ojo: el GET público de la sala lleva `s-maxage=2`; para corregir el reloj usar la elección o la invitación, que son `no-store`) | — |
| `GET /api/invite/:token` | público | — | `election.votingStartsAt` + `serverNow` | 404 |

**Transición perezosa (sin cron).** Al principio de `GET` elección / sala (por id y por código) / padrón / ledger / tally / voters / invitación y de `POST` voto / join / face enroll / wallet / identity / voted / room / schedule, el servidor llama a `syncSchedule`: si la fase es `registration`, `votingStartsAt` no es null y `now ≥ votingStartsAt`, ejecuta **la misma transición que `POST /open`** (`openElection(id, {auto:true})`: congela los commitments → `groupRoot`, ledger vacío, cierra la sala con `closedReason:"election-opened"`, fija `rollPolicy`, borra las plantillas faciales) bajo los locks `engine:` → `room:` de la elección. Dentro del lock vuelve a comprobar fase y hora: con lecturas concurrentes **solo una** transición ocurre; las demás ven `open` y no hacen nada. Fuera de `registration` nunca hace nada. Si el padrón está vacío a la hora (nadie terminó la inscripción) la elección **se queda en `registration`** (la lectura responde normal) y el panel lo dice. Al abrir (a mano o programado), `votingStartsAt` pasa a ser la hora **real** de apertura. `votingStartsAt` no entra en el manifiesto (`manifestHash` no cambia). El lock es en proceso (igual que el resto del motor): supone un solo proceso Node con el store JSON.

**Cliente.** La espera del votante (`/v`, vista `waiting`) muestra "La votación empieza en mm:ss" (h:mm:ss si falta más de 1 h) con la hora del servidor: offset = `serverNow` − punto medio del viaje de la petición (se queda con la medición de menor ida y vuelta; `lib/client/clock.ts`). Sin hora: "Esperando que el organizador abra la votación…". En 0: "Abriendo la votación…", una consulta inmediata y sondeo cada 2 s en los últimos 10 s (5 s el resto); la boleta aparece sola y el teléfono vibra/suena como antes. Panel (`RoomCard`) y proyector: cuenta regresiva junto al QR, "Abrir ahora" (`POST /open`), "Empezar en 5 min", "+5 min" y "Quitar la hora".

**Sin jerga en el flujo del votante.** `/j` y `/v` (espera, boleta, comprobante, votó, cerrada, errores) ya no muestran ni pliegan wallet, smart wallet, Kernel, eoa-demo, EIP-712, FaceBinding, Semaphore, commitment, on-chain, Base Sepolia ni ZeroDev: se quitaron los "Detalles técnicos" de la espera y del comprobante y el `LinkModeBadge`. El comprobante muestra "Tu voto fue contado", la hora, "Comprobar mi voto", "Ver resultados" y "Código de tu comprobante" (el nullifier, copiable). Los errores del servidor pasan por `voterMessage()` (`lib/client/api.ts`), que reemplaza cualquier mensaje con jerga por uno simple según el código. La etiqueta "demo" de la vinculación y el detalle técnico quedan en `/e/[id]` (centro de transparencia), `/audit` y estos docs. En el proyector, el check `anchor_matches` se llama "Sello público".
