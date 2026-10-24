# QUÓRUM — MASTER BUILD SPEC

**Trust the proof, not the organizer.**  
**Track:** Trust · **Contexto:** Platanus Hack Caracas, octubre de 2026  
**Estado:** especificación de implementación, no auditoría de seguridad ni sistema electoral certificado.  
**Idioma de producto:** español (es-VE), accesibilidad y traducciones extensibles.  
**Objetivo:** MVP demostrable y auditado por pruebas automatizadas dentro de la ventana restante del hackathon.

> **INSTRUCCIÓN PARA TODOS LOS AGENTES:** Lean el documento entero antes de construir. La prioridad no es poner votos en blockchain: es demostrar, con un verificador independiente, que un escrutinio no fue cambiado y que el sistema no expone deliberadamente la elección individual. No afirmes anonimato, coercion-resistance, seguridad nacional o verificación ZK si no se implementa y prueba realmente. Jamás utilizar identidades o elecciones políticas reales en la demostración.

---

## 0. Decisión de alcance y definición de éxito

**Quién:** universidades, asociaciones, cooperativas, comunidades y organizaciones que realizan decisiones internas de bajo riesgo y quieren comprobación externa del resultado.

**Problema concreto:** hoy un administrador de una votación digital puede declarar un total que los participantes no saben verificar de manera independiente. A la vez, listas de votos nominales exponen preferencias sensibles. La organización necesita elegibilidad, privacidad y auditoría del escrutinio sin depender exclusivamente del administrador.

**Promesa defendible:** `QUÓRUM ayuda a celebrar votaciones internas con privacidad y evidencia criptográfica comprobable de que el escrutinio publicado corresponde a los votos incluidos en una urna verificable.`

**NO prometer:** «elecciones nacionales seguras», «voto imposible de manipular», «identidad civil verificada por wallet», «resistencia absoluta a compra de votos/coerción», «nadie en el sistema puede jamás saber cómo votaste», «la blockchain garantiza la verdad», «un voto por persona» si el censo no resuelve duplicidad.

**Definición de Done:**
1. Un organizador crea una elección interna ficticia con opciones, fechas y reglas.
2. Se emiten credenciales de prueba a electores ficticios elegibles; la capacidad de votar no depende de poseer criptomonedas.
3. Electores emiten votos vía un protocolo concreto de privacidad/verificabilidad ya implementado y documentado; no guardar una relación elector→preferencia en base de datos propia.
4. La interfaz de elector muestra comprobante de inclusión que no revele el voto.
5. Se publica un conjunto de evidencias/artefactos del escrutinio.
6. Un **verificador separado** ejecuta la verificación sobre los artefactos, independiente del texto y estados servidos por el organizador.
7. Si se manipula un resultado, una prueba o un elemento relevante de la urna de prueba, el auditor falla con causa concreta.
8. Una comprobación de privacidad confirma que las páginas y registros públicos no revelan la correspondencia identidad→opción. *Esto no demuestra ausencia de fugas por metadatos.*
9. Flujo móvil pulido, pruebas E2E y demo de 3 minutos reproducible.

### Criterios del jurado
- Originalidad 15%: auditoría entendible para organizaciones pequeñas, diseño centrado en usuarios, no blockchain por marketing.
- Ambición 20%: privacidad, elegibilidad, trazabilidad, evidencia transferible, manipulación adversarial.
- Ejecución 20%: flujo end-to-end, cero pantallas vacías, estados fiables.
- Impacto 20%: utilidad para organizaciones con baja confianza y recursos limitados; medición de comprensión y tiempo de auditoría, sin atribuciones políticas.
- Técnico 25%: protocolo probado, verificador genuinamente independiente, propiedades demostradas, ataques reproducibles.

---

## 1. Datos y contexto — fuentes y límites

### 1.1 Evidencia documentada
- **The Carter Center (2024):** el informe de observación sobre la elección presidencial venezolana de 2024 señala problemas de transparencia al no disponer de resultados desagregados oficiales para corroborar resultados anunciados. Es contexto sobre la importancia de una auditoría, **no evidencia de que Quórum resolvería esa elección ni de que un hackathon sustituya controles públicos**. Fuente: https://www.cartercenter.org/ 
- **National Academies — Securing the Vote (2018):** advierte de riesgos estructurales del retorno de votos por Internet y de la incapacidad de blockchain, por sí misma, para resolver problemas de seguridad electoral. Fuente: https://nap.nationalacademies.org/catalog/25120/securing-the-vote-protecting-american-democracy
- **Helios Voting:** evidencia pública de elecciones cifradas y verificables, con limitaciones para contextos donde existe coerción. https://vote.heliosvoting.org/ ; https://heliosvoting.org/
- **MACI:** coordinación privada apoyada en criptografía de conocimiento cero, con suposiciones sobre coordinador y configuración. https://maci.pse.dev/
- **Vocdoni / DAVINCI:** infraestructura de votaciones verificables; comprobar versiones/SDK y garantías antes de integrar. https://davinci.vote/
- **ElectionGuard:** kit de votación verificable con evidencias de escrutinio. https://www.electionguard.vote/
- **W3C Verifiable Credentials:** si el equipo decide emitir elegibilidad verificable, utilizar estándar existente y conservar datos personales fuera de cadena. https://www.w3.org/TR/vc-data-model-2.0/

### 1.2 Lo que NO dicen esas fuentes
- No prueban adopción potencial, población exacta usuaria ni ventas en Venezuela.
- No prueban que blockchain sea necesaria para todas las urnas verificables.
- No prueban integridad de dispositivos, ausencia de coacción física o unicidad humana.
- No asignar porcentajes de fraude evitado sin datos de una evaluación real.

### 1.3 Métricas reales del hackathon (capturar en vivo)
- Tasa de finalización de votos entre cuentas elegibles **simuladas**.
- Tiempo mediano de votar en móvil; tiempo de un observador no técnico para obtener un resultado de auditoría.
- Verificaciones independientes exitosas sobre elección íntegra.
- Alteraciones introducidas / alteraciones detectadas (por tipos, no cifra inflada).
- Errores de accesibilidad observados y corregidos.
- Número de afirmaciones de seguridad cubiertas por tests/artefactos, y limitaciones abiertas.

---

## 2. Análisis de amenazas y modelo de confianza

**Actores:** elector, organizador, autoridad que determina elegibilidad, coordinador criptográfico si el protocolo lo requiere, auditor independiente, atacante con capacidad de alterar frontend/DB/resultados publicados.

**Amenazas prioritarias del MVP:**
- A1. Administrador edita manualmente cifra final publicada.
- A2. Se elimina o altera un artefacto del registro verificable usado para escrutinio.
- A3. Elector intenta votar dos veces con credencial de un solo uso.
- A4. Persona no elegible intenta emitir voto.
- A5. Alguien inspecciona resultados públicos tratando de deducir la preferencia de un votante.
- A6. Sitio falso copia el diseño del portal y muestra un resultado no verificable.
- A7. Coordinador no entrega pruebas o decide no finalizar; la interfaz debe mostrar indisponibilidad, no validez.

**Fuera de garantías del MVP:** coerción familiar/laboral, phishing de identidades, malware en dispositivo del votante, ataques de tráfico, censura de conectividad, denegación de servicio distribuida, verificación de personas con documento de identidad, elecciones gubernamentales, fraude del emisor del censo, compra de credenciales.

**Nunca almacenar:** cédulas reales, opción elegida junto con identificador de elector, claves privadas, frase semilla, logs de voto en claro. No publicar listas nominales de votantes.

**Separación crucial:**
- «Voto registrado»: el sistema recibió un envío o mensaje del protocolo.
- «Voto incluido»: existe evidencia de inclusión en la urna.
- «Resultado verificado»: un algoritmo independiente verificó artefactos y pruebas de escrutinio.
- «Elegibilidad verificada»: lo emitió una autoridad concreta con límites conocidos.
- «Privacidad»: depende de la definición de protocolo y supuestos; no inferir de tener un hash.

---

## 3. Decisión técnica: no reinventar cifrado o ZK

**Spike técnico de máxima prioridad (primeras 2 horas):** verificar SDK actual, despliegue, requisitos de coordinador y formato de artefactos para **MACI** y **Vocdoni/DAVINCI**. Documentar la elección en `docs/ADR-001-voting-engine.md`, con referencia a documentación exacta usada y prueba de concepto real.

**Preferencia de selección:** el motor que permita completar en la infraestructura disponible el flujo voto privado → escrutinio → evidencia → verificador independiente; **no** elegir solo porque aparece blockchain o ZK en el marketing.

**Plan A:** reutilizar SDK/contratos y verificador documentado de MACI o Vocdoni, sin modificar primitivas criptográficas. Registrar chain IDs, contratos, prueba verificable y supuestos.

**Plan B (si integración no está lista a H+6):** usar **Helios** u otro motor con verificación end-to-end existente si se puede ejecutar y verificar realmente. Cambiar la narrativa a «urna criptográfica auditada» sin inventar blockchain ni ZK. Si el SDK elegido no demuestra la propiedad prometida, comunicar la limitación.

**Plan C de demostración didáctica (NO equipararlo a producto seguro):** un ledger de hashes encadenados y firmas con auditoría de manipulación de resultados. Etiquetar **«demuestra integridad de registro, no secreto ni verificabilidad de escrutinio»**. Esta opción reduce puntuación técnica esperada y no debe venderse como votación privada. Escogerla solo para evitar presentar un simulacro engañoso.

### Arquitectura ideal

```text
App del organizador  ──┐
                      ├──> API de elección + manifiesto inmutable/versionado
App del elector ───────┘         │
                                ▼
                 Motor existente de votación privada
                  (MACI / DAVINCI / Helios probado)
                                │
                      artefactos y pruebas
                                ▼
                 Publicación de paquete de auditoría
                                │
               ┌────────────────┴─────────────────┐
               ▼                                  ▼
       Web pública de resultados          Verificador CLI aparte
       (presentación solamente)           (recalcula y decide)
```

**Regla:** nunca derivar el estado VERIFIED de un booleano en la base de datos de Quórum. La UI debe llamar a un verificador real; el resultado incluye método, versión del protocolo, input hash, salida y errores.

---

## 4. Experiencia y pantallas (UX/UI)

### A. Landing
Hero: **«Tu decisión es privada. El resultado es verificable.»** Subtítulo: «Votaciones internas con evidencia pública del escrutinio. Nadie necesita confiar ciegamente en un dashboard». Dos CTAs: `Explorar una elección demo`, `Crear votación`. Una visual simple muestra «Votar / Verificar / Auditar» sin falsos sellos institucionales.

### B. Organizador
Wizard 3 pasos: `Pregunta y opciones → Participantes elegibles → Revisar y publicar`. Confirmación explícita de carácter demostrativo y supuestos de censo. Panel con turnout agregado, progreso de cierre, prueba de auditoría y botón de exportar paquete.

### C. Elector móvil
1. Pantalla de invitación/elegibilidad (`Invitado de demostración — voto privado`).
2. Boleta clara con 2–4 opciones; opción seleccionada se confirma antes de enviar.
3. Estado real: preparando → enviando → confirmación recibida → inclusión cuando disponible.
4. Comprobante no revelador (`ID de inclusión` u otro recibo permitido por el protocolo). No mostrar opción en recibo compartible. Opción de descargar/comprobar la inclusión.

### D. Centro público de transparencia
Cifras agregadas, fecha de cierre, manifiesto, definición de padrón y verificador reproducible. Mostrar claramente *quién* certificó elegibilidad y límites conocidos. No usar «100% seguro».

### E. Auditor independiente — pantalla principal de la demo
Carga paquete público o pega identificador de la elección. Botón `Verificar escrutinio`. Indicadores separados: integridad artefactos; prueba criptográfica; coherencia del resultado; disponibilidad de evidencias; propiedades no evaluadas. Descarga archivo JSON con resultado y checksum.

### F. Laboratorio de ataques (demo, nunca producción)
Selector `Resultado alterado`, `Artefacto ausente`, `Prueba corrupta`, `Voto duplicado` según capacidades comprobadas del protocolo. Crear **copia** del paquete de auditoría, no alterar elecciones reales. Verificador enseña por qué falla. Mantener originales inmutables.

### Guía visual — agente UX/UI
- Producto editorial y confiable, sobrio, distintivo; paleta recomendada: fondo hueso `#F8F7F3`, azul noche `#182B45`, verde verificación `#147D68`, ámbar advertencias `#B7791F`, rojo fallo `#C44242` (ajustar contraste WCAG AA).
- Tipografía sans legible, jerarquía 32/24/18/15px; espacio 8pt; componentes shadcn/ui y Tailwind. Sin estética de cripto-casino ni exceso de neón.
- Estados explícitos y honestos: `pendiente`, `recibido`, `incluido`, `verificado`, `no verificable`, `fallo detectado`.
- Diseño responsive desde 360px; objetivos táctiles al menos ~44px; teclado completo; focus visible; labels reales; contraste; `prefers-reduced-motion`.
- Evitar mostrar caras, nombres reales o preferencias individuales. Usar elección ficticia con opciones neutrales (p. ej. elegir fecha de evento universitario).
- Crear design tokens, librería mínima de componentes, esqueleto de pantallas, loading/errores/vacíos, capture de pantalla y evaluación Playwright visual.

---

## 5. Diseño funcional y contratos API

**Stack propuesto:** Next.js App Router + TypeScript strict + Tailwind + shadcn/ui; Postgres/Supabase solo para metadatos no sensibles; almacenamiento objeto para paquetes públicos; viem/ethers únicamente si motor elegido lo requiere; Playwright E2E; Vitest unit/integration; CLI de auditoría en paquete independiente.

**Monorepo:**

```text
quorum/
  apps/web/                    # UI organizador, elector, auditor
  apps/verifier/               # verificador independiente web o CLI empaquetado
  packages/protocol-adapter/   # integración al SDK elegido
  packages/contracts/          # tipos, esquemas, DTO, errores
  packages/ui/                 # tokens y componentes
  packages/demo-fixtures/      # dataset y ataque reproductible
  docs/                        # ADR, amenazas, pruebas, impacto
  .claude/agents/              # agentes personalizados del proyecto
  CLAUDE.md                    # reglas maestras
```

**Entidades (conceptuales; adaptar a SDK):**

```ts
export type Election = {
  id: string;
  title: string;
  description: string;
  options: { id: string; label: string }[];
  status: 'draft' | 'open' | 'closed' | 'tallying' | 'auditable' | 'failed';
  protocol: 'maci' | 'vocdoni' | 'helios' | 'integrity-demo';
  manifestHash: string;
  startsAt: string;
  endsAt: string;
  eligibilityIssuerId: string;
};

export type AuditResult = {
  electionId: string;
  verifierVersion: string;
  protocol: Election['protocol'];
  inputArtifactDigest: string;
  checkedAt: string;
  valid: boolean;
  checks: { name: string; passed: boolean; reason?: string }[];
  unsupportedGuarantees: string[];
};
```

**Endpoints de adaptación (nombres orientativos):**

```text
POST   /api/elections                 crear borrador
POST   /api/elections/:id/publish     publicar manifiesto y bloquear opciones
GET    /api/elections/:id             lectura
POST   /api/elections/:id/eligibility emitir credenciales demo, sin PII
POST   /api/elections/:id/vote        solo intermediación validada por SDK elegido
GET    /api/elections/:id/receipt/:id inclusión sin revelar opción
POST   /api/elections/:id/close       cerrar y disparar tally real
GET    /api/elections/:id/artifacts   descargar paquete para auditoría
POST   /api/audit/verify              verificar paquete independientemente
GET    /api/elections/:id/audit       ver informe firmado/checksum
```

**Advertencia:** Si el protocolo exige que el voto cifrado vaya directo a cadena o servidor específico, no reemplazarlo por una API casera. Adaptar endpoints a la semántica real y documentarla en ADR.

**Formato del paquete:** manifiesto de elección, URL/ID de registros de voto, ciphertexts o sus referencias públicas, pruebas tally, resultados cifrados/agregados, metadatos necesarios para verificar, versiones y checksums. Sin PII.

### Seguridad y privacidad por defecto
- TLS, CSP adecuada, validación con Zod, rate limiting básico y protecciones anti-CSRF donde correspondan.
- Nunca logs de voto en claro ni envíos de opciones a analytics o error tracking.
- Evitar relacionar tokens elegibles y votos a través de DB propia o identificadores reutilizados si el protocolo promete anonimato.
- Cifrado y pruebas únicamente con librerías reconocidas; pin de versiones y checksum de dependencias.
- Nunca poner datos secretos en `.env.example`; mantener claves fuera de git.
- El organizador no controla el código ni los datos de ejecución del verificador independiente.
- Versionar manifiesto; una modificación relevante exige nueva elección o invalidar el resultado anterior según el protocolo.

---

## 6. Harness Engineering / ECC: equipo de agentes

**Marco:** usar repositorio oficial **Everything Claude Code (ECC)** https://github.com/affaan-m/ECC y sus prácticas de planning, pruebas, review, security scanning, hooks y agentes. Verificar documentación de la versión instalada; las etiquetas exactas de comandos/agentes pueden cambiar. **Nuestros roles de Quórum son agentes personalizados del proyecto**, no afirmar que todos vienen preinstalados de ECC.

### Organización: 8 agentes + 1 integrador humano

| Rol del agente | Alias | Misión exclusiva | Entregable / señal Done |
|---|---|---|---|
| **Harness Lead / Orchestrator** | `quorum-orchestrator` | plan, tickets, coordinación, ADR, integración y gestión de riesgos | build verde y demo ensayada |
| **Protocol Researcher / Cryptography** | `quorum-crypto` | spike SDK MACI/Vocdoni/Helios, implementación verificable, supuestos, tally y pruebas | elección con artefactos verificables y ADR |
| **Backend & Data** | `quorum-backend` | esquema, API, validación, almacenamiento público, credenciales demo | endpoints y tests integrados |
| **Frontend Product** | `quorum-frontend` | landing, boleta, organizador, verificador web | funcionalidad mobile-first sin mocks engañosos |
| **UX/UI Designer** **(agente adicional)** | `quorum-uxui` | identidad visual, flujos, design system, accesibilidad, prototipos y revisión visual | UI consistente, contrastes y pruebas de uso |
| **Security / Privacy Red Team** | `quorum-security` | amenaza, abuso, privacidad de metadatos, integridad artefactos, pruebas adversariales | threat model + hallazgos solucionados |
| **QA / E2E Engineer** | `quorum-qa` | Playwright, unit tests, fixtures, reporte de pruebas, accesibilidad | flujos E2E reproducibles |
| **Demo / Storytelling & Impact** | `quorum-demo` | pitch neutro, métricas, captura evidencias, guion y simulación de ataque | demo 3 min + slide one-pager + cifras con fuentes |

**Human integrator:** responsable de elecciones de producto, verificación final de claims, merge y despliegue. Ningún agente altera contratos/protocolos sin review humano de supuestos.

### Equipos de trabajo y dependencia
1. `quorum-crypto` + `quorum-security`: primero motor/pruebas/amenazas (camino crítico).
2. `quorum-uxui` + `quorum-frontend`: en paralelo, contrato de interfaces y mock de datos claramente etiquetado; conectarlo a resultados reales al integrar.
3. `quorum-backend`: adaptar persistencia/API al motor real.
4. `quorum-qa`: desarrolla pruebas desde la primera hora con criterios de aceptación.
5. `quorum-demo`: ensaya mensaje/impacto y prepara fixtures una vez se conozcan garantías reales.
6. `quorum-orchestrator`: asegura decisiones, merge, gates y no desviación de scope.

### Reglas de orquestación ECC
- Mantener `CLAUDE.md`, `docs/PLAN.md`, `docs/STATE.md`, `docs/DECISIONS.md`, `docs/RISKS.md` y `docs/ACCEPTANCE.md` como memoria compartida. Actualizar al finalizar cada tarea.
- Usar worktrees aislados o ramas por propiedad de archivos, evitando múltiples agentes modificando el mismo archivo. Integrar cada PR sólo con tests.
- Priorizar **research-first → plan → tests → implementation → review → verify**.
- Limitar trabajo en progreso (máximo 3 PRs de código a la vez); otros agentes investigan o prueban.
- Identificar zonas de propiedad: `packages/protocol-adapter` solo crypto; `packages/ui` solo UX/UI y frontend coordinados; `apps/verifier` solo crypto/QA; `apps/web` frontend; `docs` demo/orchestrator.
- Prohibido pasar resultados sintéticos como evidencia de producción; ejemplos marcados `fixture` o `simulación`.
- En CI: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`; ejecutar dependencias necesarias y registrar resultado real.
- Ante un bug de seguridad de firma, escrutinio o privacidad: **bloquear release** o deshabilitar la capacidad/claim correspondiente.

### Agentes personalizados (crear `.claude/agents/<alias>.md`)

El orquestador debe generar archivos de agentes con frontmatter y descripciones válidas para la versión de Claude Code instalada. Cada agente recibe:

```yaml
---
name: quorum-uxui
description: Owns Quórum visual identity, responsive UX, accessibility, interaction states, design QA and handoff to frontend.
---
```

**Instrucción cuerpo UX/UI:**

> Diseña un producto de confianza centrado en ciudadanos de organizaciones pequeñas, no un exchange. Crea tokens y componentes compatibles con Next.js/shadcn. Audita el flujo del votante móvil y del auditor independiente. Las etiquetas de estado deben ser criptográficamente honestas; jamás diseñar una badge VERIFIED basada en un mock. Produce `docs/DESIGN_SYSTEM.md`, `docs/UX_FLOWS.md`, componentes y un inventario de screenshots a 360, 768 y 1440 px. Trabaja con frontend por PR e inspecciona navegación teclado, errores, consentimiento y loading states.

**Instrucción cuerpo protocolo:**

> No inventes cifrado ni ZK. Decide motor a partir de PoC y fuentes oficiales. Demuestra tally + evidencia + verificador independiente. Documenta privacidad, capacidad de coerción, coordinator assumptions y ataques que no mitiga. Aporta fixture legítimo y adulterado con resultados de prueba reales.

**Instrucción cuerpo seguridad:**

> Trata el producto como un experimento de alto riesgo social. Identifica y prueba side channels, correlación de identificadores, ataques sobre resultado, elegibilidad duplicada, frontends falsos y supuestos sobre claves. No certifiques anonimato sin pruebas y amenaza definida. Convierte hallazgos en tests antes de fusionar.

**Instrucción cuerpo demo:**

> Usa solo números citables y métricas observadas. No presentar la herramienta como alternativa a elecciones gubernamentales. Demuestra en vivo un resultado íntegro, uno manipulado y una verificación externa reproducible. Preparar guion y contingencia offline con outputs de una ejecución registrada, identificados como tales.

Los restantes agentes deben tener una misión equivalente a su tabla, alcance de archivos, definición Done y gate de test.

### Comando de arranque para el orquestador (copiar en Claude Code)

```text
Lee QUORUM_HACKATHON_TRUST_ECC_MASTER.md completo. Actúa como harness lead de Quórum usando los patrones ECC ya instalados. No inventes garantías de voto privado o ZK. Primero ejecuta el spike de motores MACI/Vocdoni/Helios y escribe docs/ADR-001-voting-engine.md, incluyendo un PoC verificable, riesgos y una decisión en 2 horas. Después crea el monorepo y los ocho agentes personalizados, incluido quorum-uxui como propietario del sistema visual. Produce docs/PLAN.md con issues críticos, ruta de 36 horas/tiempo restante, dependencias, ramas/worktrees, checks de seguridad y criterios de aceptación. Divide tareas paralelas; integra un flujo end-to-end con auditor independiente y prueba de manipulación. Prioriza un demo REAL y funcional antes de detalles decorativos. Si la verificación privada real falla, degrada el alcance y etiqueta el MVP con honestidad. No me pidas decisiones triviales; decide y documenta tradeoffs. Actualiza docs/STATE.md después de cada integración. Ejecuta pruebas y registra evidencia.
```

---

## 7. Backlog ejecutable por épica

| Prioridad | Ticket | Responsable | Aceptación |
|---|---|---|---|
| P0 | PROTO-01: comparar motores y PoC | crypto | SDK elegido verificó un escrutinio auténtico |
| P0 | PROTO-02: adaptador y evidencia | crypto | paquete público auditable y reproducible |
| P0 | AUD-01: verificador independiente | crypto + QA | acepta prueba genuina, rechaza adulteración |
| P0 | VOTE-01: elegibilidad demo | backend + security | no elegible rechazado; 1 uso según protocolo |
| P0 | VOTE-02: flujo elector | frontend | votación completa móvil sin revelar opción públicamente |
| P0 | RESULT-01: portal público | frontend + backend | no presenta VERIFIED sin prueba real |
| P0 | DEMO-01: ataque observable | QA + demo | falla inequívoca en segundos |
| P1 | ORG-01: wizard organizador | frontend + UX/UI | elección de demo creada sin comandos |
| P1 | UX-01: design tokens y WCAG | UX/UI | visual consistente, teclado y mobile |
| P1 | QA-01: test suite y fixtures | QA | PR gate reproducible |
| P1 | SEC-01: amenazas y auditoría PII | security | reportes y mitigaciones |
| P2 | EXPORT-01: auditoría descargable | backend | artefactos sin datos personales |
| P2 | IMPACT-01: 5 pruebas de usabilidad | demo + UX/UI | tiempos/comentarios, sin métricas inventadas |
| P3 | Identidad VC real, app nativa, offline, multisig | nadie | fuera del MVP |

---

## 8. Plan de ejecución por horas (ajustar al tiempo restante real)

**H+0–2: Go/No-Go del motor.** Crypto prueba opciones; orchestrator crea repo, CI, docs; UX/UI wireframes; QA fixtures. No iniciar features dependientes de protocolos hasta ADR.

**H+2–7: Verificación como vertical slice.** Votar con dos o tres cuentas demo y comprobar el tally por otro proceso independiente. Red team manipula copia de artefacto y exige rechazo. Si falta: pivot Plan B, no posponer indefinidamente.

**H+7–14: Producto usable.** API, boleta, elegibilidad demo, dashboard y portal de auditoría sobre datos reales. UX/UI construye componentes junto con frontend.

**H+14–22: Seguridad, pruebas y adversario.** Integrar expiración/cierre, rechazos, paquete de auditoría, prueba de inclusión y ataques compatibles con motor. Tests de privacidad estructural y errores.

**H+22–28: Pulido de alto impacto.** UX/UI mobile-first, accesibilidad, animación discreta, estados loading/empty/failure, onboarding, visual regression. Demo prepara grabación de respaldo.

**H+28–32: Congelar features.** CI completo, smoke en deploy, registrar errores conocidos; UX/UI deja de añadir componentes. Auditor corre en proceso aparte.

**H+32–36: Ensayos y contingencia.** Ejecutar demo 3–5 veces, revisar métricas, narrativa, tiempos y URL de respaldo. No realizar grandes refactors.

**Nota:** si quedan menos horas, comprimir P1/P2/P3, nunca los gates P0 de evidencia real y no engaño.

---

## 9. Pruebas obligatorias

**Unitarias:** manifiesto inmutable tras publicar; encoding/canonicalización; error de firma; fallos API; validación estados; autorización organizador.

**Integración:** registro de credencial demo; rechazo no elegible; intento duplicado; envío de voto y recibo de inclusión según protocolo; cierre; tally; paquete; verificación independiente.

**Adversariales:**
1. `tampered_total`: `valid=false`, motivo discrepancia.
2. `tampered_proof`: `valid=false`, prueba no verifica.
3. `removed_record`: rechazo **si el protocolo permite demostrar integridad/completitud**; de lo contrario marcar cobertura no demostrada.
4. `wrong_manifest`: rechazo.
5. `double_vote`: manejo según semántica real del motor (algunos permiten reemplazo de voto; no afirmar rechazo si no aplica).
6. `non_eligible`: no se contabiliza sin autorización.
7. `unavailable_coordinator`: resultado `no verificable`, nunca success.
8. `public_data_privacy`: sin opción individual ligada a identidad en campos públicos; advertir sobre metadatos.

**E2E Playwright:** organizar elección → votar desde 3 clientes → cerrar → auditar → cambiar paquete → falla de auditoría → acceder desde móvil 360px.

**Accesibilidad:** teclado, focus, live regions para estados, contrastes, error messages sin color exclusivo, `prefers-reduced-motion`.

**Evidencia de test:** almacenar en `docs/TEST_RESULTS.md` versiones, comandos ejecutados, timestamps, resultados y problemas conocidos. Nunca declarar tests pasados si no se ejecutaron.

---

## 10. Demo 3 minutos — guion preciso

**0:00–0:20 / Hook:** «¿Cómo verificas el resultado de una votación si quien organiza es también quien anuncia el total? Quórum separa votar de confiar en el escrutinio».

**0:20–0:50 / Elección neutral:** mostrar voto privado de una elección ficticia (por ejemplo, fecha de un evento académico). Enseñar qué se publica y qué queda oculto.

**0:50–1:20 / Escrutinio:** cerrar elección, generar resultado y paquete. Mostrar auditor en otro navegador/proceso; valida la evidencia y el resultado sin ver preferencias individuales.

**1:20–2:05 / Intento de fraude:** jurado elige tipo de alteración. Cambiar copia del paquete o total publicado. Ejecutar verificador externo; muestra `FALLO DETECTADO` con causa. Mantener resultado original intacto.

**2:05–2:35 / Público no técnico:** usar modo lector para enseñar qué evidencia se revisó y qué garantías no se evaluaron.

**2:35–3:00 / Impacto y cierre:** «La confianza no tiene que depender solo de quien cuenta. Queremos hacer verificabilidad comprensible y accesible para organizaciones pequeñas». Mencionar casos internos, límites de voto remoto y próximos pasos.

**Demo contingencia:** fixtures reales precomputadas de una ejecución previa, con hash y logs. Etiquetarlas claramente «reproducción offline». No fingir transacciones en directo.

---

## 11. Métricas de impacto y experimento con personas

**Hipótesis 1:** un observador no técnico puede distinguir un escrutinio válido de uno alterado con una explicación comprensible.
- Ejecutar 5 sesiones exploratorias si hay participantes disponibles; medir acierto y tiempo. Informar muestra pequeña, no generalizar.

**Hipótesis 2:** un usuario puede emitir su voto de prueba en móvil sin asistencia.
- Medir tiempo y abandonos, registrar accesibilidad.

**Hipótesis 3:** terceros pueden verificar los mismos artefactos sin consultar estado privilegiado del organizador.
- Verificar desde segunda máquina/proceso con paquete descargado; comparar hashes y resultados.

**Métrica de integridad:** número y tipos de manipulaciones probadas y correctamente detectadas, reportando también excepciones o condiciones.

**Impacto cualitativo:** transparencia para organizaciones con disputas de confianza, protección de preferencias privadas frente a listados nominales y reducción de la dependencia de una única autoridad informativa. No declarar que esto elimina coerción, suplantación, intimidación o todos los fraudes.

---

## 12. Política de claims y límites éticos

- Proyecto para **demostraciones y decisiones internas de bajo riesgo**; no recomendar despliegue real sin revisión externa de seguridad, usabilidad, operación y marco legal.
- Nunca afirmar legitimidad de un proceso público a partir de prueba criptográfica aislada: una elección depende de padrón, libertad de participación, disponibilidad, observación y reglas institucionales.
- Mantener neutralidad institucional y política. No usar campañas, partidos, candidatos ni sufragios reales en demo.
- Reconocer que participantes bajo vigilancia/coerción pueden enfrentar riesgos incluso si el voto está cifrado.
- Blockchain no implica privacidad. Algunos sistemas publican metadatos inmutables; documentar qué se publica realmente.
- Auditoría pública solo sirve si existe evidencia completa, íntegra y verificable, y el observador sabe qué se ha verificado.

---

## 13. README y handoff esperado

**Artefactos finales del repositorio:**

```text
README.md                    setup, screenshots, demo y límites
CLAUDE.md                    reglas del harness
QUORUM_HACKATHON_TRUST_ECC_MASTER.md
apps/web/                    producto
apps/verifier/               auditor independiente
packages/protocol-adapter/   SDK elegido
packages/ui/                 diseño
packages/demo-fixtures/      inputs reales de test
.github/workflows/ci.yml     quality gates
docs/ADR-001-voting-engine.md
docs/THREAT_MODEL.md
docs/DESIGN_SYSTEM.md
docs/UX_FLOWS.md
docs/TEST_RESULTS.md
docs/DEMO_SCRIPT.md
docs/IMPACT_EVIDENCE.md
docs/KNOWN_LIMITATIONS.md
```

**Criterio final:** si se desconecta el dashboard del organizador, el verificador todavía debe poder evaluar el paquete de evidencia publicado, dentro de los supuestos del protocolo escogido.

---

## 14. Primeros pasos para un humano + Claude Code

1. Crear repo privado de Quórum con Node LTS y `pnpm`.
2. Revisar el repositorio oficial ECC: https://github.com/affaan-m/ECC ; instalar solo mediante el mecanismo oficial/documentado y revisar permisos/hook profiles antes de ejecutarlo.
3. Copiar este documento en la raíz y enviarlo al orquestador mediante el prompt de la sección 6.
4. Asignar un humano a decisiones de protocolo, privacidad y publicación. No dejar que un agente declare seguridad sin evidencia.
5. Lanzar primero la investigación/PoC del protocolo y el diseño UX/UI en paralelo. No empezar por smart contracts hechos desde cero.
6. Abrir demo interna y mantener un registro real de las pruebas conforme vayan pasando.

---

## 15. Referencias canónicas

- ECC oficial: https://github.com/affaan-m/ECC
- MACI: https://maci.pse.dev/
- DAVINCI: https://davinci.vote/
- Helios: https://heliosvoting.org/
- ElectionGuard: https://www.electionguard.vote/
- Securing the Vote (NASEM): https://nap.nationalacademies.org/catalog/25120/securing-the-vote-protecting-american-democracy
- W3C Verifiable Credentials v2.0: https://www.w3.org/TR/vc-data-model-2.0/
- Carter Center: https://www.cartercenter.org/

**Nota de fuentes:** todos los enlaces son referencias para contraste. Antes de incluir una cifra o garantía en la presentación, consultar texto primario exacto y registrar la cita/fecha en `docs/IMPACT_EVIDENCE.md`. No se incluyen estadísticas sin sustento sobre fraude electoral o impacto atribuido al producto.

---

**Fin del master spec.**
