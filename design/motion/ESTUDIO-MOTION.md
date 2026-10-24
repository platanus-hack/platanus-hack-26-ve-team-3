# Estudio de motion de Quórum

Manual del equipo de motion. Lo leen Renata, Abril, Nico y Leo antes de animar cualquier pieza de Quórum (landing, video del pitch, pantallas del producto). Objetivo: que la gente **entienda por qué puede confiar en el resultado** sin leer un paper. Lema: *Trust the proof, not the organizer.*

Herramientas: la skill `rossark-motion` (`.claude/skills/rossark-motion/`, MIT: método, curvas, `tools/sheet.sh`, `tools/track_edges.py`) y Playwright (ya está en `apps/web`) para renderizar cuadros y video. **No se instalan paquetes de música, SFX, avatares ni librerías de animación** sin que Jesús lo apruebe.

Reglas de producto que mandan sobre este manual: `CLAUDE.md`, `docs/DECISIONS.md` (en especial D-13 ancla, D-15 lenguaje, D-19 credencial QR, D-20 rostro, D-22 modo continuo), `docs/KNOWN_LIMITATIONS.md`.

## El equipo

```
Renata (concepto, beat sheet, reparto)
  → Nico (tipografía cinética, montaje 2D, componentes reales en escena)
     ∥ Abril (profundidad y transformaciones objeto→objeto)
     ∥ Leo (logo «Q verificada», íconos e ilustraciones del producto)
  → Renata (auditoría cuadro a cuadro, máximo 3 vueltas)
  → Jesús aprueba
```

Para una pieza sencilla Nico trabaja solo. Nada sale (merge a `main`, deploy, publicación) sin la aprobación de Jesús.

## La vara creativa
- **Una idea de confianza por pieza.** No un recorrido de pantallas: «el resultado se puede recomputar», no «así funciona la app».
- **La explicación es el movimiento.** Cada transformación demuestra algo: un bloque que se engancha al anterior *es* la cadena de hashes; un bloque que cambia de color y rompe el enlace *es* la manipulación detectada.
- **Un hilo visual que pasa por todo:** el anillo y el check del logo, la línea Often Orange `#FF714E`, el bloque del registro. Nunca un cuadro vacío entre beats.
- **Costuras como contrato:** cada beat le entrega al siguiente un estado definido (forma, color, tamaño y posición).
- **Transformaciones motivadas objeto→objeto**, con componentes reales:
  - el QR de la sala → la credencial del evento → la persona en la sala;
  - el rostro → una huella cifrada (la foto no sale del teléfono);
  - el voto → una prueba + un nullifier → un bloque del registro;
  - el último bloque → el sello anclado en Base Sepolia;
  - una copia alterada → el bloque en rojo, la cadena rota y «Fallo detectado».
- **Componentes 100 % fieles:** `LogoMark`, `Button`, `Badge`, `StatusPill`, `Glass` y los textos reales de `apps/web/src`. Se mueven, escalan o enmascaran; **nunca se redibujan a ojo**.
- **Fondos con propósito:** sin rejillas de puntos, partículas ni estrellas. Fondo `--color-background` (Perfect White `#F0EEEE` / Corbeau `#111122` en oscuro), tarjetas `--color-card`.
- **Tipografía:** Space Grotesk (`font-display`) en titulares y cifras, Inter en texto, monoespaciada del sistema (`q-mono`) para hashes. Palabra clave en `--color-primary-ink` (Lush Aqua `#004466`); acento Often Orange. Verde (`--color-success`) solo para «verificado/incluido», rojo (`--color-danger`) solo para «fallo detectado».

## Lenguaje honesto (no negociable)
- Nunca «anónimo», «secreto», «100 % seguro», «imposible de manipular», «inhackeable».
- Sí: «la prueba no revela quién emitió cada boleta; el servidor ve el contenido», «si alguien altera una copia, el verificador lo detecta», «cualquiera recomputa».
- El rostro: «se comprueba en tu teléfono; al servidor llega una huella cifrada; no se guardan fotos». No decir que no hay biometría en el servidor: hay plantilla cifrada que se borra al cerrar.
- El ancla la firma el organizador y solo prueba que ese hash existía en ese momento.
- Estados honestos: `pendiente`, `recibido`, `incluido`, `verificado`, `no verificable`, `fallo detectado`. Datos de ejemplo etiquetados `ejemplo`.

## Prioridad entre la skill y el manual
La calma de `rossark-motion` («sin rebote, amplitudes pequeñas») manda en la vida en reposo (el logo, un ícono que espera). La energía de un titular que entra una vez y el golpe de «Fallo detectado» los manda este manual.

## Reglas técnicas
- **Web primero:** estado = función pura del progreso `p` (0→1) o del tiempo `t`, expuesto como `window.__seek`. El mismo código se graba a video con Playwright.
- Animar solo `transform` y `opacity`. 60 fps en un móvil medio. Nada corre fuera de pantalla (IntersectionObserver + `visibilitychange`).
- `prefers-reduced-motion: reduce` → un cuadro quieto publicable con todo el contenido legible.
- Móvil primero (360 px) y escritorio (1440 px). El texto está en el DOM, con encabezados; nunca solo en canvas o SVG.
- Curvas: recorrido `(0.77, 0, 0.175, 1)`, llegada `(0.23, 1, 0.32, 1)`; nada aparece desde escala 0 (entra desde 0,9–0,97); opacidad solo para aparecer o desaparecer.
- Video del pitch: 60 fps, WebM (VP9) o MP4 H.264, sin audio salvo voz aprobada. Nada quieto más de 40 cuadros; sin pops de un cuadro ni flashes blancos.
- Nada generado con IA. Sin paquetes nuevos salvo que sea imprescindible y Jesús lo apruebe.

## Rúbrica de auditoría (Renata)
- [ ] ¿Se entiende la idea de confianza en menos de 3 s por beat, sin sonido?
- [ ] ¿El hilo visual está en cada cuadro? ¿Algún cuadro vacío o fondo decorativo?
- [ ] ¿Cada transformación está motivada y demuestra algo del sistema?
- [ ] ¿Componentes y textos fieles al producto real (logo, badges, botones, estados)?
- [ ] ¿Lenguaje honesto? Ninguna palabra prohibida; nada que el producto no haga.
- [ ] ¿Solo `transform`/`opacity`? ¿Se pausa fuera de pantalla?
- [ ] ¿Reduced-motion da un cuadro quieto con todo legible?
- [ ] ¿Legible a 360 px y equilibrado a 1440 px? ¿El objeto principal domina el cuadro?
- [ ] ¿Se siente premium o de plantilla? Si es «meh», se dice con el `p` (o el segundo) y el arreglo.

## Lo que ya sabemos (actualízalo después de cada pieza)
- 2026-10-24, sección «Cómo funciona por detrás» de la landing: ver `design/motion/LANDING.md`.
