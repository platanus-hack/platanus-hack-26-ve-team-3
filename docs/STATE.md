# Estado (actualizar al cerrar cada integración)

## 2026-10-24 — H+0
- Oficina creada: repo, CLAUDE.md, agentes, skill del motor, página.
- Investigaciones en curso: motores de votación (DAVINCI/MACI/Helios), wallets + verificación facial, Kapso WhatsApp, UI generativa en vivo. Resultados en `research/`.
- Pendiente humano: completar `EQUIPO.md` con las personas reales, credenciales (Kapso, proveedor de wallet, proveedor facial, Vercel), decidir ADR-001.

## 2026-10-24 — H+1 (≈11:00 VET)
- Hecho: repo privado `josegalvis27/quorum-hackathon`, oficina publicada (página + DB sembrada: 4 áreas, 8 agentes, 3 personas, contexto), Spec Kit + constitución, monorepo pnpm con `apps/web` (Next 16) y `packages/contracts` (Zod), CI, contrato de API v0, research 02/03/04.
- En curso (ramas en worktrees): backend (API + identidad + notify Kapso dry-run), frontend (onboarding rostro→wallet, boleta, live, organizador, auditor), QA (Vitest/Playwright/fixtures). Spike de motores (research/01) en curso.
- Bloqueos humanos: cuentas Kapso/Privy/ZeroDev (probar acceso desde IP venezolana sin VPN), integrantes del equipo, ADR-001.

## 2026-10-24 — integración fase 2 (≈12:45 VET)
- `integration/phase2` = motor + wallet + UI + QA adversarial + ancla + sala abierta. Verde: typecheck, lint, 272 tests, build, Playwright con mocks (20) y **E2E real sin mocks** (1). Evidencia: `docs/TEST_RESULTS.md` § "Integración fase 2 completa".
- Decisión aplicada: "solo ancla on-chain" → `POST /vote` con `onchain` = 400 `onchain_not_supported`.
