# Flujos UX de Quórum

Cada pantalla declara sus estados `loading / vacío / error / éxito`. Rutas según `docs/API_CONTRACT.md`. Código en `apps/web/src/app/**` y `apps/web/src/components/**`.

## 1. Votante móvil — `/v/[token]`

Stepper de 6 pasos (`Invitación → Tus datos → Prueba de vida → Wallet → Boleta → Comprobante`). Componente: `components/voter/VoterFlow.tsx`.

| Paso | Qué ve | API | Estados |
|---|---|---|---|
| Invitación (`InviteStep`) | Badge "Invitado de demostración — voto privado", título, tipo, cierre, estado, si la invitación ya votó | `GET /api/invite/:token` | loading (skeleton) · error (`ErrorState` con reintentar / ir al inicio) · elección no abierta (alerta ámbar, botón deshabilitado) · ya votó (alerta info) |
| Tus datos (`IdentityStep`) | Nombre + consentimiento explícito "modo demo, no certificada; no guardamos tu imagen" | — | validación inline con `role="alert"` |
| Prueba de vida (`LivenessStep`, `dynamic ssr:false`) | Cámara en vivo, indicador rostro/acción/capturas, acción aleatoria (parpadear o girar), 3 descriptores promediados | `POST /api/face/enroll` → `voteNonce` | cargando modelos · iniciando cámara · buscando rostro · acción · capturando (n/3) · registrando · error (sin cámara / permisos / modelos) con **"Continuar sin prueba de vida (demo)"** que etiqueta la limitación y genera un nonce local |
| Wallet | Con `NEXT_PUBLIC_PRIVY_APP_ID`: `PrivyShell` + `PrivyWalletStep` (login email/SMS, smart wallet, `client.signTypedData`). Sin él: `DemoWalletStep` con etiqueta "Wallet demo local (sin Privy)" (viem, clave en `sessionStorage`) | `POST /api/voters/:id/wallet` | conectando · sin sesión · wallet ya enlazada en otra sesión (ámbar, bloquea) · error de enlace |
| Boleta (`BallotStep`) | Radio group 2–10 opciones → pantalla de confirmación → envío. Firma EIP-712 (`VoteTypedDataDomain` + `chainId` + `verifyingContract` 0x0, `VoteTypes`). `ballotCommitment = keccak256("electionId|optionId|nonce")`. Cuerpo: `SignedVote` + `plainChoice` | `POST /api/elections/:id/vote`; polling `GET /receipt/:inclusionId` cada 3 s (máx. 10) | `preparando → enviando → recibido → incluido` con `StatusPill` y live region · error (reintentar) · aviso si se saltó la prueba de vida · nota si el nonce no era bytes32 |
| Comprobante (`ReceiptCard`) | `inclusionId`, estado, fechas, copiar, link al centro de transparencia y a resultados en vivo | — | nunca muestra la opción |

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
