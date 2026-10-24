# MOTION.md: cómo se mueve Quórum

> Notas de movimiento para la skill `rossark-motion` (`.claude/skills/rossark-motion/`, MIT). La skill lee este archivo primero. **La parte 2 manda sobre la skill.** Mantenla al día después de cada ronda.
> Quórum no tiene mascota: lo que se anima es el logo «Q verificada», los íconos (lucide-react, los mismos de la app) y los objetos del sistema (QR, rostro, prueba, bloque, sello).

---

## Parte 1. El método (resumen de la skill)

**Meta:** Quórum se siente sobrio y preciso. Nada se teletransporta, nada se queda congelado, nada grita.

### Principios
1. **Nunca teletransportar:** todo se interpola.
2. **Calma por defecto:** curvas fuertes, sin rebote en reposo.
3. **Amplitudes pequeñas:** si dudas, la mitad.
4. **Arcos y pivotes:** cada parte gira alrededor de su eje (el centro del anillo, la base del check).
5. **Overlap y follow-through:** las partes no llegan juntas; lo que va detrás llega 60–150 ms después.
6. **Variedad sin caos:** `seeded(i)` por elemento repetido; nunca un valor al azar por cuadro ni todo sincronizado.
7. **Una acción principal por beat** y como mucho 2 loops de reposo.
8. **Opacidad solo para aparecer o desaparecer.**
9. **El layout no se mueve:** solo `transform` y `opacity`.
10. **Movimiento reducido = quieto:** un cuadro publicable; los gestos muestran su cuadro final.
11. **Nada corre sin verse:** relojes en pausa fuera de pantalla o con la pestaña oculta.
12. **Suficientes cuadros:** nada dura menos de ~100 ms.

### Motor
- **Estado = f(p)** para lo atado al scroll; **f(t)** para un loop de reposo.
- **`track(t, keys)`** se detiene en cada clave (un movimiento suelto); **`flow(t, keys)`** pasa por las claves sin detenerse (una cadena).
- **Ayudas:** `wave` (−1 a 1), `loop` (0 a 1), `bell` (aparece y se va), `seg` (un beat), `seeded`.
- **Curvas:** recorrido `(0.77, 0, 0.175, 1)`; llegada `(0.23, 1, 0.32, 1)`; ease-in solo para lo que se va; loops lineales.

### Con un video de referencia
`ffprobe` → hojas de contacto a la tasa completa (`tools/sheet.sh`) → medir con `tools/track_edges.py` → colores con `tools/sample_colors.py` → comparar con tu render en los mismos instantes. Nunca se publica una copia del arte de otro.

---

## Parte 2. Quórum

### Dónde está lo que se anima
- **Logo:** `packages/ui/brand/` (SVG y README con la construcción) y `LogoMark`/`Logo` en `apps/web/src/components/ui/logo.tsx`. Anillo `cx 28 cy 28 r 19`, trazo 9, color tinta; check `M28 39 L37 48 L57 25`, trazo 9, acento; corte 17 del color del fondo.
- **Tokens:** `packages/ui/tokens.css` (Corbeau `#111122`, Often Orange `#FF714E`, Perfect White `#F0EEEE`, Lush Aqua `#004466`, Blue Graphite `#3A383F`, Dark Ages `#9698A3`; semánticos `--color-*`) y `apps/web/src/app/globals.css` (Tailwind v4 `@theme`, utilidades `q-*`).
- **Componentes:** `apps/web/src/components/ui/` (`Button`, `Badge`, `Glass`, `LogoMark`), `StatusPill.tsx` (estados honestos), íconos de `lucide-react`.
- **Landing:** `apps/web/src/components/landing/`. La sección de motion vive en `HowItWorksMotion.tsx`.

### Reglas del dueño (mandan sobre la parte 1)
- **Nunca se redibuja ni se genera con IA.** El logo sale de `LogoMark`; los íconos, de `lucide-react`.
- **El logo no se deforma:** no rotar el símbolo entero fuera de su eje, no estirar, no separar el check del anillo en reposo (README de marca). Animarlo = **dibujarlo**: el anillo se traza (`stroke-dashoffset` solo dentro del SVG o `scale` desde 0,9), luego el check llega con ease-out. El corte usa siempre el color real del fondo.
- **Colores con significado:** naranja = acción/hilo; verde = incluido/verificado; rojo = fallo detectado. Nada de colores fuera de los tokens.
- **Sin rebote** salvo el golpe único de «Fallo detectado» (un temblor de ±4 px, 2 ciclos, una sola vez).
- **Sin partículas, confeti ni fondos de puntos.**

### Antes de decir «está bien»
- [ ] Nada salta de un cuadro a otro (revisado a p cada 0,02 o a la tasa completa).
- [ ] Cada beat tiene una sola acción principal.
- [ ] El hilo naranja está en cada cuadro.
- [ ] Reduced-motion: cuadro quieto, todo legible.
- [ ] Hoja de contacto revisada con Read.
