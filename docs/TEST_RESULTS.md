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
