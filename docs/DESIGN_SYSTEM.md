# Sistema de diseño de Quórum

Producto editorial y confiable para organizaciones pequeñas. No es un exchange ni un cripto-casino: sobrio, legible, honesto. Fuente de verdad de los tokens: `packages/ui/tokens.css` (paquete `@quorum/ui`), consumidos desde `apps/web/src/app/globals.css` vía `@theme inline` de Tailwind 4.

## 1. Tokens

### Color (primitivos)
| Token | Valor | Uso |
|---|---|---|
| `--q-bone` | `#F8F7F3` | Fondo base (tema claro) |
| `--q-night` | `#182B45` | Primario: botones, títulos destacados |
| `--q-green` | `#147D68` | Verificación: `incluido`, `verificado`, éxito |
| `--q-amber` | `#B7791F` | Advertencia: `no verificable`, limitaciones, fixtures |
| `--q-red` | `#C44242` | Fallo: `fallo detectado`, errores |
| `--q-ink` / `-2` / `-3` | `#1B1F26` / `#4A5160` / `#6B7280` | Texto, texto secundario, texto sutil |

Variantes `-strong` (más oscuras) para texto sobre fondos `-soft`, garantizando AA (≥4.5:1). Fondos `-soft` (`#E3F1EC`, `#F7EDD8`, `#F8E4E4`) sólo acompañan a un icono y un texto: **el color nunca es el único portador de significado**.

### Semánticos (claro → oscuro)
`background`, `foreground`, `muted`, `muted-foreground`, `subtle`, `card`, `border`, `input`, `ring`, `primary`, `primary-foreground`, `success`, `warning`, `danger` (+ `-strong`, `-soft`), `neutral-soft`.

Tema oscuro: se activa por `prefers-color-scheme: dark` (si no se forzó claro) o por `:root[data-theme="dark"]`. El `ThemeToggle` del header guarda la preferencia en `localStorage` (`quorum.theme`) y usa `useSyncExternalStore` para no provocar renders en cascada.

### Tipografía
Manrope (next/font/google, `--font-manrope`), fallback `system-ui`. Escala:
| Clase | Tamaño | Uso |
|---|---|---|
| `text-display` | 32px / 1.2 | H1 de landing y cifras grandes |
| `text-title` | 24px / 1.2 | H1 de pantalla |
| `text-heading` | 18px / 1.3 | Títulos de tarjeta, opción confirmada |
| `text-body` | 15px / 1.55 | Cuerpo |
| `text-small` | 13px / 1.45 | Metadatos, hints, pills |

Números y hashes: `.q-mono` (monoespaciada, `tabular-nums`, `overflow-wrap: anywhere`).

### Espaciado, radios, sombras
Escala 8pt (`--space-1` 4px … `--space-16` 64px). Radios `sm` 6px, `md` 10px, `lg` 16px. Sombra única `--shadow-card`, muy suave. Objetivo táctil `--tap` = 44px (`min-h-tap`, `size-tap`).

## 2. Componentes

Primitivos en `apps/web/src/components/ui/` (estilo shadcn, escritos a mano sobre `cva` + `tailwind-merge`): `Button` (variantes `primary | secondary | ghost | success | danger | link`; `loading` pone `aria-busy` y spinner), `Card*`, `Input`, `Textarea`, `Select`, `Label`, `Field` (label + hint + error con `role="alert"`), `Checkbox`, `Alert` (`info | success | warning | danger`, con icono y prefijo textual), `Badge`, `FixtureTag`.

Componentes de producto en `apps/web/src/components/`:

| Componente | Responsabilidad | Reglas |
|---|---|---|
| `StatusPill` | Los seis estados honestos | `verificado` sólo lo pinta `AuditChecklist` cuando `AuditResult.valid === true`. Icono + texto siempre. |
| `Stepper` | Progreso del votante y del wizard | `aria-current="step"`, texto "Paso X de N" visible en móvil. |
| `Ballot` | 2–10 opciones como radio group | Labels reales, ≥56px por opción, estado seleccionado con borde + anillo. |
| `ReceiptCard` | Comprobante de inclusión | Muestra `inclusionId`, estado, fechas. **Nunca la opción**. Botón copiar con live region. |
| `AuditChecklist` | Resultado del verificador | Veredicto global: `valid` → verificado; algún `passed:false` → fallo detectado; si no → no verificable. Lista cada check con su pill, razones, propiedades no evaluadas, método/versión/hash de entrada, descarga JSON. |
| `LiveResultTile` | `StatTile`, `BarTile`, `DonutTile`, `CountdownTile`, `TextTile` | Recharts con `accessibilityLayer`, tabla `sr-only`, `isAnimationActive={false}`. Si algún `count === null` → "Desglose oculto hasta 5 votos". Textos fijos: el LLM nunca escribe texto libre. |
| `states` | `LoadingState`, `EmptyState`, `ErrorState` | Toda pantalla tiene los tres. `LoadingState` tiene `role="status"`. |

## 3. Estados honestos

| Estado | Cuándo | Tono |
|---|---|---|
| `pendiente` | Boleta preparándose/enviándose | neutral |
| `recibido` | El servidor devolvió `Receipt` sin `includedAt` | neutral |
| `incluido` | `Receipt.includedAt` presente o `state: "incluido"` | verde |
| `verificado` | `AuditResult.valid === true` (sólo auditor) | verde fuerte |
| `no verificable` | Verificador sin checks evaluados / `unsupportedGuarantees` | ámbar |
| `fallo detectado` | Algún check `passed: false` | rojo |

Prohibido: badges "VERIFICADO" derivadas de la base de datos, sellos institucionales, "100% seguro", porcentajes de "seguridad".

## 4. Accesibilidad (WCAG AA)
- Teclado completo: todo control es `button`, `a`, `input` o `label` nativo; focus visible global (`:focus-visible` con anillo `--color-ring`).
- Live regions: estados de envío (`role="status" aria-live="polite"`), copiar al portapapeles, prueba de vida.
- Errores con prefijo "Error:" y `role="alert"`; nunca sólo color.
- `prefers-reduced-motion`: animaciones y transiciones anuladas globalmente; gráficos sin animación.
- Mobile-first desde 360px; `q-container` con gutter 16px; sin scroll horizontal.
- Idioma `lang="es-VE"`; fechas en `America/Caracas`.

## 5. Datos de ejemplo
Todo dato de ejemplo lleva `FixtureTag` (`fixture`) o texto "simulación". La elección demo es ficticia: "Fecha de la asamblea anual — Condominio Los Samanes". Nunca caras, nombres reales ni procesos políticos.
