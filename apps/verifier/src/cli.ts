#!/usr/bin/env tsx
/**
 * CLI del verificador independiente.
 *   pnpm --filter @quorum/verifier verify <package.json> [--anchor-rpc <url>] [--pretty]
 * Salida: AuditResult en JSON por stdout. Código de salida: 0 si valid, 1 si no, 2 si no se pudo leer la entrada.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifyPackage } from "./verify.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const rpcIdx = args.indexOf("--anchor-rpc");
const anchorRpcUrl = rpcIdx >= 0 ? args[rpcIdx + 1] : process.env.BASE_SEPOLIA_RPC;
const pretty = args.includes("--pretty");

if (!file) {
  console.error("uso: quorum-verify <package.json> [--anchor-rpc <url>] [--pretty]");
  process.exit(2);
}

let raw: Buffer;
let pkg: unknown;
try {
  // pnpm --filter ejecuta en apps/verifier; INIT_CWD es el directorio desde el que se lanzó el comando
  raw = readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file));
  pkg = JSON.parse(raw.toString("utf8"));
} catch (e) {
  console.error(`no se pudo leer ${file}: ${(e as Error).message}`);
  process.exit(2);
}

const inputArtifactDigest = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
const result = await verifyPackage(pkg, { anchorRpcUrl, inputArtifactDigest });
process.stdout.write(JSON.stringify(result, null, pretty ? 2 : 0) + "\n");
process.exit(result.valid ? 0 : 1); // snarkjs deja workers vivos: salir explícitamente
