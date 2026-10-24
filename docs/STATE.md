# Estado (actualizar al cerrar cada integración)

## 2026-10-24 — H+0
- Oficina creada: repo, CLAUDE.md, agentes, skill del motor, página.
- Investigaciones en curso: motores de votación (DAVINCI/MACI/Helios), wallets + verificación facial, Kapso WhatsApp, UI generativa en vivo. Resultados en `research/`.
- Pendiente humano: completar `EQUIPO.md` con las personas reales, credenciales (Kapso, proveedor de wallet, proveedor facial, Vercel), decidir ADR-001.

## 2026-10-24 — H+1 (≈11:00 VET)
- Hecho: repo privado `josegalvis27/quorum-hackathon`, oficina publicada (página + DB sembrada: 4 áreas, 8 agentes, 3 personas, contexto), Spec Kit + constitución, monorepo pnpm con `apps/web` (Next 16) y `packages/contracts` (Zod), CI, contrato de API v0, research 02/03/04.
- En curso (ramas en worktrees): backend (API + identidad + notify Kapso dry-run), frontend (onboarding rostro→wallet, boleta, live, organizador, auditor), QA (Vitest/Playwright/fixtures). Spike de motores (research/01) en curso.
- Bloqueos humanos: cuentas Kapso/Privy/ZeroDev (probar acceso desde IP venezolana sin VPN), integrantes del equipo, ADR-001.

## 2026-10-24 — H+3 (≈13:00 VET)
- Entregas: QA (PR #1), backend (PR #2), frontend (PR #3), crypto Plan A (`feat/crypto-plan-a`). Integradas en `integration/h3` → **PR #4** con typecheck, lint, 124 tests, build y smoke E2E en verde. Espera aprobación en la página.
- ADR-001 propuesto (Semaphore ledger + spike DAVINCI opcional); esperando confirmación.
- Siguiente: conectar verificador real a `/api/audit/verify`, voto con prueba Semaphore, `GET /voters`, ancla real en Base Sepolia, sembrar elección demo, ensayo móvil.
- Bloqueos humanos: credenciales (Kapso, Privy, ZeroDev), decisiones del ADR y del doble voto, equipo.
