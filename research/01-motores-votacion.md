# Research 01 — Motor de votación verificable (spike H+0–2)

Fecha de consulta: 2026-10-24. Verificado contra npm, GitHub API, docs oficiales y **ejecutando código en Node 22.17**.

## Tres hallazgos que cambian la decisión
1. **MACI está archivado** (repo `privacy-ethereum/maci`, archivado 19-ago-2026, read-only; último npm `@maci-protocol/*` 3.0.0 de jun-2026; docs con páginas rotas; exige Node 20 exacto, monorepo clonado, coordinador trusted y **1,5 GB de zkeys**). Descartado.
2. **DAVINCI (Vocdoni) está vivo pero es pre-producción en mainnet.** `@vocdoni/davinci-sdk` 6.0.1 publicado el 23-oct-2026. Único preset: **OP Mainnet (chain 10)**, registro `0xc916F985CbCdbEb25A0EE6950361cf7Dd9Fbe35a` desplegado ayer. **No hay testnet ni faucet.** Probado en vivo: `https://sequencer2.davinci.vote` responde, chain 10, **0 procesos** on-chain hoy. `sequencer1` no resuelve DNS. Resultados ≥ ~6 min tras cierre; votos `pending` hasta 15 min.
3. **Semaphore v4 funciona hoy en Node 22, sin coordinador ni testnet, en 0,5 s.** Prueba local: generación 492 ms, `verifyProof` = true, prueba manipulada = false, doble voto ⇒ mismo nullifier. `snark-artifacts` (repo) archivado 19-ago-2026, pero el CDN `snark-artifacts.pse.dev` sigue vivo → **vendorizar los 3 archivos (~3,4 MB)**.

## Tabla comparativa
| Motor | Madurez | SDK JS | Coordinador / setup | Cripto / testnet | Verificador independiente | PoC 3 votantes | Riesgo |
|---|---|---|---|---|---|---|---|
| MACI 3.0.0 | Archivado | Node 20, monorepo | Sí + 1,5 GB zkeys | testnets | Parcial (on-chain) | 14–24 h | Muy alto |
| DAVINCI 6.0.1 | Activo, pre-prod | Sí (ethers 6 + snarkjs) | Secuenciador público; clave por nodo o DKG (trusted setups de desarrollo) | **OP Mainnet real**, gas del organizador | Parcial: pins/VKs, metadata SHA-256, `verifyCensusUrl`, `verifyTrackerProof`, eventos; **no re-verifica tally offline** | 6–12 h si la red coopera | Alto |
| Helios | Activo (ago-2026) | No (Python/Django, Postgres, RabbitMQ) | Trustees | — | **Sí** (verify.html en JS) | 6–10 h | Medio |
| ElectionGuard | Py 1.4.0 (2022); Rust experimental | No | Guardians | — | Solo 1.x | >30 h | Muy alto |
| **Semaphore v4 + ledger + ancla** | `@semaphore-protocol/core` 4.14.5 (17-oct-2026) | Sí, TS puro, probado | **No** | Opcional Base Sepolia (contratos ya desplegados) | **Lo construimos** y es el punto | 4–8 h | **Bajo** |
| Belenios / Zupass / Snapshot | OCaml / estancado / tokens | — | — | — | — | — | No aplican |

Versiones: `@semaphore-protocol/core` 4.14.5 · `@noble/curves` 2.4.0 · `snarkjs` 0.7.6 · `@ethereum-attestation-service/eas-sdk` 2.10.0 · `@vocdoni/davinci-sdk` 6.0.1.

## Plan A (recomendado): Semaphore v4 + ledger hash-encadenado + ancla/atestación EAS en Base Sepolia + verificador CLI
```bash
pnpm add @semaphore-protocol/core@4.14.5 @noble/curves@2.4.0 @noble/hashes viem
mkdir -p public/zk && for f in wasm zkey; do curl -o public/zk/semaphore-10.$f https://snark-artifacts.pse.dev/semaphore/4.13.0/semaphore-10.$f; done
```
- Votante: `Identity` en el navegador; el servidor guarda solo el `commitment` (padrón = `Group`). `generateProof(identity, group, message=opción, scope="quorum:<electionId>", 10, {wasm, zkey})` ⇒ `{merkleTreeRoot, nullifier, message, scope, points}`. 1 nullifier por credencial por elección.
- Servidor: ledger append-only `{proof, prevHash, hash, idx}`; rechaza raíz incorrecta, nullifier repetido, prueba inválida. Hash final + raíz + tally → **ancla on-chain** (tx con calldata o atestación EAS `0x4200000000000000000000000000000000000021` en Base Sepolia).
- Verificador (CLI aparte, sin DB): recomputa raíz desde commitments, recorre la cadena, verifica cada prueba, nullifiers únicos, recuenta, compara con ancla y con el total publicado. Falla con causa exacta (`cadena rota en #2`, `padrón alterado`, `doble voto`, `hash final ≠ ancla`, `total ≠ recomputado`).
- Contratos Semaphore v4 en Base Sepolia: `Semaphore` `0xC10E5102A2Cc077BE3B9740Fc0Ad7e27Ff8E0245`, `SemaphoreVerifier` `0x4DeC9E3784EcC1eE002001BfE91deEf4A48931f8`.
- Opcional (H+12–20): ElGamal exponencial con `@noble/curves` (probado: 3 votos [1,0,1] → suma = 2) + prueba Chaum-Pedersen de descifrado para secreto de contenido. Sin range proof no se prueba que cada boleta sea 0/1: decirlo.
- Gotcha: snarkjs deja workers vivos → `process.exit(0)` en scripts.
- **Propiedades demostradas:** elegibilidad sin identificar, unicidad, integridad del registro, inmutabilidad del total anclado, recuento reproducible. **No demostradas:** secreto frente al servidor (sin ElGamal), resistencia a coacción, validez 0/1 de boletas cifradas.

## Plan B: DAVINCI en OP Mainnet (spike paralelo con go/no-go a H+8–10)
`pnpm add @vocdoni/davinci-sdk@6.0.1 ethers@6`. Requiere `ORGANIZER_KEY` con ETH en OP Mainnet, RPC, y bucket HTTPS público sin redirects para censo/metadata (Vercel Blob sirve). Flujo: `init()` → `createProcess({census: OffchainCensus, keyMode: "sequencer"})` → votantes `submitVote` (sin gas, firman) → `waitForVoteStatus` → `getVoteReceipt` + `verifyTrackerProof` → `closeProcessIn(60)` → `waitForResults` → verificador: `init()` valida pins, `getProcess().metadataStatus`, `verifyCensusUrl`, eventos `ProcessStateTransitioned`/`ProcessResultsSet`, `decodeResults`. Ejecuté `init`, `listProcesses`, `getProcessCount`, `getGraceParams` ({defaultGrace:300, graceFloor:240, graceCeil:600, noticeMin:60}); **no** ejecuté `createProcess`/`submitVote` (ETH real).

## DAVINCI vs desde cero
**(a) Qué regala DAVINCI:** secuenciador público sin API key, cifrado homomórfico real (ElGamal BabyJubJub) + ZK de validez de boleta (Groth16) + pruebas zkVM (ZisK) verificadas on-chain, registro público en OP Mainnet, recibos verificables; votantes sin gas; costo = gas del organizador (centavos, estimación no verificada).
**(b) Qué dejamos de controlar:** 1 nodo público en una red de 1 día con 0 procesos; `init()` rechaza SDK/nodo desalineados (pasó 21 y 23 oct); latencia 6–20 min; votantes necesitan keypair y firma; censo en HTTPS público; no re-verificas el tally offline ("el contrato lo verificó"); comités con trusted setups de desarrollo; necesitas ETH en OP antes de empezar.
**(c) Derivar valor (resultado verificado → acción):** `registry.onProcessResultsSet` / `getProcess().status === RESULTS` + `decodeResults`; acciones: 1) **atestación EAS** del acuerdo `{processId, resultsTxHash, stateRoot, tally, quórum}` como acta verificable; 2) **contrato `Condominio.sol`** que lee `ProcessRegistry.getProcess()` y, si hay resultados, libera un pago / cambia un parámetro; 3) reporte auditable JSON/PDF del verificador; 4) segunda ronda automática. **La misma acción derivada consume el resultado del Plan A** (solo cambia la fuente `(root, hash, tally)`).
**Desde cero (Semaphore):** control total, demo determinista en segundos, narrativa limpia, anonimato real frente al servidor (Helios no lo da), se puede romper la elección en vivo. No da secreto del contenido (sin ElGamal) ni prueba criptográfica de tally.

**Recomendación:** Técnico/Ambición puntúan más con DAVINCI *si funciona en escenario*; menos riesgo con Semaphore. Hacer **Plan A como núcleo garantizado (listo ~H+12)** y **spike DAVINCI por 1 persona con go/no-go a H+8–10**: si una elección de 3 votantes termina con `ProcessResultsSet`, Quórum se presenta como "motor dual" y la acción derivada (EAS + contrato) se conecta a DAVINCI; si no, consume el Plan A.

**Flujo de demo:** votación (3 móviles, identidad Semaphore, prueba en 0,5 s) → verificador independiente en otra terminal: `OK` → alterar un voto en la DB → `FAIL: cadena rota en #2` → acción derivada (ancla + atestación EAS en Base Sepolia visible en EAS scan + contrato que libera lo votado). Si DAVINCI vive, segundo panel con el evento en Etherscan de OP.

## Plan C
Helios local con su verificador JS como segundo verificador o fallback. MACI: no.

## Claims prohibidos
- MACI: "mantenido", "sin coordinador de confianza", "se instala con npm".
- DAVINCI: "en producción/auditado", "sin costo", "resultados instantáneos", "descentralizado" (1 nodo), "testnet", "nadie puede falsificar pruebas de comité", "verificamos el tally offline", "votantes sin wallet".
- Helios: "anónimo frente al servidor", "ZK", "Docker oficial".
- Plan A: "voto secreto frente al servidor" (sin ElGamal), "prueba de tally" (es recuento reproducible), "boletas probadamente válidas" (sin range proof), "resistente a coacción", "artefactos de repo mantenido" (vendorizar).
- Genérico: "end-to-end verificable" solo si el votante puede comprobar que SU boleta está en el ledger (nullifier/hash; en DAVINCI recibo + `verifyTrackerProof`).

## PoC ejecutados (copiados a `packages/protocol-adapter/poc/`)
`sem.ts` (Semaphore), `dav2.ts` (lectura DAVINCI en vivo), `elgamal.ts` (ElGamal noble).

## Fuentes
https://docs.semaphore.pse.dev/guides/proofs · https://docs.semaphore.pse.dev/deployed-contracts · https://github.com/privacy-scaling-explorations/snark-artifacts · https://github.com/ethereum-attestation-service/eas-contracts · https://github.com/vocdoni/davinci-sdk (README, docs/ai/SKILL.md, references/*, CHANGELOG) · https://raw.githubusercontent.com/vocdoni/davinci-sequencer/main/docs/deployments.md · https://api.github.com/repos/privacy-scaling-explorations/maci · https://maci.pse.dev/docs/quick-start · https://raw.githubusercontent.com/benadida/helios-server/master/heliosverifier/verify.html · https://github.com/microsoft/electionguard-rust
