# Decisiones vigentes (todas las personas y agentes las respetan)

| # | Fecha | Decisión | Por qué |
|---|---|---|---|
| D-01 | 2026-10-24 | Nombre del producto: **Quórum**. Track Trust, Platanus Hack Caracas. | Spec maestra. |
| D-02 | 2026-10-24 | Idioma del producto y de la oficina: español (es-VE). Código en inglés. | Jurado y usuarios locales. |
| D-03 | 2026-10-24 | Demo con elección ficticia y opciones neutrales (p. ej. fecha de asamblea de un condominio ficticio). Nunca política real. | Spec §12. |
| D-04 | 2026-10-24 | Motor de votación: se decide en `docs/ADR-001-voting-engine.md` tras el spike (DAVINCI/Vocdoni vs MACI vs Helios vs primitivas). Hasta entonces nadie implementa cripto. | Spec §3. |
| D-05 | 2026-10-24 | Identidad del votante: invitación por WhatsApp (Kapso, con respaldo Meta Cloud API / wa.me) → nombre + datos básicos → prueba de vida facial (etiquetada "demo") → smart wallet embebida sin seed ni gas → la wallet firma el voto. Nunca guardamos biometría cruda ni rostro ligado a opción. | Visión del equipo + spec §2/§5. |
| D-06 | 2026-10-24 | Resultados en vivo solo agregados (turnout, tendencia por opción) con UI generativa; el LLM elige layout, nunca cifras. | Visión del equipo. |
| D-07 | 2026-10-24 | Nada sale hacia afuera (deploy prod, WhatsApp real, merge a main) sin aprobación en la página de la oficina. | Guía de la oficina. |
