# Guion de demo — Quórum (3 minutos)

**Lema:** Trust the proof, not the organizer.
**Elección ficticia (D-03, D-12):** "Condominio Los Samanes — ¿Cuántos proyectos vecinales financiamos este trimestre?" Opciones: `1`, `2`, `3`, `4`, `5`. El número ganador N fija cuántos proyectos salen del **sorteo verificable** entre los postulados. Todo es ficticio: condominio, vecinos, proyectos y montos.
**Base técnica:** Contrato v1 (`docs/API_CONTRACT.md`), motor `semaphore-ledger` (`docs/ADR-001-voting-engine.md`), decisiones D-09..D-12 (`docs/DECISIONS.md`).
**Estado:** borrador para ensayo. Las funciones de fase 2 se están construyendo en paralelo; lo que todavía no existe está listado en la sección 8 ("Dependencias"). No se ensaya en público nada que no haya pasado el checklist de la sección 5.

---

## 1. Reparto: personas y dispositivos

| Rol | Persona | Dispositivo | Pantalla / ruta |
|---|---|---|---|
| **Presentador** (habla) | P1 | ninguno, micrófono | — |
| **Organizador** (opera) | P2 | **Laptop A** conectada al proyector | `/org/[id]` (panel) y `/e/[id]/live` (resultados en vivo) en dos pestañas |
| **Vecino 1** | P3 (equipo) | **Móvil 1** | `/v/[token-1]` (ya inscrito antes de la demo, ver §3) |
| **Vecino 2** | P4 (equipo) | **Móvil 2** | `/v/[token-2]` (ya inscrito antes de la demo) |
| **Vecino 3** | **jurado voluntario** (o P3 si nadie se ofrece) | **Móvil 3** (del equipo, preparado) | `/v/[token-3]` — se inscribe **en vivo** con rostro + wallet |
| **Auditor externo** | **jurado** con ayuda de P4 | **Laptop B** (no es la del organizador; otra red si es posible) | `/audit/lab` y, como respaldo, terminal con el verificador CLI |

Proyección: Laptop A siempre visible. Para mostrar un móvil se usa duplicación de pantalla (AirPlay/scrcpy) o cámara de documentos; si falla, P1 narra y el móvil se muestra en mano al jurado.

---

## 2. Proyectos postulados (ficticios, para el sorteo)

Se cargan como `candidates` de la elección **antes** de abrir la inscripción, para que la lista quede fijada en el manifiesto y nadie pueda cambiarla después del voto.

| id | Proyecto (ficticio) | Monto (ficticio, unidades del fondo demo) |
|---|---|---|
| p01 | Pintura de pasillos y escaleras | 400 |
| p02 | Iluminación LED del estacionamiento | 350 |
| p03 | Huerto comunitario en la azotea | 200 |
| p04 | Mantenimiento de la bomba de agua | 500 |
| p05 | Parque infantil: reparación de columpios | 250 |
| p06 | Biblioteca de intercambio en el lobby | 100 |
| p07 | Impermeabilización del techo del salón de fiestas | 450 |

Los montos son de ejemplo y se muestran con la etiqueta `simulación`. No hay dinero real ni transferencias.

---

## 3. Antes de subir al escenario (T-30 min a T-0)

1. Crear la elección en Laptop A con `/org/new` (o el script de seed): título, opciones 1..5, `winnersCountFromResult: true`, `candidates` p01..p07, `label: "simulación"`.
2. `publish` → estado `registration`.
3. Inscribir **Vecino 1 y Vecino 2** en sus móviles (rostro + wallet + identidad Semaphore). Comprobar en el panel: `registered`.
4. **Padrón de respaldo para que los resultados en vivo muestren desglose** (decisión pendiente, ver §8): la regla del contrato oculta los conteos por opción mientras haya menos de 5 votos. Propuesta: inscribir 5 vecinos más con identidades de `simulación` y emitir sus votos **antes** de la demo, etiquetados "votos de simulación emitidos a las HH:MM". Si el equipo no lo aprueba, el guion funciona igual: en vivo se ve la participación y el desglose aparece al cierre.
5. Dejar **Vecino 3** con la invitación abierta en el Móvil 3 (pantalla "Invitación"), cámara ya autorizada en el navegador, artefactos `/zk/semaphore-10.*` ya descargados (abrir una vez la página de boleta en un ensayo para que queden en caché).
6. Laptop B: `/audit/lab` abierto, sin paquete cargado. Terminal con `pnpm --filter @quorum/verifier verify --help` probado.
7. Cronómetro visible para P1.

---

## 4. Guion 0:00–3:00

Las frases entre comillas son las exactas. Lo que va en *cursiva* es acción.

### 0:00–0:15 · Hook — P1
> "En el Condominio Los Samanes —que es ficticio— la junta cuenta los votos y anuncia el resultado. ¿Cómo sabe un vecino que ese número es el que de verdad votaron? Hoy, confiando en quien cuenta. Quórum cambia eso: **no confíes en el organizador, confía en la prueba.**"

*P2 muestra en el proyector `/org/[id]`: elección en fase `registration`, 2 de 3 vecinos inscritos (más los de simulación si se aprobó §3.4).*

### 0:15–0:50 · Inscripción con rostro + wallet (en vivo) — P1 narra, Vecino 3 opera Móvil 3
*Vecino 3 toca "Empezar" → nombre ficticio → consentimiento → prueba de vida (parpadear o girar la cabeza) → se crea la smart wallet → la wallet firma el enlace rostro↔wallet → se genera la credencial de voto en el móvil.*

> "Ella abre la invitación, hace una prueba de vida con la cámara —en modo demo— y el sistema compara su rostro con los ya inscritos en **esta** votación para rechazar duplicados. Luego se crea una wallet sin semilla y sin gas, que firma ese enlace. Y en su teléfono se genera una credencial de voto: al servidor solo le llega un compromiso, no la clave."

*En el proyector, el panel pasa a 3/3 `registered`.*

> "No guardamos fotos. Lo que comparamos es un vector numérico cifrado que se borra al cerrar." *(decir solo si el borrado está implementado; si no, decir: "…un vector numérico cifrado; borrarlo al cerrar es un pendiente que declaramos.")*

### 0:50–1:20 · Abrir y votar (3 móviles) — P2 + Vecinos 1–3
*P2 pulsa "Abrir votación" → fase `open`, padrón congelado. En el proyector se cambia a `/e/[id]/live`.*

> "Al abrir, el padrón se congela: su huella, la raíz del grupo, queda fija. Desde aquí nadie puede agregar votantes."

*Los tres vecinos votan a la vez (sugerencia: no coordinar el número; que cada uno elija). Cada móvil muestra `preparando → enviando → incluido` y el recibo.*

> "Cada voto viaja con una prueba Semaphore: demuestra que quien vota está en el padrón y que no ha votado antes, sin decir cuál de los inscritos es. Su recibo es un código —el nullifier— que no revela la opción."

*En el proyector sube la participación en vivo.*

### 1:20–1:40 · Cierre y verificación en la app — P2 + un vecino
*P2 pulsa "Cerrar votación" → `closed → tallying → auditable`. El proyector muestra el resultado (N) y el estado del verificador.*

*Vecino 1 en su móvil abre `/e/[id]` y toca **"Verificar ahora"**: el navegador descarga el paquete y ejecuta el verificador allí mismo. Ve la lista de checks y "Tu voto está incluido (posición #k)".*

> "El resultado no lo damos nosotros como verdad: el teléfono del vecino descarga el paquete y lo recalcula. Padrón, cadena de registros, cada prueba, que no haya votos repetidos y el recuento. Y comprueba que **su** voto está dentro."

### 1:40–2:15 · El jurado altera una copia — jurado en Laptop B
*P4 carga en `/audit/lab` el paquete publicado (por id). Ofrece al jurado elegir **una** alteración:*

| Lo que elige el jurado | Qué falla | Causa que debe aparecer |
|---|---|---|
| "Cambiar el total" (+1 a una opción) | `tally_matches` | "total publicado ≠ recomputado: opción …" |
| "Borrar un voto" | `chain_integrity` (+ `tally_matches`) | "cadena rota en la boleta #…" |
| "Cambiar la opción de un voto" | `proofs_valid` | "prueba inválida en la boleta #…" |
| "Meter un voto repetido" | `nullifiers_unique` | "nullifier repetido …" |
| "Colar a alguien en el padrón" | `group_root` | "la raíz no corresponde a los compromisos publicados" |
| "Cambiar un proyecto ganador del sorteo" | `draw_matches` | "sorteo publicado ≠ recomputado" |

> "Jurado: elijan cómo hacer trampa. Vamos a alterar una **copia**; el original no se toca."

*El jurado pulsa "Verificar ambos". Original: `verificado`. Copia: **`FALLO DETECTADO`** con la causa.*

> "Fallo detectado, y dice exactamente dónde. Esto no depende de nuestra base de datos: el verificador solo mira el paquete."

### 2:15–2:45 · Sorteo verificable — P2 + P1
*P2 pulsa "Realizar sorteo" → fase `drawn`. Animación: N proyectos ganadores entre p01..p07.*

> "La asamblea decidió financiar **N** proyectos. ¿Cuáles? Los elige un sorteo cuya semilla es la huella final del registro de votos. No se podía conocer antes de que entrara el último voto, y cualquiera puede repetir el cálculo."

*Vecino 2 toca **"Recomputar sorteo"** en su móvil → mismos ganadores.*

> "Mismos ganadores en su teléfono. Los recursos del fondo —ficticio— se asignan a estos N proyectos: [leer nombres y montos en pantalla]."

### 2:45–3:00 · Cierre — P1
> "Quórum es para decisiones internas: condominios, universidades, cooperativas. No es para elecciones públicas y no elimina la coacción ni los problemas del padrón; eso lo publicamos en nuestras limitaciones. Lo que sí hace es que el resultado se pueda comprobar sin creerle a quien cuenta. **Trust the proof, not the organizer.**"

### Reserva de tiempo
El guion suma 3:00 justos. Si vamos atrasados a 1:40, se recorta la explicación del sorteo a una frase ("la semilla es la huella final del registro; cualquiera lo recomputa") y se salta "Recomputar sorteo" en el móvil.

---

## 5. Checklist previa (marcar en el último ensayo y 30 min antes)

**Red y despliegue**
- [ ] URL de la demo abre en los 3 móviles y las 2 laptops (anotar la URL exacta aquí: `________`).
- [ ] Hotspot de respaldo encendido y probado en los 5 dispositivos.
- [ ] Servidor local de respaldo en Laptop A (`pnpm dev` accesible por la IP de la LAN/hotspot) probado con al menos 1 voto.
- [ ] `NEXT_PUBLIC_DEMO_ELECTION_ID` apunta a la elección de la demo.

**Móviles**
- [ ] Batería ≥ 80 %, modo no molestar, brillo alto, bloqueo automático desactivado.
- [ ] Permiso de cámara concedido al dominio de la demo en el Móvil 3.
- [ ] Artefactos `/zk/semaphore-10.wasm` y `.zkey` en caché (abrir una vez la boleta en ensayo). Medir y anotar tiempo de prueba en cada móvil: M1 `__ s`, M2 `__ s`, M3 `__ s`.
- [ ] Vecino 1 y 2 en estado `registered`; Vecino 3 en "Invitación".
- [ ] Clave de identidad Semaphore presente en `localStorage` de M1 y M2 (si se borra, no podrán votar).

**Wallet / cadena**
- [ ] `NEXT_PUBLIC_ZERODEV_PROJECT_ID` configurado y una UserOp patrocinada probada hoy; o bien, decisión tomada de usar `eoa-demo` (y la etiqueta se ve en pantalla).
- [ ] Si hay ancla: `ORGANIZER_PRIVATE_KEY` con ETH de faucet en Base Sepolia, `BASE_SEPOLIA_RPC` responde; enlace al explorador listo. Si no hay ancla: el verificador muestra `anchor_matches` como "no evaluado" y P1 **no** menciona blockchain como garantía.

**Verificación y laboratorio**
- [ ] "Verificar ahora" en el navegador probado en un móvil con el paquete de un ensayo.
- [ ] `/audit/lab` ofrece las alteraciones de la tabla de §4 sobre paquetes `semaphore-ledger` reales, y cada una muestra la causa esperada.
- [ ] Verificador CLI funciona en Laptop B: `pnpm --filter @quorum/verifier verify packages/demo-fixtures/protocol/valid.json` (exit 0) y `tampered_total.json` (exit 1).
- [ ] Carpeta `demo-backup/` en Laptop B con el paquete de la última ejecución real + sus variantes alteradas + `sha256` de cada uno + log de la ejecución, todo etiquetado "reproducción offline".

**Sorteo**
- [ ] Regla de empate en la votación de N acordada y visible (ver §8).
- [ ] "Recomputar sorteo" da los mismos ganadores en otro dispositivo.

**Material**
- [ ] Grabación de respaldo de un ensayo completo (etiquetada "grabación del ensayo de las HH:MM").
- [ ] Duplicación de pantalla del móvil probada con el proyector del evento.
- [ ] Ninguna pantalla muestra nombres reales, partidos ni política. Nombres de vecinos ficticios.

---

## 6. Plan B por fallo

Regla general: **nunca fingir.** Si algo se reemplaza por un respaldo, se dice en voz alta y la pantalla lo etiqueta.

| Falla | Señal | Qué hacemos | Frase |
|---|---|---|---|
| **Red del evento** | los móviles no cargan / timeouts | Cambiar todos al hotspot. Si tampoco: servidor local en Laptop A por LAN. | "Cambiamos a nuestra red de respaldo; la votación es la misma." |
| **Red caída del todo** | ni hotspot ni LAN | Saltar a la **reproducción offline** en Laptop B: paquete real de la última ejecución + verificador CLI + `/audit/lab` con archivo local. El jurado sigue eligiendo la alteración. | "Esto es una reproducción offline de una ejecución real de hoy a las HH:MM; el verificador corre aquí mismo, sin red." |
| **Cámara** (permiso, luz, modelo no carga) | el paso de prueba de vida no avanza en 15 s | Vecino 3 usa "Continuar sin prueba de vida (demo)" si el servidor lo acepta en la demo; si no, se usa a Vecino 3 **pre-inscrito en ensayo** (tener un 4.º token inscrito de reserva). | "La cámara no coopera; seguimos con una inscripción hecha en el ensayo. La deduplicación facial la mostramos en la grabación." |
| **Detección de duplicados** muestra falso positivo | `duplicate_identity` a una persona nueva | Usar la inscripción de reserva. Anotar el caso para KNOWN_LIMITATIONS. | "El umbral de similitud se equivocó; por eso decimos que es una prueba de vida demo, no identificación." |
| **Wallet / paymaster** (ZeroDev caído, sin cuota) | error al crear cuenta o enviar UserOp | Modo `eoa-demo` (clave local, etiqueta visible). El voto sigue validándose por la prueba Semaphore; el `txHash` on-chain queda vacío. | "La wallet patrocinada no responde; usamos la wallet local de demo, y el voto sigue protegido por la prueba." |
| **Generación de prueba lenta** en un móvil (> 10 s) | se queda en "preparando" | Seguir hablando; si pasa de 20 s, ese vecino vota desde el móvil de reserva pre-inscrito. | — |
| **Base Sepolia / RPC** | ancla no se publica | Cerrar sin ancla. El verificador marca `anchor_matches` como "no evaluado". | "Hoy el ancla en testnet no salió; el verificador lo dice en lugar de esconderlo." |
| **Verificador en el navegador** falla | error en "Verificar ahora" | Laptop B: `POST /api/audit/verify` desde `/audit` o CLI con el paquete descargado. | "Lo verificamos en una segunda máquina con el paquete descargado." |
| **Laboratorio** no aplica una alteración | botón sin efecto | Usar los fixtures alterados de `packages/demo-fixtures/protocol/` con el CLI. Son de una ejecución real del motor, etiquetados `fixture`. | "Usamos copias alteradas preparadas de antemano —son fixtures— con el mismo verificador." |
| **Sorteo** falla | error en `draw` | Mostrar el resultado de N y recomputar el sorteo con la función del adaptador en Laptop B sobre el `finalHash` publicado. Si no hay sorteo, decir que no lo hay. | "El sorteo no se ejecutó en vivo; el cálculo es público y lo hacemos aquí con la huella final." |
| **Todo** | — | Grabación del ensayo, etiquetada. | "Les mostramos la grabación del ensayo de las HH:MM; no es en vivo." |

---

## 7. Métricas a capturar en vivo (spec §1.3 y §11)

Se registran en la página de la oficina o en una nota al terminar cada ensayo. Muestra pequeña: no se generaliza.

| Fecha/hora | Ensayo o demo | Métrica | Valor | Cómo se midió |
|---|---|---|---|---|
| | | Tiempo de inscripción (invitación → `registered`) por móvil | | cronómetro |
| | | Tiempo de voto (tocar opción → `incluido`) por móvil | | cronómetro |
| | | Tiempo de "Verificar ahora" en móvil | | cronómetro |
| | | Tiempo de un observador no técnico hasta decir "válido" o "alterado" | | cronómetro |
| | | Alteraciones probadas / detectadas, por tipo | | lista de §4 |
| | | Falsos positivos/negativos de duplicado facial | | conteo manual |
| | | Errores de accesibilidad vistos | | nota |

---

## 8. Dependencias de la demo sobre funciones aún no construidas (a 2026-10-24, rama `integration/h3`)

Cada fila bloquea un bloque del guion. Fuente: Contrato v1 y lo que hoy existe en `apps/web`.

| # | Dependencia | Bloque del guion | Estado conocido |
|---|---|---|---|
| 1 | Fase `registration` + `POST /api/elections/:id/open` (congelar padrón) | 0:15–0:50, 0:50 | Definido en Contrato v1; no presente en `integration/h3` |
| 2 | Prueba de vida con Human + `POST /api/face/enroll` con **deduplicación 1:N** (`duplicate_identity`) | Inscripción | El paso de prueba de vida existe (v0); la dedupe 1:N es nueva |
| 3 | Smart wallet Kernel (ZeroDev) + firma EIP-712 `FaceBinding` + verificación ERC-1271/6492 | Inscripción | `packages/wallet` previsto; hoy hay `DemoWalletStep`/Privy |
| 4 | `POST /api/voters/:id/identity` + identidad Semaphore en el navegador | Inscripción | Nuevo en v1 |
| 5 | Voto con `castBallot` en el móvil (artefactos en `/zk/`, carga dinámica) y `POST /vote { proof }` | Voto | Adaptador listo; integración web pendiente. Tiempo en móvil **sin medir** |
| 6 | Panel del organizador con `GET /api/elections/:id/voters` y botones Abrir / Cerrar / Sortear | Todo | Panel v0 existe; acciones nuevas pendientes |
| 7 | Resultados en vivo con pocos votos: regla `< 5 ⇒ count:null` | Voto | Requiere decisión: votos de `simulación` previos (§3.4) o aceptar solo participación en vivo |
| 8 | `POST /close` que genera paquete, corre `verifyPackage` y guarda `AuditResult` | Cierre | Definido; integración pendiente |
| 9 | **"Verificar ahora" en el navegador** (bundle del verificador) + "mi voto está" por nullifier | Verificación | Nuevo en v1 |
| 10 | `/audit/lab` con alteraciones sobre paquetes `semaphore-ledger` (hoy solo: total, artefacto ausente, manifiesto, sobre el formato v0) y la alteración del sorteo | Ataque | Hay que actualizarlo |
| 11 | `candidates` dentro del manifiesto (para que la lista de proyectos quede fijada antes del voto) | Sorteo | El contrato lista `candidates` en `Election`; falta confirmar que entran en `manifestHash` |
| 12 | `drawWinners` en el adaptador, `POST/GET /draw`, check `draw_matches` en el verificador, UI de animación y "Recomputar sorteo" | Sorteo | Nuevo en v1 |
| 13 | **Regla de empate** cuando dos valores de N empatan | Sorteo | Sin decidir. Propuesta: gana el N menor (gasto más prudente) y se publica en el manifiesto antes de abrir |
| 14 | Pantalla "recursos asignados" (proyectos ganadores + montos ficticios) | 2:15–2:45 | Sin especificar en el contrato |
| 15 | Ancla en Base Sepolia (`ORGANIZER_PRIVATE_KEY` con ETH de faucet) — opcional | Cierre | Requiere decisión humana; sin ancla el guion funciona |
| 16 | Evento `Cast` del contrato `QuorumRegistry` desplegado — opcional | Voto | Requiere deploy con faucet; sin él no se menciona |
| 17 | Borrado del descriptor facial al cerrar | Frase de 0:15–0:50 | No especificado; si no existe, se usa la frase alternativa |
| 18 | Duplicación de pantalla del móvil al proyector | Todo | Logística, no código |
