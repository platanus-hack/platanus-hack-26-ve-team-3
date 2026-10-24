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
| D-09 | 2026-10-24 | **Demo en vivo:** todo el mundo ve la votación en tiempo real y cada persona puede comprobar su inclusión y el resultado **desde la misma app** al cierre. | Pedido de José (13:30 VET). |
| D-10 | 2026-10-24 | **Una persona = una smart wallet, sin duplicados:** al inscribirse, prueba de vida facial local (Human, gratis) → comparación 1:N contra los inscritos de esa votación (rechaza duplicado) → la smart wallet firma el `faceBindingHash` → rostro enlazado a la wallet. Sin servicios de pago; sin biometría cruda en servidor. | Pedido de José; research/02 (no existe hash determinista de rostro; se usa match con umbral). |
| D-11 | 2026-10-24 | **Smart wallets gasless gratuitas:** cuenta Kernel (ZeroDev, sandbox gratis en Base Sepolia) con signer local del navegador; paymaster patrocina; alternativa Alchemy Gas Manager (gratis en testnet). Sin Privy obligatorio. Cada voto envía su compromiso on-chain por UserOp patrocinada; si el paymaster no está, firma off-chain etiquetada. | Pedido de José; research/02. |
| D-12 | 2026-10-24 | **Fases:** `registration` (inscripción con rostro + wallet) → `open` (padrón congelado, voto en vivo) → `closed` → `auditable` (paquete + verificador en la app) → `drawn` (sorteo verificable). **Demo:** la asamblea del condominio vota cuántos proyectos vecinales se financian (1 a 5); el resultado N fija cuántos ganadores; un **sorteo verificable** con semilla = hash final del ledger elige los N proyectos ganadores entre los postulados; los recursos se asignan a esos. Cualquiera recomputa el sorteo. | Pedido de José. |
