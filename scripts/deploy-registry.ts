/**
 * Despliega contracts/QuorumRegistry.sol en Base Sepolia con viem.
 *
 *   ORGANIZER_PRIVATE_KEY=0x… BASE_SEPOLIA_RPC=https://sepolia.base.org \
 *     pnpm --filter @quorum/wallet deploy:registry
 *
 * Requiere una clave de testnet con ETH de faucet (docs/WALLETS.md). Sin clave sale con código 1
 * y un mensaje claro, sin tocar la red. La clave solo se lee del entorno y nunca se imprime.
 * Tras desplegar: poner la dirección en NEXT_PUBLIC_REGISTRY_ADDRESS (Vercel/.env.local).
 */
import { checkDeployEnv, deployRegistry } from "../packages/wallet/src/deploy";

async function main() {
  const check = checkDeployEnv(process.env);
  if (!check.ok) {
    console.error(`[deploy-registry] ${check.message}`);
    process.exit(1);
  }
  console.log("[deploy-registry] Desplegando QuorumRegistry en Base Sepolia (84532)…");
  const out = await deployRegistry(check.privateKey, check.rpcUrl);
  console.log(`[deploy-registry] Listo.\n  address:   ${out.address}\n  tx:        ${out.txHash}\n  organizer: ${out.organizer}\n  explorer:  https://sepolia.basescan.org/address/${out.address}`);
  console.log(`  -> NEXT_PUBLIC_REGISTRY_ADDRESS=${out.address}`);
}

main().catch((err) => {
  console.error("[deploy-registry] Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
