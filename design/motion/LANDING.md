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

## Pieza hecha: el hero animado (2026-10-24)

Sustituye a la v1 «Cómo funciona por detrás» (sección aparte de 6 pasos con raíl numerado: Jesús la descartó por genérica).

Código: `apps/web/src/components/landing/HeroMotion.tsx` (sección, reloj, titular cinético, controles, modo quieto, texto accesible), `hero/Scene.tsx` (composición = f(t)), `hero/timeline.ts` (actos, titulares, ventanas), `hero/engine.ts` (curvas y pistas). Capturas, hojas y video: `docs/screenshots/landing/hero-*` (regenerar con `node apps/web/scripts/capture-hero.mjs http://localhost:3500 docs/screenshots/landing --video` desde `apps/web`, ajustando la ruta de salida).

**Concepto:** «un solo objeto que se convierte en el siguiente», como un video de lanzamiento. El hero ocupa una pantalla; titular cinético a la izquierda (cambia por acto), CTAs fijos; a la derecha una composición en perspectiva que se transforma sola en un loop de 28 s y vuelve al principio sin corte. Hilo: la línea y el sello naranjas; luz cenital única (sombra de contacto que sigue al objeto principal).

| Acto | t (s) | Titular | Qué se transforma | Costura de salida |
|---|---|---|---|---|
| A Promesa | 0–3,4 | Nadie tiene que creerle a *quien cuenta.* | ResultsCard real inclinada en 3D | la tarjeta se encoge dentro de la pantalla mientras el cuerpo del teléfono aparece detrás (3,4–4,5) |
| B Identidad | 3,4–8,2 | Una credencial. Un rostro. *Un voto.* | la cámara (pantalla navy de FaceCapture) sube y tapa la tarjeta; QR real escaneado → se encoge en «Credencial · 1 uso»; FaceRing real se llena mientras el rostro gira; check verde | el teléfono gira hacia el otro lado (otra persona) |
| C Impostor | 8,2–12,2 | Ni sin credencial, *ni dos veces.* | un QR ajeno entra, se escanea, el marco se vuelve rojo y rebota con «Ese QR no es una credencial de Platanus Hack.»; un rostro ya inscrito: el anillo se cierra en rojo, «Este rostro ya está inscrito en esta votación.» | la pantalla de la boleta sube y el teléfono vuelve de frente |
| D Voto | 12,2–17,0 | Tu voto viaja *con su prueba.* | «Votar: Sábado 14» se pulsa; la boleta sale del borde del teléfono (clip-path medido), el teléfono cae; la boleta se dobla en sobre (solapa 3D) y la sella la prueba; un segundo sobre con el mismo nullifier choca y rebota «rechazado» | el sobre cae y se inclina hacia el suelo |
| E Cadena | 17,0–22,4 | Cada voto, *encadenado* a la vista. | los bloques (hashes reales de `valid.json`) caen sobre un plano en perspectiva, el sobre se vuelve el bloque #3 y la cinta se estira en profundidad; «final 1222…33a3» baja al sello navy «Ancla on-chain · Base Sepolia · QuorumRegistry 0x64e7…be13» | etiqueta «copia descargada» |
| F Verifica | 22,4–26,8 | Altera una copia y *salta la alarma.* | #1 rueda a `7d0f…c41b` y se tiñe de rojo; el eslabón #1→#2 se parte, #2–#3 se asientan (una oscilación); la cámara empuja; `fallo detectado`; «copia original» lo deshace todo; la cadena se recoge y la ResultsCard se recompone con «recalculado · igual» | la tarjeta gira a la pose del acto A (cierre del loop) |

**Técnica:** reloj rAF solo con el hero visible y la pestaña activa; botón de pausa y 6 marcas para saltar (WCAG 2.2.2); `window.__seek(t)` fija el tiempo (y `null` reanuda desde ahí). El impostor se intercala con `toScene(t)` (la escena de boleta/cadena/verificación corre en su propio tiempo). Solo transform/opacity, más un clip-path en la salida de la boleta y la iluminación discreta de las marcas del FaceRing real. Movimiento reducido: acto A quieto y el resumen de los 6 actos visible. Lienzo fijo por breakpoint (328×400 móvil, 560×620 escritorio) con escala estática para caber, no animada.

**Auditoría (Renata, 3 vueltas):** 1) el sobre rechazado invadía los CTAs en 360 → entra desde cerca con opacidad y sale hacia la derecha; «Crear votación» partido en 2 líneas → flecha oculta < 400 px; texto del bloque génesis desbordado; la cadena se veía a través de la tarjeta al recomponerse; acento del acto F débil → empuje de cámara. 2) el empuje recortaba el bloque #3 y el ancla → empuje 1,08/1,05; pantalla vacía al girar el teléfono → el marco del escáner entra antes; cadena más grande. 3) ok: cada cuadro tiene un objeto principal, ningún cuadro vacío, transformaciones motivadas; parece pieza de estudio, no plantilla. Pendiente para ver en un móvil real: fluidez del plano 3D de la cadena y del FaceRing (72 líneas SVG) en gama media.
