# @quorum/demo-fixtures

**Todo lo que hay aquí es FIXTURE.** Elección ficticia, votantes ficticios y paquetes de auditoría de demostración, etiquetados `fixture` en el propio JSON. Nunca contiene datos reales ni identidades políticas (regla 4 de `CLAUDE.md`).

## Contenido

| Archivo | Qué es |
|---|---|
| `src/election.ts` | `demoElection` — "Condominio Los Samanes — fecha de la asamblea anual" (3 opciones neutrales: fechas) y `demoVoters` — 6 votantes con nombres obviamente inventados y teléfonos del bloque ficticio `+1 555 01XX`. |
| `fixtures/audit-package.sample.json` | Paquete de auditoría **íntegro** con la forma `{ fixture, manifest, ballots: [{ inclusionId, commitment }], result: { counts, totalVotes, proof }, versions, checksums }`. 5 boletas de 6 elegibles. Sin PII. |
| `fixtures/tampered/tampered_total.json` | Un voto de más en los conteos; checksums originales. Esperado: `valid=false`, discrepancia. |
| `fixtures/tampered/removed_record.json` | Una boleta eliminada. Esperado: rechazo contra la copia (checksum de boletas); la completitud frente al motor real **no está demostrada**. |
| `fixtures/tampered/wrong_manifest.json` | Título y una opción cambiados; `manifestHash` original. Esperado: rechazo. |
| `fixtures/tampered/tampered_proof.json` | Un carácter del digest de la prueba alterado. Esperado: `valid=false`, la prueba no verifica. |
| `src/audit-package.ts` | Esquema Zod del paquete, `buildSamplePackage()`, `makeTampered()` y `checkIntegrity()` (oráculo de pruebas). |

## Regenerar

```bash
pnpm --filter @quorum/demo-fixtures fixtures:build   # make-sample.ts + make-tampered.ts
pnpm --filter @quorum/demo-fixtures test             # verifica determinismo y detección
```

Los generadores son deterministas: regenerar produce los mismos bytes, y los tests fallan si el JSON en disco se desvía del generador.

## Límites honestos

- `checkIntegrity()` es un **oráculo de test**, no el verificador del producto. Recalcula hashes y consistencia interna de un paquete. El verificador independiente real es `apps/verifier` (propiedad crypto+QA) y usará la canonicalización del motor elegido en ADR-001.
- Los `commitment` son `sha256(electionId|optionId|sal fija)`. Con sal pública **no ocultan la opción**; existen para que el paquete tenga la forma correcta, no para afirmar privacidad.
- Protocolo `integrity-demo`: detecta alteraciones de la copia publicada frente a sus checksums. No demuestra que el organizador no haya omitido boletas antes de publicar (`removed_record` → "cobertura no demostrada" según spec §9.3).
