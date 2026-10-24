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

## 2026-10-24 · Fase 2 — adversariales (quorum-qa, rama `feat/p2-qa-adversarial`)

- **Base:** `origin/integration/phase2` @ `71972af` (integration/h3 + motor de fase 2 + wallet). Fuente de los casos: `docs/ADVERSARIAL_TESTS.md` y `docs/THREAT_MODEL.md` de `origin/docs/seguridad`.
- **Entorno:** macOS (Darwin 25.5), Node v24.14.1, pnpm 10.18.0, Vitest 3.2.7. Ejecución final: 2026-10-24T16:27:23Z.
- **Regla:** todo contra el código real (`appendBallot`, `verifyPackage`, route handlers de `apps/web`), con pruebas Groth16 y firmas EIP-712 reales. Solo se simulan el store (memoria), la tx del ancla (lector inyectado, AT-02c) y la ausencia de RPC (AT-07d).

### Puerta completa (salida real)
```
$ pnpm typecheck && pnpm lint && pnpm test && pnpm --filter @quorum/web build
typecheck=0
lint=0
test=0
build=0
packages/contracts test:  Test Files  1 passed (1)
packages/contracts test:       Tests  63 passed (63)
packages/wallet test:  Test Files  2 passed (2)
packages/wallet test:       Tests  30 passed (30)
packages/protocol-adapter test:  Test Files  3 passed (3)
packages/protocol-adapter test:       Tests  24 passed (24)
packages/demo-fixtures test:  Test Files  1 passed (1)
packages/demo-fixtures test:       Tests  28 passed (28)
apps/verifier test:  Test Files  3 passed (3)
apps/verifier test:       Tests  31 passed (31)
apps/web test:  Test Files  3 passed (3)
apps/web test:       Tests  36 passed (36)
apps/web build: ✓ Compiled successfully · ✓ Generating static pages (16/16)
```
Total: **212 tests en verde** (antes de esta rama: 185). Nuevos o reescritos: 4 en el adaptador, 12 en el verificador, 11 en `apps/web` + el opt-in de Kapso invertido.

### Resultado por caso
| ID | Resultado real | Test | Arreglo en esta rama |
|---|---|---|---|
| AT-01 | detectado (`proofs_valid`) | `apps/verifier/test/verifier.test.ts` "tampered_proof" (ya existía) | — |
| AT-02 | (a) detectado `chain_integrity`; (b) **no detectable sin ancla** (`valid:true`, cambia `finalHash`, se declara `completitud-del-ledger`); (c) detectado `anchor_matches` | `apps/verifier/test/adversarial.test.ts` "AT-02" | — (límite documentado) |
| AT-03a | detectado (`DOUBLE_VOTE` / `nullifiers_unique` / 409) | adaptador + verificador "AT-03a"; `flow.test.ts` | — |
| AT-03b | detectado (`INVALID_ENCODING`; `package_schema`; 400) | adaptador "AT-03b" (3 variantes + otros campos); verificador "AT-03b" | ya corregido en `445b3ea`; **rojo comprobado contra `b4296ed`** (abajo) |
| AT-03c | detectado en la entrada; elección honesta `valid:true` | adaptador + verificador "AT-03c"; `flow.test.ts` (400) | ya corregido en `445b3ea`; rojo comprobado contra `b4296ed` |
| AT-04 | detectado: `/identity` tras `/open` → 409 y `groupRoot`/`/roll` iguales; prueba contra R1 → 403 | `apps/web/.../adversarial.test.ts` "AT-04" | — |
| AT-05 | (a)(b)(d) detectado `draw_matches`; (c) detectado `manifest_hash` (candidatos en el manifiesto) | verificador "AT-05" | — |
| AT-06 | detectado (`tally_matches`, incluida la variante `total+1`) | verificador "AT-06" + `verifier.test.ts` | — |
| AT-07 | (a)(b)(c) 403 sin registrar; (d) 503; 07c plantillas borradas en `/open` | web "AT-07" | — |
| AT-07b | **limitación (A4)**: σ=0,05 → 409; ruido σ=1 → 201 (esquiva el dedupe) | web "AT-07b" | — (documentado, no es un control) |
| AT-08 | (a)(b) 409, variante no canónica 400; (c) `commitments_unique` | web "AT-08" + verificador "AT-08c" | — |
| AT-09 | (a)(c) 401 y nada cambia; (b) no arranca (403/404); (d) **era vulnerable** | web "AT-09"; `units.test.ts` "AT-09(d) / A6" | **sí**: `kapso.ts` ya no crea votantes |
| AT-10 | **era vulnerable** (2 vectores, ver abajo); ahora sin reconstrucción ni PII en salidas públicas | web "AT-10" (3 tests) | **sí**: `elections.ts` (tally por lotes) y `engine.ts` (`votedAt` por día) |

### Fallos reales encontrados y arreglados (cambio mínimo, solo servidor)
1. **AT-09(d) / A6 — `apps/web/src/lib/server/kapso.ts`.** `QUORUM <id>` desde cualquier número creaba un `Voter` con `inviteToken`. Ahora el opt-in solo reenvía el enlace si `getVoterByPhone` encuentra el teléfono en el censo; si no, `ignored` y no se escribe nada. Se invirtió el test de `units.test.ts` que afirmaba el comportamiento vulnerable.
2. **AT-10 / C3 — diferencias del tally en vivo — `apps/web/src/lib/server/elections.ts`.** Con ≥5 votos el desglose cambiaba con cada boleta: el organizador (que ve quién pasa a `voted` en `GET /voters`) restaba dos lecturas de `/tally` y sabía la opción de esa persona. Ahora, en `registration`/`open`, el desglose se calcula sobre lotes completos de 5 boletas (`totalVotes` sigue exacto; al cerrar, recuento exacto).
3. **AT-10 / C5 — reconstrucción desde la DB — `apps/web/src/lib/server/engine.ts`.** `markVoted` guardaba `votedAt` con milisegundos; ordenando a los votantes por `votedAt` y emparejándolos con el ledger por posición se reconstruía **6/6** votante → opción. Ahora se guarda el inicio del día en America/Caracas (`caracasDayStart`).

### Rojo antes / verde después (salida real)
```
   × AT-03b/AT-03c contra el código anterior al fix > AT-03b rechaza nullifier no canónico
   × AT-03b/AT-03c contra el código anterior al fix > AT-03c rechaza message '0x1'
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/zz-red.test.ts > AT-03b/AT-03c contra el código anterior al fix > AT-03b rechaza nullifier no canónico
AssertionError: expected 'accepted' not to be 'accepted' // Object.is equality
 FAIL  test/zz-red.test.ts > AT-03b/AT-03c contra el código anterior al fix > AT-03c rechaza message '0x1'
AssertionError: expected 'accepted' not to be 'accepted' // Object.is equality
      Tests  2 failed (2)
--- después del fix (HEAD) ---
 ✓ test/zz-red.test.ts (2 tests)
   ✓ AT-03b/AT-03c contra el código anterior al fix > AT-03b rechaza nullifier no canónico 
      Tests  2 passed (2)
--- verificador anterior al fix (b4296ed) ---
stdout | test/zz-red.test.ts > AT-03b paquete con nullifier '0'+n y total inflado coherente → valid:false
valid: true counts: [1,2,0] failing: []
   × AT-03b paquete con nullifier '0'+n y total inflado coherente → valid:false
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/zz-red.test.ts > AT-03b paquete con nullifier '0'+n y total inflado coherente → valid:false
AssertionError: expected true to be false // Object.is equality
     14|   console.log("valid:", r.valid, "counts:", JSON.stringify(t.tally.cou…
      Tests  1 failed (1)
--- verificador HEAD ---
stdout | test/zz-red.test.ts > AT-03b paquete con nullifier '0'+n y total inflado coherente → valid:false
valid: false counts: [1,2,0] failing: ["package_schema"]
 ✓ test/zz-red.test.ts (1 test)
   ✓ AT-03b paquete con nullifier '0'+n y total inflado coherente → valid:false 
      Tests  1 passed (1)
--- kapso.ts HEAD (vulnerable) ---
   × webhook Kapso > AT-09(d) / A6: opt-in QUORUM <id> desde un teléfono FUERA del censo → ignored y no crea votante; dentro del censo reenvía el enlace (dry-run); batch y dedupe
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected { Object (ok, received, ...) } to deeply equal { ok: true, received: 1, …(3) }
      Tests  1 failed | 10 skipped (11)
--- kapso.ts con el fix ---
 ✓ src/lib/server/__tests__/units.test.ts (11 tests)
      Tests  11 passed (11)
--- AT-10 antes de los fixes (tally en vivo por voto) ---
   × AT-10 privacidad de datos públicos y de la DB (public_data_privacy) > 6 votantes en orden conocido: ni las rutas públicas ni el store permiten reconstruir votante → opción
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: votos ligados persona → opción por diferencias del tally en vivo: expected 1 to be +0 // Object.is equality
      Tests  1 failed | 8 skipped (9)
--- AT-10 con tally por lotes, antes del fix de votedAt ---
   × AT-10 privacidad de datos públicos y de la DB (public_data_privacy) > 6 votantes en orden conocido: ni las rutas públicas ni el store permiten reconstruir votante → opción
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: votedAt no debe ordenar a los votantes: expected 6 to be 1 // Object.is equality
      Tests  1 failed | 8 skipped (9)
--- AT-10 DB: reconstrucción por votedAt (ms) sin el fix ---
   × AT-10 privacidad de datos públicos y de la DB (public_data_privacy) > 6 votantes en orden conocido: ni las rutas públicas ni el store permiten reconstruir votante → opción
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: reconstrucción votante → opción desde la DB: expected 6 to be less than 6
      Tests  1 failed | 8 skipped (9)
```
(Para AT-03b/03c se copiaron temporalmente `ledger.ts` y `verify.ts` de `b4296ed`, anterior al fix `445b3ea`, se corrió un test equivalente y se restauró con `git checkout`; el archivo temporal no se versionó.)

### Listado de los tests adversariales (`--reporter=verbose`)
```
 ✓ test/adversarial.test.ts > codificación canónica (hallazgos C1 y A1) > isCanonicalField: rechaza ceros a la izquierda, hex, signo y valores ≥ r
 ✓ test/adversarial.test.ts > codificación canónica (hallazgos C1 y A1) > C1: re-enviar la misma boleta con nullifier '0'+n o hex → INVALID_ENCODING (nunca se acepta un doble voto)
 ✓ test/adversarial.test.ts > codificación canónica (hallazgos C1 y A1) > A1: message en hex o fuera de rango → INVALID_ENCODING antes de entrar al ledger
 ✓ test/adversarial.test.ts > AT-03 nullifier repetido (adaptador) > AT-03a: la misma prueba reinsertada tal cual → DOUBLE_VOTE y el ledger no crece
 ✓ test/adversarial.test.ts > AT-03 nullifier repetido (adaptador) > AT-03b: rechaza nullifier no canónico en sus tres variantes ('0'+n, '00'+n, '0x'+hex) y no infla el ledger
 ✓ test/adversarial.test.ts > AT-03 nullifier repetido (adaptador) > AT-03b (otros campos): '0'+x en message, scope, merkleTreeRoot o points[] → INVALID_ENCODING
 ✓ test/adversarial.test.ts > AT-03 nullifier repetido (adaptador) > AT-03c: message '0x1' (la prueba Groth16 sigue verificando) se rechaza en la entrada; el recuento honesto queda sin inválidas
      Tests  7 passed (7)
 ✓ test/adversarial.test.ts > verificador: hallazgos C1 y M3 > AT-03b / C1: doble voto con nullifier '0'+n (cadena rehecha) → valid:false (package_schema: decimal canónico)
 ✓ test/adversarial.test.ts > verificador: hallazgos C1 y M3 > AT-08c / M3: commitment duplicado en el padrón (raíz y génesis recalculadas) → commitments_unique falla
 ✓ test/adversarial.test.ts > verificador: hallazgos C1 y M3 > paquete legítimo → commitments_unique pasa
 ✓ test/adversarial.test.ts > AT-02 ledger reordenado > (a) intercambiar #0 y #1 sin rehacer hashes → chain_integrity 'cadena rota en #0'
 ✓ test/adversarial.test.ts > AT-02 ledger reordenado > (b) intercambiar y rehacer cadena + finalHash + checksums → valid:true sin ancla (indetectable), cambia finalHash y se declara completitud-del-ledger no garantizada
 ✓ test/adversarial.test.ts > AT-02 ledger reordenado > (c) igual que (b) pero con ancla del finalHash original → anchor_matches 'hash final ≠ ancla'
 ✓ test/adversarial.test.ts > AT-03 nullifier repetido (verificador) > AT-03a: la boleta #0 duplicada tal cual (cadena rehecha) → nullifiers_unique '#2 repite el nullifier de #0'
 ✓ test/adversarial.test.ts > AT-03 nullifier repetido (verificador) > AT-03b: variantes '00'+n y '0x'+hex con cadena, tally y checksums rehechos → valid:false (nunca un total inflado válido)
 ✓ test/adversarial.test.ts > AT-03 nullifier repetido (verificador) > AT-03c: con la entrada canónica la elección honesta sigue valid:true; un message '0x1' colado en el paquete hace fallar package_schema
 ✓ test/adversarial.test.ts > AT-05 sorteo > legítimo → valid:true y draw_matches pasa
 ✓ test/adversarial.test.ts > AT-05 sorteo > (a) seed ≠ keccak256(finalHash) → draw_matches
 ✓ test/adversarial.test.ts > AT-05 sorteo > (b) seed correcta pero ganadores permutados o cambiados → draw_matches
 ✓ test/adversarial.test.ts > AT-05 sorteo > (c) candidato añadido tras publicar y ganadores recomputados con la semilla correcta → manifest_hash falla (candidatos en el manifiesto, fix A5)
 ✓ test/adversarial.test.ts > AT-05 sorteo > (d) N distinto del que sale del recuento → draw_matches 'N publicado ≠ N recomputado'
 ✓ test/adversarial.test.ts > AT-06 tally inflado > total += 1 sin tocar el ledger (tallyHash y checksum rehechos) → tally_matches 'total: publicado 3, boletas en el ledger 2'
      Tests  15 passed (15)
 ✓ src/lib/server/__tests__/units.test.ts > webhook Kapso > AT-09(d) / A6: opt-in QUORUM <id> desde un teléfono FUERA del censo → ignored y no crea votante; dentro del censo reenvía el enlace (dry-run); batch y dedupe
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-09 un tercero infla el censo o cierra la elección (C4) > (a) POST /voters sin credenciales o con token ajeno → 401, sin inviteToken y sin crear votantes
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-09 un tercero infla el censo o cierra la elección (C4) > (b) sin token de invitación el atacante no puede empezar la inscripción (enroll / wallet / identity → 403/404)
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-09 un tercero infla el censo o cierra la elección (C4) > (c) POST /close, /open, /invites y /draw sin credenciales → 401 y la elección no cambia de estado
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-04 groupRoot cambiado tras /open > (1) /identity después de /open → 409 y groupRoot y /roll no cambian; (2) prueba contra un padrón con un miembro extra → 403 not_eligible
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-07 FaceBinding con firma ajena o reenviada > (a) firma de W2 sobre {wallet: W1}, (b) replay para otro voterId u otra elección, (c) faceBindingHash ≠ H1 → 403 y el votante NO queda registrado; (d) kernel sin RPC → 503
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-07 FaceBinding con firma ajena o reenviada > AT-07b (A4, limitación documentada): el dedupe 1:N detecta ruido pequeño (σ=0,05) pero un descriptor con ruido grande lo esquiva — no es un control de unicidad
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-07 FaceBinding con firma ajena o reenviada > AT-07c (A2): después de /open no queda ninguna plantilla facial de la elección
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-08 commitment duplicado inyectado (M3) > (a) V2 inscribe el commitment público de V1 → 409; (b) V1 lo reenvía → 409; el padrón congelado no tiene duplicados
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-10 privacidad de datos públicos y de la DB (public_data_privacy) > votedAt se guarda con granularidad de día en America/Caracas (UTC−4)
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-10 privacidad de datos públicos y de la DB (public_data_privacy) > tally en vivo por lotes de 5: el 6.º voto no cambia el desglose hasta completar el lote; al cerrar, recuento exacto
 ✓ src/lib/server/__tests__/adversarial.test.ts > AT-10 privacidad de datos públicos y de la DB (public_data_privacy) > 6 votantes en orden conocido: ni las rutas públicas ni el store permiten reconstruir votante → opción
      Tests  12 passed | 10 skipped (22)
```

### Límites que siguen abiertos (no ocultos)
- AT-02(b): sin ancla, reordenar boletas y rehacer la cadena es indetectable y cambia la semilla del sorteo (A5). Solo el ancla o el recibo del votante (índice/hash) lo delatan.
- AT-07b (A4): el dedupe facial no garantiza "una persona = una wallet"; el descriptor lo pone el cliente.
- AT-10: el lote de 5 da k-anonimato 5 frente al organizador, no anonimato perfecto (un lote unánime revela la opción de sus 5 votantes). `votedAt` por día aún separa a quienes votan en días distintos.
- C2: `onchain.txHash` en `POST /vote` se **ignora** (no se guarda) con `QUORUM_ONCHAIN_CAST` apagado; no se rechaza con 400. Decisión pendiente de José.
- La UI (`InviteStep`) muestra `votedAt` con hora: tras el fix verá las 00:00; conviene mostrar solo la fecha (no se tocó la UI en esta rama).

## 2026-10-24 · Ancla vía QuorumRegistry + FaceBinding Kernel real (quorum-crypto, rama `feat/p2-anchor`)

### Qué cambió
- **Cierre:** si hay `NEXT_PUBLIC_REGISTRY_ADDRESS` (o el manifiesto lo fija), el ancla es `QuorumRegistry.anchor(keccak256(utf8(electionId)), finalHash)` desde la clave del organizador (`anchorOnRegistry` en `@quorum/protocol-adapter`, ABI de `@quorum/wallet`). Se espera el receipt y se exige el evento `Anchored` del registro antes de guardar `anchor = {chainId, txHash, registryAddress}`. Sin registro: modo anterior (tx a sí mismo con calldata) como fallback.
- **Hallazgo M1:** el manifiesto fija de forma aditiva `anchorPolicy = {kind: "quorum-registry"|"calldata", chainId, registryAddress?, organizer}` (solo si hay `ORGANIZER_PRIVATE_KEY`); entra en `manifestHash`. Si la clave configurada no es el organizador fijado, el cierre no ancla y lo dice.
- **Verificador (`anchor_matches`):** lee receipt + logs, decodifica `Anchored(electionId, finalHash, castCount, organizer)` del registro (ABI declarada en el propio verificador, sin importar `@quorum/wallet`), compara `electionId = keccak256(utf8(id))`, `finalHash` y `organizer` = el del manifiesto. Cada check lleva ahora `status` (aditivo en `AuditCheck`): `verificado` / `no evaluado` / `fallo detectado`.
  - `fallo detectado`: hash/elección/organizador distintos, evento de otro contrato, tx revertida, tx inexistente, ancla que contradice el manifiesto (otro registro u otra cadena; detectable sin red).
  - `no evaluado` (`passed: true`): sin ancla, sin RPC, o ancla coincidente pero el manifiesto no fija organizador (paquetes anteriores a M1 → `unsupportedGuarantees: autoria-del-ancla`).
  - `no evaluado` con `passed: false` (`valid: false`): RPC caído. No se acusa manipulación, pero tampoco se da por válido.

### Tests offline (transporte/lector simulado)
- `packages/protocol-adapter/test/registry-anchor.test.ts` (3): calldata `anchor(...)` al registro, registro simulado con las reglas del contrato (solo organizador, una vez), rechazo de otra cadena / organizador distinto al del manifiesto / `AlreadyAnchored`, receipt sin evento o con otro hash → lanza.
- `apps/verifier/test/registry-anchor.test.ts` (8): verificado; finalHash alterado; organizador distinto; otra elección, otro contrato, revertida, inexistente; registro distinto al del manifiesto sin RPC; no evaluado (sin RPC, RPC caído, sin organizador fijado); `anchorPolicy` dentro de `manifestHash`; modo calldata con organizador fijado (otra cuenta → fallo, organizador → verificado).
- `apps/web/src/lib/server/__tests__/flow.test.ts` (+2): cierre con registro (manifiesto con `anchorPolicy`, `anchor.registryAddress`, `anchor_matches` verificado; paquete con finalHash alterado por `POST /api/audit/verify` → fallo detectado) y ancla fallida (sin fondos) → `anchor=null`, `anchorStatus.mode=error`, `anchor_matches` no evaluado.

```
$ pnpm typecheck && pnpm lint && pnpm test
packages/contracts test:       Tests  63 passed (63)
packages/wallet test:       Tests  30 passed (30)
packages/demo-fixtures test:       Tests  28 passed (28)
packages/protocol-adapter test:       Tests  23 passed (23)
apps/verifier test:       Tests  27 passed (27)
apps/web test:       Tests  27 passed (27)
$ pnpm --filter @quorum/web build   → ✓ (Next 16.4.3, Turbopack)
```

### RED · FaceBinding con Kernel real (ERC-6492), verificado por la ruta del servidor
`apps/web/src/lib/server/__tests__/facebinding-kernel.net.test.ts` — excluido de `pnpm test`; se salta si falta `NEXT_PUBLIC_ZERODEV_PROJECT_ID` o `BASE_SEPOLIA_RPC`. Crea una cuenta Kernel v3.1 real con `createKernelWallet` (signer efímero), firma FaceBinding sin desplegar y llama a `verifyFaceBinding("kernel", …)` de `lib/server/wallet.ts` (`publicClient.verifyTypedData` contra Base Sepolia). No envía transacciones.
```
$ pnpm --filter @quorum/web test:net
[net] Kernel 0xb63c56156b927C37EeEE970dEbB28b6F33525864 · desplegada=false · chainId=84532
[net] firma 768 bytes · envoltura ERC-6492=true
[net] verifyFaceBinding(kernel) servidor → true
[net] mensaje alterado (voterId) → false
[net] otra wallet → false
 ✓ src/lib/server/__tests__/facebinding-kernel.net.test.ts (1 test) 1263ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### Punta a punta REAL en Base Sepolia (una ejecución, 2026-10-24 ~12:30 -0400)
Precomprobación (lectura): clave del organizador = `organizer()` del registro = `0x51CD729395EF14cD476f1c208cDd141aAf9dA751`, saldo 0,019998 ETH, `finalHashOf(keccak256("el_demo_los_samanes_p2anchor_20261024")) = 0x0` (no anclada).
```
$ DATA_DIR=<tmp> NEXT_PUBLIC_DEMO_ELECTION_ID=el_demo_los_samanes_p2anchor_20261024 \
  tsx --env-file=.env.local scripts/seed-demo.ts --simulate 6 --full --anchor --out <tmp>/paquete-real.json
✔ el_demo_los_samanes_p2anchor_20261024 · estado registration · manifestHash 0x942ecc9e2fb19ab7a31d451b668cf808a2d081226432537dbd1bc9b9e8e3e4a7
  · inscrito vt_… (simulado) ×6
✔ open · groupRoot 14516157008205877686439905402488367942597438171608487525523825333037845590558
  · boleta #0..#5 incluida
✔ close → auditable · verificador valid=true · ancla: anclado vía QuorumRegistry 0x64E7cbf3B1a334A6633F0025d289335AEdA8Be13 en Base Sepolia, tx 0x97911d4ef30c860177d109febe60f2beebd9750e7dff82267b9226f9c0737371
    PASS package_schema … tally_matches: recuento reproducido: [1,1,3,1,0] (6 boletas, 0 inválidas)
    PASS anchor_matches: evento Anchored del QuorumRegistry 0x64E7cbf3B1a334A6633F0025d289335AEdA8Be13 en Base Sepolia (tx 0x97911d4ef3…): electionId y finalHash coinciden; organizador 0x51CD729395EF14cD476f1c208cDd141aAf9dA751 = el fijado en el manifiesto; castCount 0
  ancla: chainId 84532 · tx 0x97911d4ef30c860177d109febe60f2beebd9750e7dff82267b9226f9c0737371
✔ draw → drawn · N=3 · ganadores p-02, p-03, p-07 · seed 0xb141166739178c4c8f3904fff9e961504ea865026bf863cb40ae720f954dc532
✔ paquete de auditoría → <tmp>/paquete-real.json (sha256 0x25b535a0d2a3d51d28de23ab3f07034559797e3e8d795f612cd3e25d5438e6e5)
```
(En esa ejecución el script aún imprimía `PASS/FAIL`; ahora imprime el `status`.) Tx: https://sepolia.basescan.org/tx/0x97911d4ef30c860177d109febe60f2beebd9750e7dff82267b9226f9c0737371

Verificador CLI independiente sobre el paquete publicado (lee el receipt por RPC):
```
$ pnpm --filter @quorum/verifier verify <tmp>/paquete-real.json --anchor-rpc $BASE_SEPOLIA_RPC   → exit 0
valid True sha256:25b535a0d2a3d51d28de23ab3f07034559797e3e8d795f612cd3e25d5438e6e5
verificado       package_schema · manifest_hash · group_root · commitments_unique · chain_integrity · proofs_valid (6/6) · nullifiers_unique · tally_matches
verificado       anchor_matches · evento Anchored del QuorumRegistry 0x64E7cbf3B1a334A6633F0025d289335AEdA8Be13 en Base Sepolia (tx 0x97911d4ef3…): electionId y finalHash coinciden; organizador 0x51CD729395EF14cD476f1c208cDd141aAf9dA751 = el fijado en el manifiesto; castCount 0
verificado       draw_matches · sorteo recomputado: N=3, ganadores [p-02, p-03, p-07] con semilla keccak256(finalHash)
```
Copia alterada (solo `finalHash` → `0xeeee…`):
```
$ pnpm --filter @quorum/verifier verify <tmp>/paquete-alterado.json --anchor-rpc $BASE_SEPOLIA_RPC   → exit 1
valid False sha256:7b9c5a23f5564876df6eb754197689f08fce69c6a58fed208d9137aad7d2827c
fallo detectado  chain_integrity · finalHash publicado 0xeeeeeeeeeeeeeeee… ≠ último hash 0x4efee9339db2b7d6…
fallo detectado  anchor_matches · hash final ≠ ancla: anclado 0x4efee9339db2b7d6…, paquete 0xeeeeeeeeeeeeeeee…
fallo detectado  draw_matches · sorteo no reproducible: sorteo hecho sobre finalHash 0x4efee9339db2b7d6… ≠ finalHash del paquete 0xeeeeeeeeeeeeeeee…
(resto de checks: verificado)
```

### Límites (no ocultos)
- El verificador confía en el RPC que se le pasa; con un RPC malicioso `anchor_matches` no vale.
- `castCount` del evento es 0 porque el `cast` on-chain del votante sigue apagado (C2); no se compara con el ledger.
- La UI no muestra todavía el campo `status` de los checks (fuera de alcance de esta rama: no se tocaron páginas ni componentes).
- El ancla prueba que el organizador fijó ese `finalHash` una sola vez para ese `electionId` en ese registro; no prueba que el ledger sea correcto (eso lo recomputa el verificador).

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

## 2026-10-24 · Integración fase 2 completa (rama `integration/phase2`, integrador)

**Contenido:** integration/h3 + `feat/phase2-engine` + `feat/phase2-wallet` + `feat/phase2-ui` + `feat/p2-qa-adversarial` + `feat/p2-anchor` + `feat/p2-sala-abierta`, más los ajustes de integración (tipos v1 de la web desde `@quorum/contracts`, `WalletStep` real, sorteo con `drawWinners` del adaptador, `eoa-demo` en `localStorage`, `POST /vote` con `onchain` → 400 `onchain_not_supported`, `check.status` en la UI, E2E real).

### Comandos ejecutados (salida real, America/Caracas)
| Hora | Comando | Resultado |
|---|---|---|
| 12:41:35 -0400 | `pnpm typecheck` | exit 0 |
| 12:42:31 -0400 | `pnpm lint` | exit 0 (0 errores, 0 warnings) |
| 12:42:00 -0400 | `pnpm test` | exit 0 · contracts 63 · wallet 31 · demo-fixtures 28 · protocol-adapter 27 · verifier 41 · web 82 → **272 tests, 0 fallos** |
| 12:42:15 -0400 | `pnpm --filter @quorum/web build` | exit 0 (`✓ Compiled successfully in 3.9s`, 17 páginas) |
| 12:42:43 -0400 | `PORT=3327 pnpm --filter @quorum/web exec playwright test e2e/smoke.spec.ts e2e/phase2.spec.ts` | **20 passed** (chromium + mobile-360) |
| 12:42:59 -0400 | `pnpm --filter @quorum/web test:e2e:real` | **1 passed** (12.5 s de test; 21.6 s con `next build` + `next start`) |

Detalle Playwright con mocks (por proyecto `chromium` y `mobile-360`): smoke ×4 (portada 200 + h1, idioma, `/zk` sirve los artefactos, centro de transparencia del fixture) y phase2 ×6 (inscripción rostro→wallet→credencial y voto con prueba real en el navegador; invitación inexistente; Verificar ahora ⇒ verificado parcial con ancla no evaluada; total alterado ⇒ fallo detectado; sorteo Recomputar aquí coincide; panel del organizador con Bearer y token mostrado una vez).

### E2E real (`e2e/phase2.real.spec.ts`, sin mocks)
`playwright.real.config.ts`: `next build` (en `.next-e2e-real`) + `next start -p 3318`, store JSON en un `DATA_DIR` temporal, `NEXT_PUBLIC_QUORUM_E2E_FAKE_FACE=1`. Variables vaciadas explícitamente (Next no pisa variables ya definidas con `.env.local`): `ORGANIZER_PRIVATE_KEY`, `NEXT_PUBLIC_REGISTRY_ADDRESS`, `BASE_SEPOLIA_RPC`, `NEXT_PUBLIC_BASE_SEPOLIA_RPC`, `NEXT_PUBLIC_ZERODEV_PROJECT_ID`, AI Gateway, Kapso/Meta; `INVITE_CHANNEL=dry-run`; `FACE_KEY` aleatoria de prueba. Recorrido comprobado:
1. Asistente `/org/new`: votación ficticia con opciones "1"/"2", 3 proyectos al sorteo, 2 vecinos ficticios → publicar; `organizerToken` leído del panel (mostrado una vez). `POST /open` sin token → 401.
2. Cada votante en su propio contexto de navegador: rostro simulado → wallet `eoa-demo` (etiqueta "demo"; clave en `localStorage`) → credencial Semaphore. El contexto de Ana se cierra y se reabre con su almacenamiento: la wallet y la credencial siguen sirviendo.
3. Organizador congela el padrón y abre. Ambos votan "2" con prueba Groth16 generada en el navegador → recibo `incluido`, nullifiers distintos, cuerpo del voto solo `{proof}`.
4. Doble voto: reenviar la misma prueba → **409 `already_voted`**; desde la UI con una prueba nueva (otra opción, misma credencial) → "No se pudo enviar la boleta… ya fue usada para votar"; voto con `onchain` → **400 `onchain_not_supported`**. Ledger durante `open`: `count: 2`, sin entradas.
5. Cerrar: `GET /audit` → `auditResult.valid: true`, `anchorStatus.mode: "disabled"` (ninguna tx).
6. "Verificar ahora" en el navegador: **verificado** + **no verificable** (ancla no evaluada, "Verificación parcial"), versión `quorum-verifier`, mismo digest que el servidor. "Mi voto está" con el comprobante guardado ⇒ `incluido` en el paquete verificado.
7. Sorteo: `GET /draw` → `n: 2` (ganó la opción "2"); `/e/:id/draw` muestra 2 ganadores; **Recomputar aquí ⇒ Coincide**, seed igual a la publicada y `finalHash` del paquete coincide.

### Hallazgos de la integración (corregidos)
- La UI validaba formas que el backend real no produce: `anchorStatus` (objeto, no string), `groupRoot/scope/genesisHash/finalHash` null antes de abrir, `tieBreak` null, invitación sin `voter.state`. Con los esquemas de `@quorum/contracts` el E2E real los ejercita.
- La "referencia local" del sorteo en la web hacía Fisher–Yates hacia atrás con otra codificación: contra el backend real habría mostrado "no verificable". Ahora la web usa `drawWinners` del adaptador y exige seed y ganadores en el mismo orden.
- `eoa-demo` en `sessionStorage` perdía la credencial al cerrar la pestaña entre inscripción y voto (la credencial se cifra con la firma FaceBinding). Ahora `localStorage` (test en `packages/wallet` y en el E2E real).
- Rostro simulado idéntico para votantes con ids de igual longitud ⇒ el dedupe 1:N real devolvía `duplicate_identity`. Ahora el descriptor sintético se siembra con el voterId.
- Turbopack no empaquetaba el adaptador en el navegador por `new URL(dir, import.meta.url)` (lo tapaba el loader de la UI, retirado): `new globalThis.URL(...)`.
- El E2E con mocks arrancaba `pnpm dev` con `NEXT_PUBLIC_ZERODEV_PROJECT_ID` de `.env.local` (modo Kernel con red). Ahora vacío, igual que la clave del organizador y el registro.

### Límites (no ocultos)
- No se probó Kernel/ZeroDev real ni el ancla real en este run (vaciados a propósito; el ancla tiene su evidencia en la sección de `feat/p2-anchor`).
- El rostro del E2E es simulado (Playwright no tiene cámara); la prueba de vida real no se ejercitó aquí.
- `e2e/voter-flow.spec.ts` (esqueleto v0 con `test.fixme`) y las capturas (`SCREENSHOTS=1`) no se corrieron en esta pasada.
- Ninguna UI muestra `votedAt` hoy (la invitación solo lo usa internamente); no hubo nada que cambiar a "solo fecha".

## 2026-10-24 · Laboratorio del jurado y auditor v1 (rama `feat/p2-audit-lab`)
Verificador usado: el de esta rama (`quorum-verifier/0.1.0`, sin `draw_matches`/`commitments_unique`). Paquete: `public/fixtures/protocol/valid.json` (fixture, 3 boletas con pruebas Groth16 reales). Ancla "simulada" = lector inyectado con el acta del original (etiquetada `simulación`).

| Alteración | Check esperado (sin ancla) | Resultado real sin ancla | Con ancla simulada |
|---|---|---|---|
| Cambiar el voto de una boleta (cadena/recuento rehechos) | `proofs_valid` | falla `proofs_valid` | + `anchor_matches` |
| Reordenar el registro | `chain_integrity` | falla `chain_integrity` | igual |
| Duplicar un voto (mismo nullifier, rehecho) | `nullifiers_unique` | falla `nullifiers_unique` | + `anchor_matches` |
| Inflar el resultado (tallyHash recalculado) | `tally_matches` | falla `tally_matches` | + `anchor_matches` |
| Cambiar la raíz del padrón | `group_root` | falla `group_root` (y otros) | + `anchor_matches` |
| Colar a alguien en el padrón | `group_root` | falla `group_root` | igual |
| Alterar el hash final | `chain_integrity` | falla `chain_integrity` | + `anchor_matches` |
| Borrar una boleta | `chain_integrity`, `tally_matches` | fallan ambos | igual |
| Quitar un voto y rehacer todo | — (no detectable) | `valid: true` (no detectado, como advierte el guion) | falla `anchor_matches` |
| Cambiar semilla / ganador del sorteo | `draw_matches` | no ejecutable: el fixture no trae `draw` y este verificador no emite `draw_matches` | — |

Comandos ejecutados (verdes): `pnpm typecheck`, `pnpm lint`, `pnpm test` (web 85 tests, incl. `src/lib/client/lab/__tests__/lab.test.ts` 29 y `src/components/__tests__/lab.test.tsx` 4), `pnpm --filter @quorum/web build`, `PORT=3317 playwright test e2e/lab.spec.ts e2e/phase2.spec.ts e2e/smoke.spec.ts` (38 passed, 4 skipped = capturas), capturas `SCREENSHOTS=1` → `docs/screenshots/phase2/lab-*-{360,1440}.png`.

## 2026-10-24 · Integración: laboratorio del jurado + verificador con esquema estricto (`integration/phase2`)

`feat/p2-audit-lab` integrado sobre motor/wallet/UI/QA/ancla/sala. Cambios del verificador (hallazgos del laboratorio):
(a) `manifest_hash` sobre el manifiesto tal como llega (canónico); (b) esquema estricto: un campo no declarado en la raíz, el manifiesto, una entrada del ledger, una prueba, un candidato, el tally o el sorteo ⇒ `package_schema` **fallo detectado** (opcionales documentados: `versions`, `generatedAt`, `draw`, `rollPolicy`); (c) un JSON sin forma de paquete (no declara `quorum-audit/1` + `semaphore-ledger`) ⇒ `package_schema` **no evaluado** → "no verificable", nunca "fallo detectado" ni "verificado".

### Comandos ejecutados (America/Caracas, salida real)
| Hora | Comando | Resultado |
|---|---|---|
| 12:57:06 | `pnpm typecheck` | exit 0 |
| 12:57:13 | `pnpm lint` | exit 0 |
| 12:57:16 | `pnpm test` | exit 0 · contracts 63 · wallet 31 · demo-fixtures 28 · protocol-adapter 27 · verifier **59** (+18 `strict-schema.test.ts`) · web **121** → **329 tests, 0 fallos** |
| 12:57:32 | `pnpm --filter @quorum/web build` | exit 0 |
| 12:57:39 | `PORT=3327 playwright test e2e/smoke.spec.ts e2e/phase2.spec.ts e2e/lab.spec.ts` | **38 passed** (chromium + mobile-360) |
| 12:58:02 | `pnpm --filter @quorum/web test:e2e:real` | **1 passed** |

### Paquetes reales de `seed:demo --full` (DATA_DIR temporal, sin ancla) → CLI del verificador
- `seed:demo -- --reset --simulate 6 --full --out seed-plain.json` → `valid: true`; todos los checks `verificado` salvo `anchor_matches` `no evaluado` (sin ancla); `draw_matches` verificado (N=3).
- `seed:demo -- --reset --simulate 6 --full --room --out seed-room.json` (nuevo: los simulados entran por la sala) → paquete con `rollPolicy: open-room`; `valid: true`, mismos estados, y `censo-abierto-en-sala` en `unsupportedGuarantees`.

### Laboratorio
- Fixture v1 `public/fixtures/protocol/lab-drawn.json` (`pnpm --filter @quorum/web fixtures:lab`): 4 credenciales, 3 boletas con pruebas Groth16 reales, `drawRule` (from-result, `tieBreak: lowest`, 4 candidatos) y sorteo hecho con `runDraw` (N=2). Es el origen por defecto de `/audit/lab` y `/audit?fixture=1`.
- "Cambiar la semilla" y "Cambiar un ganador" ⇒ `draw_matches` fallo detectado (unit + E2E). "Esconder un dato en una boleta" (`voterId` en la boleta #0 con checksums rehechos) ⇒ `package_schema` fallo detectado. "Ocultar la sala abierta" (borrar `rollPolicy`) ⇒ **no detectable** (está fuera de los hashes) y la UI lo dice; deshabilitada si el paquete no declara sala.
- "Quitar un voto y rehacer todo" ahora rehace también el sorteo: sigue siendo no detectable sin ancla y detectado con ancla simulada.

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

## 2026-10-24 · Integración: sala abierta UI + peso por teléfono (`integration/phase2`)

`feat/p2-sala-ui` integrado (/j/[roomCode], proyector, RoomCard, modo observador, `sw.js`, headers `immutable`). `artifacts.ts` queda con una sola solución (`new globalThis.URL(dir, import.meta.url)`); no queda loader. `playwright.real.config.ts` corre juntos `phase2.real`, `room.real` (movido a `e2e/`) y `weight.real`.

### Peso por teléfono (medido, no estimado)
`e2e/weight.real.spec.ts`: servidor real, Chromium emulando un Pixel 5, cámara falsa de Chromium; inscripción con la prueba de vida REAL (Human descarga sus modelos) + voto con prueba Groth16. Bytes transferidos por la red (CDP `encodedDataLength`):

| | Antes (iris activado) | Después |
|---|---|---|
| Modelos de Human | 13,07 MB (12 archivos, con `iris.bin` 2,60 MB) | **10,46 MB** (10 archivos) |
| Artefactos ZK (`/zk`, wasm comprimido) | 3,41 MB | 3,41 MB |
| JS | 0,93 MB | 0,93 MB |
| Otros | 0,09 MB | 0,09 MB |
| **Total por teléfono** | **17,49 MB** | **14,89 MB** (≈ 893 MB para 60 teléfonos sin caché compartida; antes ≈ 1,05 GB) |

Config de Human (`HUMAN_CONFIG`): detector + malla (el parpadeo y el giro salen de la malla, no del iris) + descriptor (dedupe 1:N; edad/género vienen dentro del mismo modelo `faceres` y no se pueden separar) + antispoof + liveness. Apagados: iris y atención (nuevo), emoción, cuerpo, manos, objetos y segmentación (ya lo estaban). Se quitaron de `/models` `iris.json`, `iris.bin` y `models.json` (no se cargaban); un test exige que `/models` sea exactamente lo que precarga la sala.

Funcionalidad comprobada tras el recorte (mismo spec): la autoprueba de Human (su imagen de calentamiento, no una persona nuestra) devuelve `face.real` y `face.live` numéricos, descriptor de ≥ 64 dimensiones y malla de ≥ 468 puntos; el dedupe 1:N del servidor con ese descriptor real: primera inscripción 201, el mismo rostro con ruido ⇒ **409 `duplicate_identity`**, otro vector ⇒ 201.

### Batería final (America/Caracas, salida real)
| Hora | Comando | Resultado |
|---|---|---|
| 13:11:52 | `pnpm typecheck` | exit 0 (repetido 13:14:16 tras el ajuste de `room.spec.ts`: exit 0) |
| 13:11:59 | `pnpm lint` | exit 0 (repetido 13:14:16: exit 0) |
| 13:12:03 | `pnpm test` | exit 0 · contracts 63 · wallet 31 · demo-fixtures 28 · protocol-adapter 27 · verifier 59 · web 144 → **352 tests, 0 fallos** |
| 13:12:19 | `pnpm --filter @quorum/web build` | exit 0 |
| 13:13:46 | `PORT=3347 playwright test e2e/smoke.spec.ts e2e/phase2.spec.ts e2e/lab.spec.ts e2e/room.spec.ts` | **52 passed**, 4 skipped (capturas, solo con `SCREENSHOTS=1`) |
| 13:12:53 | `QUORUM_E2E_REAL_PORT=3357 pnpm --filter @quorum/web test:e2e:real` | **3 passed** (phase2.real, room.real, weight.real) |

La primera pasada de Playwright con mocks (13:12:28) falló en `room.spec.ts` (2 proyectos): esperaba 14 archivos en Cache Storage y ahora son 12 (sin iris). Se actualizó la aserción y se repitió la suite completa (13:13:46, verde).

### Pendientes
- `faceres.bin` (6,98 MB) es el 47 % del peso total. Cambiarlo por un descriptor más pequeño cambia las dimensiones y obliga a recalibrar `FACE_DEDUPE_THRESHOLD`: no se hizo.
- Los `.bin` de los modelos viajan sin comprimir (`application/octet-stream`); con gzip se ahorrarían ≈ 1,4 MB por teléfono. Requiere decidir cómo servirlos comprimidos (Next/Vercel no comprimen ese tipo).
- La prueba de vida activa (parpadeo/giro) con una cara real no se automatiza (cámara falsa sin rostro); se verifica la carga y salida de los modelos y el dedupe, no la interacción humana.
