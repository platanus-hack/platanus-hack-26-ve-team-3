# Sistema de diseño de Quórum

Producto confiable para organizaciones pequeñas, con estética de "UI kit azul": fondo niebla, tarjetas blancas con sombra azulada difusa, primario azul, botones píldora y cifras grandes. Oscuro: grafito con acentos azul/verde/rojo. No es un exchange ni un cripto-casino: sin neón, sin caras, estados honestos. Fuente de verdad de los tokens: `packages/ui/tokens.css` (paquete `@quorum/ui`), consumidos desde `apps/web/src/app/globals.css` vía `@theme inline` de Tailwind 4.

## 1. Tokens

### Color (primitivos)
| Token | Valor | Uso |
|---|---|---|
| `--q-mist` | `#F3F6FB` | Fondo base (tema claro) |
| `--q-blue` | `#1F6BF5` | Primario: botones, selección, fase actual, serie 1 |
| `--q-blue-ink` | `#1A5FE0` | Texto/links azules (`text-primary-ink`) |
| `--q-blue-soft` / `-muted` | `#E8F0FE` / `#C4D7FC` | Fondos suaves, badge `primary`, segunda barra de un split |
| `--q-navy` | `#1B3A6B` | Avisos oscuros |
| `--q-green` | `#0E7C5A` | Verificación: `incluido`, `verificado`, éxito |
| `--q-amber` | `#9A6410` | Advertencia: `no verificable`, limitaciones, fixtures |
| `--q-red` | `#C73A4C` | Fallo: `fallo detectado`, errores |
| `--q-ink` / `-2` / `-3` | `#0F1729` / `#5A6577` / `#626C7E` | Texto, texto secundario, texto sutil |

En oscuro un mismo azul no pasa AA como fondo con texto blanco y como texto sobre tarjeta, por eso existen `primary` (fondo, `#2A62F0`) y `primary-ink` (texto, `#6EA0FF`). Usa `text-primary-ink` para links y texto azul, nunca `text-primary`.

Variantes `-strong` para texto sobre fondos `-soft`, garantizando AA (≥4.5:1, medido par por par). Fondos `-soft` sólo acompañan a un icono y un texto: **el color nunca es el único portador de significado**.

Gráficos: `--color-chart-1..10` (orden fijo, la 1 es la marca) y `--color-grid`. Los componentes los leen como `var(--color-chart-N)`; nunca hex en el componente.

### Semánticos (claro → oscuro)
`background`, `foreground`, `muted`, `muted-foreground`, `subtle`, `card`, `border`, `input`, `ring`, `primary`, `primary-foreground`, `primary-ink`, `primary-soft`, `primary-soft-foreground`, `primary-muted`, `navy`, `success`, `warning`, `danger` (+ `-strong`, `-soft`), `neutral-soft`.

Tema oscuro: se activa por `prefers-color-scheme: dark` (si no se forzó claro) o por `:root[data-theme="dark"]`. El `ThemeToggle` del header guarda la preferencia en `localStorage` (`quorum.theme`) y usa `useSyncExternalStore` para no provocar renders en cascada.

### Tipografía
Inter (`--font-inter`) para UI y texto; Space Grotesk (`--font-space-grotesk`, clase `font-display`) para H1 de landing y cifras grandes. Ambas vía next/font/google, fallback `system-ui`. Escala:
| Clase | Tamaño | Uso |
|---|---|---|
| `text-display` | 32px / 1.15 | H1 de pantalla grande |
| `text-title` | 24px / 1.15 | H1 de pantalla |
| `text-heading` | 18px / 1.3 | Títulos de tarjeta, opción confirmada |
| `text-body` | 15px / 1.55 | Cuerpo |
| `text-small` | 13px / 1.45 | Metadatos, hints, pills |

Cifras grandes (porcentajes, conteos, cuenta regresiva): `.q-num` (Space Grotesk, `tabular-nums`). Etiqueta sobre cifra o tarjeta: `.q-eyebrow` (13px, mayúsculas, muted). Números y hashes: `.q-mono` (monoespaciada, `tabular-nums`, `overflow-wrap: anywhere`).

### Espaciado, radios, sombras
Escala 8pt (`--space-1` 4px … `--space-16` 64px). Radios `sm` 8px, `md` 12px (inputs, opciones), `lg` 20px (tarjetas), `xl` 28px (tarjeta destacada), `full` para botones y pills. Sombras: `shadow-card` (difusa, teñida de azul), `shadow-elevated` (tarjeta destacada), `shadow-primary` (botón primario y selección). Objetivo táctil `--tap` = 44px (`min-h-tap`, `size-tap`).

## 2. Componentes

Primitivos en `apps/web/src/components/ui/` (estilo shadcn, escritos a mano sobre `cva` + `tailwind-merge`): `Button` (píldora; variantes `primary | soft | secondary | ghost | success | danger | link`; `loading` pone `aria-busy` y spinner), `Card*`, `Input`, `Textarea`, `Select`, `Label`, `Field` (label + hint + error con `role="alert"`), `Checkbox`, `Alert` (`info | success | warning | danger`, con icono y prefijo textual), `Badge` (`neutral | primary | success | warning | danger`), `FixtureTag`.

Componentes de producto en `apps/web/src/components/`:

| Componente | Responsabilidad | Reglas |
|---|---|---|
| `StatusPill` | Los seis estados honestos | `verificado` sólo lo pinta `AuditChecklist` cuando `AuditResult.valid === true`. Icono + texto siempre. |
| `Stepper` | Progreso del votante y del wizard | `aria-current="step"`, texto "Paso X de N" visible en móvil. |
| `Ballot` | 2–10 opciones como radio group | Labels reales, ≥56px por opción, estado seleccionado con borde + anillo. |
| `ReceiptCard` | Comprobante de inclusión | Muestra `inclusionId`, estado, fechas. **Nunca la opción**. Botón copiar con live region. |
| `AuditChecklist` | Resultado del verificador | Veredicto global: `valid` → verificado; algún `passed:false` → fallo detectado; si no → no verificable. Lista cada check con su pill, razones, propiedades no evaluadas, método/versión/hash de entrada, descarga JSON. |
| `LiveResultTile` | `StatTile`, `BarTile`, `DonutTile`, `CountdownTile`, `TextTile` | `BarTile` horizontal = lista de barras de progreso en HTML (etiqueta, conteo, % del total); vertical y donut con Recharts y `accessibilityLayer`, tabla `sr-only`, `isAnimationActive={false}`. Si algún `count === null` → "Desglose oculto hasta 5 votos". Textos fijos: el LLM nunca escribe texto libre. |
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

## 5. Tono y datos de ejemplo
Producto MVP mobile-first, no demo: textos cortos, sin "demo", "fixture" ni "ficticio" en pantalla. Los límites reales (el servidor ve la boleta, la cámara no verifica identidad civil) se dicen, en una línea. Paquetes de ejemplo llevan `FixtureTag` ("ejemplo", tono neutral). Nunca caras, nombres reales ni procesos políticos.

## 6. Captura facial
Estilo Face ID: rostro en círculo, anillo de 72 marcas que avanza con el progreso real (capturas de frente → giro → regreso → comprobación, verde al terminar), flechas animadas hacia la izquierda en el giro (el tracker acepta ambos lados). Solo UI: umbrales y `LivenessTracker` sin cambios.
