# ADR-001 — Motor de votación

**Estado:** **aprobado por José** en la página de la oficina (2026-10-24, 11:39 VET). Plan A implementado en `feat/crypto-plan-a` (PR #4).

## Contexto
Spike completo en `research/01-motores-votacion.md`. Resumen: MACI archivado (ago-2026); DAVINCI vivo pero pre-producción, solo OP Mainnet (sin testnet), 1 nodo público, resultados en ≥6 min; Helios es Python sin SDK JS; ElectionGuard sin SDK viable; **Semaphore v4 probado hoy en Node 22 en 0,5 s**.

## Decisión
1. **Plan A (núcleo garantizado): `protocol = "semaphore-ledger"`** — Semaphore v4 (padrón anónimo con `commitment`, 1 nullifier por credencial por elección) + ledger de boletas hash-encadenado + ancla del `{groupRoot, finalHash, tally}` como atestación EAS o calldata en **Base Sepolia** + **verificador independiente** (`apps/verifier`, CLI sin acceso a la DB) que recomputa todo y falla con causa concreta. Artefactos `semaphore-10.{wasm,zkey}` vendorizados (profundidad 10 = 1024 votantes).
2. **Plan B (spike paralelo, go/no-go a H+8–10): DAVINCI en OP Mainnet.** Requiere ETH real en OP y bucket HTTPS. Si una elección de 3 votantes llega a `ProcessResultsSet`, se presenta "motor dual" y la acción derivada consume ese resultado.
3. **Acción derivada (igual para A y B):** atestación EAS del acuerdo + contrato mínimo que ejecuta lo votado (p. ej. libera un pago del condominio) leyendo `(root, hash, tally)` o `ProcessRegistry.getProcess()`.
4. Opcional H+12–20: capa ElGamal exponencial + Chaum-Pedersen para secreto de contenido (sin range proof; declararlo).

## Propiedades que afirmamos (Plan A)
Elegibilidad sin identificar · unicidad (nullifier) · integridad del registro (cadena de hashes) · inmutabilidad del total (ancla on-chain) · recuento reproducible por terceros.

## Propiedades que NO afirmamos
Secreto del contenido frente al servidor (sin ElGamal) · resistencia a coacción · validez 0/1 de boletas cifradas · verificación de identidad civil · "ZK del escrutinio".

## Actualización del contrato de tipos
`Protocol` en `packages/contracts` pasa a `["semaphore-ledger", "davinci", "helios", "integrity-demo"]`. El backend reemplaza `plainChoice` por la prueba Semaphore cuando el adaptador esté integrado.

## Consecuencias
- Riesgo bajo para la demo de 3 min; manipulación demostrable en vivo.
- Dependencia de CDN/artefactos vendorizados; `process.exit` en scripts con snarkjs.
- Necesidad humana: ETH en OP Mainnet solo si se aprueba el spike DAVINCI; Base Sepolia vía faucet CDP para el ancla.

## Fuentes
Ver `research/01-motores-votacion.md` (fechas y URLs exactas).

---

## Implementación del Plan A (crypto, 2026-10-24 ~H+3, rama `worktree-agent-af92e8779c55801f6`)

### Qué se construyó
| Pieza | Ruta | Dependencias (pin exacto) |
|---|---|---|
| Adaptador | `packages/protocol-adapter` (`@quorum/protocol-adapter`, TS puro, ESM) | `@semaphore-protocol/core@4.14.5` (arrastra `snarkjs@0.7.5`, `@zk-kit/artifacts@2.0.1`), `viem@2.57.11` |
| Verificador independiente | `apps/verifier` (`@quorum/verifier`, CLI + `verifyPackage()`) | `@quorum/contracts` (tipos), `@semaphore-protocol/core@4.14.5`, `viem@2.57.11`, `zod` |
| Fixtures | `packages/demo-fixtures/protocol/*.json` | generados por `pnpm --filter @quorum/protocol-adapter fixtures` |
| Artefactos Groth16 | `packages/protocol-adapter/artifacts/semaphore-10.{wasm,zkey}` | vendorizados (ver abajo) |

**No se implementó ninguna primitiva criptográfica propia.** Identidad (EdDSA-BabyJubJub + Poseidon), grupo (LeanIMT), prueba y verificación (Groth16 sobre BN254) son de `@semaphore-protocol/core` sin modificar. Lo nuestro es: el formato del ledger, el hash canónico SHA-256, el paquete de auditoría, el ancla y el verificador que recomputa todo.

### Artefactos vendorizados
- Origen: `https://snark-artifacts.pse.dev/semaphore/4.13.0/semaphore-10.wasm` y `.zkey`, descargados el 2026-10-24T14:22:38Z.
- SHA-256 (`shasum -a 256`): wasm `1e9e1e3ad9917164bc96c751e32fae724400b92063f5a2cfd22ca64674bf4f96` (1 815 560 B); zkey `f644af6753be9d48454d8f9bb74bf2e9a416dd7d1a704c3cf1d50e535969a19a` (2 422 238 B). Registrados en `src/artifacts.ts` y comprobados por un test y por `scripts/copy-artifacts.sh` antes de copiarlos a `apps/web/public/zk/`.
- Por qué vendorizar: el repo `privacy-scaling-explorations/snark-artifacts` está archivado (2026-08-19); el CDN sigue vivo pero no se puede depender de él en la demo. `verifyProof` **no** necesita artefactos (claves de verificación embebidas en el paquete), así que el verificador no depende del CDN.
- Profundidad fija 10 (hasta 1024 votantes). El grupo LeanIMT de Semaphore tiene profundidad dinámica (3 miembros ⇒ 2), por eso `castBallot` pasa `merkleTreeDepth=10` explícito y el verificador exige que cada prueba declare esa profundidad.

### Formato del paquete `quorum-audit/1` (lo que el verificador reimplementa)
- **Hash canónico:** `sha256(JSON.stringify(sortKeysRecursivo(v)))` con bigint → string decimal y `undefined` omitido. Hex con `0x`.
- **Scope de la elección:** `keccak256(utf8("quorum:" + electionId)) >> 8` como string decimal (Semaphore limita scopes textuales a 31 bytes; el `>> 8` lo deja en 248 bits).
- **Boleta:** `SemaphoreProof` tal cual (`merkleTreeDepth`, `merkleTreeRoot`, `message` = índice de opción en decimal, `nullifier`, `scope`, `points[8]`). El contenido del voto va **en claro** en `message`.
- **Ledger:** `genesisHash = H({kind:"quorum-ledger-genesis", electionId, scope, groupRoot})`; entrada `i`: `prevHash = hash(i-1) | genesis`, `hash = H({idx, prevHash, proof})`; `finalHash` = último hash (o génesis si vacío).
- **Tally:** `{counts[i], invalid, total}` recontando `message`; mensajes fuera de rango cuentan como `invalid`.
- **Paquete:** `{version, protocol:"semaphore-ledger", electionId, manifest, manifestHash, scope, merkleTreeDepth, groupRoot, commitments[], ledger[], genesisHash, tally, tallyHash, finalHash, anchor|null, checksums{manifest,commitments,ledger,tally}, versions, generatedAt}`. Sin PII: solo commitments (nunca nombres, teléfonos ni claves).
- **Ancla (calldata):** tx de la cuenta del organizador a sí misma en Base Sepolia con `abi.encode(bytes32 finalHash, bytes32 groupRoot, bytes32 tallyHash, string electionId)`.

### Checks del verificador y qué detecta cada uno
`package_schema` · `manifest_hash` (A-manifiesto) · `group_root` (A4: padrón alterado tras publicar) · `chain_integrity` (A2: registro alterado/eliminado) · `proofs_valid` (A2/A4: contenido alterado, prueba de otro padrón u otra elección) · `nullifiers_unique` (A3: doble voto) · `tally_matches` (A1: cifra publicada editada) · `anchor_matches` (A1/A2 "sofisticadas": paquete reconstruido entero; solo con `--anchor-rpc`). Cada fallo trae la causa concreta (índice de boleta, valores publicados vs recomputados).

### Supuestos de confianza (honestos)
1. **El organizador es el único escritor del ledger** y ve cada `message` en claro. Puede saber qué se votó (no quién), y podría publicar un paquete reconstruido desde cero; eso solo lo detecta el ancla (si la publicó antes y el verificador la lee) o un votante con su recibo (`nullifier` ausente). No hay coordinador ni secuenciador: la "autoridad" es el organizador + lo que ancló.
2. **El padrón lo decide el organizador.** El verificador comprueba que la raíz publicada sale de los commitments publicados, no que esos commitments sean personas elegibles reales.
3. **El ancla la firma la cuenta del organizador** en Base Sepolia (chainId 84532). El verificador solo acepta esa cadena y confía en el RPC que se le pasa (`--anchor-rpc`); con un RPC malicioso el check no vale. Sin RPC el check queda `no evaluado` y se añade a `unsupportedGuarantees`.
4. **Trusted setup de Semaphore** (ceremonia PSE) y corrección de `snarkjs`/`circom`: fuera de nuestro alcance, igual que para cualquier usuario del protocolo.

### Lo que garantiza y lo que NO
- **Garantiza (y se prueba en tests):** elegibilidad anónima (prueba de pertenencia al padrón), unicidad (nullifier por credencial+elección, segunda boleta **rechazada**, no reemplazada), integridad del registro (cadena SHA-256), recuento reproducible (cualquiera recuenta), detección con causa concreta de las 7 manipulaciones de los fixtures, e inmutabilidad del total **solo si** hay ancla y RPC.
- **NO garantiza (listado literal en `unsupportedGuarantees`):** secreto del contenido frente al servidor (sin ElGamal), resistencia a coacción, validez 0/1 de boletas cifradas (no hay cifrado), identidad civil, "prueba criptográfica del escrutinio" (es recuento), completitud del ledger sin ancla.
- Claim prohibido en UI: "voto secreto", "ZK del escrutinio", "end-to-end verificable" (solo "el votante puede comprobar que su nullifier está en el ledger").

### Chain IDs y contratos
- Base Sepolia `chainId 84532` (fuente: https://docs.base.org/chain/network-information, 2026-10-24).
- EAS `0x4200000000000000000000000000000000000021`, SchemaRegistry `0x4200000000000000000000000000000000000020` (predeploys OP Stack; fuente: https://github.com/ethereum-attestation-service/eas-contracts#base-sepolia, 2026-10-24).
- Contratos Semaphore v4 en Base Sepolia (`Semaphore` `0xC10E5102A2Cc077BE3B9740Fc0Ad7e27Ff8E0245`) **no se usan**: la verificación es off-chain en el verificador. Documentados en `research/01` por si se quiere verificación on-chain después.
- **Ninguna transacción real se ha enviado.** `anchorOnBaseSepolia`/`readAnchor` están probados con un transporte simulado (`AnchorTransport` inyectable); el camino real usa `viem` (`createWalletClient` + `http(rpcUrl)`). Para ejecutarlo hace falta `BASE_SEPOLIA_RPC` y una clave con ETH del faucet CDP → **decisión humana (José)**.
- **Actualización 2026-10-24 (rama `feat/p2-anchor`):** el ancla por defecto es `QuorumRegistry.anchor(keccak256(utf8(electionId)), finalHash)` (contrato `0x64e7cbf3b1a334a6633f0025d289335aeda8be13` en Base Sepolia; organizador `0x51CD729395EF14cD476f1c208cDd141aAf9dA751`). El manifiesto fija `anchorPolicy {kind, chainId, registryAddress?, organizer}` (M1, entra en `manifestHash`) y el verificador lee el evento `Anchored` del receipt y exige `organizer` = el fijado. Ejecutado una vez de verdad: tx `0x97911d4ef30c860177d109febe60f2beebd9750e7dff82267b9226f9c0737371` (ver `docs/TEST_RESULTS.md`). El modo calldata queda como fallback sin registro.

### EAS (detrás de bandera)
Implementado con `viem` contra la misma ABI del contrato (sin `@ethereum-attestation-service/eas-sdk`, que arrastra ethers 6): `attestAnchorOnEas(payload, schemaUid, pk, rpc, {enabled:true})` codifica `attest((bytes32 schema,(address,uint64,bool,bytes32,bytes,uint256)))` con `data = abi.encode(finalHash, groupRoot, tallyHash, electionId)` y devuelve el `uid` del evento `Attested`; `readEasAttestation(uid)` decodifica. Falta registrar el esquema una vez: enviar `encodeRegisterAnchorSchemaCalldata()` (`"bytes32 finalHash,bytes32 groupRoot,bytes32 tallyHash,string electionId"`, sin resolver, no revocable) a SchemaRegistry y guardar el `uid` en env `QUORUM_EAS_SCHEMA_UID`; activar con `QUORUM_EAS_ENABLED=true`. El verificador CLI hoy solo compara contra `anchor.txHash` (calldata); la lectura de `attestationUid` queda documentada como `no evaluado`.

### PoC ejecutado (salida real; detalle completo en `docs/TEST_RESULTS.md`)
```
$ pnpm --filter @quorum/protocol-adapter fixtures            # 2026-10-24T14:29:04Z
valid.json: 3 boletas, tally={"counts":[1,2,0],"invalid":0,"total":3}, root=105088850375…, finalHash=0x122281d0c1470dcd… (1037 ms)
$ pnpm --filter @quorum/protocol-adapter test                # 12 passed (12), 2.62 s
$ pnpm --filter @quorum/verifier test                        # 10 passed (10), 1.74 s
$ pnpm --filter @quorum/verifier verify packages/demo-fixtures/protocol/valid.json           → valid:true,  exit 0
$ pnpm --filter @quorum/verifier verify packages/demo-fixtures/protocol/tampered_total.json  → valid:false, exit 1
  FAIL tally_matches: total publicado ≠ recomputado: opción 0 (opt-a): publicado 2, recomputado 1; opción 1 (opt-b): publicado 1, recomputado 2
```

### Decisiones tomadas por crypto (revisables)
- Doble voto ⇒ **rechazo** (`LedgerRejection{code:"DOUBLE_VOTE"}`), no reemplazo. Semaphore no impone semántica; elegimos la más simple y verificable.
- `anchor_matches` no evaluado ⇒ `passed:true` + `reason:"no evaluado…"` + entrada en `unsupportedGuarantees`, porque `AuditCheck` no tiene estado tripartito. La UI debe leer `reason`/`unsupportedGuarantees`, no solo `passed`.
- `message` = índice de opción (número). Para `ranking`/`budget` harían falta codificaciones adicionales (no hechas).
- Fixture extra `removed_record_rechained.json`: documenta el límite real (sin ancla no se detecta). Está en el README de fixtures y en el test.
