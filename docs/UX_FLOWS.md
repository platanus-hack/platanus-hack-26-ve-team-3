# Flujos UX de Quórum

Cada pantalla declara sus estados `loading / vacío / error / éxito`. Rutas según `docs/API_CONTRACT.md`. Código en `apps/web/src/app/**` y `apps/web/src/components/**`.

## 1. Votante móvil — `/j/[roomCode]` y `/v/[token]` (flujo simple)

Quien escanea el QR ya sabe de qué va la votación. **Inscripción en 2 pantallas, voto en 1.** Nunca se muestran en el flujo principal "wallet", "firma", "EIP-712", "Semaphore", "credencial", "nullifier", "commitment", "Kernel" ni "on-chain": se habla de "vincular este teléfono", "tu voto" y "comprobante". Todo lo técnico (modo de vinculación con su etiqueta **demo**, dirección, commitment, nullifier, hash) vive en el desplegable **"Detalles técnicos"**. Texto base 18 px, un solo botón primario por pantalla, objetivos ≥ 56 px, una mano a 360 px. Componentes: `components/voter/VoterFlow.tsx` (+ `Consent`, `FaceCapture`, `BallotScreen`, `VoteReceiptCard`, `VoterUi`) y `components/room/RoomJoin.tsx`. Capturas: `docs/screenshots/phase2/flujo-simple-*-360.png`.

| Pantalla | Qué ve | API | Estados |
|---|---|---|---|
| **Paso 1 de 2** — `/j/<código>` | Título, "Tu nombre o apodo", una línea de consentimiento ("Usamos tu cámara para comprobar que eres una persona y que no te inscribes dos veces. No guardamos fotos. Al tocar Continuar, aceptas.") + "Más detalles" (texto completo honesto), botón **Continuar** | `GET /api/rooms/:code`, `POST /api/rooms/:code/join` → `/v/<token>` | loading · sala no encontrada · nombre inválido (`role="alert"`) · 429 espera · llena / cerrada / expirada / votación abierta → modo observador · retomar ("Ya entraste desde este teléfono") |
| **Paso 1 de 2** — `/v/<token>` (invitación directa) | Igual, sin campo de nombre (ya viene de la invitación). Si llegó por `/j`, se salta: ya aceptó allí | `GET /api/invite/:token` | loading · error con reintentar |
| **Paso 2 de 2** — rostro (`FaceCapture`, `dynamic ssr:false`) | Cámara a pantalla completa, óvalo guía y **una instrucción a la vez**: "Mira a la cámara" → "Parpadea" / "Gira un poco la cabeza" → "Quédate quieto…" → "Comprobando…". Captura y avance **automáticos** al pasar `face.real`/`face.live` (sin botón de captura) | `POST /api/face/enroll` (dedupe 1:N) | sin permiso → instrucciones iPhone/Android + **Intentar de nuevo** + **Solo quiero mirar** · sin cámara · **rostro duplicado** → "Este rostro ya está inscrito en esta votación." + Solo quiero mirar |
| Paso 2 — "Vinculando este teléfono…" | Barra de progreso; en segundo plano: wallet (Kernel o `eoa-demo`), firma `FaceBinding`, identidad Semaphore cifrada con la clave del dispositivo, commitment | `POST /api/voters/:id/wallet`, `POST /api/voters/:id/identity` | error → "No pudimos vincular este teléfono" + Intentar de nuevo (el rostro ya comprobado se guarda para no repetir la cámara si recarga) |
| "¡Listo! Ya estás inscrito." | "Deja esta página abierta: la votación aparecerá aquí cuando empiece." Polling cada 5 s; al abrir pasa sola a la boleta, vibra y suena si el navegador lo permite; Wake Lock mientras espera | `GET /api/invite/:token` | Detalles técnicos: modo de vinculación (demo), dirección, commitment |
| **Voto** — boleta (`BallotScreen`) | Opciones como botones grandes (≥ 56 px, `role="radio"`); tocar una muestra abajo un único **"Votar: <opción>"** (esa es la confirmación). 5 opciones sin scroll a 360×740. Sin volver a la wallet: la inscripción se abre con la clave del dispositivo | `GET /roll`, `POST /vote {proof}`, `POST /voted` aparte | "Enviando tu voto…" · ya votó (409) → comprobante · fuera del padrón → mensaje simple |
| Comprobante (`VoteReceiptCard`) | Check grande, **"Tu voto fue contado"** (o "recibido" si aún no está incluido), "Ver resultados en vivo" y "Comprobar mi voto" (usa el nullifier por debajo: `/e/:id?comprobar=1#mi-voto` comprueba sin otro toque) | — | nunca muestra la opción; el nullifier, posición, hash y estado van en Detalles técnicos |
| Otras fases | Votación cerrada → "La votación terminó" + Ver resultados · abierta sin inscripción en este teléfono → observador · ya votó (otro navegador) → "Ya votaste" con la fecha · rostro comprobado en otro teléfono → "Ya empezaste en otro teléfono" | | |

Toques medidos (`e2e/voter-taps.spec.ts`, 360×740): **inscripción 2** (enfocar el campo + Continuar) + escribir el nombre + permitir la cámara; **voto 2** (opción + Votar).

## 2. Resultados en vivo — `/e/[id]/live`
`LiveDashboard`: `GET /elections/:id` (título, `layout` si viene) → `GET /layout` (si falla, layout por defecto por `kind`) → `GET /tally` cada 3 s (pausa si la pestaña no es visible). Badge "Layout: servidor | por defecto".
Estados: loading · error sin datos (`ErrorState`) · error con datos previos (aviso ámbar "mostrando el último dato") · `count: null` → "Desglose oculto hasta 5 votos" · elección cerrada (countdown dice "Cerrada").

## 3. Centro de transparencia — `/e/[id]`
Agregados, manifiesto (hash, tipo, protocolo, fechas, opciones), elegibilidad (quién certificó, padrón, prueba de vida demo), límites conocidos; botones a vivo, auditor y descarga del paquete.
Estados: loading · error (no encontrada) · sin agregados · fixture (si el id es el de la elección demo y la API no responde, se muestra el fixture con `FixtureTag`).

## 4. Organizador
### `/org/new` — wizard 3 pasos (`ElectionWizard`)
1. Pregunta y opciones (título, descripción, tipo, 2–10 opciones, apertura/cierre). Validación inline.
2. Participantes (nombre + teléfono opcional E.164; pegar lista "Nombre, +58…"). Validación de teléfonos.
3. Revisar y publicar: resumen + checkbox de reconocimiento (demostración, padrón = lista, verificador decide). Progreso textual: crear → registrar participantes → publicar. Redirige a `/org/[id]`.
APIs: `POST /elections` → `POST /voters` → `POST /publish`. Los `inviteUrl` devueltos se guardan en `localStorage` del organizador (el contrato no expone GET de participantes).

### `/org/[id]` — panel (`OrgPanel`)
Tarjetas: participación (polling 5 s mientras está abierta), cierre (botón "Cerrar elección" con confirmación irreversible → `POST /close`), paquete de auditoría (`GET /artifacts` como descarga + link al auditor). Invitaciones: selector de canal `dry-run | wame`, "Enviar invitaciones" → `POST /invites`; lista de links para copiar/abrir con estado por participante; alerta fija "el envío real (kapso/meta) requiere aprobación". Sección "Agregar participantes".
Estados: loading · error · vacío (sin participantes en este navegador) · sin agregados.

## 5. Auditor — `/audit`
1. Cargar paquete: por id (`GET /elections/:id/artifacts`) o subir JSON (≤20 MB). Se muestra SHA-256 local del JSON cargado.
2. "Verificar escrutinio" → `POST /api/audit/verify { package }` → `AuditChecklist`.
Estados: vacío (sin paquete) · verificando (live region) · error del verificador ("no se puede afirmar nada") · resultado: `verificado` sólo si `valid === true`; `fallo detectado` si algún check falla; `no verificable` si no evaluó nada (p. ej. `verifier-not-integrated`). Descarga JSON del `AuditResult` + hash local.

## 6. Laboratorio de ataques — `/audit/lab`
1. Paquete original (id, archivo o **fixture** etiquetado).
2. Alteración sobre una **copia profunda en memoria**: `Total alterado` (+1 al primer conteo), `Artefacto ausente` (elimina el primer artefacto de evidencia), `Manifiesto incorrecto` (cambia el hash o un campo del manifiesto). Se muestra ruta, antes/después y SHA-256 de la copia; se puede descargar.
3. "Verificar ambos": original y copia al mismo verificador; dos `AuditChecklist` lado a lado.
Estados: vacío · sin copia · verificando · error parcial (uno de los dos no respondió) · sin veredicto.

## 7. Landing — `/`
Hero "Tu decisión es privada. El resultado es verificable." + subtítulo de la spec; CTAs "Explorar una elección demo" (`/e/<NEXT_PUBLIC_DEMO_ELECTION_ID | fixture>`) y "Crear votación"; tres pilares Votar / Verificar / Auditar; tarjetas "Qué sí prometemos / Qué no prometemos".

## Accesibilidad transversal
Skip link, `lang="es-VE"`, focus visible, live regions, labels reales, errores sin color exclusivo, objetivos ≥44px, `prefers-reduced-motion`, tema claro/oscuro.

## Pendientes / preguntas a backend
- `voteNonce` debe ser bytes32 hex (si no, el cliente lo normaliza con keccak256 y lo avisa en pantalla).
- Falta `GET /api/elections/:id/voters` (o similar) para que el panel no dependa del `localStorage`.
- Ruta "continuar sin prueba de vida": el servidor decidirá si acepta el nonce local; la UI ya avisa que puede rechazarlo.
- Revisión visual con Playwright a 360/768/1440 pendiente de que exista el backend para capturar pantallas con datos.
