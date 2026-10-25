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

## 2026-10-24 — fase 2 en main (≈16:30 VET)
- `main` = fase 2 completa + flujo simple + cuenta regresiva/inicio programado + credencial QR del evento + rostro rápido (WASM, 7,35 MB por teléfono) + diagnóstico de cámara. Desplegado en Render (https://quorum-sefw.onrender.com) desde `main`.
- Verde: typecheck, lint, 425 tests, build, 70 Playwright con mocks y 5 E2E reales (credencial, espera, voto completo, sala, peso). Evidencia en `docs/TEST_RESULTS.md`.
- Pendiente: probar en iPhone/Android reales (A/B `?fb=wasm|humangl`), calibrar el umbral de dedupe 0.70 con cámaras frontales reales.

## 2026-10-24 — revisión manual de duplicados (`feat/aprobacion-manual`, D-21)
- Gemelos con credenciales distintas: 202 `pending_review` → el organizador aprueba/rechaza en el panel → el teléfono sigue solo. Pendientes se rechazan solas al abrir; panel con "X de Y listos" y avisos antes de abrir. `manualApprovals` en el paquete y en el verificador. Diagnóstico `link:*` en client-log.
- Verde: typecheck, lint, 508 tests, build, 78 Playwright con mocks, 6 E2E reales. Evidencia en `docs/TEST_RESULTS.md`. Sin PR ni merge (pendiente de aprobación).

## 2026-10-24 — modo continuo «Al instante» (`feat/modo-continuo`, D-22, ≈18:40 VET)
- Predeterminado en votaciones nuevas: se inscriben y votan en el mismo momento. Publicar = abrir; la sala sigue abierta mientras se vota; `member_added` encadenado en el ledger; boleta válida con raíz histórica de las últimas 32 y ≥ K=5 miembros; cerrar = sala + votación. «Con hora de inicio» (fases) sigue disponible y sus paquetes verifican igual.
- Verde: typecheck, lint, 483 tests, build, 86 Playwright con mocks, 7 E2E reales (incluye `continuo.real`). Evidencia en `docs/TEST_RESULTS.md`. Sin merge ni deploy (pendiente de aprobación).
- Pendiente: probar con teléfonos reales en el evento; decidir si K=5 es el valor para mañana.

## 2026-10-25 — repo del equipo 3 (`feat/repo-equipo`, ≈07:30 VET)
- El código completo se refleja en `platanus-hack/platanus-hack-26-ve-team-3` (historial fusionado con la plantilla de Platanus). `origin` empuja a los dos repos; Render sigue desplegando desde `josegalvis27/quorum-hackathon`.
- Llenados: `README.md`, `project-description.md`, `platanus-hack-project.jsonc` (deploy: https://quorum-sefw.onrender.com) y `project-logo.png` (1000×1000, marca Quórum). Comandos del README ejecutados: verificador sobre `valid.json` (verificado) y `tampered_total.json` (`tally_matches` = fallo detectado).
## 2026-10-25 — limpiar «Mis votaciones» (`feat/limpiar-lista`, ≈07:50 VET)
- La lista de «Mis votaciones» vive solo en el navegador (localStorage); no hay listado ni borrado en el servidor. Nuevo botón «Limpiar» en «Anteriores» (con confirmación) que quita esas votaciones de la lista del teléfono sin tocar credenciales, recibos ni datos del servidor.
- Verde en el worktree: vitest web 344 tests (36 archivos), typecheck, lint. Sin merge (pendiente de aprobación).
