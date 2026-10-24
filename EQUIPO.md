# Equipo de la oficina Quórum

**Proyecto:** Quórum — votaciones internas con voto privado y escrutinio verificable (Platanus Hack Caracas 2026, track Trust).
**Clientes:** condominios, universidades, cooperativas, comunidades y organizaciones que deciden internamente y quieren comprobar el resultado sin confiar ciegamente en quien organiza.
**Tono de marca:** sobrio, claro, honesto; "la confianza no tiene que depender solo de quien cuenta". Palabras que sí: verificable, evidencia, comprobable, privado, incluido. Palabras que no: 100% seguro, imposible de manipular, anónimo (salvo prueba), blockchain como garantía.
**Ciudad / zona horaria:** Caracas, America/Caracas.

> Esta tabla se armó a partir de la spec maestra y del brief verbal de José. **Pendiente:** nombres, emails de claude.ai y computadoras de los demás integrantes (sección «Personas»). Se completa desde la página («¿Quién eres?») o editando este archivo.

## Personas
| id | Nombre | Email claude.ai | Áreas de las que es dueña | Motor |
|---|---|---|---|---|
| jose | José Galvis | admin@staffon.app | direccion, protocolo, producto, calidad (todas, hasta repartir) | Mac de José (git, node 22, pnpm, Playwright, gh) |
| socio2 | (por definir) | | | |
| socio3 | (por definir) | | | |

Quien aprueba lo que no tiene dueño claro: **José**.

## Áreas y agentes
| Área | Dueño | Agente | Hace | Recibe | Entrega | Aprueba |
|---|---|---|---|---|---|---|
| Dirección | José | **Orquestador** (`quorum-orquestador`, coordinador) | Reparte encargos, convierte respuestas en decisiones, mantiene PLAN/STATE/DECISIONS/RISKS, vigila claims | encargos sin agente, respuestas | tareas asignadas, decisiones, resumen | — |
| Dirección | José | **Demo** (`quorum-demo`) | Guion 3 min, one-pager, cifras con fuente, limitaciones, contingencia offline | garantías reales del motor, métricas | DEMO_SCRIPT, IMPACT_EVIDENCE, KNOWN_LIMITATIONS | José |
| Protocolo | José | **Crypto** (`quorum-crypto`) | Spike de motores, ADR-001, protocol-adapter, verificador independiente, fixtures | research, decisiones | ADR + PoC real + verificador | José |
| Protocolo | José | **Seguridad** (`quorum-seguridad`) | Threat model, auditoría PII/biometría, tests adversariales, revisión de claims | código, fixtures | hallazgos + tests | José |
| Producto | José | **UX/UI** (`quorum-uxui`) | Tokens, flujos, componentes, accesibilidad, capturas 360/768/1440 | spec §4, pantallas | DESIGN_SYSTEM, UX_FLOWS, hallazgos | José |
| Producto | José | **Frontend** (`quorum-frontend`) | Landing, wizard, onboarding con rostro+wallet, boleta, resultados en vivo (UI generativa), auditor, laboratorio de ataques | contratos, tokens | pantallas funcionando | José |
| Producto | José | **Backend** (`quorum-backend`) | API, censo demo, invitaciones WhatsApp (Kapso), wallets embebidas, prueba de vida, paquete de auditoría | ADR, research | endpoints + tests | José |
| Calidad | José | **QA** (`quorum-qa`) | Vitest, Playwright E2E, adversariales, TEST_RESULTS | criterios de aceptación | evidencia real de pruebas | José |

## Motores
| Motor | Persona | Computadora | Áreas | Capacidades |
|---|---|---|---|---|
| mac-jose | José | Mac (Darwin) | * | negocio, git, web (node+pnpm+Chrome), e2e (Playwright) |

## Reglas acordadas
- Nunca sin aprobación: desplegar a producción, enviar WhatsApp reales, merge a `main`, publicar resultados/claims externos, gastar dinero (créditos de testnet/proveedores).
- Datos sensibles que los agentes no ven ni copian: claves/API keys, cédulas, rostros, teléfonos reales de votantes.
- Dónde aprobar: en código → diseño, plan y merge; en demo → guion y cifras; en comunicaciones → antes de enviar.
- Decisiones vigentes iniciales: ver `docs/DECISIONS.md` (D-01..D-07).

## Técnico
- Repo de la oficina = repo del producto (privado en GitHub, ver `CLAUDE.md`).
- Cuentas de claude.ai: compartir la página como editor a cada integrante.
- El mundo (vista 3D): activado, con robotines/personitas heredados de la página base.
