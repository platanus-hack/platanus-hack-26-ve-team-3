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
