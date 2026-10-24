# Fixtures del protocolo (Plan A: semaphore-ledger)

Generados con `pnpm --filter @quorum/protocol-adapter fixtures` el 2026-10-24T14:29:06.277Z. Todo es **fixture / simulación**: elección ficticia, 3 votantes con identidades Semaphore generadas al vuelo, pruebas Groth16 reales (artefactos vendorizados).

| Archivo | Manipulación | Check que debe fallar |
|---|---|---|
| valid.json | ninguna | — (exit 0) |
| tampered_total.json | counts[0]+1, counts[1]-1; tallyHash y checksums rehechos | tally_matches |
| tampered_proof.json | message de la boleta #1 cambiado 0→1; cadena y tally rehechos | proofs_valid |
| removed_record.json | boleta #1 eliminada sin rehacer la cadena | chain_integrity, tally_matches |
| removed_record_rechained.json | boleta #1 eliminada y todo rehecho | solo anchor_matches (con RPC/ancla) o el recibo del votante; sin ancla el verificador NO puede detectarlo |
| wrong_manifest.json | etiqueta de una opción cambiada tras publicar | manifest_hash |
| double_vote.json | prueba #0 insertada de nuevo (mismo nullifier); cadena y tally rehechos | nullifiers_unique |
| wrong_root.json | commitment #2 sustituido en el padrón | group_root |
