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
