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
| T14 | (D-21) Un organizador malicioso aprueba duplicados a mano (una misma persona con varias credenciales prestadas pasa como "gemelo") | La excepción solo existe con credencial del evento (credencial distinta y de un solo uso); revisión solo en `registration`; tope de 10 pendientes por votación y 3 revisiones nuevas por IP cada 10 min; las pendientes se rechazan solas al abrir; **el número de aprobaciones manuales es público** (`manualApprovals.count` en el paquete, mostrado por el verificador) | **Parcial**: detectable, no evitable. El organizador ya controla quién entra al padrón (T-A4); esta vía le da otra forma de hacerlo, pero visible en el conteo público: si `count` es alto frente a `joined`, el escrutinio merece sospecha. La revisión no guarda con quién coincidió ni la similitud (A3) | `reviews.test.ts`, `review.real.spec.ts` |
| T15 | (D-21) Usar la revisión como oráculo o vía masiva (muchas credenciales + el mismo rostro para saturar al organizador o colarse) | 202 idéntico para cualquier coincidencia, sin similitud ni con quién; tope por votación (al llenarse → 409 normal); rate limit por IP; la plantilla del pendiente sí cuenta para el dedupe de los siguientes | Sí, dentro del modelo demo (el descriptor lo manda el cliente: A4) | `reviews.test.ts` (tope, rate limit) |
| T16 | (D-22, modo continuo) Deducir el voto de quien vota temprano: con pocos inscritos en la raíz de su prueba, el conjunto de anonimato es pequeño | No se aceptan boletas cuya raíz tenga < K miembros (`minAnonymitySet`, por defecto 5, en `manifestHash`; `ANONYMITY_SET_TOO_SMALL` en el adaptador, `anonymity_set_min` en el verificador); `groupSize` por boleta publicado y recomputado; mínimo y mediana en el centro de transparencia | **Parcial**: K acota el peor caso (1 de 5), no lo elimina; quien vota antes se esconde entre menos personas. Declarado en `unsupportedGuarantees` (`anonimato-variable-en-modo-continuo`) y KNOWN_LIMITATIONS § 2 bis | adapter `continuous.test.ts`; verifier `continuous.test.ts` (K no alcanzado → fallo) |
| T17 | (D-22) Correlación por tiempo: el servidor ve cuándo se completa cada inscripción y cuándo llega cada boleta; el ledger publica el orden | Ninguno criptográfico. El ledger no guarda voterId ni horas; `votedAt` sigue con granularidad de día; durante `open` no se publican entradas (C3) | **No** frente al servidor del organizador (ni frente a quien observe la red). Declarado en `unsupportedGuarantees` (`correlacion-temporal-en-modo-continuo`) | — |
| T18 | (D-22) Raíces manipuladas: el organizador acepta una boleta contra un grupo que nunca existió, contra una raíz vieja fuera de la ventana, o reescribe `rootAfter` / `groupSize` | `root_history` recomputa la secuencia de raíces desde los `member_added` con el `Group` de Semaphore y exige raíz anterior a la boleta, dentro de las últimas `rootWindow`; `group_root` exige `rootAfter` recomputado y `commitments` = secuencia | **Sí** | verifier `continuous.test.ts` (raíz inventada, fuera de ventana, `groupSize` falso, `rootAfter` alterado) |
| T19 | (D-22) Carrera inscripción ↔ voto (raíz cambia entre generar y enviar la prueba) | Inscripciones y votos bajo el mismo lock `engine:`; ventana de 32 raíces; `stale_root` → el cliente rehace la prueba sola | **Sí** (hasta 32 inscripciones durante la generación de la prueba) | backend `continuous.test.ts` (concurrencia) |
