# Modelo de amenazas de Quórum

> **`release_blocked: true`.** Hay 5 hallazgos críticos (escrutinio y privacidad), detallados en §8. Uno está **demostrado con código**: si se reenvía la prueba pública de otro votante escribiendo su `nullifier` con un cero delante, el adaptador la acepta como voto nuevo y el verificador dice `valid:true` con el total inflado. Dos más están en el **diseño del Contrato v1**, que se está implementando ahora; hay que corregirlos antes de escribir ese código.

- **Autor:** quorum-seguridad (red team). **Dueño humano:** José (área Protocolo).
- **Fecha:** 2026-10-24, ~12:00 VET (H+5).
- **Base revisada:** rama `docs/seguridad` = `origin/integration/h3` @ `567e997`: `packages/protocol-adapter`, `apps/verifier`, `apps/web/src/app/api/**`, `apps/web/src/lib/{server,client}/**`, `packages/contracts`, `packages/notify`, `docs/API_CONTRACT.md` (v0 y v1), `docs/DECISIONS.md` (D-01..D-12), `docs/ADR-001-voting-engine.md`, `research/01..04`.
- **Importante:** la fase 2 (fases `registration → open → … → drawn`, voto con prueba Semaphore, sorteo, smart wallet) **todavía no tiene commits** en `origin/wip/phase2-*`. Los hallazgos sobre v1 se refieren al **diseño** de `docs/API_CONTRACT.md` §"Contrato v1"; los que se refieren a v0 se refieren al código que hoy está en `integration/h3`.
- **Qué no es este documento:** no es una auditoría de seguridad ni una certificación. Es el modelo de amenazas de un MVP de hackathon para **votaciones internas de bajo riesgo** (spec §0, §12).

---

## 1. Qué protegemos (activos)

| # | Activo | Dónde vive hoy | Propiedad que importa |
|---|---|---|---|
| AC1 | **Opción elegida por cada persona** | v0: `ballots.json` (`choice` en claro, `store.ts:30`). v1: `proof.message` en claro en el ledger (`ballot.ts:12`) | Que no se pueda ligar a la identidad (rúbrica: "no exponer deliberadamente la elección individual") |
| AC2 | **Integridad del escrutinio**: ledger, tally y paquete `quorum-audit/1` | `packages/protocol-adapter/src/{ledger,audit-package}.ts`; `GET /artifacts` | Que el total publicado salga de las boletas incluidas y que cualquiera pueda recontarlo |
| AC3 | **Padrón** (`commitments[]`, `groupRoot`) | v1: se congela en `POST /open` | Solo entran personas invitadas y cada una una sola vez |
| AC4 | **Descriptor facial (embedding)**: dato biométrico | `faceTemplates.json` cifrado con AES-256-GCM (`face.ts:64-70`) | Que no salga del servidor, que se borre y que no se ligue a la opción |
| AC5 | **PII del censo**: `displayName`, `phoneE164`, `inviteToken` | `voters.json` (`elections.ts:107-118`) | Que no se publique y que el token (credencial bearer) no se filtre |
| AC6 | **Claves**: Semaphore (navegador), signer de la wallet (navegador), `FACE_KEY`, `ORGANIZER_PRIVATE_KEY`, `KAPSO_*` | `localStorage`/`sessionStorage`, `.env` | Que nunca estén en git, en la DB ni en logs |
| AC7 | **Sorteo verificable** (`seed`, `candidates`, `winners`) | v1: `draw.ts`, todavía no existe | Que el organizador no pueda elegir el resultado |
| AC8 | **Ancla on-chain** `{finalHash, groupRoot, tallyHash}` | `anchor.ts`; sin tx real todavía | Que no se pueda cambiar el paquete después de cerrar |

## 2. Actores

| Actor | Qué puede hacer de verdad | Qué quiere |
|---|---|---|
| **Organizador malicioso** | Es el **único escritor** del ledger y del padrón; opera el servidor y la DB; ve cada `message` en claro; decide el orden de las boletas; firma el ancla; elige cuándo cerrar | Cambiar el total, meter o quitar votantes, ver quién votó qué, manipular el sorteo |
| **Votante doble / votante saboteador** | Tiene **un** `inviteToken` legítimo; puede llamar la API directamente (sin la UI), mandar descriptores faciales inventados y pruebas Semaphore con codificación rara | Votar dos veces, registrarse dos veces o invalidar la elección |
| **Servidor comprometido** (atacante con acceso a disco/logs/env, o un empleado de la plataforma) | Lee `.data/*.json`, logs y variables de entorno; puede reescribir respuestas de la API | Ligar identidad y opción, extraer biometría, robar tokens |
| **Observador** (cualquier persona en Internet, otro vecino en la asamblea) | Lee todo lo público: `/tally`, `/ledger`, `/voters` (v1), `/artifacts`, el ancla on-chain; puede consultar cada 2 s; ve quién tiene el teléfono en la mano | Saber cómo votó una persona concreta |
| **Jurado que altera una copia** | Edita el JSON del paquete descargado (laboratorio `/audit/lab`) y se lo pasa al verificador | Ver si el verificador detecta la manipulación con una causa concreta |
| Atacante externo sin invitación | Llama a endpoints sin autenticación; manda WhatsApp al número de Kapso | Meterse en el padrón, cerrar elecciones ajenas |
| Frontend falso (A6) | Clona la UI y muestra "verificado" | Convencer de un resultado que no se verificó |
| Proveedores (RPC, paymaster ZeroDev, Kapso/Meta, AI Gateway) | Ven metadatos (IP, wallet, teléfono, hora) | Fuera de nuestro control; se documenta |

## 3. Superficies de ataque (estado real del código en `567e997`)

| Ruta | Auth | Zod | Rate limit | Observación de seguridad |
|---|---|---|---|---|
| `POST /api/elections` | **ninguna** | sí | 20/min/IP | `organizerId: "demo-organizer"` fijo (`elections.ts:44`) |
| `POST /api/elections/:id/publish` | **ninguna** | — | **no** | cualquiera publica cualquier elección |
| `POST /api/elections/:id/voters` | **ninguna** | sí | 30/min/IP | **devuelve `inviteToken` al que llama** (`elections.ts:122-124`) → hallazgo C4 |
| `POST /api/elections/:id/invites` | **ninguna** | sí | 10/min/IP | dry-run escribe en el log el nombre y la URL con el token (`notify/src/index.ts:55`) |
| `POST /api/elections/:id/close` | **ninguna** | — | **no** | cualquiera cierra cualquier elección |
| `POST /api/face/enroll` | `inviteToken` | sí | 20/min/IP | guarda el embedding cifrado y nunca lo borra |
| `POST /api/face/verify` | **solo `voterId`** | sí | 30/min/IP | devuelve la `similarity` exacta (oráculo) → hallazgo A3 |
| `POST /api/voters/:id/wallet` | `inviteToken` | sí | 20/min/IP | v0 sin firma de la wallet; v1 añade `FaceBinding` |
| `POST /api/elections/:id/vote` | nonce + firma EIP-712 | sí | 20/min/IP | v0 guarda `choice` y `votedAt == receivedAt` → hallazgo C5 |
| `GET /api/elections/:id/tally` | pública | — | — | `s-maxage=2`; desglose desde 5 votos |
| `GET /api/elections/:id/artifacts` | pública | — | — | sin PII directa |
| `POST /api/audit/verify` | pública | sí | 30/min/IP | hoy devuelve `verifier-not-integrated` (honesto) |
| `POST /api/webhooks/kapso` | HMAC | parcial | **no** | el opt-in `QUORUM <id>` **crea votantes** (`kapso.ts:96-121`) → hallazgo A6 |
| v1 `GET /voters`, `GET /ledger`, `POST /open`, `POST /draw`, `POST /identity` | sin definir | — | — | ver C2, C3, A5, A7 |

Rate limit: en memoria y por instancia, con la clave tomada del primer valor de `X-Forwarded-For` (`ratelimit.ts:6-9`). En Vercel no es global y fuera de Vercel se falsifica.

## 4. Amenazas y controles

Las amenazas A1..A7 son las de la spec §2. Las T8..T13 salen de D-09..D-12 y de esta revisión. "Test" se refiere a `docs/ADVERSARIAL_TESTS.md` (casos AT-xx).

| # | Amenaza | Control actual | ¿Lo cubre? | Test |
|---|---|---|---|---|
| A1 | El organizador edita la cifra final publicada | `tally_matches` recuenta desde el ledger (`verify.ts:226-244`) | **Sí**, si el ledger es íntegro | `tampered_total.json` (AT-06) |
| A1' | Total inflado "consistente": se reenvía una prueba con el `nullifier` escrito de otra forma | ninguno | **No: hallazgo C1** | AT-03b (falta) |
| A2 | Se elimina o altera un registro | `chain_integrity` + `proofs_valid` | Sí, si no rehacen la cadena; **con la cadena rehecha, solo el ancla o el recibo del votante** | `tampered_proof`, `removed_record`, `removed_record_rechained` (AT-01, AT-02) |
| A3 | Una persona vota dos veces | `nullifier` por credencial y elección; `DOUBLE_VOTE` (`ledger.ts:63`), `nullifiers_unique` | **Solo con nullifier en forma canónica: hallazgo C1** | `double_vote.json` (AT-03a), AT-03b falta |
| A3' | Una persona se inscribe dos veces (dos invitaciones o el opt-in de Kapso) | v1: dedupe facial 1:N con umbral | **Débil**: el descriptor lo manda el cliente (A4); el control real es una invitación por persona en el censo | AT-07b (falta) |
| A4 | Alguien no elegible vota | prueba de pertenencia al `groupRoot` | Sí frente a la prueba; **no frente a quien mete gente en el padrón**: los endpoints no tienen auth (C4) ni lo tiene el opt-in (A6) | adapter "no elegible" + AT-09 (falta) |
| A5 | Deducir el voto de una persona a partir de lo público | desglose solo desde 5 votos | **No** en v1: ledger en vivo con `message` en claro + estado por votante público (C3); `txHash` on-chain (C2) | AT-10 (falta) |
| A6 | Un sitio falso muestra "verificado" | verificador en el navegador/CLI sobre el paquete descargado | Parcial: protege a quien verifica por su cuenta; no hay firma del paquete ni dominio fijado | — |
| A7 | El coordinador no entrega o no finaliza | no hay coordinador; si falta el ancla/RPC, `anchor_matches` queda "no evaluado" | Parcial: `passed:true` con `reason` "no evaluado" (`verify.ts:250-259`); la UI tiene que mostrarlo (M2) | test "sin RPC" en `verifier.test.ts` |
| T8 | El organizador manipula el sorteo | v1: `seed = keccak256(finalHash)` | **No**: el organizador puede reordenar o retener boletas para elegir semilla, y los `candidates` no están en el manifiesto (A5) | AT-05 (falta) |
| T9 | Fuga o abuso del dato biométrico | AES-256-GCM en reposo; sin imágenes | **Parcial**: no se borra nunca, `face/verify` funciona como oráculo, la clave dev es adivinable (A2, A3, M6) | §8 |
| T10 | La FaceBinding se firma con otra wallet o se reenvía | v1: EIP-712 `FaceBinding{electionId, voterId, faceBindingHash, wallet}` | Por diseño sí; **sin implementar** | AT-07 (falta) |
| T11 | Se cambia el padrón después de abrir | `groupRoot` congelado; `WRONG_ROOT` | Sí en el adaptador; la API v1 está por hacer | AT-04 |
| T12 | Un votante saboteador invalida la elección entera | ninguno | **No: hallazgo A1** (`message` en hex) | AT-03c (falta) |
| T13 | Robo de credenciales del dispositivo (XSS, acceso físico) | claves en `localStorage`/`sessionStorage` | No (es demo); está documentado | — |

## 5. Qué garantiza el sistema (y bajo qué supuestos)

Lenguaje para docs, UI y pitch. **Cada frase tiene un test detrás o no se dice.**

**Lo que sí se puede afirmar hoy (Plan A, `semaphore-ledger`), una vez cerrados C1 y A1:**
1. **Elegibilidad sin revelar quién vota:** cada boleta lleva una prueba Semaphore v4 de pertenencia al padrón publicado (`groupRoot`), y esa prueba no dice qué miembro la generó. *Supuesto:* el padrón lo arma el organizador; el verificador comprueba que la raíz sale de los commitments publicados, **no** que esos commitments sean personas reales y distintas.
2. **Una boleta por credencial y por elección:** el `nullifier` es determinista por (credencial, elección) y la segunda boleta se **rechaza**. *Hoy falla con `nullifier` no canónico (C1).*
3. **Integridad del registro:** cadena SHA-256 desde un génesis ligado a `electionId`, `scope` y `groupRoot`.
4. **Recuento reproducible:** cualquiera recuenta el ledger y lo compara con el tally publicado. Es un **recuento**, no una prueba criptográfica del escrutinio.
5. **Inmutabilidad del total, solo con ancla y RPC:** si el ancla se publicó antes y el verificador la lee de un RPC en el que confía.
6. **El verificador falla con una causa concreta** en las 7 manipulaciones de los fixtures (`docs/TEST_RESULTS.md`; re-ejecutado: `pnpm --filter @quorum/verifier test` → 10/10 en verde, 2026-10-24T15:59Z).

**Lo que NO garantiza (y no se dice en ninguna pantalla ni en el pitch):**
- **No es voto secreto frente al servidor:** el servidor ve cada opción en claro (`message`). Sabe *qué* se votó; la prueba solo oculta *quién*. Esto se pierde del todo si se implementa v1 tal como está escrito (C2, C3).
- **No es anonimato fuerte:** no hay protección frente a metadatos (IP, hora, orden, quién tenía el teléfono en la mano, logs de proveedores). Tampoco frente a un organizador que cruza tiempos de su propia DB.
- **No resiste coacción ni compra de votos:** quien tenga la clave Semaphore del votante (o el propio votante) puede demostrar cómo votó, y la clave vive en `localStorage`.
- **"Una persona = un voto" no está garantizado:** la prueba de vida es una **demo** que corre en el cliente; el servidor recibe un vector que cualquiera puede fabricar. Lo que limita el doble registro es **el censo de invitaciones**, no el rostro.
- **No verifica identidad civil**, cédulas ni documentos.
- **No da completitud del ledger sin ancla:** una boleta eliminada con la cadena rehecha solo la detecta su votante con el recibo.
- **No prueba que el sorteo sea justo** mientras siga abierto T8.
- **No sirve para elecciones públicas o gubernamentales** (spec §12). Prohibido: "100% seguro", "imposible de manipular", "voto secreto", "anónimo", "ZK del escrutinio", "end-to-end verificable", "la blockchain garantiza", "un voto por persona", "verificación de identidad".

## 6. Mitigaciones propuestas y riesgo residual

| Riesgo | Mitigación propuesta | Riesgo residual tras mitigar |
|---|---|---|
| C1 replay con nullifier no canónico | Canonicalizar todos los campos de la prueba (decimal sin ceros a la izquierda, `< r` del campo BN254) en `appendBallot` y en el verificador; deduplicar por `BigInt(nullifier)` | Bajo |
| A1 sabotaje con `message` en hex | El adaptador rechaza codificaciones no canónicas (`INVALID_ENCODING`); el verificador informa la boleta concreta en lugar de rechazar el paquete entero | Bajo |
| C2 `txHash` on-chain liga wallet ↔ opción | Quitar `onchain.txHash` de `/vote`; no emitir `Cast(electionId, commitment)` desde la wallet del votante. Si se quiere on-chain: el **servidor/relayer** publica `finalHash` periódicamente o la prueba (nullifier + message) desde una cuenta común | Medio: metadatos de red |
| C3 ledger en vivo + estado público por votante | `/ledger` sin `message` hasta el cierre (solo `idx, nullifier, hash`); `/voters` solo para el organizador; la gráfica en vivo se actualiza por lotes de ≥5 votos nuevos | Medio: en una asamblea presencial con pocas personas, el orden y la hora siguen filtrando |
| C4 endpoints del organizador sin auth | Secreto de organizador (`orgToken` devuelto al crear, guardado como hash, enviado en `Authorization: Bearer`) en publish/open/voters/invites/close/draw; rate limit en todos | Bajo para la demo; en producción, auth real |
| C5 join elector↔opción en v0 | Eliminar la ruta `integrity-demo` (`plainChoice`) al integrar v1; no guardar `votedAt` con precisión de ms; borrar nonces usados | Bajo |
| A2 retención biométrica | Borrar `faceTemplates` de la elección al pasar a `open` (el 1:N solo hace falta durante `registration`); nunca en paquete, logs ni on-chain | Bajo: queda la ventana de inscripción |
| A3 oráculo en `face/verify` | Exigir `inviteToken`; responder solo `ok`; limitar intentos por `voterId` | Bajo |
| A4 dedupe 1:N burlable | Presentarlo como "fricción de demo", no como garantía; el control es el censo | **Alto, aceptado y declarado** |
| A5 sorteo manipulable | Meter `candidates` (ordenados) y la regla de `N` en el manifiesto antes de `open`; semilla = `keccak256(finalHash ‖ blockhash(H))` con `H` fijado en el manifiesto y posterior al cierre; el ancla, antes del sorteo | Bajo-medio |
| A6 opt-in Kapso crea votantes | El opt-in solo **reenvía** el enlace a teléfonos que ya están en el censo; no crea votantes | Bajo |
| Ancla sin comprobar el emisor | Fijar la dirección del organizador en el manifiesto y comprobar `tx.from` y `tx.to` | Bajo |

---

## 7. Fuera de alcance (no se mitiga en el MVP)

Coacción familiar o laboral, phishing de enlaces de invitación, malware en el dispositivo, análisis de tráfico, censura de conectividad, DDoS, identidad civil, fraude del emisor del censo, compra de credenciales, trusted setup de Semaphore (ceremonia PSE) y bugs de `snarkjs`/`circom`, honestidad del RPC del ancla, disponibilidad de ZeroDev/Kapso/AI Gateway. Coincide con la spec §2.

---

## 8. Revisión de PII y biometría, y hallazgos del código

Orden: crítico → alto → medio → bajo. "Evidencia" es `archivo:línea` en `567e997` o la línea del contrato v1. "Demostrado" quiere decir que se ejecutó código contra el adaptador o el verificador reales; los scripts eran temporales y no se versionaron (ver AT-03b y AT-03c para reproducirlos).

### Críticos (bloquean el release o el claim)

**C1. Doble voto e inflado del tally con un `nullifier` no canónico (demostrado).**
- *Evidencia:* `packages/protocol-adapter/src/ledger.ts:63` deduplica por igualdad de **string** (`e.proof.nullifier === proof.nullifier`), y `ledger.ts:58-64` no valida el formato de los campos. `apps/verifier/src/verify.ts:19` acepta decimales con ceros a la izquierda (`/^\d+$/`) y `verify.ts:215-222` también deduplica por string. `verifyProof` de Semaphore convierte a BigInt, así que `"0"+nullifier` y `"0x…"` verifican.
- *Ejecución (2026-10-24, sobre `valid.json`):* `verifyProof({...p, nullifier:"0"+p.nullifier})` → `true`; `appendBallot` → **ACEPTADA** (4 boletas con 3 votantes); paquete reconstruido → `verifyPackage` → **`valid:true`, ningún check falla, `counts:[1,3,0]`**.
- *Impacto:* en v1 el ledger es público (`GET /ledger`), así que **cualquier observador** puede reenviar cualquier prueba ya publicada con `0`, `00`, `000`… delante y sumar votos sin límite, y el verificador lo da por bueno. Es un fallo de escrutinio.
- *Fix:* en `appendBallot` y en el verificador, exigir `^(0|[1-9]\d*)$` en `nullifier`, `message`, `scope`, `merkleTreeRoot` y `points[]`, con cada valor `< 21888242871839275222246405745257275088548364400416034343698204186575808495617`, y deduplicar por `BigInt(x).toString()`. Lo mismo en el Zod del `POST /vote` v1. *Dueño:* quorum-crypto. *Test:* AT-03b.

**C2. El Contrato v1 liga la wallet (y con ella la persona) a la opción a través del `txHash` on-chain.**
- *Evidencia:* `docs/API_CONTRACT.md:80`: `POST /vote { proof, onchain?: { txHash } }` y verifica el evento `Cast(electionId, commitment)`; `docs/DECISIONS.md:14` (D-11): "cada voto envía su compromiso on-chain por UserOp".
- *Impacto:* la petición de voto lleva juntas la prueba (con `message` = opción) y una tx firmada por la smart wallet del votante que emite **su commitment**. El servidor ya tiene `commitment → voterId → wallet → faceBinding` (`API_CONTRACT.md:76-77`). Resultado: **identidad → opción** en una sola petición, y además en público en Base Sepolia (wallet + hora). Esto anula la única propiedad de privacidad que da Semaphore.
- *Fix:* quitar `onchain` de `/vote` y no emitir `Cast(…commitment)` al votar. Si se quiere actividad on-chain, que la haga el servidor o un relayer: `finalHash` cada N boletas o al cierre (el ancla que ya existe). La UserOp del votante solo puede servir en la **inscripción** (registrar el commitment), nunca al votar. *Dueños:* quorum-backend y quorum-crypto (carril wallet). *Test:* AT-10.

**C3. El ledger en vivo con `message` en claro, junto con el estado público por votante, desanonimiza a cualquier observador.**
- *Evidencia:* `docs/API_CONTRACT.md:81` (`GET /ledger` público durante `open`); `API_CONTRACT.md:71` (`GET /voters` con `displayName`, `state:"voted"` y `walletAddress`, sin auth definida); D-09 (todo en tiempo real).
- *Impacto:* consultando `/voters` y `/ledger` cada pocos segundos, un observador ve que "Ana pasó a `voted`" y que "entró la boleta #7 con `message=2`" → Ana votó la opción 2. Ni siquiera hace falta comparar agregados: es exacto boleta por boleta. También choca con la regla dura 3 ("nunca publicar listas nominales").
- *Fix:* durante `open`, `/ledger` devuelve solo `{idx, nullifier, hash}` y el `message` se publica al cerrar (el votante comprueba su inclusión con el nullifier, que no revela la opción). `/voters` solo con el token del organizador y sin `displayName`/`walletAddress` en ninguna vista pública (lo público es `registeredCount`/`votedCount`). La gráfica en vivo se refresca por lotes (≥5 votos nuevos o cada 60 s). *Dueño:* quorum-backend (+ quorum-frontend para la UI en vivo). *Test:* AT-10.

**C4. Los endpoints del organizador no tienen autenticación: cualquiera mete votantes en el censo y cierra elecciones.**
- *Evidencia:* `apps/web/src/app/api/elections/[id]/voters/route.ts:6-9` y `apps/web/src/lib/server/elections.ts:122-124` (la respuesta trae `inviteToken` e `inviteUrl`); `…/publish/route.ts:5`, `…/close/route.ts:5`, `…/invites/route.ts:10` no comprueban quién llama; `elections.ts:44` `organizerId: "demo-organizer"`.
- *Impacto:* un tercero hace `POST /voters` con 50 nombres, recibe 50 tokens, completa la prueba de vida con vectores inventados, enlaza wallets y vota (v0), o registra 50 commitments antes de `/open` (v1). El verificador no puede detectarlo porque el padrón es un supuesto de confianza. También puede cerrar la elección de otro en mitad de la demo. Rompe A4 y la spec §9 ("autorización organizador").
- *Fix:* `POST /elections` devuelve un `organizerToken` aleatorio (se guarda `sha256`); `publish/open/voters/invites/close/draw` exigen `Authorization: Bearer` con comparación en tiempo constante; rate limit en `publish`/`close`. *Dueño:* quorum-backend. *Test:* AT-09.

**C5. v0 (`integrity-demo`, lo que hoy corre en `integration/h3`): la DB propia permite reconstruir elector → opción.**
- *Evidencia:* `apps/web/src/lib/server/vote.ts:111-113,121`: `Voter.votedAt` y `Ballot.receivedAt` son **el mismo string ISO**, y `Ballot.choice` va en claro (`vote.ts:120`). Además, `apps/web/src/lib/client/vote.ts:33-35` usa como `ballotCommitment` `keccak256(electionId|optionId|nonce)`, y `store.ts:35-42` guarda `nonce → voterId`: con la DB se prueban todas las opciones y se recupera la de cada votante aunque se quitara `choice`.
- *Impacto:* quien tenga acceso a `.data/` (organizador o servidor comprometido) saca la lista nominal de votos. Viola la regla dura 3 y el punto 3 del DoD de la spec.
- *Fix:* al integrar v1, **borrar** la ruta `plainChoice`/`integrity-demo` y el `ballotCommitment` derivado del nonce; no guardar `votedAt` con precisión de milisegundos (como mucho un booleano); borrar los nonces consumidos. Mientras v0 siga desplegado, la UI no puede decir "voto privado". *Dueño:* quorum-backend. *Test:* AT-10 (parte v0).

### Altos

**A1. Un votante puede invalidar la verificación de toda la elección (demostrado).** `ledger.ts:58-69` acepta `message:"0x1"` (la prueba verifica); el tally del adaptador lo cuenta como inválido (`ledger.ts:86`) y el verificador rechaza el paquete entero en `package_schema` (`verify.ts:23`). *Ejecución:* boleta #0 con `message` en hex → `adapterTally {counts:[1,1,0], invalid:1}` → `verifyPackage` → `valid:false`, "ledger.0.proof.message: string decimal". Una elección honesta acaba en `failed` por culpa de una sola persona. *Fix:* el mismo de C1 (rechazar en la entrada con `INVALID_ENCODING`); en el verificador, informar la boleta en `proofs_valid` en lugar de abortar el esquema. *Dueño:* quorum-crypto. *Test:* AT-03c.

**A2. Los embeddings faciales se guardan sin plazo de borrado.** `apps/web/src/lib/server/face.ts:64-70` (`putFaceTemplate`); el `Store` no tiene método para borrarlos (`store.ts:71-72`). El contrato v1 los vuelve a guardar para el 1:N (`API_CONTRACT.md:75`). `research/02:117` ya decía "cifrar, borrar al cerrar". El embedding **es** un dato biométrico: el cifrado lo protege en reposo, pero el servidor tiene la clave. *Fix:* `deleteFaceTemplates(electionId)` al pasar a `open` (en v0, al cerrar); un test que compruebe que `faceTemplates.json` no tiene entradas de la elección después de `/open`; no incluir `faceBindingHash` en el paquete público. *Dueño:* quorum-backend. *Test:* AT-07c.

**A3. `POST /api/face/verify` funciona como oráculo biométrico y no exige `inviteToken`.** `packages/contracts/src/index.ts:53` (`FaceVerifyInput` sin `inviteToken`), `face.ts:76-95` (devuelve `similarity` con 4 decimales). Con un `voterId` (en v1 lo publica `GET /voters`) se puede hacer hill-climbing para aproximar el embedding guardado, o conseguir nonces. *Fix:* exigir `inviteToken`, responder solo `{ok}`, máximo 5 intentos por `voterId`. *Dueño:* quorum-backend.

**A4. La dedupe facial 1:N (D-10) se esquiva llamando a la API.** El descriptor lo calcula el navegador y el servidor lo acepta tal cual (`FaceEnrollInput`, `contracts/index.ts:52`): basta añadir ruido hasta que la similitud baje del umbral de 0,75. *Fix:* no prometer "una persona = una wallet"; decir "la demo rechaza registros duplicados evidentes; la unicidad depende del censo de invitaciones". *Dueños:* quorum-frontend (copy) y quorum-backend. *Test:* AT-07b.

**A5. El organizador puede elegir el resultado del sorteo.** Diseño v1 (`API_CONTRACT.md:70,89`): (a) los `candidates` no están en `ElectionManifest` (`audit-package.ts:9-20`), así que se pueden cambiar después de conocer la semilla; (b) `seed = keccak256(finalHash)` y el organizador controla `finalHash`, porque puede reordenar boletas (`rechain`) o retener la última, y con n boletas tiene n! semillas para elegir. Solo lo descubriría un votante que compare su `idx`/`hash` del recibo. *Fix:* `candidates` ordenados y la regla de `N` (incluido el desempate) en el manifiesto antes de `open`; semilla `keccak256(finalHash ‖ blockhash(H))` con `H` fijado en el manifiesto y posterior al cierre; anclar antes de sortear; `draw_matches` comprueba todo esto. *Dueño:* quorum-crypto. *Test:* AT-05.

**A6. Cualquiera se mete en el censo mandando un WhatsApp.** `apps/web/src/lib/server/kapso.ts:106-121`: `QUORUM <electionId>` desde cualquier número crea un `Voter` nuevo si la elección está en `draft`/`open`. *Fix:* el opt-in solo reenvía el enlace a teléfonos que ya están en el censo (`getVoterByPhone`); nunca crea votantes. *Dueño:* quorum-backend. *Test:* AT-09.

**A7. El Contrato v1 publica una lista nominal.** `API_CONTRACT.md:71` (`displayName` + `walletAddress` + estado). Contradice la regla dura 3 y la spec §2. *Fix:* ver C3. *Dueño:* quorum-backend.

### Medios

| # | Hallazgo | Evidencia | Fix | Dueño |
|---|---|---|---|---|
| M1 | El ancla no comprueba quién la emite: el paquete trae su propio `txHash`, y un falsificador manda su propia tx con el calldata nuevo | `verify.ts:261-271` (no mira `tx.from` ni `tx.to`) | Dirección del organizador en el manifiesto; comprobar `from == to == organizer`; la UI muestra el `txHash` que se conoce por otro canal | quorum-crypto |
| M2 | "No evaluado" cuenta como `passed:true` y el resultado puede salir `valid:true` sin ancla | `verify.ts:250-259` | La UI muestra un estado tripartito (`verificado` / `no evaluado` / `fallo`) a partir de `reason` y `unsupportedGuarantees`; nunca un "verificado" pleno sin ancla | quorum-frontend |
| M3 | No se marcan los commitments duplicados ni el commitment `0` | `verify.ts:149-163`; `identity.ts:29-31` | Check `commitments_unique`; el v1 `/identity` rechaza con 409 un commitment ya inscrito | quorum-crypto, quorum-backend |
| M4 | Texto falso en la UI: "Todo ocurre en tu navegador" (el descriptor se envía y se guarda); el consentimiento no dice que se guarda ni cuándo se borra | `apps/web/src/components/voter/LivenessStep.tsx:158`; `IdentityStep.tsx:42` | "Tu cámara se procesa en tu navegador. Enviamos un vector numérico cifrado (no tu foto) para evitar inscripciones duplicadas; se borra al abrir la votación." | quorum-frontend |
| M5 | Antispoof y liveness de Human se cargan pero su resultado no se mira | `human.ts:23-24` activados; `LivenessStep.tsx:91-106` solo mira gestos | Exigir `face.real` y `face.live` por encima de un umbral; aun así, la etiqueta sigue siendo "demo" (spoofing con foto o vídeo posible) | quorum-frontend |
| M6 | `FACE_KEY` de desarrollo derivada de un valor público (`DATA_DIR`) | `face.ts:18-24` | Fallar también fuera de `production` si no hay `FACE_KEY`, o generar una aleatoria por proceso; documentarlo en `.env.example` | quorum-backend |
| M7 | El canal dry-run escribe en los logs el nombre y la URL con el `inviteToken` (credencial) | `packages/notify/src/index.ts:55` | Loguear `inviteUrl` enmascarado (`/v/abcd…`) y sin nombre | quorum-backend |
| M8 | La clave Semaphore y el signer de la wallet viven en `localStorage`/`sessionStorage`: si hay XSS o acceso al dispositivo, se roban y se puede demostrar cómo votó alguien | `API_CONTRACT.md:77`; `apps/web/src/lib/client/wallet.ts:18-26` | CSP estricta (`script-src 'self'`), etiqueta "demo"; documentado como límite de coacción | quorum-frontend |
| M9 | La regla para fijar `N` desde el resultado no cubre empates ni la opción "inválida" | `API_CONTRACT.md:70,89` | Regla en el manifiesto (p. ej. "en empate gana el N menor") y comprobada en `draw_matches` | quorum-crypto |

### Bajos

| # | Hallazgo | Evidencia | Fix | Dueño |
|---|---|---|---|---|
| B1 | Rate limit en memoria y por instancia; IP tomada de `X-Forwarded-For` (falsificable fuera de Vercel) | `ratelimit.ts:6-9` | Aceptado para la demo; en producción, Vercel Firewall o KV | quorum-backend |
| B2 | Se puede inscribir la cara en `draft` y en `open` (en v1 debería ser solo en `registration`) | `face.ts:60` | Restringir por fase al implementar v1 | quorum-backend |
| B3 | La ruta "Continuar sin prueba de vida" genera un nonce local que el servidor rechaza: experiencia confusa (no es un hueco de seguridad) | `LivenessStep.tsx:144,218` | En v1, quitarla o etiquetarla "no podrás votar" | quorum-frontend |

### Lo que está bien (comprobado)
- No hay imágenes en el servidor; solo el embedding (`human.ts`, `LivenessStep.tsx:129-135`).
- `phoneE164` no sale en ninguna respuesta (`publicVoter`, `invite/[token]/route.ts:16`).
- El paquete `quorum-audit/1` no tiene nombres, teléfonos ni claves (`audit-package.ts:57-61`, test en `adapter.test.ts`).
- Los errores nunca escriben el body en el log (`errors.ts:74-76`).
- Ningún secreto en git (`git grep` de claves y tokens sin resultados); `.env*` y `.data/` están en `.gitignore`.
- El layout del LLM solo recibe `{kind, optionCount, durationMin}` y su salida se valida con un enum de Zod (`layout.ts:55-58,84-87`): no puede inventar cifras.
- `POST /api/audit/verify` no finge: devuelve `verifier-not-integrated` (`audit/verify/route.ts:25-30`).

### Claims a retirar o reescribir
- "Todo ocurre en tu navegador" (`LivenessStep.tsx:158`): reescribir (M4).
- "Una persona = una smart wallet, sin duplicados" (D-10): pasar a "evita duplicados evidentes en la demo".
- Cualquier "voto privado/secreto/anónimo": mientras sigan abiertos C2, C3 y C5, decir solo "**la prueba no revela quién emitió cada boleta; el servidor ve el contenido**".
- "Verificado" sin ancla: "verificado (sin ancla on-chain: completitud no evaluada)".
