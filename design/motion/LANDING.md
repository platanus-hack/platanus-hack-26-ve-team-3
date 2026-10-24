# Usar el estudio en la landing de Quórum

En una landing cambia el formato de entrega, no el método (`ESTUDIO-MOTION.md`).

## Reparto

| Agente | En la landing hace |
|---|---|
| Renata | Concepto de movimiento por sección, beat sheet atado al scroll, qué se mueve y qué queda en reposo, y la auditoría final |
| Abril | Profundidad y transformaciones objeto→objeto atadas al scroll (voto → bloque, bloque → sello, cadena que se rompe) |
| Leo | El logo «Q verificada» que se dibuja, los íconos del producto (lucide) y su gesto al entrar |
| Nico | Tipografía cinética de titulares, montaje de los beats con componentes reales y el video del pitch |

## Formato de entrega

- **Animación en vivo (preferido):** componentes React/CSS donde el estado es función pura del progreso `p` (0→1) de la sección, igual que `window.__seek`. Así se renderiza a cuadros y video con Playwright y se monta en la web.
  - Scroll: `p` = progreso de la sección en viewport (listener pasivo + `requestAnimationFrame`, activo solo con la sección visible por IntersectionObserver).
  - Reposo: reloj en loop que se pausa fuera de pantalla y con la pestaña oculta.
- **Video:** WebM (VP9) o MP4 H.264, sin audio, `autoplay muted loop playsinline`, ≤ 2–3 MB, con póster.

## Reglas web (además de `ESTUDIO-MOTION.md`)
- `prefers-reduced-motion: reduce` → todo quieto en un cuadro publicable con todos los pasos legibles.
- Nada corre fuera de pantalla.
- Solo `transform` y `opacity`. 60 fps en un móvil medio.
- El texto de cada paso está en el DOM con encabezados (no solo en SVG o canvas).
- Archivos nuevos; enganche mínimo en `apps/web/src/app/page.tsx` (otra persona trabaja el look and feel de la landing).

## Verificación
- Playwright: capturas a p = 0, 0.2, 0.4, 0.6, 0.8, 1 en 360 y 1440 px, y con reduced-motion, en `docs/screenshots/landing/motion-*.png`; hoja de contacto con ffmpeg (`tile`) o `tools/sheet.sh` sobre el video `motion-scroll.webm` (`recordVideo`).
- Renata la mira con Read y pasa la rúbrica (máximo 3 vueltas).

## Encargo de ejemplo
> Renata: concepto de movimiento para «Cómo funciona por detrás». Entrega: 2 conceptos, beat sheet atado al scroll, reparto Abril/Leo/Nico. Formato web: componente con estado = f(p). Respeta `prefers-reduced-motion` y el lenguaje honesto de D-15.
