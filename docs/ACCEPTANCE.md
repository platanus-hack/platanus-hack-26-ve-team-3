# Criterios de aceptación (gates P0 primero)

| Ticket | Aceptación | Evidencia |
|---|---|---|
| PROTO-01 Comparar motores y PoC | El SDK elegido verifica un escrutinio auténtico con 3 votantes demo; ADR-001 con fuentes y salida real | `docs/ADR-001-voting-engine.md`, `docs/TEST_RESULTS.md` |
| PROTO-02 Adaptador y evidencia | Paquete de auditoría público, reproducible, sin PII | `packages/protocol-adapter`, fixture íntegro |
| AUD-01 Verificador independiente | Acepta prueba genuina; rechaza `tampered_total`, `tampered_proof`, `wrong_manifest` con causa; `removed_record` según motor | `apps/verifier` + fixtures adulterados |
| VOTE-01 Elegibilidad demo | No elegible rechazado; credencial de un uso según motor; no se almacena `voterId → opción` | tests de integración |
| ID-01 Rostro → wallet | Invitación → datos → consentimiento → prueba de vida (etiquetada demo) → smart wallet creada sin seed ni gas → `userId → walletAddress` | E2E móvil |
| VOTE-02 Flujo elector | Voto completo en móvil 360px; recibo de inclusión que no revela la opción | Playwright |
| RESULT-01 Portal público / resultados en vivo | Solo agregados; layout generativo validado por Zod; nunca `verificado` sin verificador real | tests + revisión seguridad |
| DEMO-01 Ataque observable | El jurado elige la alteración; el verificador muestra `FALLO DETECTADO` en segundos; original intacto | ensayo grabado |
| ORG-01 Wizard organizador | Elección demo creada sin comandos; invitaciones en dry-run hasta aprobación | E2E |
| UX-01 Tokens y WCAG | Contraste AA, teclado, focus, reduced motion, 360/768/1440 | capturas |
| QA-01 Suite | `pnpm verify` verde en CI | GitHub Actions |
| SEC-01 Amenazas y PII | THREAT_MODEL con test por amenaza; sin PII/biometría persistida en claro | revisión |
| INVITE-01 WhatsApp | Kapso en modo opt-in (wa.me → webhook → link); template enviado a aprobación; respaldo wa.me | log de dry-run |
