# Evidencia de pruebas — Quórum

Regla: **nunca se declara un test pasado sin haberlo ejecutado.** Cada entrada lleva comando, versiones, timestamp (America/Caracas) y salida real resumida. Lo que no se ejecutó aparece como `fixme` o `pendiente`.

## 2026-10-24 · Infraestructura de pruebas (quorum-qa, rama `qa/infra-pruebas`)

### Entorno

| Herramienta | Versión |
|---|---|
| node | v22.17.0 |
| pnpm | 10.18.0 (vía `npx pnpm@10`; no está en PATH local) |
| vitest | 3.2.7 |
| @playwright/test | 1.64.1 (Chromium 1248 / 156.0.8078.4, cache `~/Library/Caches/ms-playwright`) |
| next | 16.4.3 |
| zod | 4.6.7 |
| tsx | 4.23.15 |
| SO | macOS Darwin 25.6.0 (arm64) |

### Estado de partida (antes de los cambios)

`pnpm test` en la raíz **fallaba**: `apps/web` declara `vitest run --passWithNoTests` sin tener `vitest` instalado (`sh: vitest: command not found`, `spawn ENOENT`). Corregido añadiendo `vitest` como devDependency de `@quorum/web` y un `apps/web/vitest.config.ts` que excluye `e2e/**` (Playwright) del patrón de Vitest.

### Comandos ejecutados

#### 1. `pnpm --filter @quorum/demo-fixtures fixtures:build` — 10:22 (America/Caracas)

Genera el paquete íntegro y las 4 copias adulteradas de forma determinista.

```
[fixture] escrito .../fixtures/audit-package.sample.json (5 boletas, manifestHash sha256:d6b730ae8ef2830460bcdd35b64826990c486dde120dc11e65cdfb15cef8f80f)
[fixture] tampered_total:  oráculo valid=false; fallan: checksum_result, total_matches_ballots, proof
[fixture] removed_record:  oráculo valid=false; fallan: checksum_ballots, total_matches_ballots, proof
[fixture] wrong_manifest:  oráculo valid=false; fallan: manifest_hash, checksum_manifest
[fixture] tampered_proof:  oráculo valid=false; fallan: checksum_result, proof
```

#### 2. `pnpm test` (raíz, `pnpm -r test`) — 2026-10-24 10:22:56 -04 · **verde**

```
apps/web test: No test files found, exiting with code 0
packages/contracts test:  Test Files  1 passed (1)
packages/contracts test:       Tests  55 passed (55)
packages/contracts test:    Duration  343ms
packages/demo-fixtures test:  Test Files  1 passed (1)
packages/demo-fixtures test:       Tests  28 passed (28)
packages/demo-fixtures test:    Duration  313ms
```

Una corrida previa (10:22:39) falló 1/28 en demo-fixtures: el teléfono ficticio generado tenía un dígito de menos (`+155501001`). Se corrigió el generador a `+15550100NN` (bloque reservado para ficción) y se regeneraron los fixtures.

#### 3. `pnpm --filter @quorum/web exec playwright test e2e/smoke.spec.ts` — 2026-10-24 10:23:05 -04 · **verde**

Levanta `pnpm dev` (Next 16, puerto 3000) vía `webServer` y corre contra la app actual de create-next-app.

```
Version 1.64.1
Running 4 tests using 4 workers
  ✓  1 [chromium]   › e2e/smoke.spec.ts:8:7  › smoke › la portada responde 200 y tiene un h1 (1.4s)
  ✓  4 [chromium]   › e2e/smoke.spec.ts:18:7 › smoke › el documento declara idioma (base de accesibilidad) (1.4s)
  ✓  2 [mobile-360] › e2e/smoke.spec.ts:18:7 › smoke › el documento declara idioma (base de accesibilidad) (1.4s)
  ✓  3 [mobile-360] › e2e/smoke.spec.ts:8:7  › smoke › la portada responde 200 y tiene un h1 (1.4s)
  4 passed (6.9s)
```

#### 4. `pnpm --filter @quorum/web exec playwright test` (suite completa) — 2026-10-24 10:23:25 -04

```
  26 skipped
  4 passed (3.5s)
```

Los 26 `skipped` son los `test.fixme` de `e2e/voter-flow.spec.ts` (13 tests × 2 proyectos). `playwright test --list`: 30 tests en 2 archivos.

#### 5. `pnpm typecheck` y `pnpm lint` — 10:23 · **verdes**

`apps/web typecheck: Done`, `packages/contracts typecheck: Done`, `packages/demo-fixtures typecheck: Done`; `eslint` de `apps/web` sin hallazgos (incluye `e2e/**` y `playwright.config.ts`).

Nota: en un árbol limpio, antes de correr `next dev`/`next build`, `apps/web` typecheck falla con `src/app/layout.tsx(20,50): Cannot find name 'LayoutProps'` porque Next 16 genera ese tipo en `.next/dev/types`. Es preexistente (create-next-app) y afecta al job `verify` de CI, que corre `pnpm typecheck` antes de `pnpm build`. Propiedad frontend; sugerencia: `next typegen` antes del typecheck o invertir el orden en CI.

### Qué cubre cada suite

**`packages/contracts/src/__tests__/schemas.test.ts` (55 tests)** — contrato Zod v0:
Election (válida, defaults, título <3, opciones <2 y >10, enums, fechas ISO, sin campos de PII) · CreateElectionInput (strip de campos de servidor) · Voter (E.164 válido/6 inválidos, wallet 0x40hex, sin campo elector→opción) · InviteRequest (1..500, canal) · FaceEnrollInput/FaceVerifyResult (descriptor 64..2048, `consent: true` literal, `mode: demo-liveness`, sin campo imagen) · SignedVote · Receipt (estados honestos; rechaza `verificado`) · Aggregates (turnout ∉ [0,1] rechazado, `count: null`, enteros, strip de votos individuales) · Tile/LiveLayout (tile desconocido, métrica inventada, texto libre, orientación, 2..6 tiles, columns) · AuditResult (`valid` booleano, campos obligatorios de método/versión/digest) · ApiError.

**`packages/demo-fixtures/src/__tests__/fixtures.test.ts` (28 tests)** — fixtures etiquetados `fixture`:
elección y 6 votantes ficticios cumplen el contrato · paquete íntegro determinista (disco == generador), forma `{manifest, ballots[{inclusionId, commitment}], result{counts}, versions, checksums}`, sin PII (spec §9.8), oráculo `valid=true`, Aggregates derivable · 4 copias adulteradas: deterministas, etiquetadas `fixture.tamper`, rechazadas por el oráculo con causa.

**`apps/web/e2e/smoke.spec.ts` (2 × 2 proyectos)** — ejecutados de verdad (ver §3).

**`apps/web/e2e/voter-flow.spec.ts` (13 × 2 proyectos, todos `fixme`)** — organizar en `/org/new` → publicar (manifiesto inmutable) → 3 votantes desde 3 contextos de navegador → duplicado según motor → no elegible → resultados en vivo solo agregados → cerrar + paquete sin PII → auditor con método/versión/hash → copia alterada ⇒ `FALLO DETECTADO` y original intacto → coordinador caído ⇒ `no verificable` → móvil 360px sin scroll horizontal y foco visible → live region. Se activan quitando `fixme` cuando existan las rutas de `docs/API_CONTRACT.md`.

### Casos adversariales (spec §9) — resultado REAL por caso

Detección hecha por `checkIntegrity()` de `@quorum/demo-fixtures` (oráculo de pruebas que recalcula hashes/consistencia), **no** por `apps/verifier`, que aún no existe. Cuando exista, estos mismos fixtures deben pasar por él.

| Caso | Resultado | Evidencia |
|---|---|---|
| 1 `tampered_total` | **detectado** — `total_matches_ballots`: "discrepancia: suma de conteos 6, totalVotes 6, boletas incluidas 5" | fixtures.test.ts |
| 2 `tampered_proof` | **detectado** — `proof`: la prueba no verifica; boletas y conteos intactos | fixtures.test.ts |
| 3 `removed_record` | **detectado contra la copia** (`checksum_ballots`); **cobertura no demostrada** frente al motor: el test demuestra que si la boleta se omite antes de firmar checksums/prueba, el oráculo acepta el paquete (`integrity-demo` no prueba completitud) | fixtures.test.ts |
| 4 `wrong_manifest` | **detectado** — `manifest_hash` y `checksum_manifest` | fixtures.test.ts |
| 5 `double_vote` | **pendiente** (sin backend); E2E 3b en `fixme`, redactado para aceptar rechazo o reemplazo según ADR-001 | voter-flow.spec.ts |
| 6 `non_eligible` | **pendiente** (sin backend); E2E 3c en `fixme` | voter-flow.spec.ts |
| 7 `unavailable_coordinator` | **pendiente**; E2E 8 en `fixme` (intercepta `/api/audit/verify` con 503 y exige `no verificable`) | voter-flow.spec.ts |
| 8 `public_data_privacy` | **cumple en fixtures**: el paquete publicado no contiene nombres, teléfonos, tokens, ids de votante ni `choice`; Aggregates descarta votos individuales por strip de Zod. Advertencia: metadatos (orden/tiempo de inclusión) no evaluados | fixtures.test.ts, schemas.test.ts |

### Accesibilidad

Solo la base: `<html lang>` presente (smoke). Teclado, foco, live regions, contraste y `prefers-reduced-motion` quedan en `fixme` hasta que exista la UI; añadir `@axe-core/playwright` en ese momento.

### Fallos conocidos / pendientes

- `apps/web` typecheck requiere tipos generados por Next (ver §5). Riesgo para el job `verify` de CI.
- `pnpm` no está en el PATH de esta máquina; todo se corrió con `npx --yes pnpm@10`. El `webServer` de Playwright ejecuta `pnpm dev`, que funcionó porque `npx` añade `pnpm` al PATH del proceso hijo.
- Job `e2e` añadido a `.github/workflows/ci.yml` (`playwright install --with-deps chromium`); **no ejecutado aún en GitHub Actions**.
- `apps/verifier` y `packages/protocol-adapter` no existen: los casos adversariales están demostrados solo con el oráculo de fixtures.


---

# Evidencia de pruebas

Regla (CLAUDE.md #6): nunca declarar tests pasados si no se ejecutaron. Cada sección lista comandos, versiones, timestamps (UTC) y salida real.

## Protocolo (Plan A) — crypto, 2026-10-24

**Entorno:** macOS (Darwin 25.6.0), Node v22.17.0, pnpm 10.18.0, vitest 3.2.7, `@semaphore-protocol/core` 4.14.5 (snarkjs 0.7.5), `viem` 2.57.11. Rama `worktree-agent-af92e8779c55801f6`.

### 1. Artefactos vendorizados (2026-10-24T14:22:38Z)
```
$ curl -fsSL -o semaphore-10.wasm https://snark-artifacts.pse.dev/semaphore/4.13.0/semaphore-10.wasm   (1 815 560 B)
$ curl -fsSL -o semaphore-10.zkey https://snark-artifacts.pse.dev/semaphore/4.13.0/semaphore-10.zkey   (2 422 238 B)
$ shasum -a 256 semaphore-10.wasm semaphore-10.zkey
1e9e1e3ad9917164bc96c751e32fae724400b92063f5a2cfd22ca64674bf4f96  semaphore-10.wasm
f644af6753be9d48454d8f9bb74bf2e9a416dd7d1a704c3cf1d50e535969a19a  semaphore-10.zkey
```
`scripts/copy-artifacts.sh` ejecutado contra un directorio temporal (no se tocó `apps/web`): `copied semaphore-10.{wasm,zkey} -> … (sha256 ok)`, exit 0.

### 2. Fixtures generados (2026-10-24T14:29:04Z)
```
$ pnpm --filter @quorum/protocol-adapter fixtures
valid.json: 3 boletas, tally={"counts":[1,2,0],"invalid":0,"total":3}, root=105088850375…, finalHash=0x122281d0c1470dcd… (1037 ms)
wrote …/packages/demo-fixtures/protocol/{valid,tampered_total,tampered_proof,removed_record,removed_record_rechained,wrong_manifest,double_vote,wrong_root}.json
done in 1055 ms
```
Pruebas Groth16 reales (3 votantes, votos `[1,0,1]`), ~0,35 s por boleta. Todo etiquetado `fixture`.

### 3. Tests unitarios/integración del adaptador (2026-10-24T14:32:10Z)
```
$ pnpm --filter @quorum/protocol-adapter test
 ✓ test/adapter.test.ts (12 tests) 1898ms
 Test Files  1 passed (1)   Tests  12 passed (12)   Duration  2.62s
```
Cubre: SHA-256 de artefactos · hash canónico · scope determinista · identidad→grupo→prueba (depth 10, scope, raíz) · prueba manipulada no verifica · no elegible no puede emitir (`NOT_IN_GROUP`) · ledger acepta 3 y rechaza `DOUBLE_VOTE` (mismo nullifier con otro mensaje), `WRONG_ROOT` (raíz dada y prueba de otro padrón), `WRONG_SCOPE` (prueba de otra elección), `INVALID_PROOF` · tally `[1,2,0]` · paquete sin claves privadas y serializable · ancla: calldata ida/vuelta, `anchorOnBaseSepolia` + `readAnchor` con transporte simulado, rechazo de chainId ≠ 84532 · EAS desactivado por defecto y `attest()` + uid con bandera.

### 4. Tests del verificador independiente (2026-10-24T14:32:18Z)
```
$ pnpm --filter @quorum/verifier test
 ✓ test/verifier.test.ts (10 tests) 1203ms
 Test Files  1 passed (1)   Tests  10 passed (10)   Duration  1.74s
```
Cubre cada fixture (check exacto que falla + `reason` concreta), entrada no válida (`package_schema`, nunca lanza), protocolo distinto rechazado, y un flujo generado en el test con ancla simulada: `anchor_matches` pasa con RPC simulado, queda `no evaluado` sin RPC, una eliminación con cadena/tally/checksums rehechos **solo** se detecta contra el ancla (`hash final ≠ ancla`), y un RPC caído produce fallo explícito (nunca éxito).

### 5. Typecheck
```
$ pnpm --filter @quorum/protocol-adapter --filter @quorum/verifier typecheck
packages/protocol-adapter typecheck: Done
apps/verifier typecheck: Done
```

### 6. CLI real (2026-10-24T14:32:43Z – 14:33:21Z)
```
$ pnpm --filter @quorum/verifier verify packages/demo-fixtures/protocol/valid.json
{"electionId":"fixture-condominio-2026","verifierVersion":"quorum-verifier/0.1.0 (semaphore-core 4.14.5)","protocol":"semaphore-ledger",
 "inputArtifactDigest":"sha256:f1bc0f439a2fc84dedb181b72b001019be70b4a6d6ce758bcb416a3eab6e5dca","checkedAt":"2026-10-24T14:32:54.890Z","valid":true,
 "checks":[package_schema ✓, manifest_hash ✓ (0xe6b670faff25fa1e…), group_root ✓ (3 commitments), chain_integrity ✓ (finalHash 0x122281d0c1470dcd…),
           proofs_valid ✓ (3/3), nullifiers_unique ✓ (3), tally_matches ✓ ([1,2,0]), anchor_matches ✓ "no evaluado: el paquete no declara ancla on-chain"],
 "unsupportedGuarantees":[secreto-del-contenido-frente-al-servidor, resistencia-a-coaccion, validez-0/1-de-boletas-cifradas, identidad-civil,
                          prueba-criptografica-de-escrutinio, inmutabilidad-on-chain (sin ancla), completitud-del-ledger (sin ancla)]}
EXIT 0

$ pnpm --filter @quorum/verifier verify packages/demo-fixtures/protocol/tampered_total.json
 "valid":false … {"name":"tally_matches","passed":false,
   "reason":"total publicado ≠ recomputado: opción 0 (opt-a): publicado 2, recomputado 1; opción 1 (opt-b): publicado 1, recomputado 2"}
EXIT 1
```
Corrida sobre todos los fixtures (`tsx apps/verifier/src/cli.ts <fixture>`), 2026-10-24T14:33:21Z:
```
== valid.json → exit 0, valid=true, 784 ms
== tampered_total.json → exit 1, valid=false, 861 ms
   FAIL tally_matches: total publicado ≠ recomputado: opción 0 (opt-a): publicado 2, recomputado 1; opción 1 (opt-b): publicado 1, recomputado 2
== tampered_proof.json → exit 1, valid=false, 819 ms
   FAIL proofs_valid: boleta #1: la prueba Groth16 de Semaphore no verifica (contenido o prueba alterados)
== removed_record.json → exit 1, valid=false, 743 ms
   FAIL chain_integrity: cadena rota en #1: idx=2
   FAIL tally_matches: total publicado ≠ recomputado: opción 0 (opt-a): publicado 1, recomputado 0; total: publicado 3, boletas en el ledger 2
== removed_record_rechained.json → exit 0, valid=true, 752 ms
   (límite declarado) unsupported: completitud-del-ledger: sin ancla, una boleta eliminada con la cadena rehecha solo la detecta el votante con su recibo (nullifier)
== wrong_manifest.json → exit 1, valid=false, 764 ms
   FAIL manifest_hash: manifiesto alterado: sha256(manifest) 0x90b690f7…aefea356 ≠ manifestHash publicado 0xe6b670fa…fde3042d5; checksums.manifest ≠ sha256(manifest)
== double_vote.json → exit 1, valid=false, 909 ms
   FAIL nullifiers_unique: doble voto: #3 repite el nullifier de #0
== wrong_root.json → exit 1, valid=false, 865 ms
   FAIL group_root: padrón alterado: raíz recomputada desde 3 commitments 156319214086… ≠ groupRoot publicada 105088850375…
```
Corrida final tras mejorar el texto de `chain_integrity` (2026-10-24T14:37:18Z; verificador re-testeado a las 14:37:05Z: 10 passed, typecheck Done):
```
== valid.json → exit 0, valid=true, 797 ms
== tampered_total.json → exit 1, valid=false, 729 ms      FAIL tally_matches (idéntico a arriba)
== tampered_proof.json → exit 1, valid=false, 777 ms      FAIL proofs_valid: boleta #1 …
== removed_record.json → exit 1, valid=false, 717 ms
   FAIL chain_integrity: cadena rota en #1: la entrada en esa posición tiene idx=2 (falta o sobra al menos una boleta)
   FAIL tally_matches: … total: publicado 3, boletas en el ledger 2
== removed_record_rechained.json → exit 0, valid=true, 718 ms   (límite declarado)
== wrong_manifest.json → exit 1, valid=false, 733 ms      FAIL manifest_hash
== double_vote.json → exit 1, valid=false, 746 ms         FAIL nullifiers_unique: #3 repite el nullifier de #0
== wrong_root.json → exit 1, valid=false, 728 ms          FAIL group_root
```

### Mapa con §9 de la spec (pruebas adversariales)
| Caso | Resultado | Cobertura |
|---|---|---|
| 1 `tampered_total` | `valid=false`, `tally_matches` con discrepancia por opción | demostrada |
| 2 `tampered_proof` | `valid=false`, `proofs_valid` boleta #1 no verifica | demostrada |
| 3 `removed_record` | `valid=false`, `chain_integrity` + `tally_matches` | demostrada para eliminación ingenua; **eliminación con cadena rehecha solo contra ancla** (`removed_record_rechained`, test con ancla simulada) — cobertura sin ancla **no demostrada**, declarada en `unsupportedGuarantees` |
| 4 `wrong_manifest` | `valid=false`, `manifest_hash` | demostrada |
| 5 `double_vote` | `appendBallot` ⇒ `DOUBLE_VOTE` (rechazo, no reemplazo); paquete con nullifier repetido ⇒ `nullifiers_unique` | demostrada |
| 6 `non_eligible` | `castBallot` ⇒ `NOT_IN_GROUP`; prueba contra otro padrón ⇒ `WRONG_ROOT`; en paquete ⇒ `group_root`/`proofs_valid` | demostrada |
| 7 `unavailable_coordinator` | no hay coordinador; RPC de ancla caído ⇒ `anchor_matches` falla con `no se pudo leer…`, nunca éxito | demostrada (simulado) |
| 8 `public_data_privacy` | paquete sin nombres/teléfonos/claves (test: ninguna clave privada aparece); **advertencia:** `message` en claro ⇒ el organizador ve qué se votó aunque no quién | demostrada con límite declarado |

### Problemas conocidos
- **No se ha enviado ninguna tx real a Base Sepolia** (sin clave con fondos; decisión humana). Ancla y EAS probados con transporte simulado.
- `pnpm -r typecheck` y `pnpm -r test` fallan en `apps/web` por causas ajenas a este carril (`LayoutProps` no definido en `src/app/layout.tsx`; `vitest` no instalado en `apps/web`). No se tocó `apps/web`.
- Lectura de `attestationUid` (EAS) en el verificador CLI: no implementada; se reporta `no evaluado`.
- `ranking`/`budget`: el `message` es un índice de opción; esas modalidades necesitan otra codificación (no hecha).

---

## 2026-10-24 · Fase 2 — motor Contrato v1 (quorum-backend + quorum-crypto, rama `feat/phase2-engine`)

Entorno: macOS (Darwin 25.5), Node 22, `pnpm@10.18.0`, Next.js 16.4.3 (Turbopack). Sin red para cadena: ancla y RPC simulados por inyección en tests; **ninguna transacción real enviada**.

### Comandos ejecutados (2026-10-24 12:12:32 -0400) · **todos verdes**
```
$ pnpm typecheck                      → exit 0 (contracts, protocol-adapter, verifier, demo-fixtures, web)
$ pnpm lint                           → exit 0
$ pnpm test                           → exit 0
packages/contracts        ✓ src/__tests__/schemas.test.ts (63 tests) 14ms
packages/protocol-adapter ✓ test/draw.test.ts (5) · ✓ test/adversarial.test.ts (3) 511ms · ✓ test/adapter.test.ts (12) 1088ms   → 20 passed
packages/demo-fixtures    ✓ src/__tests__/fixtures.test.ts (28 tests)
apps/verifier             ✓ test/adversarial.test.ts (3) 575ms · ✓ test/verifier.test.ts (10) 1105ms · ✓ test/draw.test.ts (6) 1316ms → 19 passed
apps/web                  ✓ units.test.ts (11) · ✓ flow.test.ts (14) 3800ms → 25 passed
Total: 155 tests, 0 fallos
$ pnpm --filter @quorum/web build     → exit 0 ("✓ Compiled successfully", 26 rutas /api incluidas las nuevas)
```

### Qué cubren los tests nuevos (todo con pruebas Semaphore Groth16 reales, no simuladas)
- **Flujo completo Los Samanes** (`flow.test.ts`): 6 inscritos (rostro → firma EIP-712 `FaceBinding` → commitment) → `open` (groupRoot) → 5 votos → tally con umbral de 5 → recibo por nullifier → doble voto 409 → `close` (`auditable`, `verifyPackage` real, ancla "no evaluado") → paquete sin PII con `ETag`/304 → `draw` (N=3, `draw_matches` PASS) → `/api/audit/verify` válido; copia con tally alterado → `tally_matches` FAIL; basura → `package_schema` FAIL.
- **Inscripción:** dedupe 1:N → 409 `duplicate_identity` sin guardar nada; misma cara en otra elección sí; face/verify exige `inviteToken` y no devuelve similitud (A3); wallet exige rostro, firma propia y sobre su `faceBindingHash`; `kernel` sin RPC → 503; `kernel` con verificador ERC-1271/6492 inyectado → OK; identidad una vez, commitment único, no canónico → 400; nada se admite tras `open`; plantillas faciales borradas al abrir (A2).
- **Voto:** en `registration` → 409; nullifier `"0"+n` → 400 (C1); `message` hex → 400 (A1); scope de otra elección → 403; prueba alterada → 403 "no verifica"; opción fuera de rango → 400 sin consumir el nullifier; tras cerrar → 409. `GET /ledger` sin entradas mientras está `open` (C3). `onchain.txHash` ignorado por defecto (C2).
- **Cierre:** ancla con transporte simulado → `anchor_matches` PASS y calldata = `(finalHash, groupRoot, tallyHash, electionId)`; ledger alterado en la base → estado `failed` con `chain_integrity`/`proofs_valid` FAIL publicados.
- **Auth (C4/A7):** sin token, con token de otra elección o `Basic` → 401 en publish/voters/invites/open/close/draw; GET /voters público solo agregados; el token no aparece en GET /elections ni se guarda en claro.
- **Protocolo:** sorteo determinista e independiente del orden; empate → N menor (`tieBreak: "lowest"`); verificador detecta ganadores cambiados, N inflado, semilla falsa, sorteo sin regla, regla cambiada tras publicar (manifest_hash), sin `tieBreak`; C1 en el verificador (paquete con nullifier `"0"+n` → `package_schema` FAIL); M3 (`commitments_unique` FAIL "commitment #2 duplica #0").

### `seed:demo` real (store en directorio temporal, 2026-10-24 ~12:08 -0400)
```
$ DATA_DIR=<tmp> pnpm --filter @quorum/web seed:demo -- --simulate 6 --full
✔ el_demo_los_samanes · estado registration · manifestHash 0xede8c1b59ab928b1dba0156728fc6555b7a870b661cad4166243815fe3843437
  · inscrito vt_… (simulado) ×6
✔ open · groupRoot 9031565953714164753025204305915415947152527370743909802554256206822167163514
  · boleta #0..#5 incluida
✔ close → auditable · verificador valid=true · ancla: ancla deshabilitada: faltan ORGANIZER_PRIVATE_KEY y/o BASE_SEPOLIA_RPC; el verificador la declara no evaluada
    PASS package_schema · manifest_hash · group_root · commitments_unique · chain_integrity · proofs_valid (6/6) · nullifiers_unique
    PASS tally_matches: recuento reproducido: [1,1,3,1,0] (6 boletas, 0 inválidas)
    PASS anchor_matches: no evaluado: el paquete no declara ancla on-chain
    PASS draw_matches: no evaluado: el manifiesto declara sorteo pero aún no se ha realizado
✔ draw → drawn · N=3 · ganadores p-02, p-01, p-06 · seed 0xf4ea2144ed786ac78943d789963ffb13b68bdda732c14334bf41b2b931e9e9cf
```
### Humo HTTP contra `next start` (build de producción, mismo store)
`GET /artifacts` → 200 con `etag`; `POST /api/audit/verify` con ese paquete → `valid: true`, 10/10 checks (incluye `draw_matches` recomputado) y `inputArtifactDigest: sha256:…`; `GET /voters` público → solo `counts`; `POST /draw` sin token → 401. Confirma que `verifyProof` (snarkjs) funciona dentro del bundle de Turbopack.

### Límites conocidos (no ocultos)
- Ancla real en Base Sepolia **no ejecutada** (requiere decisión humana; el script la bloquea salvo `--anchor`).
- La firma Kernel real (ERC-6492) no se probó contra RPC: solo con verificador inyectado.
- Correlación por tiempo: `POST /voters/:id/voted` (autodeclarado) y el tally en vivo con ≥5 votos permiten inferencias de tiempo; ver informe.

## Sala abierta (feat/p2-sala-abierta) — 2026-10-24 ~12:30 -0400

Comando ejecutado (exit 0): `pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @quorum/web build`

### Tests (salida real, extracto)
```
packages/contracts test:       Tests  63 passed (63)
packages/wallet test:          Tests  30 passed (30)
packages/protocol-adapter test: Tests  20 passed (20)
packages/demo-fixtures test:   Tests  28 passed (28)
packages/notify test: No test files found, exiting with code 0
apps/verifier test:  ✓ test/adversarial.test.ts (3 tests) 629ms
apps/verifier test:  ✓ test/verifier.test.ts (12 tests) 1104ms
apps/verifier test:  ✓ test/draw.test.ts (6 tests) 1276ms
apps/verifier test:  Test Files  3 passed (3)
apps/verifier test:       Tests  21 passed (21)
apps/web test:  ✓ src/lib/server/__tests__/units.test.ts (11 tests) 15ms
apps/web test:  ✓ src/lib/server/__tests__/rooms.test.ts (11 tests) 387ms
apps/web test:  ✓ src/lib/server/__tests__/flow.test.ts (14 tests) 3884ms
apps/web test:  Test Files  3 passed (3)
apps/web test:       Tests  36 passed (36)
```
Build: `✓ Compiled successfully in 4.0s` · rutas nuevas `ƒ /api/elections/[id]/room`, `ƒ /api/rooms/[roomCode]`, `ƒ /api/rooms/[roomCode]/join`.

### Qué cubren (`apps/web/src/lib/server/__tests__/rooms.test.ts`, 11 tests; el último con pruebas Semaphore Groth16 reales)
- **Auth:** POST/DELETE sin Bearer o con token de otra elección → 401; GET público sin `roomCode`/`joinUrl`, con Bearer sí.
- **Fase:** sala en `draft` → 409 `closed`; tras `open` → 409; `maxSeats`/`expiresInMin` fuera de rango → 400.
- **Entrada:** votante `source:"room"`, `inviteStatus:"claimed"`, sin teléfono; `inviteToken` sirve en `GET /api/invite/:token`; código case-insensitive; código inexistente o con `../` → 404.
- **Alias raros → 400:** vacío, espacios, `<script>`, NUL, zero-width, RLO, emoji, teléfono (`+58 412 1234567`, `04121234567`), cédula (`V-12.345.678`), 33 caracteres, URL, número, null. Aceptados: `O'Neil-2`, `María_José`, `Mesa 3`, `Zoë`, `李雷`; NFD → NFC; espacios colapsados.
- **Tope:** `maxSeats=2` → tercero 409 `room_full`; 12 entradas concurrentes con tope 5 → exactamente 5 creados; reabrir con tope < ocupados → 400; ampliar conserva el código (200).
- **Expiración** (reloj simulado): a los 60,001 s → 410 `room_closed` "expiró", `closedReason:"expired"`; reabrir da código nuevo y el viejo queda cerrado.
- **DELETE** idempotente → 410 al entrar; los ya inscritos siguen.
- **Rate limit por IP:** `ROOM_JOIN_RATE_PER_MIN=2` → la tercera desde la misma IP 429; otra IP entra.
- **Apertura + paquete:** 3 entran por sala, 2 se inscriben (rostro → FaceBinding → identidad), el 3.º repite cara → 409 `duplicate_identity`; `open` cierra la sala (`election-opened`, join → 410); 1 voto real; `close` → `auditable`; `GET /artifacts` trae `rollPolicy {kind:"open-room", maxSeats:60, joined:3, enrolled:2, eligibility:"face-dedupe-demo", note}` sin alias ni ids; `verifyPackage` (en `/audit` y re-verificando en `/api/audit/verify`) `valid:true` con `unsupportedGuarantees` → `censo-abierto-en-sala: … tope 60 asientos, entraron 3, 2 llegaron al padrón de 2 commitments …`. Elección solo por invitación → sin `rollPolicy` ni nota.
- **A6** (`units.test.ts`): opt-in `QUORUM <id>` desde un número no cargado → `ignored`, 0 votantes; con el votante cargado por el organizador → reenvía su enlace (dry-run) sin duplicar.
- **Verificador** (`apps/verifier/test/verifier.test.ts`, +2): `rollPolicy` válida → sigue `valid:true` y añade la nota; mal formada → `package_schema` FAIL.

### Humo HTTP contra `next start` (build de producción; store en directorio temporal; seed `--room --seats 3`; tokens redactados)
```
$ pnpm --filter @quorum/web seed:demo -- --reset --room --seats 3 --minutes 15
✔ sala abierta HAVMTF · 3 asientos · expira 2026-10-24T16:45:16.338Z
  QR / enlace para el público: http://localhost:3191/j/HAVMTF
$ GET /api/elections/:id/room (público)
{"open":true,"seatsTaken":0,"maxSeats":3,"expiresAt":"2026-10-24T16:45:16.338Z","closedReason":null}
$ POST /api/elections/:id/room sin Bearer
{"error":"Se requiere Authorization: Bearer <organizerToken> de esta elección","code":"forbidden"} [401]
$ GET /api/rooms/havmtf (minúsculas)
{"electionId":"el_demo_los_samanes","title":"Condominio Los Samanes (ficticio): ¿cuántos proyectos vecinales financiamos?","open":true,"seatsTaken":0,"maxSeats":3,"expiresAt":"2026-10-24T16:45:16.338Z","closedReason":null}
$ POST /api/rooms/HAVMTF/join {displayName:"Ana"}
{"electionId":"el_demo_los_samanes","voterId":"vt_9ff8f3d60aaa86af","displayName":"Ana","inviteToken":"<redactado>","inviteUrl":"http://localhost:3191/v/<redactado>"} [201]
$ POST /api/rooms/HAVMTF/join {displayName:"Mesa 3"}
{"electionId":"el_demo_los_samanes","voterId":"vt_0e0b66734fee6b19","displayName":"Mesa 3","inviteToken":"<redactado>","inviteUrl":"http://localhost:3191/v/<redactado>"} [201]
$ POST /api/rooms/HAVMTF/join {displayName:"+58 412 1234567"}
{"error":"displayName: Solo letras, números, espacios y . ' _ -; displayName: No uses tu teléfono ni números de documento como alias","code":"invalid_input"} [400]
$ POST /api/rooms/HAVMTF/join {displayName:"<b>x</b>"}
{"error":"displayName: Solo letras, números, espacios y . ' _ -","code":"invalid_input"} [400]
$ POST /api/rooms/HAVMTF/join {displayName:"Beto"}
{"electionId":"el_demo_los_samanes","voterId":"vt_cf4a7085d4e806a4","displayName":"Beto","inviteToken":"<redactado>","inviteUrl":"http://localhost:3191/v/<redactado>"} [201]
$ POST /api/rooms/HAVMTF/join {displayName:"Carla"}
{"error":"La sala está llena (3 de 3)","code":"room_full"} [409]
$ GET /api/elections/:id/room (organizador)
{"open":true,"seatsTaken":3,"maxSeats":3,"expiresAt":"2026-10-24T16:45:16.338Z","closedReason":null,"roomCode":"HAVMTF","joinUrl":"http://localhost:3191/j/HAVMTF"}
$ DELETE /api/elections/:id/room
{"open":false,"seatsTaken":3,"maxSeats":3,"expiresAt":"2026-10-24T16:45:16.338Z","closedReason":"manual","roomCode":"HAVMTF","joinUrl":"http://localhost:3191/j/HAVMTF"} [200]
$ POST join tras cerrar
{"error":"La sala está cerrada","code":"room_closed"} [410]
```

### Límites conocidos (no ocultos)
- `seatsTaken` cuenta votantes creados por sala, aunque no terminen la inscripción (un asiento abandonado no se libera). El rate limit por IP es generoso (30/min) porque el wifi del evento comparte IP; el control real es `maxSeats` + expiración + dedupe facial demo.
- `rollPolicy` es una declaración del organizador fuera de `manifestHash`/`checksums`: quien manipule el paquete puede quitarla y el verificador no lo detecta. Por eso se declara como garantía no soportada, nunca como check.
- El dedupe facial es modo demo (descriptor de modelo local, umbral coseno 0,75), no una garantía biométrica.

## Sala abierta — UI (`feat/p2-sala-ui`, 2026-10-24)
Rutas nuevas: `/j/[roomCode]` (entrada móvil + modo observador), tarjeta "Sala abierta" en `/org/[id]`, `/e/[id]/proyector`.
Ejecutado en este worktree (salidas reales, resumidas):

```
$ pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @quorum/web build   → EXIT=0
packages/contracts 63 passed · packages/wallet 30 · packages/protocol-adapter 20 · packages/demo-fixtures 28
apps/verifier 21 · apps/web 90 passed (11 archivos; nuevo: src/components/__tests__/room.test.tsx, 21 tests)

$ pnpm --filter @quorum/web exec playwright test -c playwright.real.config.ts      (next start, DATA_DIR temporal, claves on-chain vacías)
✓ sala real: 2 entran por /j y llegan a /v/<token>; la sala llena ofrece modo observador   1 passed

$ E2E_PROD=1 PORT=3337 playwright test e2e/room.spec.ts                            (mocks del contrato, chromium + mobile-360)
14 passed
$ E2E_PROD=1 PORT=3337 playwright test e2e/room.spec.ts e2e/phase2.spec.ts e2e/smoke.spec.ts e2e/voter-flow.spec.ts
34 passed · 26 skipped (voter-flow v0 y capturas: se saltan por diseño)
$ E2E_PROD=1 PORT=3337 SCREENSHOTS=1 playwright test e2e/screenshots.room.spec.ts --project=chromium
20 passed → docs/screenshots/phase2/sala-*.png y proyector-*.png (360 y 1440)
```

### Descarga por teléfono (medido con CDP, Pixel 5 a 360 px, `next start`)
| Qué | Bytes transferidos |
|---|---|
| `/j/<code>` (HTML + JS + CSS + fuente) | 286 864 (25 peticiones) |
| Modelos de Human + `/zk` (14 archivos; `.wasm` con gzip, `.bin`/`.zkey` sin comprimir) | 16 474 464 |
| Chunk JS de Human (se carga en la prueba de vida) | ≈ 405 769 gzip (1 574 595 sin comprimir) |
| Chunk JS de Semaphore/snarkjs (se carga en la boleta) | ≈ 170 925 gzip (561 118) |
| **Total aproximado por teléfono** | **≈ 17,3 MB** → 60 teléfonos ≈ 1 GB por el wifi del evento |

- `/zk/*` y `/models/*` salen con `Cache-Control: public, max-age=31536000, immutable` (verificado con `curl -I`).
- `/j` registra `public/sw.js` (sólo cachea `/zk` y `/models`, cache-first) y llena Cache Storage mientras la persona escribe el alias. Medido: en la segunda visita los 4 archivos más pesados salen `fromServiceWorker: true`. Sin contexto seguro (http://IP-de-la-red) cae a `<link rel="prefetch">`; en esa medición `faceres.bin` (7 MB) NO quedó en la caché HTTP del contexto efímero de Chromium → servir la demo por HTTPS (o localhost) para que el service worker funcione.
- El mayor peso es `faceres.bin` (6,98 MB) e `iris.bin` (2,60 MB): bajarlo exige tocar la config de Human (pendiente, no se cambió).

### Arreglo de build incluido
`next build` fallaba en la base (`packages/protocol-adapter/src/artifacts.ts`: Turbopack analiza `new URL(dir, import.meta.url)` → "Can't resolve <dynamic>"; el loader `build-tools/strip-js-ext-loader.cjs` no se aplica a ese archivo). Se cambió a `Reflect.construct(URL, [dir, import.meta.url])` (mismo valor en Node; tests del adaptador 20/20). Efecto colateral: en el navegador ahora sí carga `drawWinners` del adaptador, y el mock E2E del sorteo usaba la referencia local → se alineó el mock al adaptador.
