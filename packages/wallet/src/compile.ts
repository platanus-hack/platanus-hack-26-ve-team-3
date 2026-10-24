/**
 * Compilación de contracts/QuorumRegistry.sol con solc-js. Solo para scripts y tests (Node):
 * no se exporta desde el índice del paquete para no arrastrar solc al bundle del navegador.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const SOLC_SETTINGS = { optimizerRuns: 200, evmVersion: "cancun" } as const;

export type CompiledRegistry = {
  contractName: "QuorumRegistry";
  sourcePath: "contracts/QuorumRegistry.sol";
  sourceSha256: string;
  compiler: { name: "solc-js"; version: string; optimizerRuns: number; evmVersion: string };
  abi: unknown[];
  bytecode: `0x${string}`;
  deployedBytecode: `0x${string}`;
};

export function compileRegistry(repoRoot: string): CompiledRegistry {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const solc = require("solc") as { compile(input: string): string; version(): string };
  const sourcePath = "contracts/QuorumRegistry.sol" as const;
  const source = readFileSync(path.join(repoRoot, sourcePath), "utf8");
  const input = {
    language: "Solidity",
    sources: { [sourcePath]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: SOLC_SETTINGS.optimizerRuns },
      evmVersion: SOLC_SETTINGS.evmVersion,
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: { severity: string; formattedMessage: string }[];
    contracts?: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string }; deployedBytecode: { object: string } } }>>;
  };
  const errors = (output.errors ?? []).filter((e) => e.severity === "error");
  if (errors.length) throw new Error("solc: " + errors.map((e) => e.formattedMessage).join("\n"));
  const c = output.contracts?.[sourcePath]?.QuorumRegistry;
  if (!c) throw new Error("solc no produjo QuorumRegistry");
  return {
    contractName: "QuorumRegistry",
    sourcePath,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    compiler: { name: "solc-js", version: solc.version(), optimizerRuns: SOLC_SETTINGS.optimizerRuns, evmVersion: SOLC_SETTINGS.evmVersion },
    abi: c.abi,
    bytecode: `0x${c.evm.bytecode.object}`,
    deployedBytecode: `0x${c.evm.deployedBytecode.object}`,
  };
}
