# Plan (H+0 = 2026-10-24 ~10:00 VET; ajustar al tiempo real restante)

## Ruta crítica
1. **H+0–2 Go/No-Go del motor** (crypto): spike DAVINCI/MACI/Helios → `docs/ADR-001-voting-engine.md`. En paralelo: oficina (listo), research (listo), tokens y flujos (uxui), fixtures y criterios (qa), pruebas de proveedores desde IP venezolana sin VPN (backend: Privy, ZeroDev, CDP, Kapso, Didit).
2. **H+2–7 Vertical slice de verificación**: votar con 3 cuentas demo → tally por proceso independiente → red team altera copia → rechazo. Si no se logra: Plan B (Helios) / Plan C etiquetado.
3. **H+7–14 Producto usable**: API, onboarding rostro→wallet, boleta, dashboard organizador, resultados en vivo, auditor web. Kapso opt-in + template en aprobación.
4. **H+14–22 Seguridad y pruebas**: cierre/expiración, paquete de auditoría, recibo de inclusión, 8 adversariales, privacidad estructural.
5. **H+22–28 Pulido**: mobile-first, accesibilidad, estados, grabación de respaldo.
6. **H+28–32 Congelar**: CI completo, smoke en deploy, errores conocidos.
7. **H+32–36 Ensayos**: demo 3–5 veces, métricas, URL de respaldo.

## Carriles y propiedad
| Carril | Dueño | Archivos |
|---|---|---|
| protocolo | quorum-crypto (+seguridad) | `packages/protocol-adapter`, `apps/verifier`, `packages/demo-fixtures`, `docs/ADR-*` |
| web-back | quorum-backend | `apps/web/src/app/api/**`, `apps/web/src/lib/server/**`, `packages/contracts`, `packages/notify` |
| web-front | quorum-frontend (+uxui) | `apps/web/src/app/**` (no api), `apps/web/src/components/**`, `packages/ui` |
| qa | quorum-qa | `tests/**`, `apps/web/e2e/**`, `docs/TEST_RESULTS.md` |
| docs | orquestador, demo | `docs/*` |

## WIP
Máximo 3 PRs de código a la vez. Gates P0 nunca se posponen.

## Decisiones pendientes (humano)
- ADR-001 motor (tras spike).
- Proveedor de wallet (Privy vs CDP) según prueba de acceso desde Venezuela.
- Proveedor facial (Human local vs Didit) según prueba de acceso.
- Cuenta Kapso + número + template `quorum_invite` (UTILITY) enviado a aprobación.
- Integrantes del equipo y sus áreas (EQUIPO.md).
