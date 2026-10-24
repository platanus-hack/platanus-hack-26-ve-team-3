/**
 * Verificador independiente de Quórum para el protocolo `semaphore-ledger` (ADR-001, Plan A).
 *
 * Reglas de independencia: este módulo NO importa `apps/web` ni `@quorum/protocol-adapter`; solo necesita
 * el paquete de auditoría público. Reimplementa el hash canónico y la cadena, usa `@semaphore-protocol/core`
 * (Group + verifyProof, claves de verificación embebidas) y `viem` para hashes/ABI/RPC.
 * Nunca deriva "verificado" de un booleano: cada check se recomputa aquí.
 */
import { Group, verifyProof } from "@semaphore-protocol/core";
import { AuditResult as AuditResultSchema, type AuditResult } from "@quorum/contracts";
import { concat, createPublicClient, decodeAbiParameters, http, keccak256, sha256, stringToBytes, toHex, type Hex } from "viem";
import { z } from "zod";

export const VERIFIER_VERSION = "quorum-verifier/0.1.0 (semaphore-core 4.14.5)";
export const BASE_SEPOLIA_CHAIN_ID = 84532;

// ---------- esquema del paquete (quorum-audit/1) ----------
const Hex32 = z.string().regex(/^0x[0-9a-f]{64}$/, "hex de 32 bytes");
/** Módulo del campo escalar de BN254. */
const SNARK_SCALAR_FIELD = BigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
/** Decimal canónico (sin ceros a la izquierda ni hex) y < r: evita dos codificaciones del mismo nullifier (C1). */
const Decimal = z
  .string()
  .regex(/^(0|[1-9]\d{0,77})$/, "decimal canónico (sin ceros a la izquierda ni hex)")
  .refine((v) => BigInt(v) < SNARK_SCALAR_FIELD, "fuera del campo BN254");
const ProofSchema = z.object({
  merkleTreeDepth: z.number().int().min(1).max(32),
  merkleTreeRoot: Decimal,
  message: Decimal,
  nullifier: Decimal,
  scope: Decimal,
  points: z.tuple([Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal, Decimal]),
});
const EntrySchema = z.object({ idx: z.number().int().min(0), prevHash: Hex32, hash: Hex32, proof: ProofSchema });
const Hex32Lower = z.string().regex(/^0x[0-9a-f]{64}$/, "hex de 32 bytes");
const DrawCandidateSchema = z.object({ id: z.string().min(1), label: z.string(), amount: z.number().optional() });
const DrawRuleSchema = z.object({
  candidates: z.array(DrawCandidateSchema).min(1),
  winnersCount: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("fixed"), n: z.number().int().min(0) }),
    z.object({ kind: z.literal("from-result"), optionValues: z.array(z.number().int().min(0)) }),
  ]),
  tieBreak: z.literal("lowest").optional(),
});
const DrawSchema = z.object({
  seed: Hex32Lower,
  n: z.number().int().min(0),
  winners: z.array(z.string()),
  method: z.literal("keccak256(finalHash)|fisher-yates"),
  finalHash: Hex32Lower,
});
const ManifestSchema = z.object({
  electionId: z.string().min(1),
  title: z.string(),
  kind: z.enum(["yes-no", "multiple", "ranking", "budget"]),
  options: z.array(z.object({ id: z.string(), label: z.string() })).min(2),
  startsAt: z.string(),
  endsAt: z.string(),
  protocol: z.literal("semaphore-ledger"),
  merkleTreeDepth: z.number().int(),
  label: z.string().optional(),
  drawRule: DrawRuleSchema.optional(),
});
const TallySchema = z.object({ counts: z.array(z.number().int().min(0)), invalid: z.number().int().min(0), total: z.number().int().min(0) });
export const AuditPackageSchema = z.object({
  version: z.literal("quorum-audit/1"),
  protocol: z.literal("semaphore-ledger"),
  electionId: z.string().min(1),
  manifest: ManifestSchema,
  manifestHash: Hex32,
  scope: Decimal,
  merkleTreeDepth: z.number().int(),
  groupRoot: Decimal,
  commitments: z.array(Decimal).min(1),
  ledger: z.array(EntrySchema),
  genesisHash: Hex32,
  tally: TallySchema,
  tallyHash: Hex32,
  finalHash: Hex32,
  anchor: z.object({ chainId: z.number().int(), txHash: Hex32.optional(), attestationUid: Hex32.optional() }).nullable(),
  checksums: z.object({ manifest: Hex32, commitments: Hex32, ledger: Hex32, tally: Hex32 }),
  versions: z.object({ adapter: z.string(), semaphore: z.string(), artifacts: z.string() }).optional(),
  generatedAt: z.string().optional(),
  draw: DrawSchema.optional(),
});
export type AuditPackage = z.infer<typeof AuditPackageSchema>;

// ---------- hash canónico (misma definición que el adaptador; reimplementada a propósito) ----------
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}
export const hashCanonical = (v: unknown): Hex => sha256(stringToBytes(canonicalJson(v)));
export const expectedScope = (electionId: string): string => (BigInt(keccak256(stringToBytes(`quorum:${electionId}`))) >> 8n).toString();

// ---------- sorteo (reimplementado a propósito; misma definición que protocol-adapter/src/draw.ts) ----------
/** seed = keccak256(finalHash); Fisher-Yates parcial con r_i = keccak256(seed ‖ uint256(i)) sobre ids ordenados. */
export function recomputeDraw(candidateIds: readonly string[], n: number, finalHash: Hex): { seed: Hex; winners: string[]; n: number } {
  const ids = [...candidateIds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const seed = keccak256(finalHash);
  const take = Math.min(n, ids.length);
  for (let i = 0; i < take; i++) {
    const r = BigInt(keccak256(concat([seed, toHex(BigInt(i), { size: 32 })])));
    const j = i + Number(r % BigInt(ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return { seed, winners: ids.slice(0, take), n: take };
}

// ---------- ancla ----------
export type AnchorRead = { chainId: number; from: string; to: string | null; input: Hex };
export type AnchorReader = (txHash: Hex) => Promise<AnchorRead>;

export function viemAnchorReader(rpcUrl: string): AnchorReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return async (hash) => {
    const [chainId, tx] = await Promise.all([client.getChainId(), client.getTransaction({ hash })]);
    return { chainId, from: tx.from, to: tx.to ?? null, input: tx.input };
  };
}

export function decodeAnchorCalldata(data: Hex): { finalHash: Hex; groupRoot: string; tallyHash: Hex; electionId: string } {
  const [finalHash, root, tallyHash, electionId] = decodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "string" }], data);
  return { finalHash, groupRoot: BigInt(root).toString(), tallyHash, electionId };
}

// ---------- verificación ----------
export type VerifyOptions = {
  /** RPC de Base Sepolia para leer la tx de ancla. Sin esto, `anchor_matches` queda "no evaluado". */
  anchorRpcUrl?: string;
  /** Lector inyectable (tests). Tiene prioridad sobre anchorRpcUrl. */
  anchorReader?: AnchorReader;
  /** Digest del artefacto de entrada tal cual se recibió (p. ej. SHA-256 de los bytes del archivo). */
  inputArtifactDigest?: string;
  now?: () => Date;
};

type Check = { name: string; passed: boolean; reason?: string };

const BASE_UNSUPPORTED = [
  "secreto-del-contenido-frente-al-servidor: la opción elegida viaja en claro dentro de la prueba Semaphore (no hay cifrado ElGamal); el servidor ve cada voto, aunque no sabe de quién es",
  "resistencia-a-coaccion: un votante puede demostrar a un tercero cómo votó",
  "validez-0/1-de-boletas-cifradas: no aplica (no hay cifrado); el recuento cuenta mensajes en claro y marca como inválidos los que no son una opción",
  "identidad-civil: el padrón son commitments admitidos por el organizador; el verificador no comprueba quién es cada persona ni si la lista es la correcta",
  "prueba-criptografica-de-escrutinio: no hay ZK del tally; es un recuento reproducible por cualquiera",
];

export async function verifyPackage(input: unknown, opts: VerifyOptions = {}): Promise<AuditResult> {
  const checkedAt = (opts.now?.() ?? new Date()).toISOString();
  const inputArtifactDigest: string = opts.inputArtifactDigest ?? hashCanonical(input);
  const checks: Check[] = [];
  const unsupported = [...BASE_UNSUPPORTED];

  const parsed = AuditPackageSchema.safeParse(input);
  const maybeId = (input as { electionId?: unknown } | null)?.electionId;
  const electionId = typeof maybeId === "string" ? maybeId : "unknown";
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    checks.push({ name: "package_schema", passed: false, reason: `paquete no válido (${issue?.path.join(".") || "raíz"}: ${issue?.message})` });
    return finish({ electionId, protocol: "semaphore-ledger" });
  }
  const pkg = parsed.data;
  checks.push({ name: "package_schema", passed: true, reason: `quorum-audit/1, ${pkg.ledger.length} boletas, ${pkg.commitments.length} commitments` });

  // 1. manifest_hash
  {
    const h = hashCanonical(pkg.manifest);
    const problems: string[] = [];
    if (h !== pkg.manifestHash) problems.push(`sha256(manifest) ${h} ≠ manifestHash publicado ${pkg.manifestHash}`);
    if (pkg.checksums.manifest !== h) problems.push(`checksums.manifest ≠ sha256(manifest)`);
    if (pkg.manifest.electionId !== pkg.electionId) problems.push(`manifest.electionId ≠ electionId`);
    if (pkg.manifest.merkleTreeDepth !== pkg.merkleTreeDepth) problems.push(`manifest.merkleTreeDepth ≠ merkleTreeDepth`);
    checks.push({ name: "manifest_hash", passed: problems.length === 0, reason: problems.length ? `manifiesto alterado: ${problems.join("; ")}` : `manifestHash coincide (${h.slice(0, 18)}…)` });
  }

  // 2. group_root
  let rootOk = false;
  {
    let root = "";
    const problems: string[] = [];
    try {
      root = new Group(pkg.commitments.map((c) => BigInt(c))).root.toString();
    } catch (e) {
      problems.push(`no se pudo reconstruir el padrón: ${(e as Error).message}`);
    }
    if (root && root !== pkg.groupRoot) problems.push(`raíz recomputada desde ${pkg.commitments.length} commitments ${root.slice(0, 12)}… ≠ groupRoot publicada ${pkg.groupRoot.slice(0, 12)}…`);
    if (pkg.checksums.commitments !== hashCanonical(pkg.commitments)) problems.push("checksums.commitments ≠ sha256(commitments)");
    rootOk = problems.length === 0;
    checks.push({ name: "group_root", passed: rootOk, reason: rootOk ? `raíz del padrón recomputada y coincide (${pkg.commitments.length} commitments)` : `padrón alterado: ${problems.join("; ")}` });
  }

  // 2b. commitments_unique (M3): un commitment repetido daría dos hojas a la misma credencial en el padrón.
  {
    const seen = new Map<bigint, number>();
    const dups: string[] = [];
    pkg.commitments.forEach((c, i) => {
      const k = BigInt(c);
      const first = seen.get(k);
      if (first !== undefined) dups.push(`commitment #${i} duplica #${first}`);
      else seen.set(k, i);
    });
    checks.push({ name: "commitments_unique", passed: dups.length === 0, reason: dups.length ? `padrón con duplicados: ${dups.join("; ")}` : `${seen.size} commitments únicos` });
  }

  // 3. chain_integrity
  const scope = expectedScope(pkg.electionId);
  {
    const problems: string[] = [];
    const genesis = hashCanonical({ kind: "quorum-ledger-genesis", electionId: pkg.electionId, scope: pkg.scope, groupRoot: pkg.groupRoot });
    if (genesis !== pkg.genesisHash) problems.push(`genesisHash ${pkg.genesisHash.slice(0, 18)}… ≠ recomputado ${genesis.slice(0, 18)}…`);
    let prev: string = genesis;
    for (let i = 0; i < pkg.ledger.length && problems.length === 0; i++) {
      const e = pkg.ledger[i];
      if (e.idx !== i) problems.push(`cadena rota en #${i}: la entrada en esa posición tiene idx=${e.idx} (falta o sobra al menos una boleta)`);
      else if (e.prevHash !== prev) problems.push(`cadena rota en #${i}: prevHash ${e.prevHash.slice(0, 18)}… ≠ hash anterior ${prev.slice(0, 18)}…`);
      else {
        const h = hashCanonical({ idx: e.idx, prevHash: e.prevHash, proof: e.proof });
        if (h !== e.hash) problems.push(`cadena rota en #${i}: hash ${e.hash.slice(0, 18)}… ≠ recomputado ${h.slice(0, 18)}…`);
      }
      prev = e.hash;
    }
    if (problems.length === 0) {
      const last = pkg.ledger.length ? pkg.ledger[pkg.ledger.length - 1].hash : genesis;
      if (last !== pkg.finalHash) problems.push(`finalHash publicado ${pkg.finalHash.slice(0, 18)}… ≠ último hash ${last.slice(0, 18)}…`);
      if (pkg.checksums.ledger !== hashCanonical(pkg.ledger)) problems.push("checksums.ledger ≠ sha256(ledger)");
    }
    checks.push({ name: "chain_integrity", passed: problems.length === 0, reason: problems.length ? problems.join("; ") : `cadena SHA-256 íntegra: génesis → ${pkg.ledger.length} boletas → finalHash ${pkg.finalHash.slice(0, 18)}…` });
  }

  // 4. proofs_valid
  {
    const problems: string[] = [];
    if (pkg.scope !== scope) problems.push(`scope publicado ${pkg.scope.slice(0, 12)}… ≠ keccak("quorum:${pkg.electionId}")>>8`);
    for (let i = 0; i < pkg.ledger.length && problems.length === 0; i++) {
      const p = pkg.ledger[i].proof;
      if (p.merkleTreeRoot !== pkg.groupRoot) problems.push(`boleta #${i}: raíz de la prueba ≠ groupRoot (prueba contra otro padrón)`);
      else if (p.scope !== scope) problems.push(`boleta #${i}: scope ≠ scope de la elección (prueba de otra elección)`);
      else if (p.merkleTreeDepth !== pkg.merkleTreeDepth) problems.push(`boleta #${i}: profundidad ${p.merkleTreeDepth} ≠ ${pkg.merkleTreeDepth}`);
      else {
        let ok = false;
        try {
          ok = await verifyProof(p);
        } catch (e) {
          problems.push(`boleta #${i}: error al verificar (${(e as Error).message})`);
          break;
        }
        if (!ok) problems.push(`boleta #${i}: la prueba Groth16 de Semaphore no verifica (contenido o prueba alterados)`);
      }
    }
    checks.push({ name: "proofs_valid", passed: problems.length === 0, reason: problems.length ? problems.join("; ") : `${pkg.ledger.length}/${pkg.ledger.length} pruebas Semaphore verifican contra groupRoot y scope de la elección` });
  }

  // 5. nullifiers_unique
  {
    // Se compara el VALOR (BigInt), no el texto: "0"+n y n son el mismo nullifier.
    const seen = new Map<bigint, number>();
    const dups: string[] = [];
    pkg.ledger.forEach((e, i) => {
      const key = BigInt(e.proof.nullifier);
      const first = seen.get(key);
      if (first !== undefined) dups.push(`#${i} repite el nullifier de #${first}`);
      else seen.set(key, i);
    });
    checks.push({ name: "nullifiers_unique", passed: dups.length === 0, reason: dups.length ? `doble voto: ${dups.join("; ")}` : `${seen.size} nullifiers únicos` });
  }

  // 6. tally_matches
  {
    const n = pkg.manifest.options.length;
    const counts = new Array<number>(n).fill(0);
    let invalid = 0;
    for (const e of pkg.ledger) {
      const m = Number(e.proof.message);
      if (Number.isInteger(m) && m >= 0 && m < n) counts[m] += 1;
      else invalid += 1;
    }
    const problems: string[] = [];
    if (pkg.tally.counts.length !== n) problems.push(`tally tiene ${pkg.tally.counts.length} opciones, el manifiesto ${n}`);
    else counts.forEach((c, i) => { if (pkg.tally.counts[i] !== c) problems.push(`opción ${i} (${pkg.manifest.options[i].id}): publicado ${pkg.tally.counts[i]}, recomputado ${c}`); });
    if (pkg.tally.invalid !== invalid) problems.push(`inválidas: publicado ${pkg.tally.invalid}, recomputado ${invalid}`);
    if (pkg.tally.total !== pkg.ledger.length) problems.push(`total: publicado ${pkg.tally.total}, boletas en el ledger ${pkg.ledger.length}`);
    const th = hashCanonical(pkg.tally);
    if (th !== pkg.tallyHash) problems.push("tallyHash ≠ sha256(tally)");
    if (pkg.checksums.tally !== th) problems.push("checksums.tally ≠ sha256(tally)");
    checks.push({ name: "tally_matches", passed: problems.length === 0, reason: problems.length ? `total publicado ≠ recomputado: ${problems.join("; ")}` : `recuento reproducido: ${JSON.stringify(counts)} (${pkg.ledger.length} boletas, ${invalid} inválidas)` });
  }

  // 7. anchor_matches
  {
    const reader = opts.anchorReader ?? (opts.anchorRpcUrl ? viemAnchorReader(opts.anchorRpcUrl) : undefined);
    if (!pkg.anchor) {
      checks.push({ name: "anchor_matches", passed: true, reason: "no evaluado: el paquete no declara ancla on-chain" });
      unsupported.push("inmutabilidad-on-chain: paquete sin ancla; nada impide que el organizador publique otro paquete distinto más tarde");
      unsupported.push("completitud-del-ledger: sin ancla, una boleta eliminada con la cadena rehecha solo la detecta el votante con su recibo (nullifier)");
    } else if (!pkg.anchor.txHash) {
      checks.push({ name: "anchor_matches", passed: true, reason: "no evaluado: ancla sin txHash (solo attestationUid); lectura EAS no implementada en este verificador" });
      unsupported.push("inmutabilidad-on-chain: ancla no evaluada");
    } else if (!reader) {
      checks.push({ name: "anchor_matches", passed: true, reason: `no evaluado: ancla declarada (chainId ${pkg.anchor.chainId}, tx ${pkg.anchor.txHash.slice(0, 12)}…) pero sin --anchor-rpc` });
      unsupported.push("inmutabilidad-on-chain: ancla no evaluada (sin RPC)");
      unsupported.push("completitud-del-ledger: sin comparar con el ancla, una boleta eliminada con la cadena rehecha no se detecta aquí");
    } else {
      const problems: string[] = [];
      try {
        const tx = await reader(pkg.anchor.txHash as Hex);
        if (tx.chainId !== pkg.anchor.chainId) problems.push(`chainId del RPC ${tx.chainId} ≠ ${pkg.anchor.chainId}`);
        if (pkg.anchor.chainId !== BASE_SEPOLIA_CHAIN_ID) problems.push(`ancla en chainId ${pkg.anchor.chainId}; este verificador solo acepta Base Sepolia (${BASE_SEPOLIA_CHAIN_ID})`);
        const a = decodeAnchorCalldata(tx.input);
        if (a.electionId !== pkg.electionId) problems.push(`electionId anclado "${a.electionId}" ≠ "${pkg.electionId}"`);
        if (a.finalHash !== pkg.finalHash) problems.push(`hash final ≠ ancla: anclado ${a.finalHash.slice(0, 18)}…, paquete ${pkg.finalHash.slice(0, 18)}…`);
        if (a.groupRoot !== pkg.groupRoot) problems.push(`groupRoot anclada ≠ paquete`);
        if (a.tallyHash !== pkg.tallyHash) problems.push(`tallyHash anclado ≠ paquete`);
      } catch (e) {
        problems.push(`no se pudo leer/decodificar la tx de ancla: ${(e as Error).message}`);
      }
      checks.push({ name: "anchor_matches", passed: problems.length === 0, reason: problems.length ? problems.join("; ") : `ancla en Base Sepolia (tx ${pkg.anchor.txHash.slice(0, 12)}…) coincide con finalHash, groupRoot y tallyHash` });
    }
  }

  // 8. draw_matches (solo si el manifiesto declara regla de sorteo o el paquete trae sorteo)
  if (pkg.manifest.drawRule || pkg.draw) {
    const rule = pkg.manifest.drawRule;
    const draw = pkg.draw;
    if (!rule) {
      checks.push({ name: "draw_matches", passed: false, reason: "el paquete trae un sorteo pero el manifiesto no declara regla de sorteo (regla añadida después de publicar)" });
    } else if (!draw) {
      checks.push({ name: "draw_matches", passed: true, reason: "no evaluado: el manifiesto declara sorteo pero aún no se ha realizado" });
      unsupported.push("sorteo: aún no realizado; no hay ganadores que comprobar");
    } else {
      const problems: string[] = [];
      const ids = rule.candidates.map((c) => c.id);
      if (new Set(ids).size !== ids.length) problems.push("ids de candidatos repetidos en el manifiesto");
      // N recomputado desde NUESTRO recuento, no desde el tally publicado.
      const n = pkg.manifest.options.length;
      const counts = new Array<number>(n).fill(0);
      for (const e of pkg.ledger) {
        const m = Number(e.proof.message);
        if (Number.isInteger(m) && m >= 0 && m < n) counts[m] += 1;
      }
      let expectedN: number | null;
      if (rule.winnersCount.kind === "fixed") expectedN = rule.winnersCount.n;
      else {
        // Empate en el máximo → gana la opción de MENOR valor N (tieBreak "lowest", declarado en el manifiesto).
        const values = rule.winnersCount.optionValues;
        const max = Math.max(0, ...counts);
        let best = -1;
        if (max > 0) counts.forEach((c, i) => { if (c === max && (best < 0 || values[i] < values[best])) best = i; });
        expectedN = best >= 0 ? (values[best] ?? null) : null;
        if (values.length !== n) problems.push(`optionValues tiene ${values.length} valores, el manifiesto ${n} opciones`);
        if (rule.tieBreak !== "lowest") problems.push("el manifiesto no declara regla de empate (tieBreak) para N");
      }
      if (expectedN === null) problems.push("no hay boletas válidas: la regla no fija N y no debería existir sorteo");
      if (draw.finalHash !== pkg.finalHash) problems.push(`sorteo hecho sobre finalHash ${draw.finalHash.slice(0, 18)}… ≠ finalHash del paquete ${pkg.finalHash.slice(0, 18)}…`);
      if (problems.length === 0 && expectedN !== null) {
        const r = recomputeDraw(ids, expectedN, pkg.finalHash as Hex);
        if (draw.seed !== r.seed) problems.push(`semilla publicada ${draw.seed.slice(0, 18)}… ≠ keccak256(finalHash) ${r.seed.slice(0, 18)}…`);
        if (draw.n !== r.n) problems.push(`N publicado ${draw.n} ≠ N recomputado ${r.n}`);
        if (JSON.stringify(draw.winners) !== JSON.stringify(r.winners)) problems.push(`ganadores publicados [${draw.winners.join(", ")}] ≠ recomputados [${r.winners.join(", ")}]`);
      }
      checks.push({
        name: "draw_matches",
        passed: problems.length === 0,
        reason: problems.length ? `sorteo no reproducible: ${problems.join("; ")}` : `sorteo recomputado: N=${draw.n}, ganadores [${draw.winners.join(", ")}] con semilla keccak256(finalHash)`,
      });
    }
  }

  return finish({ electionId: pkg.electionId, protocol: "semaphore-ledger" });

  function finish(meta: { electionId: string; protocol: "semaphore-ledger" }): AuditResult {
    const result: AuditResult = {
      electionId: meta.electionId,
      verifierVersion: VERIFIER_VERSION,
      protocol: meta.protocol,
      inputArtifactDigest,
      checkedAt,
      valid: checks.every((c) => c.passed),
      checks,
      unsupportedGuarantees: unsupported,
    };
    return AuditResultSchema.parse(result);
  }
}
