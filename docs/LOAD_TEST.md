# Prueba de carga — sala de 60 personas contra Render (simulación)

- **Fecha:** 2026-10-24, 14:39:26 → 14:41:07 hora de Caracas (UTC−4). **Una sola corrida** contra la instancia real.
- **Destino:** `https://quorum-sefw.onrender.com` (Render Standard, 1 instancia, Next.js + API, store JSON en disco `/var/data`; delante hay Cloudflare: `server: cloudflare`, `cf-cache-status: DYNAMIC`).
- **Commit desplegado:** `1345299` (`origin/integration/phase2`). Antes de empezar, el deploy respondía 502 (seguía construyéndose); se hizo polling a `/` cada 15 s hasta recibir 200.
- **Generador:** `apps/web/scripts/load-test.ts` (`pnpm --filter @quorum/web load:test`), desde un solo equipo (Apple M5 Pro, Caracas). Enlace del cliente: una descarga sola de `faceres.bin` (7 MB) dio 3,8 MB/s.
- **Comando:** `npx tsx --tsconfig tsconfig.json scripts/load-test.ts --voters 60 --concurrency 20 --pollers 20 --out run1.json --package-out run1-pkg.json`
- **Contenido:** elección ficticia `el_c9c1d1a1eb37c7dc` "Prueba de carga (simulación)", sala `SGRUYF`, 60 votantes "Simulado N", descriptores faciales sintéticos (1024 floats gaussianos aleatorios: coseno ≈ 0 entre sí), wallets EOA efímeras (`eoa-demo`, FaceBinding EIP-712 con dominio `Quorum/1/84532`), identidades Semaphore generadas en el proceso. Sin personas ni datos reales.

## Escenario
1. Organizador: `POST /api/elections` → `publish` → `POST /room` (maxSeats 80, 15 min).
2. 20 "proyectores/teléfonos" haciendo polling cada 2 s durante toda la corrida (5 por endpoint): `GET /room`, `GET /tally`, `GET /voters` (conteos públicos), `GET /e/:id/live` (HTML SSR).
3. Estáticos: 60 "teléfonos" × 12 archivos (`/models/*` 10 archivos, `/zk/*` 2 archivos), concurrencia 20, `cache-control: no-cache`.
4. Inscripción (concurrencia 20): `POST /rooms/:code/join` → `GET /v/:token` (HTML) → `GET /api/invite/:token` → `POST /face/enroll` → `POST /voters/:id/wallet` → `POST /voters/:id/identity`.
5. `POST /open` → `GET /roll` → 60 pruebas Semaphore pre-generadas en local (8,1 s, **fuera de la medición**) → **ráfaga: 60 `POST /vote` a la vez** → 10 reenvíos de doble voto.
6. `POST /close` (con ancla en Base Sepolia) → `GET /audit` → `GET /artifacts` → verificador CLI local → `POST /draw` → `GET /draw`.

**Rate limit por IP:** el servidor limita por el primer valor de `x-forwarded-for`. Los 60 joins se enviaron primero **sin** cabecera propia (todos desde la IP de este equipo, como un wifi de evento); los rechazados se reintentaron con una `x-forwarded-for` distinta por teléfono, y el resto de fases usó una por teléfono (simula IPs distintas, p. ej. datos móviles).

## Resultados por endpoint (ms, medidos desde el cliente: incluyen red Caracas ↔ Virginia)

| Endpoint | n | Estados | p50 | p95 | p99 | máx | req/s |
|---|---:|---|---:|---:|---:|---:|---:|
| POST /api/elections | 1 | 201 | 112 | 112 | 112 | 112 | – |
| POST /publish | 1 | 200 | 138 | 138 | 138 | 138 | – |
| POST /room | 1 | 201 | 171 | 171 | 171 | 171 | – |
| POST /rooms/:code/join (IP compartida) | 60 | **30×201, 30×429** | 149 | 372 | 376 | 376 | 13,7 |
| POST /rooms/:code/join (reintento con IP propia) | 30 | 30×201 | 248 | 437 | 445 | 445 | 12,8 |
| GET /v/:token (HTML) | 60 | 200 | 358 | 745 | 759 | 759 | 13,5 |
| GET /api/invite/:token | 60 | 200 | 118 | 284 | 288 | 288 | 15,7 |
| POST /api/face/enroll | 60 | 201 | 342 | 572 | 660 | 660 | 14,5 |
| POST /api/voters/:id/wallet | 60 | 200 | 228 | 418 | 483 | 483 | 14,8 |
| POST /api/voters/:id/identity | 60 | 201 | 202 | 459 | 494 | 494 | 15,7 |
| POST /open | 1 | 200 | 162 | 162 | 162 | 162 | – |
| GET /roll | 1 | 200 | 91 | 91 | 91 | 91 | – |
| **POST /vote (ráfaga de 60 simultáneos)** | 60 | 60×201 | **4037** | **5242** | 5362 | 5362 | 11,2 |
| POST /vote (doble voto) | 10 | 10×409 `already_voted` | 166 | 207 | 207 | 207 | – |
| POST /close (tally + ancla + paquete + verifyPackage) | 1 | 200 | 3728 | 3728 | 3728 | 3728 | – |
| GET /audit | 1 | 200 | 138 | – | – | 138 | – |
| GET /artifacts (75 kB) | 1 | 200 | 121 | – | – | 121 | – |
| POST /draw | 1 | 200 | 2644 | – | – | 2644 | – |
| GET /draw | 1 | 200 | 99 | – | – | 99 | – |
| poll GET /room | 244 | 200 | 123 | 389 | 904 | 1577 | 2,5 |
| poll GET /tally | 245 | 200 | 120 | 329 | 992 | 1410 | 2,5 |
| poll GET /voters (conteos) | 243 | 200 | 120 | 386 | 1320 | 1618 | 2,5 |
| poll GET /e/:id/live (HTML) | 244 | 200 | 175 | 646 | 943 | 1536 | 2,5 |
| static /models/* | 600 | 200 | 433 | 7865 | 17880 | 53122 | 8,7 |
| static /zk/* | 120 | 200 | 1364 | 4391 | 10475 | 12250 | 1,9 |

**Total:** 2168 peticiones · **0 respuestas 5xx · 0 timeouts · 0 errores de red.**

## Fases

| Fase | Tiempo | Nota |
|---|---:|---|
| Estáticos (60 teléfonos × 12 archivos, conc. 20) | 70,4 s | **897,1 MB** servidos (642,8 MB modelos + 254,3 MB ZK) → 12,7 MB/s agregados; TTFB p50 134 ms / p95 423 ms (modelos), 126 / 206 ms (ZK) |
| Inscripción de 60 (join→enroll→wallet→identity, conc. 20) | 5,4 s | 60/60 inscritos; 30 joins 429 con IP compartida (reintentados con IP propia) |
| Ráfaga de 60 votos simultáneos | 5,36 s | 60/60 incluidos; primera respuesta a +1,78 s, luego ~61 ms por voto en serie (mediana entre respuestas 47 ms) |
| Doble voto (10 reenvíos) | – | 10/10 → 409 `already_voted` |
| Cierre | 3,7 s | `auditable`; ancla tx `0x0e185305c1279f61042ea52b30beb2506878f98a51a520a8012a378c8d9c4919` (Base Sepolia, vía QuorumRegistry `0x64E7…8Be13`) |
| Verificador CLI local sobre el paquete descargado | 0,9 s | exit 0, `valid=true`; `anchor_matches: no evaluado` (sin `BASE_SEPOLIA_RPC` en el equipo de prueba); en el servidor `anchor_matches: verificado` |
| Sorteo | 2,6 s | N=2 (ganó "2 proyectos": 10/30/20 votos), ganadores `p-05`, `p-06` |

Latencia de los pollers por ventana (todos los endpoints de polling juntos):

| Ventana | n | p50 | p95 | máx |
|---|---:|---:|---:|---:|
| Durante estáticos | 702 | 139 | 434 | 1410 |
| Durante inscripción | 57 | 153 | 409 | 525 |
| **Durante la ráfaga de votos** | 52 | 157 | **1536** | 1618 |
| Durante cierre/sorteo | 79 | 110 | 179 | 190 |

## Hallazgos

### 1. Bloqueante para el evento: rate limit por IP con la sala en un mismo wifi (medido)
`rateLimit` usa el primer valor de `x-forwarded-for`. Topes: join 30/min, `face/enroll`, `wallet`, `identity` y `vote` **20/min por IP** (`apps/web/src/app/api/**/route.ts`).
- **Medido:** de 60 joins desde una sola IP, **30 recibieron 429** (exactamente el tope de 30/min).
- **Deducido del código (no medido en esta corrida):** si los 60 teléfonos salen por la misma IP pública (wifi del evento con NAT), en enroll/wallet/identity entrarían 20 por minuto, y en la ráfaga de voto **40 de 60 recibirían 429**. La inscripción de 60 pasaría de ~5 s a ≥ 3 minutos, con errores visibles en los teléfonos.
- **Arreglo mínimo (implementado en esta rama, con test):** `QUORUM_RATELIMIT_SCALE` (multiplicador de todos los topes por IP; por defecto 1, sin cambio de comportamiento). Para el evento, en el dashboard de Render: `QUORUM_RATELIMIT_SCALE=5` (100/min en enroll/wallet/identity/vote) y `ROOM_JOIN_RATE_PER_MIN=200`. Sin desplegar código, la alternativa inmediata es `QUORUM_RATELIMIT=off` durante la presentación. Los controles reales no dependen del rate limit: `maxSeats`, `inviteToken` por paso, nullifier contra doble voto (10/10 → 409 medido).
- **Nota de seguridad (medida):** los 30 reintentos con una `x-forwarded-for` inventada entraron (201): el tope por IP se evade enviando esa cabecera, porque Cloudflare/Render la reenvían y el servidor toma el primer valor. Para un rate limit que no se pueda evadir habría que usar `cf-connecting-ip` o el último salto de confianza; no lo cambié (afecta la política de seguridad: decisión de seguridad/organizador).

### 2. Ráfaga de votos: verificación en serie (medido, no bloqueante)
`castVote` hace `appendBallot` (verificación Groth16) y `putEngine` (reescribe `engine.json` completo) dentro de `withLock("engine:<id>")`. Evidencia: 60 votos simultáneos → primera respuesta a +1,78 s y luego ~61 ms por voto en serie; el último tarda 5,36 s. Durante esos 5 s el p95 de los pollers sube de ~400 ms a 1,5 s (el event loop está ocupado). En local (M5 Pro) la verificación Groth16 de esas mismas 60 pruebas cuesta 5,2 ms de media (140 ms la primera, carga de la clave de verificación); el resto del costo en Render es CPU más lenta y la persistencia del store, que serializa y escribe **toda** la colección `engine` (todas las elecciones que hay en el disco) en cada voto. No puedo separar ambas partes sin instrumentar el servidor.
- Para 60 personas no hace falta arreglarlo: en la vida real los votos no llegan todos en el mismo milisegundo y 5 s en el peor caso es aceptable.
- Si se quisiera más margen (≫ 100 votantes): verificar la prueba Groth16 **fuera** del lock (es pura) y dejar en el lock solo raíz/nullifier/append; y persistir `engine` por elección (un archivo por elección) en vez de la colección entera. No implementado.

### 3. Estáticos pesados: ~15 MB por teléfono, sin caché en el borde (medido)
897,1 MB para 60 teléfonos en 70,4 s (12,7 MB/s agregados) con TTFB p50 ~130 ms: el servidor empieza a responder rápido; el tiempo total lo domina el ancho de banda (la cola p99 de 17,9 s y el máximo de 53 s son descargas de `faceres.bin`, 7 MB, compitiendo por el enlace). No puedo atribuir el límite de 12,7 MB/s al servidor o al enlace de este equipo (una descarga sola dio 3,8 MB/s). Cloudflare responde `cf-cache-status: DYNAMIC`: **no cachea** `/models` ni `/zk` aunque llevan `immutable`, así que cada teléfono los baja desde la instancia de Render. En el evento el cuello de botella probable es el wifi del lugar: 60 × 15 MB ≈ 0,9 GB; a 50 Mbit/s reales serían ~2,4 min si todos entran a la vez. Recomendación: pedir al público que abra el enlace al principio (el service worker y `immutable` evitan repetir la descarga), o servir `/models` y `/zk` desde una CDN. No implementado.

## Veredicto
- **Servidor Render Standard: fluido para 60 personas.** 0 errores 5xx y 0 timeouts en 2168 peticiones; inscripción de 60 en 5,4 s con p95 < 0,6 s por paso; ráfaga de 60 votos completa en 5,4 s (60/60 incluidos, 10/10 dobles votos rechazados); cierre + ancla en 3,7 s; paquete verificado en el servidor y con el CLI local.
- **No hace falta subir a Pro.** El único punto lento (la ráfaga de voto) está serializado por diseño (un lock por elección), así que más CPUs no lo acelerarían; con 60 personas no molesta.
- **Antes de la presentación sí hay que tocar la configuración:** con todos en el mismo wifi el rate limit por IP rechazaría la mitad de los joins (medido) y 40 de 60 votos (deducido del código). Poner `QUORUM_RATELIMIT_SCALE=5` + `ROOM_JOIN_RATE_PER_MIN=200` (requiere desplegar esta rama) o `QUORUM_RATELIMIT=off` durante la demo.
- Lo que no cubre esta prueba: teléfonos reales (Human + generación de la prueba en el móvil), el wifi del lugar y varias IPs reales a la vez.
