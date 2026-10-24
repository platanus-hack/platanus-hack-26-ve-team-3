# CONTINUAR — instrucción para retomar Quórum en cualquier sesión de Claude Code

**Repo:** https://github.com/josegalvis27/quorum-hackathon (privado) · **Oficina:** https://claude.ai/artifact/H1MyTrpkB5xrPX5k6VV71K · **Fecha de corte:** 2026-10-24 ~14:00 VET (H+4 de 36).

## 1. Cómo retomar (copiar y pegar en Claude Code, en la carpeta del repo clonado)

```text
Lee CONTINUAR.md, CLAUDE.md, docs/STATE.md, docs/DECISIONS.md (D-01..D-12), docs/API_CONTRACT.md (v0 y v1) y docs/PLAN.md. Actúa como harness lead de Quórum (quorum-orquestador) usando la oficina: página https://claude.ai/artifact/H1MyTrpkB5xrPX5k6VV71K (ArtifactData para leer/escribir tareas, siempre con if_version) y los agentes de .claude/agents/quorum-*.md. Primero: `git fetch origin` y revisa qué ramas existen (feat/phase2-engine, feat/phase2-ui, feat/phase2-wallet); si alguna no existe o está incompleta, relanza el agente correspondiente con el prompt de la sección 4 de CONTINUAR.md, en un worktree desde origin/integration/h3. Luego integra fase 2 en integration/h3 (resuelve conflictos, pnpm typecheck/lint/test/build, Playwright smoke), abre un PR y déjalo en "Te toca" de la página para que José apruebe el merge a main. Después sigue el plan de la sección 3. No afirmes anonimato/ZK/100% seguro; no envíes WhatsApp reales ni despliegues a producción sin aprobación en la página. Actualiza docs/STATE.md al cerrar cada integración.
```

Requisitos de la máquina: Node 22, `npx pnpm@10`, `gh` autenticado con acceso al repo, Chromium de Playwright (`npx playwright install chromium`). La identidad del motor se crea con `bash oficina/motor.sh "<Nombre>" jose`.

## 2. Estado al corte

| Pieza | Dónde | Estado |
|---|---|---|
| Oficina (página + DB + agentes + motor `/oficina`) | `oficina/oficina.html`, `.claude/` | Lista. Te toca: merge PR #4, cuentas, equipo |
| Research (motores, wallets+rostro, Kapso, UI en vivo) | `research/01..04` | Lista; también en Biblioteca de la página |
| ADR-001 motor `semaphore-ledger` | `docs/ADR-001-voting-engine.md` | **Aprobado por José** (D-08) |
| Fase 1: QA, backend API, frontend P0, crypto (adaptador + verificador) | PRs #1, #2, #3 + `feat/crypto-plan-a` → integrados en **`integration/h3` (PR #4)** | Todo verde: typecheck, lint, 124 tests, build, smoke E2E. **Pendiente: aprobar merge a main** |
| Fase 2 (D-09..D-12): fases + voto Semaphore + sorteo; UI inscripción/voto/verificar/sorteo; smart wallet Kernel gasless + contrato | ramas `feat/phase2-engine`, `feat/phase2-ui`, `feat/phase2-wallet` (base `integration/h3`) | **En curso por 3 agentes al momento del corte.** Verificar con `git fetch && git branch -r` |

## 3. Siguientes pasos (en orden)
1. Integrar fase 2 en `integration/h3` → PR → aprobación → merge a `main`.
2. Credenciales (gratis, sin VPN): ZeroDev project (Base Sepolia) → `NEXT_PUBLIC_ZERODEV_PROJECT_ID`; faucet Base Sepolia para `ORGANIZER_PRIVATE_KEY` (desplegar `QuorumRegistry` con `scripts/deploy-registry.ts` y anclar); Kapso (`KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`, template `quorum_invite` UTILITY a aprobación; mientras, flujo opt-in wa.me). Todo en `apps/web/.env.local`.
3. `pnpm --filter @quorum/web seed:demo` → elección demo "Condominio Los Samanes" (¿cuántos proyectos financiamos? 1..5 → sorteo verificable de N proyectos). Ensayar en 3 móviles: inscripción (rostro + wallet) → abrir → votar → cerrar → verificar en la app → sorteo.
4. Deploy a Vercel (preview primero; producción solo con aprobación). Variables de env en Vercel.
5. Seguridad (quorum-seguridad): `docs/THREAT_MODEL.md`, 8 adversariales reales, revisión de PII/biometría.
6. Demo (quorum-demo): `docs/DEMO_SCRIPT.md` 3 min (hook → inscripción con rostro → voto en vivo → cierre → el jurado altera una copia → FALLO DETECTADO → sorteo → recursos asignados), `IMPACT_EVIDENCE.md`, `KNOWN_LIMITATIONS.md`, grabación de respaldo.
7. Congelar features a H+28; ensayos H+32.

## 4. Prompts de los agentes de fase 2 (relanzar si falta una rama)
Lanzar cada uno con `Agent` (subagent general-purpose, isolation worktree) y la instrucción inicial `git fetch origin && git checkout -b <rama> origin/integration/h3 && npx --yes pnpm@10 install`.
- **feat/phase2-engine** (backend+crypto): implementar `docs/API_CONTRACT.md` "Contrato v1": fases `registration→open→closed→tallying→auditable→drawn`; `POST /open` congela `groupRoot`; dedupe facial 1:N (409 `duplicate_identity`) + `faceBindingHash`; `POST /voters/:id/wallet` verifica firma EIP-712 `FaceBinding`; `POST /voters/:id/identity` guarda `commitment`; `POST /vote {proof}` con `appendBallot`; `GET /ledger`; `/close` → paquete + `verifyPackage` + ancla opcional; `/draw` con `drawWinners` determinista (seed keccak256(finalHash)) y check `draw_matches` en el verificador; `seed-demo.ts`; tests completos; TEST_RESULTS.
- **feat/phase2-ui** (frontend): inscripción (rostro → wallet firma FaceBinding → identidad Semaphore en navegador → commitment), voto con `generateProof` en navegador (artefactos en `public/zk`) y `txHash` opcional, en vivo con fases, "Verificar ahora" con `verifyPackage` en navegador y "Mi voto está" por nullifier, pantalla de sorteo con "Recomputar aquí", panel del organizador con botones por fase y candidatos, capturas 360/768/1440.
- **feat/phase2-wallet**: `packages/wallet` con Kernel (ZeroDev) + paymaster, fallback `eoa-demo`; `contracts/QuorumRegistry.sol` (`cast`, `anchor`) compilado con solc y script de deploy viem; `WalletStep.tsx`; `docs/WALLETS.md` con pasos de cuenta gratis, costos $0 y plan B Alchemy/Pimlico.

## 5. Reglas que no cambian
Ver `CLAUDE.md`: política de claims (spec §12), nunca PII/biometría cruda, nunca `verificado` sin verificador real, aprobaciones en la página para merge/deploy/WhatsApp, elección ficticia neutral.
