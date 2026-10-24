# Casos adversariales de Quórum

- **Autor:** quorum-seguridad. **Para:** quorum-qa (implementación) y quorum-crypto/quorum-backend (fixes). **Fecha:** 2026-10-24 ~12:00 VET.
- **Base:** `integration/h3` @ `567e997`. Hallazgos referenciados en `docs/THREAT_MODEL.md` §8.
- **Estado real de ejecución:** `pnpm --filter @quorum/verifier test` → **10/10 en verde** (2026-10-24T15:59Z, ejecutado en este worktree). Los casos marcados **"falta test"** no se han ejecutado como test versionado. AT-03b y AT-03c se reprodujeron con scripts temporales (no versionados) y el resultado está abajo **tal como salió**.
- **Convención:** todo caso trabaja sobre **copias** (fixtures en `packages/demo-fixtures/protocol/` o paquetes generados con `buildDemoElection`), nunca sobre una elección real (spec §4.F).

Resumen:

| ID | Caso | Capa | Resultado hoy | Test hoy |
|---|---|---|---|---|
| AT-01 | Boleta alterada en el paquete | verificador | **detecta** (`proofs_valid`) | `apps/verifier/test/verifier.test.ts` "tampered_proof" |
| AT-02 | Ledger reordenado | verificador | sin rehacer la cadena: detecta; **rehecha: NO detecta (sin ancla)** | falta test |
| AT-03a | Nullifier repetido idéntico | adaptador + verificador | **detecta** | `verifier.test.ts` "double_vote"; `adapter.test.ts` "ledger: … doble voto" |
| AT-03b | Nullifier repetido no canónico (`"0"+n`) | adaptador + verificador | **NO detecta (C1, crítico)** | falta test |
| AT-03c | `message` en hex (sabotaje) | adaptador + verificador | **elección honesta queda `failed` (A1)** | falta test |
| AT-04 | `groupRoot` cambiado tras `/open` | adaptador + API v1 | adaptador detecta; API v1 sin implementar | `verifier.test.ts` "wrong_root", `adapter.test.ts` WRONG_ROOT; API falta |
| AT-05 | Sorteo con seed distinta / candidatos cambiados | verificador `draw_matches` | **no existe aún** | falta test |
| AT-06 | Tally inflado | verificador | **detecta** (`tally_matches`) | `verifier.test.ts` "tampered_total" |
| AT-07 | FaceBinding con firma ajena / reenviada | API v1 | **no existe aún** | falta test |
| AT-08 | Commitment duplicado inyectado | API v1 + verificador | **NO detecta** (M3) | falta test |
| AT-09 | Censo inflado por un tercero sin auth | API v0 | **pasa el ataque (C4, A6)** | falta test |
| AT-10 | Privacidad de datos públicos y de la DB (`public_data_privacy`) | API v0/v1 | **falla** (C2, C3, C5) | parcial: `fixtures.test.ts` "no contiene PII" (solo el paquete) |

---

## AT-01 — Boleta alterada en el paquete
- **Precondición:** paquete íntegro `valid.json` (3 boletas, `counts:[1,2,0]`).
- **Pasos:** en la copia, cambiar `ledger[1].proof.message` de `"0"` a `"1"`; recalcular la cadena (`rechain`), el tally, `tallyHash` y los checksums, como haría un atacante cuidadoso.
- **Resultado esperado:** `valid:false`; falla **solo** `proofs_valid` con la causa "boleta #1: la prueba Groth16 de Semaphore no verifica (contenido o prueba alterados)". Exit code 1 en la CLI.
- **Dónde se prueba hoy:** `packages/demo-fixtures/protocol/tampered_proof.json` + `apps/verifier/test/verifier.test.ts` (`it("tampered_proof.json → proofs_valid falla en la boleta #1")`). **En verde.**
- **QA extra:** E2E en `/audit/lab` → "Prueba corrupta" → la UI muestra `fallo detectado` con esa razón literal (no un rojo genérico).

## AT-02 — Ledger reordenado
- **Precondición:** paquete íntegro con ≥2 boletas de opciones distintas.
- **Pasos:**
  - (a) Intercambiar `ledger[0]` y `ledger[1]` sin tocar hashes.
  - (b) Intercambiarlas y rehacer todo: `rechain(entries, genesisHash)`, `finalHash` y `checksums.ledger`. El tally no cambia.
  - (c) Igual que (b), pero con un `anchor` simulado que apunta al `finalHash` original (`anchorReader` inyectado como en el test del ancla).
- **Resultado esperado:** (a) `chain_integrity` falla con "cadena rota en #0". (b) **`valid:true`**: sin ancla, el reordenamiento es indetectable; debe aparecer `completitud-del-ledger` en `unsupportedGuarantees`. Importa porque **cambia `finalHash` y por tanto la semilla del sorteo** (A5). (c) `anchor_matches` falla con "hash final ≠ ancla".
- **Dónde se prueba hoy:** **falta test.**
- **Propuesta para QA:** `apps/verifier/test/adversarial.test.ts` → `describe("AT-02 ledger reordenado")` con los 3 sub-casos, usando `buildDemoElection({votes:[0,1,2]})`, `rechain` y un `AnchorReader` simulado. Añadir el fixture `reordered_rechained.json` en `make-fixtures.ts`. Afirmar que en (b) cambia `finalHash`, para que el riesgo sobre el sorteo quede escrito en un test.

## AT-03 — Nullifier repetido
### AT-03a — repetición idéntica
- **Precondición:** ledger con 3 boletas.
- **Pasos:** volver a insertar la prueba #0 tal cual (o generar otra prueba con la misma credencial y otro `message`).
- **Resultado esperado:** adaptador → `LedgerRejection{code:"DOUBLE_VOTE"}`; API v1 → `409 already_voted`; verificador sobre un paquete con la boleta duplicada → `nullifiers_unique` falla "#3 repite el nullifier de #0".
- **Dónde se prueba hoy:** `adapter.test.ts` ("ledger: acepta 3 boletas, rechaza doble voto…") y `verifier.test.ts` ("double_vote.json"). **En verde.**

### AT-03b — repetición con codificación no canónica (**crítico C1**)
- **Precondición:** ledger público (v1 `GET /ledger`) o paquete `valid.json`.
- **Pasos:** tomar `p = ledger[0].proof`; enviar `{...p, nullifier: "0" + p.nullifier}` (variantes: `"00"+…`, `"0x"+hex`).
- **Resultado esperado (tras el fix):** adaptador → `LedgerRejection` (`INVALID_ENCODING` o `DOUBLE_VOTE`); API → 400/409; verificador → `package_schema` o `nullifiers_unique` falla con "nullifier no canónico en #3".
- **Resultado HOY (ejecutado el 2026-10-24 con un script temporal sobre `valid.json`):**
  ```
  verifyProof(nullifier "0"+n) = true ; verifyProof(nullifier hex) = true
  appendBallot(...)            = "ACCEPTED len=4"
  verifyPackage(paquete reconstruido) = { valid: true, failing: [], tally: {counts:[1,3,0], invalid:0, total:4} }
  ```
- **Dónde se prueba hoy:** **falta test.**
- **Propuesta para QA:** en `packages/protocol-adapter/test/adapter.test.ts`, `it("AT-03b rechaza nullifier no canónico")` con las tres variantes; en `apps/verifier/test/adversarial.test.ts`, el paquete reconstruido (reutilizar el bloque `rechain`/`recount`/`tallyHash` del test del ancla) debe salir `valid:false`. Fixture nuevo `double_vote_noncanonical.json`. **Este test tiene que estar en rojo antes del fix y en verde después; es requisito para desbloquear el release.**

### AT-03c — `message` en hex: un votante sabotea la verificación (**alto A1**)
- **Pasos:** emitir una boleta válida y cambiar `message:"1"` por `"0x1"` antes de enviarla (la prueba sigue verificando).
- **Resultado esperado (tras el fix):** `POST /vote` → 400 `invalid_input`; adaptador → `INVALID_ENCODING`; el paquete de la elección sigue `valid:true`.
- **Resultado HOY (ejecutado):** `appendBallot` la acepta; `tally` → `{counts:[1,1,0], invalid:1}`; `verifyPackage(buildAuditPackage(...))` → `valid:false`, "package_schema: ledger.0.proof.message: string decimal". **La elección honesta acaba en `failed`.**
- **Propuesta para QA:** mismo archivo que AT-03b, `it("AT-03c message no canónico se rechaza en la entrada")`.

## AT-04 — `groupRoot` cambiado tras `/open`
- **Precondición (v1):** elección en `open` con el padrón congelado (`groupRoot` R0).
- **Pasos:** (1) `POST /api/voters/:id/identity` con un commitment nuevo después de `/open`; (2) enviar una prueba generada contra un padrón con un miembro extra (raíz R1); (3) en la copia del paquete, sustituir un commitment (`wrong_root.json`).
- **Resultado esperado:** (1) `409 closed` (no se admiten commitments fuera de `registration`); (2) `LedgerRejection WRONG_ROOT` → `403 not_eligible`; (3) `group_root` falla con "padrón alterado: raíz recomputada … ≠ groupRoot publicada".
- **Dónde se prueba hoy:** (2) `adapter.test.ts` ("prueba de otro padrón" → `WRONG_ROOT`); (3) `verifier.test.ts` ("wrong_root.json"). **En verde.** (1) **falta test** (la ruta v1 no existe).
- **Propuesta para QA:** `apps/web/src/lib/server/__tests__/phase2.test.ts` → `it("AT-04 /identity tras /open → 409 y groupRoot no cambia")`, que compruebe que `election.groupRoot` sigue igual y que `/roll` devuelve los mismos commitments.

## AT-05 — Sorteo con seed distinta o candidatos cambiados
- **Precondición (v1):** elección `auditable` con `finalHash` F, `candidates` C (ordenados por id), `N` derivado del resultado.
- **Pasos:** en la copia del paquete: (a) `draw.seed` ≠ `keccak256(F)`; (b) seed correcta pero `winners` permutados o cambiados; (c) añadir o quitar un candidato de `candidates` y recalcular `winners` con la semilla correcta; (d) `N` distinto del que sale del tally (incluido un empate).
- **Resultado esperado:** `draw_matches` falla en (a), (b) y (d) con la causa ("seed ≠ keccak256(finalHash)", "ganadores recomputados […] ≠ publicados", "N publicado ≠ N del resultado"). En (c) **solo se puede detectar si `candidates` está en el manifiesto** (fix A5): entonces falla `manifest_hash` o `draw_matches`. Con el diseño actual, (c) **pasaría**.
- **Dónde se prueba hoy:** **falta test** (`draw.ts` y `draw_matches` todavía no existen).
- **Propuesta para QA:** `packages/protocol-adapter/test/draw.test.ts` (determinismo: misma entrada → mismos ganadores; vector fijo conocido) y `apps/verifier/test/adversarial.test.ts` → `describe("AT-05 sorteo")` con (a)-(d). Fixtures `draw_wrong_seed.json`, `draw_swapped_candidates.json`.

## AT-06 — Tally inflado
- **Precondición:** `valid.json`.
- **Pasos:** `tally.counts[0] += 1; counts[1] -= 1`, recalculando `tallyHash` y `checksums.tally` (también probar `total += 1` sin tocar el ledger).
- **Resultado esperado:** `tally_matches` falla con "opción 0 (opt-a): publicado 2, recomputado 1; opción 1 (opt-b): publicado 1, recomputado 2" (y "total: publicado 4, boletas en el ledger 3").
- **Dónde se prueba hoy:** `tampered_total.json` + `verifier.test.ts` ("tampered_total.json → tally_matches falla con la discrepancia concreta"). **En verde.** La variante `total+1` **falta**; propuesta: un `it` más en el mismo describe.
- **Nota:** el inflado *consistente* (que rehace también el ledger) es AT-03b.

## AT-07 — FaceBinding con firma ajena
- **Precondición (v1):** votante V1 con `faceBindingHash` H1 emitido por `/face/enroll`; wallets W1 (de V1) y W2 (del atacante).
- **Pasos:** (a) `POST /voters/V1/wallet {walletAddress: W1, bindingSignature: firma de W2 sobre FaceBinding{…, wallet: W1}}`; (b) firma válida de W1 pero sobre `voterId: V2` o `electionId` de otra elección (replay); (c) firma correcta con `faceBindingHash` ≠ H1; (d) `kind:"kernel"` sin RPC disponible.
- **Resultado esperado:** (a), (b) y (c) → `403 forbidden` con la causa; el votante **no** pasa a `registered`. (d) → `503 unavailable` (nunca aceptar por defecto).
- **Dónde se prueba hoy:** **falta test** (la ruta v1 no existe; v0 enlaza la wallet sin firma, `voters/[id]/wallet/route.ts:15-31`).
- **Propuesta para QA:** `apps/web/src/lib/server/__tests__/phase2.test.ts` → `describe("AT-07 FaceBinding")` con cuentas viem `privateKeyToAccount` para W1/W2 (EOA, sin red) y un `verifyTypedData` simulado para el caso kernel.
- **Sub-casos biométricos:**
  - **AT-07b** (A4): enrolar V2 con el descriptor de V1 + ruido gaussiano σ=0,05 → documentar si pasa del umbral 0,75. Se espera que **pase**; el test fija la limitación, no un control.
  - **AT-07c** (A2): después de `POST /open`, `store` no tiene `faceTemplates` de esa elección.

## AT-08 — Inyección de commitment duplicado
- **Precondición (v1):** fase `registration`; commitment C1 de V1 ya inscrito (público en `/roll`).
- **Pasos:** (a) V2, con su propio token, hace `POST /voters/V2/identity {commitment: C1}`; (b) el mismo V1 reenvía su commitment; (c) en la copia del paquete, `commitments.push(commitments[0])` y se recalculan `groupRoot`, génesis y cadena.
- **Resultado esperado:** (a) y (b) → `409` ("commitment ya inscrito" / "una sola vez por votante"); (c) el check `commitments_unique` (propuesto, M3) falla con "commitment #3 duplica #0". **Hoy (c) pasa**: `group_root` recalcula la raíz con el duplicado y no lo marca (`verify.ts:149-163`; comprobado que la raíz cambia y que nada lo rechaza).
- **Dónde se prueba hoy:** **falta test.**
- **Propuesta para QA:** (a) y (b) en `phase2.test.ts`; (c) en `apps/verifier/test/adversarial.test.ts` con un fixture `duplicate_commitment.json`.

## AT-09 — Un tercero infla el censo (endpoints sin auth)
- **Precondición:** elección `open` (v0) o `registration` (v1) creada por el organizador.
- **Pasos:** (a) sin credenciales, `POST /api/elections/:id/voters {voters:[{displayName:"x"}]}`; (b) con el token devuelto, `face/enroll` con un vector aleatorio de 1024 floats, `wallet` con una cuenta nueva, y votar; (c) `POST /api/elections/:id/close` sin credenciales; (d) webhook de Kapso firmado con `QUORUM <id>` desde un teléfono que no está en el censo.
- **Resultado esperado (tras el fix C4/A6):** (a) y (c) → `401/403`; (b) no llega a empezar; (d) → `ignored`, sin crear `Voter`.
- **Resultado HOY:** (a) devuelve `201` con `inviteToken` (`elections.ts:122-124`); (c) cierra la elección; (d) crea un votante (`kapso.ts:106-121`). El test actual `units.test.ts` ("opt-in QUORUM <id> crea al votante…") **afirma el comportamiento vulnerable** y hay que invertirlo.
- **Propuesta para QA:** `apps/web/src/lib/server/__tests__/authz.test.ts` con (a)-(d); al cambiar el webhook, actualizar `units.test.ts:153`.

## AT-10 — Privacidad de datos públicos y de la DB (`public_data_privacy`)
- **Precondición:** elección con 6 votantes ficticios que votan en orden conocido.
- **Pasos:**
  - (v0, C5) Votar con 3 votantes y luego, leyendo **solo** el store (`listVoters`, `listBallots`, nonces), intentar reconstruir votante → opción: (i) unir `votedAt == receivedAt`; (ii) para cada nonce usado, `keccak256(electionId|opt|nonce)` contra `ballot.commitment`.
  - (v1, C3) Durante `open`, consultar `GET /voters` y `GET /ledger` después de cada voto y cruzarlos.
  - (v1, C2) Comprobar que el body de `POST /vote` no admite `onchain`/`txHash` y que ninguna petición lleva a la vez un `commitment` (o una wallet) y un `message`.
  - Todas las versiones: `JSON.stringify` de `/artifacts`, `/tally`, `/ledger`, `/voters` no contiene `displayName`, `phoneE164`, `inviteToken`, `walletAddress` ni `faceBindingHash`.
- **Resultado esperado (tras el fix):** la reconstrucción v0 falla (o la ruta v0 ya no existe); en v1, `/ledger` no trae `message` durante `open` y `/voters` exige el token del organizador; `/vote` rechaza `onchain` con 400.
- **Resultado HOY:** v0 → (i) y (ii) reconstruyen el 100 % (por lectura de código: `vote.ts:111-121`, `client/vote.ts:33-35`; **no se ejecutó**: QA debe confirmarlo con el test). v1 → por diseño, el cruce identifica cada voto.
- **Dónde se prueba hoy:** parcial: `packages/demo-fixtures/src/__tests__/fixtures.test.ts` ("no contiene PII…") cubre solo el paquete v0 de muestra. **El resto falta.**
- **Propuesta para QA:** `apps/web/src/lib/server/__tests__/privacy.test.ts` con un `describe` por vector; el test de cruce v1 se escribe **antes** de implementar `/ledger` y `/voters`.

---

## Gate de release propuesto
`release_blocked` pasa a `false` solo cuando AT-03b, AT-03c, AT-09 y AT-10 (con la parte v1 escrita) están en verde en CI y registrados en `docs/TEST_RESULTS.md` con comando y timestamp, y C2/C3 están corregidos en `docs/API_CONTRACT.md`.
