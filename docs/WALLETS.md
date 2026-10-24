# Wallets de Quórum — smart wallet gasless (ZeroDev Kernel) en Base Sepolia

Fecha: 2026-10-24 (VET). Lo marcado **[NO VERIFICADO]** no se ha comprobado en vivo desde Venezuela.
Decisiones: D-10, D-11 (`docs/DECISIONS.md`). Contrato: "Smart wallet gasless (cliente)" en `docs/API_CONTRACT.md` v1.

## Qué hay en el repo

| Pieza | Ruta | Qué hace |
|---|---|---|
| Paquete | `packages/wallet` (`@quorum/wallet`) | Crea/recupera la cuenta del votante, firma EIP-712 `FaceBinding`, envía `cast` patrocinado (solo Kernel). |
| Contrato | `contracts/QuorumRegistry.sol` | `cast(electionId, commitment)` y `anchor(electionId, finalHash)` con eventos `Cast(electionId, commitment)` / `Anchored(electionId, finalHash, castCount, organizer)`. `anchor` es `onlyOrganizer`: el `organizer` es quien despliega, se fija en el constructor (inmutable) y va como topic indexado en `Anchored`, para que el verificador compruebe quién ancló (M1). |
| ABI + bytecode | `contracts/build/QuorumRegistry.json`, `packages/wallet/src/registry-artifact.ts` | Generados con `pnpm --filter @quorum/wallet compile:contracts` (solc-js 0.8.38, optimizer 200, evm cancun). Un test falla si el artefacto no coincide con una compilación fresca. |
| Deploy | `scripts/deploy-registry.ts` | Despliega con viem usando `ORGANIZER_PRIVATE_KEY` + `BASE_SEPOLIA_RPC`. Sin clave sale con mensaje claro y código 1. **No se ha desplegado nada.** |
| UI | `apps/web/src/components/voter/WalletStep.tsx` | Paso de wallet de la inscripción: entrega `{ address, signature, mode }` por `onDone`. |

### Modos
- **`kernel`** (si existe `NEXT_PUBLIC_ZERODEV_PROJECT_ID`), etiquetada **"Smart wallet demo"**: smart account Kernel v3.1 (EntryPoint 0.7) con validador ECDSA cuyo signer es una clave generada en el navegador (`localStorage`, clave `quorum.wallet.kernelSigner.v1`). Bundler y paymaster de ZeroDev: el votante no paga gas. La cuenta es contrafactual (se despliega en su primera UserOp); sus firmas antes del despliegue vienen envueltas en ERC-6492 y el servidor debe verificarlas con `publicClient.verifyTypedData` (ERC-1271/6492, requiere `BASE_SEPOLIA_RPC`). `verifyFaceBinding({ ..., publicClient })` del paquete ya hace eso.
- **`eoa-demo`** (sin project id, o si ZeroDev falla al iniciar): EOA de viem con clave efímera en `sessionStorage` (se borra al cerrar la pestaña). Etiquetada "Wallet demo" en la UI. No es smart wallet, no tiene gas y **no** envía `cast` (lanza `CastUnavailableError`): el compromiso queda solo off-chain y así se etiqueta.

### Limitación de custodia (M8)
Las claves de signer (`localStorage` en `kernel`, `sessionStorage` en `eoa-demo`) viven en el navegador del votante, sin cifrar más allá de lo que ofrece el navegador; cualquier script con acceso al origen (XSS, extensión maliciosa) podría leerlas. Por eso **ambos modos llevan la etiqueta "demo" visible** (`MODE_LABEL`, `isDemo: true`) y no se presentan como wallets de producción. No hay frase semilla ni función para exportar o mostrar la clave (un test lo comprueba): si el votante borra datos del sitio o cambia de dispositivo, pierde la wallet y debe re-inscribirse con el organizador. Producción requeriría passkeys/WebAuthn como signer o un proveedor de wallets embebidas con recuperación.

## API de `@quorum/wallet`

```ts
getOrCreateWallet({ projectId, onchainCast? = false, kernelStorage?, demoStorage?, publicRpcUrl?, fallbackToDemo? = true, onFallback? }): Promise<QuorumWallet>
createKernelWallet({ projectId, privateKey, publicRpcUrl? }): Promise<QuorumWallet>
createEoaDemoWallet({ privateKey }): QuorumWallet

type QuorumWallet = {
  mode: "kernel" | "eoa-demo"; address; label; isDemo; created; persisted;
  signTypedData(td): Promise<Hex>;
  signFaceBinding({ electionId, voterId, faceBindingHash }): Promise<{ message, signature }>;
  onchainCast: boolean; // false por defecto (C2)
  sendCast({ registryAddress, electionId, commitment }): Promise<{ userOpHash, txHash, sponsored: true }>; // requiere onchainCast
  sendSponsored({ to, data }): Promise<{ userOpHash, txHash, sponsored: true }>;                         // requiere onchainCast
};
onchainCastEnabled(flag), OnchainCastDisabledError, CastUnavailableError

FaceBindingTypes, faceBindingDomain(chainId), faceBindingTypedData(msg), verifyFaceBinding({ message, signature, publicClient? })
registryAbi, registryBytecode, encodeCast(electionId, commitment), encodeAnchor(electionId, finalHash), electionIdToBytes32(id), toBytes32(v)
resolveWalletMode(projectId), zerodevRpcUrl(projectId, chainId = 84532), loadOrCreateSignerKey(storage, key), memoryStorage()
```

EIP-712 `FaceBinding`: dominio `{ name: "Quorum", version: "1", chainId: 84532, verifyingContract: 0x000…0 }` (igual que el voto), tipos `{ electionId: string, voterId: string, faceBindingHash: bytes32, wallet: address }`. El backend debe usar **exactamente** estos tipos (importarlos de `@quorum/wallet` o copiarlos a `@quorum/contracts` como `FaceBindingTypes`).

On-chain, `electionId` es `keccak256(utf8(electionId))` y `commitment` un bytes32 (hash de entrada del ledger o nullifier Semaphore convertido con `toBytes32`).

## Privacidad: leer antes de activar `cast` on-chain (C2)
**Por defecto desactivado.** `sendCast` y `sendSponsored` lanzan `OnchainCastDisabledError` salvo que la wallet se cree con `onchainCast: onchainCastEnabled(process.env.NEXT_PUBLIC_QUORUM_ONCHAIN_CAST)` y la variable valga exactamente `true`. `NEXT_PUBLIC_QUORUM_ONCHAIN_CAST=false` en `.env.example`. El flujo de voto no debe usarlo por defecto; `WalletStep` nunca lo llama.

- **Correlación por tiempo y orden:** aunque `commitment` fuese opaco, la tx del votante aparece en un bloque con marca de tiempo y el ledger público asigna índices en orden de llegada; comparando ambos se puede asociar la wallet a su entrada del ledger (y a la opción) con alta probabilidad, sobre todo con pocos votantes.
- La transacción revela el remitente (la smart account del votante). Esa dirección está enlazada en el servidor a la inscripción facial del votante.
- Si `commitment` es el nullifier o el hash de una entrada del ledger público que contiene `message` (= índice de la opción), **cualquiera puede unir wallet → nullifier → opción**. Eso rompe el secreto del voto frente al público.
- Por eso `cast` desde la wallet del votante **no debe enviar el nullifier ni el hash de la boleta** mientras el ledger publique la opción junto al nullifier. Alternativas: (a) no enviar `cast` por votante y usar solo `anchor` del organizador al cierre (recomendado para la demo); (b) que un relayer/organizador envíe los `cast` en lote; (c) un `cast` que solo registre "participó" con un valor no relacionable con el ledger. Decisión pendiente de José/crypto; este paquete no decide por el flujo.
- Nada de esto da anonimato ni resistencia a coerción; no afirmarlo.

## Crear la cuenta gratis de ZeroDev (sin VPN)
1. Entrar a https://dashboard.zerodev.app/ y registrarse (email o GitHub/Google). Plan **Sandbox: $0, solo testnets** (https://www.zerodev.app/pricing, consultado 2026-10-24; ~10.000 créditos, del orden de 500 UserOps según research/02). No pide tarjeta. Los ToS de ZeroDev no nombran a Venezuela (research/02). **[NO VERIFICADO]** que el dashboard cargue desde IP venezolana: probar sin VPN; si bloquea, usar el plan B, no una VPN.
2. **Create Project** → nombre `quorum-demo` → red **Base Sepolia**. La red de un proyecto no se cambia después (hay que crear otro).
3. En el proyecto, sección **Gas Policies** → nueva política de patrocinio (p. ej. "sponsor all" para el proyecto, con límite de cantidad por si acaso). **Sin política, el paymaster no patrocina nada** y `sendCast` falla.
4. Copiar el **Project ID** (pestaña del proyecto / RPC). El endpoint que usa el paquete es `https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/84532`; confirmar en la pestaña RPC del dashboard que el formato coincide.
5. Poner `NEXT_PUBLIC_ZERODEV_PROJECT_ID=<id>` en `apps/web/.env.local` y en Vercel (Preview y Production). Es un id público (va al navegador); restringir dominios permitidos en el dashboard si la opción existe.
6. Probar: abrir el paso de wallet; debe salir "Smart wallet · sin gas" con una dirección. Si sale "Wallet demo" con aviso "Smart wallet no disponible", revisar consola.

## Costos
| Concepto | Costo |
|---|---|
| ZeroDev Sandbox (bundler + paymaster en testnet) | $0 |
| Gas de UserOps de votantes en Base Sepolia | $0 (ETH de testnet pagado por el paymaster de ZeroDev) |
| Deploy de `QuorumRegistry` y `anchor` del organizador | ETH de testnet del faucet (valor real $0) |
| RPC público `https://sepolia.base.org` | $0 (con límites de tasa) |

Nada de esto toca mainnet. No hay fondos reales en juego.

## ETH de Base Sepolia (faucet) para el organizador
Fuente: https://docs.base.org/base-chain/tools/network-faucets (consultado 2026-10-24). Cada faucet limita a ~1 reclamo por 24 h.
- **Coinbase Developer Platform** (hasta 0,1 ETH/24 h): https://portal.cdp.coinbase.com/products/faucet — requiere cuenta CDP; acceso desde VE **[NO VERIFICADO]**.
- **Alchemy** (requiere cuenta gratis): https://www.alchemy.com/faucets/base-sepolia
- thirdweb, QuickNode, Chainstack (API key), ethfaucet.com: listados en la misma página.

Pasos: crear una clave **solo de testnet** (p. ej. `cast wallet new` de Foundry o `node -e "console.log(require('viem/accounts').generatePrivateKey())"` desde `packages/wallet`), pedir ETH al faucet para su dirección, guardar la clave en `.env.local` como `ORGANIZER_PRIVATE_KEY` (nunca en git ni en la oficina) y desplegar:

```bash
export ORGANIZER_PRIVATE_KEY=0x…   # clave de testnet
export BASE_SEPOLIA_RPC=https://sepolia.base.org
pnpm --filter @quorum/wallet deploy:registry
# → NEXT_PUBLIC_REGISTRY_ADDRESS=0x…
```

Desplegar gasta ETH de testnet: requiere la aprobación de José (D-07).

## Plan B: Alchemy o Pimlico
Si ZeroDev no carga desde Venezuela o se agota la cuota:
- **Alchemy Gas Manager** (gratis en testnets): crear app en https://dashboard.alchemy.com en Base Sepolia, crear una *Gas Manager policy* y usar su RPC como bundler (`eth_sendUserOperation`) y la policy para `alchemy_requestGasAndPaymasterAndData`. Alchemy Account Kit v4 está deprecado (research/02): usar solo su bundler/paymaster.
- **Pimlico** (https://dashboard.pimlico.io, plan gratis con créditos de testnet **[NO VERIFICADO]**, ToS 404 al consultarlo): bundler + paymaster vía `https://api.pimlico.io/v2/84532/rpc?apikey=…`, compatible con `permissionless`.
- Cambio de código: en `createKernelWallet` sustituir `zerodevRpcUrl(...)` por la URL del proveedor y `paymaster.getPaymasterData` por el cliente de paymaster ERC-7677 del proveedor (viem `createPaymasterClient`). La cuenta Kernel y las firmas no cambian. No implementado aún: hoy el plan B operativo es `eoa-demo` etiquetado.

## Cómo se probó (sin red, sin fondos)
- `packages/wallet/test/wallet.test.ts`: compuerta C2 (`sendCast`/`sendSponsored` rechazados por defecto sin enviar nada; `onchainCastEnabled` solo con `"true"`), etiquetas "demo" y ausencia de API de exportación de clave (M8), modos, recuperación de clave, firma `FaceBinding` verificada offline (EOA) y rechazo al alterar cualquier campo o el chainId, Kernel con el SDK de ZeroDev simulado (`vi.mock`), calldata exacta de `cast`, fallback a demo, `fetch` bloqueado para asegurar cero llamadas de red, validación del entorno de deploy.
- `packages/wallet/test/registry.contract.test.ts`: el contrato corre en un EVM en memoria (`@ethereumjs/evm`): deploy, `cast` + evento, doble `cast` rechazado, `anchor` solo organizador y una vez (evento con `organizer` indexado), `cast` rechazado tras `anchor`, ceros rechazados; y el artefacto del repo coincide con una compilación fresca.
- **No probado:** Kernel real contra ZeroDev (falta project id), verificación ERC-6492 real contra RPC, deploy real.

Fuentes: https://docs.zerodev.app/sdk/core-api/sponsor-gas · https://docs.zerodev.app/wallets/quickstart · https://docs.arbitrum.io/for-devs/third-party-docs/ZeroDev/zero-dev (formato de URL v3) · https://www.dynamic.xyz/docs/smart-wallets/smart-wallet-providers/zerodev (proyecto ligado a una red; política de gas obligatoria) · https://docs.base.org/base-chain/tools/network-faucets · research/02-wallets-identidad.md.
