# PLATANUS HACKATHON — AI ENGINEERING HARNESS

**Stack:** Claude Code + Everything Claude Code (ECC) + GitHub Spec Kit + Playwright + Git Worktrees + CI

**Objetivo:** Preparar un entorno de ingeniería asistida por agentes para desarrollar, integrar, probar y presentar un MVP funcional en 36 horas.

## 1. Filosofía del sistema

No queremos utilizar Claude Code solamente para generar código. Queremos construir un sistema de agentes que siga este ciclo:

```text
IDEA / PROBLEMA
       ↓
SPEC KIT — Requisitos + criterios de aceptación
       ↓
PLANNER + ARCHITECT — Arquitectura + contratos + tareas
       ↓
IMPLEMENTACIÓN EN PARALELO — Frontend / Backend / IA
       ↓
TDD + E2E + SECURITY REVIEW
       ↓
BUILD + TYPECHECK + CI
       ↓
REVISIÓN HUMANA
       ↓
DEMO FUNCIONAL
```

**Regla principal:** Ningún agente marca una tarea como terminada simplemente porque escribió código. Debe demostrar que funciona.

## 2. Instalar Everything Claude Code (ECC)

Repositorio oficial: https://github.com/affaan-m/ECC

Dentro de Claude Code:

```text
/plugin marketplace add https://github.com/affaan-m/ECC
/plugin install ecc@ecc
```

Reiniciar Claude Code si es necesario y comprobar que los agentes están disponibles.

**Importante:** No instalar ECC simultáneamente como plugin y mediante instalación manual completa; no duplicar hooks en `settings.json`. Conservar aprobación humana para operaciones destructivas, secretos y despliegues.

## 3. Agentes ECC prioritarios

| Agente | Función | Prioridad |
|---|---|---|
| `planner` | Planificación y dependencias | Obligatorio |
| `architect` | Arquitectura y contratos | Obligatorio |
| `tdd-guide` | Desarrollo guiado por pruebas | Obligatorio |
| `code-reviewer` | Revisión de calidad | Obligatorio |
| `security-reviewer` | Riesgos de seguridad y autorización | Obligatorio |
| `e2e-runner` | Flujos reales con Playwright | Obligatorio |
| `build-error-resolver` | Errores de tipos y compilación | Obligatorio |
| `doc-updater` | Documentación | Recomendado |
| `react-reviewer` | Revisión React, si existe en versión instalada | Opcional |
| `database-reviewer` | Esquemas y consultas, si aplica | Opcional |
| `refactor-cleaner` | Limpieza de código | Opcional |

Verificar disponibilidad y nombres en la versión instalada: https://github.com/affaan-m/ECC/tree/main/agents

### Agentes personalizados

Crear en `.claude/agents/` (según el formato compatible con la versión actual de Claude Code):

**`frontend-builder`**: Next.js/React, diseño responsivo, contratos API aprobados, estados de error/carga/vacío. No inventa endpoints.

**`ai-engineer`**: integración LLM, respuestas estructuradas, tools, validación de esquemas, evaluación de respuestas y protección de datos. No ejecuta JavaScript arbitrario generado por el modelo.

**`integration-owner`**: contratos compartidos, merges, builds, CI y despliegue siempre demostrable. Es un rol bajo supervisión humana.

## 4. Instalar GitHub Spec Kit

Repositorio oficial: https://github.com/github/spec-kit

Requisitos: Git, Python 3.11+, `uv` y Claude Code autenticado.

```bash
uv tool install specify-cli
specify init . --integration claude
specify check
```

Si algún argumento cambia en la versión instalada, consultar `specify init --help` y la documentación oficial.

### Flujo de especificación

Verificar los comandos disponibles tras inicializar y ejecutar, cuando correspondan:

```text
/speckit-constitution
/speckit-specify
/speckit-clarify
/speckit-plan
/speckit-tasks
/speckit-analyze
/speckit-implement
```

El objetivo es completar especificación, arquitectura y tareas iniciales en **60–90 minutos**, no documentar durante medio hackathon.

### Constitución sugerida

```text
PROJECT CONSTITUTION — HACKATHON MODE
1. Deliver working software, not mock-only functionality.
2. Prioritize one critical user journey.
3. Maintain server-side security boundaries.
4. Validate external inputs using schemas.
5. Never invent API responses, test results or integrations.
6. Give every feature measurable acceptance criteria.
7. Prefer understandable architecture.
8. Automate tests for critical behavior.
9. Keep main deployable.
10. Keep changes small and independently reviewable.
11. Parallelize only independent tasks.
12. Reserve time for integration and presentation.
13. Never commit secrets.
14. Require human approval for destructive actions.
15. Demonstrate real user value within three minutes.
```

## 5. Instalar Playwright E2E

Una vez inicializado el proyecto Node.js:

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Organización propuesta:

```text
tests/
├── e2e/
│   ├── happy-path.spec.ts
│   ├── authorization.spec.ts
│   ├── error-handling.spec.ts
│   └── generative-ui.spec.ts
└── unit/
```

Scripts para un proyecto **Next.js + TypeScript + ESLint + Vitest previamente configurado**:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:e2e": "playwright test",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "build": "next build",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build && npm run test:e2e"
  }
}
```

Adaptar estos scripts al framework y gestor de paquetes elegido. Configurar el servidor de prueba para Playwright antes de ejecutar E2E.

El agente E2E debe comprobar el flujo principal, respuestas reales del backend, autorización, renderizado de UI generativa y manejo de errores.

## 6. Estructura de repositorio

```text
hackathon/
├── CLAUDE.md
├── .claude/
│   ├── agents/
│   │   ├── frontend-builder.md
│   │   ├── ai-engineer.md
│   │   └── integration-owner.md
│   └── rules/
├── .specify/
├── specs/
├── docs/
│   ├── architecture.md
│   ├── api-contracts.md
│   ├── decisions.md
│   ├── demo-script.md
│   └── progress.md
├── apps/web/
├── packages/
│   ├── shared/
│   └── ai/
├── tests/{unit,e2e}/
└── .github/workflows/ci.yml
```

## 7. Contenido recomendado de CLAUDE.md

```markdown
# Hackathon Engineering Harness

You are working in a 36-hour international hackathon.

## Mission
Ship a real, original, testable MVP that solves one clearly defined problem.

## Source of truth
1. Project constitution
2. Current feature specification
3. Architecture and API contracts
4. Task plan
5. Existing verified implementation

Never silently override the project specification.

## Before coding
- Understand the task and acceptance criteria.
- Inspect existing code and contracts.
- Identify dependencies and file ownership.
- Create or update relevant tests.
- Obtain approval before changing shared contracts.

## During coding
- Implement one logical task at a time.
- Prefer existing packages and patterns.
- Use strict TypeScript types.
- Validate external inputs.
- Handle loading, empty and error states.
- Never create fake production integrations or expose credentials.

## Parallel execution
- Delegate independent tasks.
- Assign explicit file ownership.
- Use separate Git worktrees where practical.
- Do not modify another agent's owned files.
- Do not merge failing changes.

## Definition of Done
- Acceptance criteria are met.
- Required tests pass.
- Typecheck, lint and build pass.
- Relevant E2E tests pass.
- No unresolved critical security findings.
- Documentation is updated.
- Changes are integrated and evidence recorded.

Report failures truthfully. Never claim tests passed if not executed.

## Priorities
P0: Critical demo flow.
P1: Functional completeness.
P2: UX polish.
P3: Optional features.

Stop optional development when the demo freeze begins.
```

## 8. Orquestación y paralelismo

```text
SPEC KIT
  ↓
PLANNER + ARCHITECT
  ↓
CONTRACTS APPROVED
  ├── FRONTEND
  ├── BACKEND
  └── AI ENGINEER
  ↓
INTEGRATION OWNER
  ├── TDD
  ├── E2E
  └── SECURITY
  ↓
CODE REVIEWER
  ↓
BUILD + CI
  ↓
WORKING DEMO
```

Asignar tareas independientes con archivos propios y contratos claros. No mandar varios agentes a editar simultáneamente los mismos archivos.

### Git Worktrees

```bash
git worktree add ../hack-frontend -b feature/frontend
git worktree add ../hack-backend -b feature/backend
git worktree add ../hack-ai -b feature/ai
```

Abrir una sesión de Claude Code por worktree cuando se necesite implementación paralela real. Los subagentes que solo revisan pueden trabajar sin worktree propio. Una persona es responsable de integrar.

## 9. Quality Gates

### Gate 1 — Specification
- [ ] Problema definido.
- [ ] Usuario y propuesta de valor claros.
- [ ] Flujo principal.
- [ ] Criterios de aceptación medibles.

### Gate 2 — Architecture
- [ ] Componentes y contratos definidos.
- [ ] Esquemas de datos.
- [ ] Límites de confianza y permisos.
- [ ] Responsables de módulos.

### Gate 3 — Implementation
- [ ] Código funcional.
- [ ] Pruebas unitarias relevantes.
- [ ] Typecheck correcto.
- [ ] Sin secretos en el repositorio.

### Gate 4 — Integration
- [ ] Frontend y backend conectados.
- [ ] Respuestas reales verificadas.
- [ ] E2E ejecutado.
- [ ] Manejo de errores.
- [ ] Revisión de seguridad.

### Gate 5 — Demo Ready
- [ ] Despliegue funcional.
- [ ] Flujo principal probado.
- [ ] Datos de demostración.
- [ ] Ensayo del pitch.
- [ ] Video de respaldo.
- [ ] README y arquitectura actualizados.

## 10. CI mínimo

Configurar GitHub Actions para ejecutar:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
```

Agregar E2E al CI cuando esté configurado el entorno de prueba. Enfocar las pruebas en autorización, operaciones críticas y demo.

## 11. Reparto de trabajo para GhostShield

| Responsable | Entregables |
|---|---|
| Backend | Middleware de autorización, políticas, límites, auditoría |
| Frontend | Dashboard, eventos, renderer generativo y componentes seguros |
| AI Engineer | Interpretación, JSON estructurado, selección de componentes, evaluación |
| Security Reviewer | Pruebas de acceso y exposición, secretos y abuso en entorno controlado |
| E2E Runner | App vulnerable de prueba, corrección activada, bloqueo y UI verificadas |

**Seguridad:** La UI generativa nunca otorga permisos. Todas las operaciones se autorizan en servidor; el LLM solo propone vistas o acciones que después son validadas.

## 12. Cronograma de 36 horas

| Tiempo | Objetivo |
|---|---|
| 0–2 h | Problema, especificación y arquitectura |
| 2–5 h | Contratos, setup y primer vertical slice |
| 5–20 h | Implementación paralela |
| 20–26 h | Integración funcional |
| 26–30 h | E2E, seguridad y correcciones |
| 30–33 h | UX y estabilización |
| 33–36 h | Congelar funciones y preparar presentación |

Lograr el primer flujo end-to-end antes de la mitad de la competencia.

## 13. Prompt maestro para arrancar Claude Code

```text
You are the Lead Engineering Orchestrator for our international hackathon team.

Use GitHub Spec Kit for specification-driven development and Everything Claude Code for specialized engineering delegation.

Mission: coordinate a production-minded, security-first workflow optimized for a 36-hour hackathon.

First:
1. Inspect the repository.
2. Discover available ECC agents, commands and skills.
3. Verify Spec Kit integration and the project constitution.
4. Identify missing tooling and report it.
5. Never assume an unavailable tool is installed.

Then:
1. Produce a concise implementation plan.
2. Define the first functional vertical slice.
3. Define API contracts and acceptance criteria.
4. Break work into independent tasks.
5. Assign tasks to available agents.
6. Parallelize only tasks with clear ownership.
7. Require tests and execution evidence.
8. Run build, typecheck, lint and relevant tests.
9. Request security and code reviews.
10. Keep the demo working throughout development.

Never invent test results.
Never skip authorization checks.
Never allow an LLM to grant its own permissions.
Never merge broken code into main.

Optimize for originality, technical quality, social impact, reliable execution and a three-minute demo.

Start by auditing the development environment. Do not implement product features until a minimum specification and architecture exist.
```

## 14. Reglas operativas

- El líder humano toma decisiones arquitectónicas finales.
- Cada tarea tiene responsable, dependencias y criterios de aceptación.
- Cada agente recibe el mínimo contexto necesario.
- El código debe ser verificable y reproducible.
- Las pruebas automáticas no sustituyen la revisión humana.
- Evitar herramientas nuevas en las últimas horas salvo necesidad crítica.
- No ejecutar acciones destructivas sin aprobación.
- Mantener un despliegue funcional.
- Reservar tiempo para presentación.

## 15. Checklist antes de iniciar

- [ ] Claude Code funcionando.
- [ ] ECC instalado una sola vez.
- [ ] Agentes ECC visibles.
- [ ] Spec Kit funcionando.
- [ ] Node.js y gestor de paquetes.
- [ ] Playwright instalado.
- [ ] Repositorio Git preparado.
- [ ] CI mínimo.
- [ ] Variables de prueba.
- [ ] Worktrees o ramas distribuidos.
- [ ] Responsable de integración.
- [ ] Modelo y presupuesto de IA definidos.
- [ ] Primer despliegue.

---

**Principio final:** *Agents write code. Tests establish evidence. Engineers own the decisions.*

**Referencias:**
- [Everything Claude Code](https://github.com/affaan-m/ECC)
- [Agentes ECC](https://github.com/affaan-m/ECC/tree/main/agents)
- [GitHub Spec Kit](https://github.com/github/spec-kit)
- [Playwright](https://playwright.dev/)
