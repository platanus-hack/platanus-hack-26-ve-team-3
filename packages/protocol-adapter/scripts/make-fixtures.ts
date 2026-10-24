/**
 * Genera packages/demo-fixtures/protocol/*.json con un paquete íntegro (3 votantes, pruebas Groth16 reales)
 * y copias adulteradas, cada una con UNA manipulación aislada (el atacante rehace lo que un atacante
 * cuidadoso rehace: cadena, checksums, tally) para que el verificador la detecte por la causa exacta.
 *
 *   pnpm --filter @quorum/protocol-adapter fixtures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemoElection, createVoterIdentity, hashCanonical, rechain, tally as recount, tallyHash, type AuditPackage, type SemaphoreProof } from "../src/index";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../demo-fixtures/protocol");
mkdirSync(outDir, { recursive: true });

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Rehace cadena, tally, tallyHash, finalHash y checksums tras tocar el ledger (manipulación "consistente"). */
function reconcile(pkg: AuditPackage, opts: { recountTally?: boolean } = { recountTally: true }): AuditPackage {
  pkg.ledger = rechain(pkg.ledger, pkg.genesisHash);
  pkg.finalHash = pkg.ledger.length ? pkg.ledger[pkg.ledger.length - 1].hash : pkg.genesisHash;
  if (opts.recountTally) pkg.tally = recount({ entries: pkg.ledger }, pkg.manifest.options.length);
  pkg.tallyHash = tallyHash(pkg.tally);
  pkg.checksums = { manifest: hashCanonical(pkg.manifest), commitments: hashCanonical(pkg.commitments), ledger: hashCanonical(pkg.ledger), tally: hashCanonical(pkg.tally) };
  return pkg;
}

const t0 = Date.now();
const generatedAt = new Date().toISOString();
const demo = await buildDemoElection({ votes: [1, 0, 1], generatedAt });
const valid = demo.pkg;
console.log(`valid.json: ${valid.ledger.length} boletas, tally=${JSON.stringify(valid.tally)}, root=${valid.groupRoot.slice(0, 12)}…, finalHash=${valid.finalHash.slice(0, 18)}… (${Date.now() - t0} ms)`);

const fixtures: Record<string, AuditPackage> = { valid };

// A1: el organizador edita la cifra publicada (y rehace tallyHash/checksums para que "cuadre").
{
  const p = clone(valid);
  p.tally.counts[0] += 1;
  p.tally.counts[1] -= 1;
  fixtures.tampered_total = reconcile(p, { recountTally: false });
}

// A2: se altera el contenido de una boleta (message 0 → 1) y se rehace cadena + tally. La prueba Groth16 ya no verifica.
{
  const p = clone(valid);
  const proof = p.ledger[1].proof as SemaphoreProof;
  (proof as { message: string }).message = (BigInt(proof.message) + 1n).toString();
  fixtures.tampered_proof = reconcile(p);
}

// A2: se elimina una boleta sin rehacer la cadena (manipulación ingenua): cadena rota en #1 y tally ≠ recuento.
{
  const p = clone(valid);
  p.ledger.splice(1, 1);
  fixtures.removed_record = p;
}

// A2 (sofisticada): se elimina una boleta Y se rehace todo. Solo el ancla / el recibo del votante la detecta.
{
  const p = clone(valid);
  p.ledger.splice(1, 1);
  fixtures.removed_record_rechained = reconcile(p);
}

// Manifiesto cambiado después de publicar (p. ej. etiqueta de una opción) sin que cambie manifestHash.
{
  const p = clone(valid);
  p.manifest.options[0].label = "Reparar el próximo año";
  fixtures.wrong_manifest = p;
}

// A3: la misma credencial vota dos veces: se inserta otra vez la prueba #0 (mismo nullifier) y se rehace todo.
{
  const p = clone(valid);
  p.ledger.push({ ...clone(p.ledger[0]), idx: p.ledger.length });
  fixtures.double_vote = reconcile(p);
}

// A4: se altera el padrón después de publicar (un commitment sustituido). La raíz publicada ya no sale de los commitments.
{
  const p = clone(valid);
  p.commitments[2] = createVoterIdentity().commitment;
  p.checksums.commitments = hashCanonical(p.commitments);
  fixtures.wrong_root = p;
}

for (const [name, pkg] of Object.entries(fixtures)) {
  const file = resolve(outDir, `${name}.json`);
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`wrote ${file}`);
}
writeFileSync(
  resolve(outDir, "README.md"),
  `# Fixtures del protocolo (Plan A: semaphore-ledger)\n\nGenerados con \`pnpm --filter @quorum/protocol-adapter fixtures\` el ${generatedAt}. Todo es **fixture / simulación**: elección ficticia, 3 votantes con identidades Semaphore generadas al vuelo, pruebas Groth16 reales (artefactos vendorizados).\n\n| Archivo | Manipulación | Check que debe fallar |\n|---|---|---|\n| valid.json | ninguna | — (exit 0) |\n| tampered_total.json | counts[0]+1, counts[1]-1; tallyHash y checksums rehechos | tally_matches |\n| tampered_proof.json | message de la boleta #1 cambiado 0→1; cadena y tally rehechos | proofs_valid |\n| removed_record.json | boleta #1 eliminada sin rehacer la cadena | chain_integrity, tally_matches |\n| removed_record_rechained.json | boleta #1 eliminada y todo rehecho | solo anchor_matches (con RPC/ancla) o el recibo del votante; sin ancla el verificador NO puede detectarlo |\n| wrong_manifest.json | etiqueta de una opción cambiada tras publicar | manifest_hash |\n| double_vote.json | prueba #0 insertada de nuevo (mismo nullifier); cadena y tally rehechos | nullifiers_unique |\n| wrong_root.json | commitment #2 sustituido en el padrón | group_root |\n`,
);
console.log(`done in ${Date.now() - t0} ms`);
process.exit(0); // snarkjs deja workers vivos
