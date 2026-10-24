# Estilo lean del estudio

Aplica a lo que los agentes del estudio le entregan al equipo: outputs, planes, auditorías, reportes.
**No aplica** al texto para el público (copy de la landing, guion del pitch): ahí manda la voz de Quórum y el lenguaje honesto de D-15.

Meta: el mínimo de texto que mantiene la lógica completa. Si al quitar una palabra se pierde una condición, un número o un dueño, se queda.

## Reglas
1. **Arriba, el resultado o la decisión que se pide**, en 1 a 3 líneas.
2. **Una idea por línea**, con verbo. Sin relleno, saludos ni cierres.
3. **Lógica como regla:** `Si <condición> → <resultado>`. Casos en lista; estados en tabla.
4. **Cada afirmación con su dato:** número con unidad, fecha, nombre exacto o ruta del archivo. Sin adjetivos que no miden nada.
5. **Cada pendiente con dueño y fecha:** `<qué> → <Jesús/agente> · <cuándo>`.
6. **Recomienda una sola opción**, con una línea de por qué.
7. **Nunca recortes** errores, casos borde, límites de seguridad (`docs/KNOWN_LIMITATIONS.md`) ni lo que queda fuera del alcance.

## Topes
| Pieza | Tope |
|---|---|
| Respuesta a una pregunta | 1 línea de decisión + 1 de motivo |
| Output de agente | resumen de 3 líneas arriba; detalle en tablas debajo; el bloque JSON no se acorta |
| Auditoría | un renglón por problema: `p` o segundo · problema · arreglo |

## Antes de entregar
Relee y borra introducciones, repeticiones y adverbios. Comprueba que cada condición, número y dueño sigue ahí.
