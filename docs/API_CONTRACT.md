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
2. `POST /api/face/enroll` `{voterId, inviteToken, descriptor, consent}` → **dedupe 1:N**: compara contra todos los descriptores inscritos en la misma elección; si similitud ≥ `FACE_DEDUPE_THRESHOLD` (default 0.75) responde `409 {code:"duplicate_identity"}`. Si pasa: guarda cifrado y devuelve `{ ok, faceBindingHash, voteNonce }` donde `faceBindingHash = keccak256(electionId | voterId | sha256(descriptorCifrado))`.
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
`NEXT_PUBLIC_ZERODEV_PROJECT_ID`, `NEXT_PUBLIC_REGISTRY_ADDRESS`, `ORGANIZER_PRIVATE_KEY`, `FACE_DEDUPE_THRESHOLD=0.75`, `NEXT_PUBLIC_DEMO_ELECTION_ID`.
