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
