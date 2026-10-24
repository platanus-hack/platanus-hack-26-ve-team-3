# Quórum — Constitución del proyecto (modo hackathon)

1. Entregar software que funciona, no mocks: cada pantalla habla con una API real o muestra un fixture etiquetado.
2. Un solo recorrido crítico primero: organizar → invitar → identificar (rostro + wallet) → votar → cerrar → verificar → detectar manipulación.
3. Límites de seguridad en el servidor: la UI y el LLM nunca otorgan permisos ni declaran `verificado`.
4. Validar toda entrada externa con esquemas Zod (`@quorum/contracts`).
5. Nunca inventar respuestas de API, resultados de tests ni integraciones.
6. Cada feature tiene criterios de aceptación medibles (`docs/ACCEPTANCE.md`).
7. Arquitectura comprensible: monorepo pnpm, Next.js App Router, verificador en paquete aparte.
8. Tests automáticos para el comportamiento crítico (voto, cierre, verificación, adversariales).
9. `main` siempre desplegable; CI verde para mergear.
10. Cambios pequeños y revisables; un PR por carril.
11. Paralelizar solo tareas independientes con propiedad de archivos explícita.
12. Reservar tiempo para integración (H+20–26) y demo (H+33–36).
13. Nunca commitear secretos ni datos personales (teléfonos, rostros, cédulas).
14. Aprobación humana en la página de la oficina para acciones destructivas o externas (deploy, WhatsApp real, merge).
15. Demostrar valor real en tres minutos: voto privado, verificación independiente, fraude detectado.
16. Política de claims: sin "anónimo", "ZK", "100% seguro" ni política real salvo prueba implementada (spec §12).
