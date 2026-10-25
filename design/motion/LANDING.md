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

## Pieza hecha: «Cómo funciona por detrás» (2026-10-24)

Código: `apps/web/src/components/landing/HowItWorksMotion.tsx` (sección, scroll, modo quieto), `how-it-works/Stage.tsx` (escena 320×330 = f(p)), `how-it-works/motion.ts` (curvas y beats). Capturas y video: `docs/screenshots/landing/motion-*`.

**Concepto:** «un solo hilo, del QR al verificador»: un escenario fijo (sticky) donde un objeto se transforma en el siguiente, y el raíl naranja de 6 pasos avanza con el scroll.

| Beat | p | Acción principal | Costura de salida |
|---|---|---|---|
| 1 | 0–0,17 | QR de la sala; línea naranja lo escanea → tarjeta «Credencial del evento · 1 uso» | teléfono centrado |
| 2 | 0,17–0,33 | El teléfono se corre a la izquierda; rostro enmarcado + «Gira un poco la cabeza» + check; chip «huella cifrada» viaja en arco al «Servidor · 0 fotos guardadas» | tarjeta del servidor a la derecha |
| 3 | 0,33–0,5 | «Votar: Sábado 14» se pulsa; la boleta (prueba + nullifier) sale por detrás del teléfono al lugar del servidor; «Segundo voto · mismo nullifier» → `rechazado` | boleta a la derecha |
| 4 | 0,5–0,67 | El teléfono sale; bloques #1–#3 entran con sus enlaces; la boleta se vuelve el bloque #4 (borde naranja) | cadena centrada |
| 5 | 0,67–0,83 | La cadena sube; «final d4e1…» baja al sello «Ancla on-chain · Base Sepolia · QuorumRegistry»; el logo «Q verificada» llega | sello bajo la cadena |
| 6 | 0,83–1 | «copia descargada»: #2 cambia a rojo (`e01a`), #3–#4 se marcan, los enlaces se rompen, `Cadena del registro · fallo detectado` (un temblor); «Copia original · Sorteo recomputado · igual» | cuadro final publicable |

**Aprendido:** el título va fuera del sticky (en 360 px no cabe con escena a escala 1); la escena se escala con `--s` por breakpoint y por alto de pantalla, nunca animado; lo que «sale» de un objeto va detrás de él en el DOM.
