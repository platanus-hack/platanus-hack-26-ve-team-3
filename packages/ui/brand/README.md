# Marca de Quórum

Fuente: canvas «Logo Quórum» (concepto A recomendado). Tokens de color en `../tokens.css`; reglas de UI en `docs/DESIGN_SYSTEM.md`.

## Logo: «Q verificada»

Un anillo (el quórum) cuya cola es un check: la votación se cierra cuando el resultado se verifica.

| Archivo | Uso |
|---|---|
| `logo-mark.svg` | Símbolo sobre fondo claro |
| `logo-mark-dark.svg` | Símbolo sobre fondo oscuro |
| `logo-horizontal.svg` | Símbolo + «Quórum» sobre fondo claro (header, documentos) |
| `logo-horizontal-dark.svg` | Símbolo + «Quórum» sobre fondo oscuro |
| `app-icon.svg` | Ícono de app y favicon grande (fondo Corbeau, radio 18/80) |
| `favicon-16.svg` | Favicon a 16 px: trazos más gruesos para que se lea |
| `concepts/` | Conceptos A (elegido), B «Quórum alcanzado» y C «Bloque de prueba», solo como referencia |

En la app: `LogoMark` y `Logo` en `apps/web/src/components/ui/logo.tsx` (usan `currentColor` y `--color-accent`, así cambian solos con el tema).

### Construcción (viewBox `1 -3.5 64 64`)

- Anillo: círculo `cx 28 · cy 28 · r 19`, trazo 9, color tinta.
- Check: trazo `M28 39 L37 48 L57 25`, 9 de ancho, puntas y uniones redondeadas, color acento.
- Corte: el mismo trazo debajo, 17 de ancho, del color del fondo. Separa el check del anillo; usa siempre el color real del fondo.
- A 16 px: anillo y check a 10, corte a 19.

### Tamaños

| Uso | Tamaño |
|---|---|
| Ícono de app | 180 · 96 · 48 px |
| Header | símbolo 30–32 px + palabra 22 px |
| Favicon | 16 px (`favicon-16.svg`) |
| Mínimo del símbolo | 16 px |

Espacio libre alrededor: al menos el grosor del anillo (9/64 del lado).

### No hacer

- No cambiar el color del corte por otro que no sea el fondo.
- No rotar, estirar ni separar el check del anillo.
- No poner el símbolo sobre fotos o degradados sin una placa de color sólido.

## Color

| Nombre | Hex | Rol |
|---|---|---|
| Corbeau | `#111122` | Tinta, texto, fondo oscuro, ícono de app |
| Often Orange | `#FF714E` | Acento: check del logo, botón principal (texto Corbeau, 6.85:1), barras, foco |
| Perfect White | `#F0EEEE` | Fondo claro, corte del logo sobre claro |
| Lush Aqua | `#004466` | Texto de acento y links (9.0:1 sobre Perfect White) |
| Blue Graphite | `#3A383F` | Superficies oscuras secundarias, serie de gráficos |
| Dark Ages | `#9698A3` | Segunda barra, texto sutil en oscuro (no como texto sobre claro: 2.48:1) |

Acentos alternativos probados en el canvas: Lush Aqua `#004466` y azul `#1F6BF5`. El oficial es Often Orange.

## Tipografía

- Palabra «Quórum» y cifras: **Space Grotesk** 600, interletrado −0.035em.
- Interfaz y texto: **Inter** 400/500/600.
- Hashes y códigos: monoespaciada del sistema.

Los SVG con palabra usan `<text>` con Space Grotesk; donde no esté cargada, convertir a contornos antes de imprimir.
