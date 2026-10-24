# Research 02 — Smart wallets embebidas, prueba de vida facial y unicidad humana

Fecha de consulta: 2026-10-24. Lo marcado **[NO VERIFICADO]** es hipótesis.

## 0. Sanciones (leer antes de elegir proveedor)
- Venezuela **no** es jurisdicción bajo sanciones comprehensivas de OFAC (programa *targeted*: SDN + sector petrolero/gobierno; desde enero 2026 OFAC relaja con licencias generales). Ningún ToS leído nombra a Venezuela; todos dicen "países bajo sanciones comprehensivas" (Cuba, Irán, Corea del Norte, Siria, Crimea/Donetsk/Luhansk).
- Eso no impide geo-bloqueo por IP (decisión comercial). **Prueba obligatoria en las primeras 2 h: registrarse y hacer 1 llamada API de Privy, ZeroDev y CDP desde IP venezolana sin VPN.** Usar VPN viola ToS de thirdweb, Dynamic y Turnkey.
- Fuentes: https://quinnsights.quinnemanuel.com/post/102mfcu/ofac-issues-new-general-license-authorizing-venezuelan-origin-oil-transactions · https://www.foley.com/insights/publications/2026/08/ofac-reaffirms-recent-licenses-along-with-new-license-in-response-to-venezuela-earthquakes/

## A. Smart wallets embebidas (comparativa)
| Proveedor | Login sin wallet | Custom auth / server-side para enlazar a rostro | Gas Base Sepolia | Free tier | ToS Venezuela | Integración |
|---|---|---|---|---|---|---|
| **Privy** | Email OTP, SMS, passkey, social, JWT | Sí, pero custom auth requiere "Request access" (riesgo en 30 h) | Smart wallets Kernel/Safe/etc.; paymaster externo (ZeroDev/Pimlico/Alchemy gratis en testnet) | 499 MAU, 50K firmas/mes | No la bloquea (AUP 16-dic-2025) | 2–4 h |
| **Coinbase CDP Embedded Wallets** | Email, SMS, OAuth **o JWT propio** (self-serve, JWKS) | Sí | CDP Paymaster nativo en Base Sepolia | 5.000 ops/mes | **[NO VERIFICADO]** (ToS 403); Coinbase consumidor no opera en VE | 3–5 h |
| Base Account | Passkey | No | ERC-7677 | n/a | mismo paraguas Coinbase | No encaja |
| **ZeroDev** (Kernel) | No es auth; cuenta 4337 + bundler/paymaster | Sí si el signer es nuestro | Sandbox $0 = solo testnet, 10.000 créditos (~500 userOps) | $0 sandbox | No la bloquea (ToS 29-sep-2026) | 2–3 h |
| thirdweb in-app | Email, phone, social, passkey, JWT custom | Sí | 1.000 tx patrocinadas | Contradicción docs vs pricing ($99/mes) | No la bloquea | 3–4 h |
| Dynamic | Email, SMS, social, passkey | BYO auth = Enterprise | Sí | Sin plan gratis prod | Prohíbe VPN | Descartado |
| Turnkey | Email, phone, passkey o custodial por app | Nativo (sub-org por usuario) | Sin paymaster | 100 wallets, **25 tx/mes** | Prohíbe VPN | Descartado por cuota |
| Alchemy Account Kit | — | **v4 deprecado**; recomienda Privy como signer | Gas Manager gratis en testnets | Free | No la bloquea | Solo como paymaster/bundler |
| Para (ex Capsule) | Email, phone, passkey | **Pregenerated wallets con `CUSTOM_ID`** (modelo ideal) | vía AA | 1.200 MAU; pregen quizá en Starter $200 **[NO VERIFICADO]** | Sin lista de países | 4–6 h |

### Recomendación principal: Privy (email/SMS) + smart wallet Kernel vía Privy + paymaster ZeroDev Sandbox en Base Sepolia
Único con free tier real, SDK Next.js maduro, smart wallets integradas (`useSmartWallets().client.signTypedData`), y no dependemos de que aprueben custom auth.

Enlace rostro→wallet a nivel de aplicación:
1. Invitación WhatsApp → `/vote/<electionId>?invite=<token>`.
2. Login Privy (email/SMS OTP) → crea EOA embebida + smart wallet Kernel.
3. Antes de habilitar "Votar": enrolamiento/verificación facial (sección B). Guardamos `userId (Privy DID) → smartWalletAddress → faceTemplateRef`.
4. Al votar, la smart wallet firma EIP-712 con un `nonce` emitido tras el liveness; el servidor verifica ERC-1271/6492 y consume el nonce.
5. Si Privy aprueba custom auth, pasar a flujo server-side (backend emite JWT tras match → `custom_user_id`).

```bash
pnpm add @privy-io/react-auth @privy-io/node viem permissionless
# opcional, control directo de Kernel:
pnpm add @zerodev/sdk @zerodev/ecdsa-validator
```
```
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_SECRET=                 # solo servidor
ZERODEV_PROJECT_ID=
NEXT_PUBLIC_ZERODEV_RPC=https://rpc.zerodev.app/api/v3/<PROJECT_ID>/chain/84532   # verificar formato en dashboard
NEXT_PUBLIC_CHAIN_ID=84532
BASE_SEPOLIA_RPC=https://sepolia.base.org
```
Dashboard Privy: Smart wallets → Kernel (ZeroDev) → Base Sepolia → URL ZeroDev como bundler y paymaster.
```tsx
import {PrivyProvider} from '@privy-io/react-auth';
import {SmartWalletsProvider} from '@privy-io/react-auth/smart-wallets';
<PrivyProvider appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!} config={{loginMethods:['email','sms'], embeddedWallets:{ethereum:{createOnLogin:'users-without-wallets'}}}}>
  <SmartWalletsProvider>{children}</SmartWalletsProvider>
</PrivyProvider>
```
(Nombres a verificar: la página de configuración de smart wallets devolvió 404.)

### Respaldo: Coinbase CDP Embedded Wallets con JWT propio + smart account + CDP Paymaster
Match facial OK → backend firma JWT RS256 (`sub = userId`) → `authenticateWithJWT()` → CDP crea la wallet. `pnpm add @coinbase/cdp-react @coinbase/cdp-hooks @coinbase/cdp-core jose`. Riesgo: geo-bloqueo del Portal CDP desde Venezuela no verificado.

### Plan C: clave por usuario generada en servidor (viem `generatePrivateKey`, cifrada) + Kernel ZeroDev + paymaster Sandbox. Custodial; etiquetarlo así ("custodia delegada para la demo").

Fuentes: https://www.privy.io/pricing · https://privy.io/acceptable-use-policy · https://docs.privy.io/authentication/user-authentication/jwt-based-auth/setup · https://docs.privy.io/recipes/wallets/server-side-user-wallets · https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/usage · https://docs.cdp.coinbase.com/embedded-wallets/custom-authentication · https://docs.cdp.coinbase.com/paymaster/introduction/welcome · https://www.zerodev.app/pricing · https://docs.zerodev.app/sdk/signers/privy · https://portal.thirdweb.com/wallets/custom-auth · https://docs.getpara.com/v3/react/guides/pregen · https://docs.pimlico.io/guides/pricing

## B. Verificación facial / liveness

### Por qué no se puede "hashear el rostro"
Un modelo produce un **embedding** (vector de floats, 128-d en face-api.js, 1024-d en Human) distinto en cada captura; dos capturas de la misma persona dan vectores *cercanos* bajo un umbral, nunca idénticos. Un hash destruye esa cercanía. Los fuzzy extractors son investigación, no SDK. Arquitectura honesta: **match 1:1 contra template enrolado con umbral**; la wallet se deriva de la cuenta (`userId`), el rostro solo la desbloquea. Biometría nunca on-chain ni en logs.

| Opción | 1:1 | Guarda | Precio | SDK | Venezuela |
|---|---|---|---|---|---|
| **@vladmandic/human** (MIT, local) | descriptor 1024 floats; `human.match.similarity` | tú (DB cifrada) | $0 | npm, WebGL/WASM | n/a |
| face-api.js | 128-d, euclídea ~0,6 | tú | $0 | tfjs | superseded por Human |
| MediaPipe Tasks | sin FaceEmbedder; landmarks útiles para liveness activa casera | — | $0 | `@mediapipe/tasks-vision` | n/a |
| **Didit** | liveness pasiva + face match 1:1 | Didit | **500 bundles/mes gratis sin tarjeta** | Web SDK | 220+ países |
| AWS Rekognition Face Liveness + CompareFaces | Amplify `FaceLivenessDetector` | S3 tuyo | $0,015/check; sin free tier (créditos $200) | React | No bloquea [no verificado] |
| Azure Face | Limited Access, solo clientes gestionados | — | — | — | Inviable |
| Regula / Sumsub / Veriff / Persona / iProov / FacePhi / Incode / BioID | enterprise/trial | — | mín. $49–149/mes o cotización | — | Veriff mostró geo-bloqueo |
| FaceIO | widget enroll/authenticate | motor externo | free 1.000 usuarios; anti-spoof desde Pro $39 | JS | — |

### Recomendación demo: Human local etiquetado "Prueba de vida — modo demo"
1. `pnpm add @vladmandic/human`; copiar `node_modules/@vladmandic/human/models` a `apps/web/public/models`.
2. Config `face:{detector:{rotation:true}, mesh:{enabled:true}, description:{enabled:true}, antispoof:{enabled:true}, liveness:{enabled:true}}` (nombres de módulos a confirmar en la wiki).
3. Liveness activa visible: "gira la cabeza / parpadea" con landmarks (vistoso en demo).
4. Enrolamiento: 3 capturas → promedio → `POST /api/face/enroll` → DB cifrada ligada al `userId`.
5. Verificación: descriptor → `POST /api/face/verify` → distancia vs template, umbral conservador (calibrar) → emite `voteNonce` de 2 min.
6. Pitch: "Hoy: match 1:1 local + anti-spoof heurístico, sin biometría en terceros. Producción: liveness certificada (Didit 500/mes gratis o AWS) con el mismo contrato `userId → walletAddress`." Tener Didit configurado como opción B (solo cambia `/api/face/verify`).

Fuentes: https://github.com/vladmandic/human/wiki/Embedding · https://didit.me/pricing · https://aws.amazon.com/rekognition/pricing/ · https://learn.microsoft.com/en-us/legal/cognitive-services/computer-vision/limited-access-identity · https://faceio.net/pricing

## C. Unicidad humana (next step del pitch)
| Opción | Qué es | Venezuela |
|---|---|---|
| **World ID** (IDKit v4) | nullifier único por (usuario, rp, action) → anti doble voto; `POST developer.world.org/api/v4/verify/{rp_id}` | Orbs en AR/CL/CO/MX/PE/EC/GT/DO; **VE no aparece** [no verificado] |
| **Self.xyz** | pasaporte NFC → prueba ZK; `@selfxyz/enterprise-sdk`; mock passport gratis | cobertura VE [no verificado] |
| Humanode Biomapper | unicidad biométrica on-chain EVM | app Humanode requerida |
| **Rarimo / Freedom Tool** | ZK passport NFC, votos en L2; usado por oposición en **Rusia (2024)** y **Georgia (United Space, 2024)**, piloto Irán (Jomhoor). **No hay evidencia de uso en Venezuela: no afirmarlo.** | pasaporte VE es ICAO → compatible técnicamente |
| Zupass | tickets PCD de eventos | no aplica |

Frase para el pitch: "Quórum v2: el votante prueba con su pasaporte (NFC + ZK, misma primitiva que Freedom Tool en Georgia y Rusia) que es un ciudadano único mayor de edad sin revelar quién es; el nullifier reemplaza la verificación facial."

## D. Firma del voto: EIP-712 + verificación ERC-1271/6492 con viem
`publicClient.verifyTypedData` cubre EOAs, contratos (1271), cuentas no desplegadas (6492) y 7702. https://viem.sh/docs/actions/public/verifyTypedData
```ts
export const domain = { name: 'Quorum', version: '1', chainId: 84532, verifyingContract: '0x0000000000000000000000000000000000000000' } as const;
export const types = { Vote: [
  { name: 'electionId', type: 'bytes32' }, { name: 'choice', type: 'uint8' },
  { name: 'voter', type: 'address' }, { name: 'nonce', type: 'bytes32' }, { name: 'expires', type: 'uint64' } ] } as const;
// cliente
const { client } = useSmartWallets();
const signature = await client!.signTypedData({ domain, types, primaryType: 'Vote', message });
// servidor
const pc = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC) });
const valid = await pc.verifyTypedData({ address: message.voter, domain, types, primaryType: 'Vote', message, signature });
```
Antes de verificar: `walletOf(userId) === message.voter`, consumir `nonce`, comprobar `expires`. Si no hay contrato, dirección cero y firmas off-chain, anclando el hash de la urna en Base Sepolia al cierre (momento visual de demo).

## Riesgos
1. Geo-bloqueo práctico (probar hoy sin VPN). 2. Privy custom auth gated → enlazar a nivel app. 3. Embedding = dato biométrico: cifrar, borrar al cerrar, consentimiento, nunca on-chain; Venezuela sin ley general de datos (habeas data art. 28 CRBV, TSJ 1318/2011 [no verificado]). 4. Cuotas: ZeroDev ~500 userOps, Privy 499 MAU. 5. Deprecaciones: Alchemy AK v4, Base Account renombrado. 6. No decir que Freedom Tool se usó en Venezuela.

No verificado: ToS CDP (403), ToS Pimlico (404), página de config de smart wallets Privy (404), World App/Self para documentos venezolanos, free tier pregen de Para, nombres de módulos antispoof/liveness de Human.
