/**
 * Compila contracts/QuorumRegistry.sol con solc-js (versión fijada en package.json) y escribe:
 *  - contracts/build/QuorumRegistry.json  (abi, bytecode, deployedBytecode, metadatos de compilación)
 *  - packages/wallet/src/registry-artifact.ts (ABI `as const` + bytecode para viem)
 * Uso: pnpm --filter @quorum/wallet compile:contracts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRegistry } from "../src/compile";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const out = compileRegistry(repoRoot);
const buildDir = path.join(repoRoot, "contracts/build");
mkdirSync(buildDir, { recursive: true });
writeFileSync(path.join(buildDir, "QuorumRegistry.json"), JSON.stringify(out, null, 2) + "\n");

const ts = `/* Generado por packages/wallet/scripts/compile-contracts.ts — NO editar a mano. */
/* Fuente: contracts/QuorumRegistry.sol · solc ${out.compiler.version} · optimizer ${out.compiler.optimizerRuns} runs · evm ${out.compiler.evmVersion} */
export const registryAbi = ${JSON.stringify(out.abi, null, 2)} as const;

export const registryBytecode = "${out.bytecode}" as const;

export const registrySourceSha256 = "${out.sourceSha256}" as const;
`;
writeFileSync(path.join(repoRoot, "packages/wallet/src/registry-artifact.ts"), ts);
console.log(`QuorumRegistry compilado con solc ${out.compiler.version}: bytecode ${(out.bytecode.length - 2) / 2} bytes, ABI ${out.abi.length} entradas.`);
