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

## 2026-10-24 — fase 2 completa (≈13:15 VET)
- `integration/phase2` = h3 + motor + wallet + UI + QA adversarial + ancla vía `QuorumRegistry` + sala abierta (backend y UI) + laboratorio del jurado + verificador con esquema estricto + docs de seguridad y demo.
- Verde: typecheck, lint, **352 tests**, build, **52 Playwright** (smoke, phase2, lab, room) y **3 E2E reales** sin mocks (flujo de voto completo, sala abierta, peso por teléfono). Evidencia en `docs/TEST_RESULTS.md`.
- Probado contra Base Sepolia: UserOp patrocinada por ZeroDev, firma FaceBinding de Kernel (ERC-6492) verificada por el servidor, ancla real `0x97911d4e…737371` verificada por el CLI; copia alterada → fallo detectado.
- Seguridad: los 5 críticos y AT-01..AT-10 cubiertos con tests; límites en `docs/KNOWN_LIMITATIONS.md`.
- Peso por teléfono: 14,89 MB (antes 17,49).
- Pendiente: deploy (necesita base de datos compartida: hoy el store es JSON en disco), ensayo con teléfonos reales y cámara real, prueba de carga en el Wi-Fi del evento.

## 2026-10-24 — flujo simple del votante (`feat/flujo-simple`, ≈13:45 VET)
- Inscripción en 2 pantallas y voto en 1 (D-18). Toques medidos: inscripción 2 (+ nombre + cámara), voto 2. Sin "wallet/firma/credencial/nullifier…" en el flujo principal; todo eso en "Detalles técnicos" con la etiqueta demo.
- Credencial cifrada con clave del dispositivo (AES-GCM no extraíble en IndexedDB); las inscripciones v2 se abren re-firmando en segundo plano.
- Verde: typecheck, lint, 361 tests, build, 58 Playwright con mocks (smoke, phase2, lab, room, voter-taps) y 3 E2E reales. Peso por teléfono: 14,83 MB. Evidencia: `docs/TEST_RESULTS.md` § "Flujo simple del votante".
- Pendiente: probar en teléfonos reales (iPhone Safari, Android de gama baja) la cámara automática, la vibración/sonido al abrir y el Wake Lock.

## 2026-10-24 — rostro rápido (`feat/rostro-rapido`, ≈16:15 VET)
- Cámara: 10,46 MB → 2,97 MB por teléfono (insightface uint8 en vez de faceres, sin facemesh, gzip, WASM). Backend wasm por defecto; `?fb=` para A/B. Dedupe 0.70 (256 dims) calibrado con LFW. Total por teléfono 14,89 → 7,35 MB.
- Verde: typecheck, lint, 376 tests, build, 40 Playwright con mocks, 3 E2E reales. Evidencia: `docs/TEST_RESULTS.md` («Rostro rápido»).
- Pendiente: A/B en teléfonos reales (desplegar la rama), licencia de pesos InsightFace.
