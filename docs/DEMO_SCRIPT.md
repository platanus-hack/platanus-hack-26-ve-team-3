# Guion de demo — Quórum, modo "sala abierta" (3 minutos)

**Lema:** Trust the proof, not the organizer.
**Dinámica:** **todo el público vota desde su propio teléfono** (jurado y asistentes). El organizador proyecta un QR (`/j/<roomCode>`), la sala tiene tope de lugares (~60) y expira a los 15 min. Cada persona entra con un alias libre, hace la prueba de vida con deduplicación facial, se le crea una smart wallet sin gas y vota. El proyector muestra en vivo los inscritos, la participación y, con 5 votos o más, el desglose por opción.
**Base:** Contrato v1 (`docs/API_CONTRACT.md`), motor `semaphore-ledger` (`docs/ADR-001-voting-engine.md`), D-09..D-12 (`docs/DECISIONS.md`) y decisiones del coordinador del 2026-10-24:
- **Empate en N:** gana el N menor. Se publica en el manifiesto antes de abrir.
- **Lenguaje:** "la prueba no revela quién emitió cada boleta; el servidor ve el contenido". Nunca "anónimo" ni "secreto".
- **Cadena:** solo el **ancla del organizador al cierre** en Base Sepolia (contrato `QuorumRegistry` ya desplegado). No hay registro on-chain por votante.

**Estado:** borrador para ensayo. El modo sala abierta se construye en paralelo; lo que falta está en §9. Nada se presenta en público sin pasar el checklist de §6.

---

## 1. La pregunta (ficticia, neutral y que le importe a la sala)

Formato fijo para todas las alternativas: **"¿Cuántos ___ financia el fondo simulado?"** con opciones `1`, `2`, `3`, `4`, `5`. El número ganador N fija cuántos ganadores salen del sorteo verificable entre 7 postulados. No hay dinero real.

| # | Pregunta | Postulados para el sorteo (7) | Por qué engancha | Riesgo |
|---|---|---|---|---|
| **A (recomendada)** | "**Próxima hackathon:** ¿cuántas mejoras del espacio financia el fondo simulado?" | Café 24 h · Wi-Fi de respaldo · Sala de siesta · Más enchufes por mesa · Comida vegetariana todas las comidas · Pizarras en cada mesa · Zona sin ruido | Todos en la sala las vivieron hoy; nadie gana ni pierde nada real | Ninguno conocido. Que el equipo organizador del evento no lo lea como crítica: tono de juego |
| B | "**Pizza de la madrugada:** ¿cuántos sabores pide el fondo simulado para la próxima edición?" | Margarita · Pepperoni · Vegetariana · Hawaiana · Cuatro quesos · Jamón y maíz · Champiñones | Muy ligera; risa fácil | Pierde un poco de "seriedad" de la acción derivada |
| C | "**Proyectos de esta hackathon:** ¿cuántos reciben el fondo simulado?" | Proyectos de la hackathon | Máxima emoción | **No recomendada sin consentimiento** de cada equipo: un sorteo con nombres de equipos reales puede confundirse con un premio o un juicio. Si se usa, solo con equipos que acepten y con la etiqueta "simulado, sin premio" |
| D | "**Condominio Los Samanes** (ficticio): ¿cuántos proyectos vecinales financiamos?" | Pintura de pasillos · Iluminación LED · Huerto en la azotea · Bomba de agua · Parque infantil · Biblioteca de intercambio · Impermeabilización | Es el caso de uso real del producto | Al público le importa menos |

La pregunta elegida, los 7 postulados, la regla de empate y la hora límite van en el manifiesto **antes** de abrir la sala.

---

## 2. Reparto

| Rol | Quién | Dispositivo | Pantalla |
|---|---|---|---|
| **Presentador** | P1 | micrófono | — |
| **Organizador** | P2 | **Laptop A → proyector** | Pantalla de sala (`/j/<roomCode>` en modo proyector): QR, contador, participación, desglose, retos, sorteo. Panel del organizador en otra pestaña (Abrir votación / Cerrar / Sortear) |
| **Jurado auditor** | un jurado, con ayuda de P3 | **Laptop B** (no es la del organizador) | `/audit/lab`. Respaldo: terminal con el verificador CLI |
| **Soporte en sala** | P3 y P4 | sus teléfonos | Recorren la sala y ayudan con cámara o permisos. P4 tiene inscripciones de reserva |
| **Público y jurado** | todos | **su propio teléfono** | `/j/<roomCode>` |

---

## 3. Texto exacto de la pantalla del QR (proyector)

```
QUÓRUM · Sala abierta · DEMO

Vota desde tu teléfono
"Próxima hackathon: ¿cuántas mejoras del espacio
 financia el fondo simulado? (1 a 5)"

[ QR GRANDE ]        quorum-<dominio>/j/<ROOMCODE>
Código de sala: <ROOMCODE>

27 de 60 inscritos · cierra la inscripción en 12:41

1. Escanea y elige un alias (no uses tu nombre real).
2. Prueba de vida con la cámara (modo demo).
3. Se crea tu wallet: sin semilla y sin pagar gas.
4. Vota y luego comprueba "Mi voto está".

Modo demo: comparamos un vector numérico de tu rostro
para evitar inscripciones dobles. No guardamos fotos.
Votación ficticia. Fondo simulado. Sin premios.
```

**Primera pantalla en el teléfono** (`/j/<roomCode>`):

```
Bienvenida a la sala <ROOMCODE> — votación de demostración
Elige un alias: [__________]  (no uses tu nombre real)
☐ Entiendo que esto es una demo: la cámara se usa para una prueba
  de vida y para evitar inscripciones dobles en esta sala. Se
  compara un vector numérico, no se guarda la foto.
[ Entrar ]
```

Cuando se cierra la inscripción y alguien llega tarde:

```
La inscripción de esta sala ya cerró (padrón congelado).
Puedes seguir como observador: ver resultados, verificar el
paquete y recomputar el sorteo desde tu teléfono.
```

---

## 4. Antes del pitch (T-10 min a T-0)

- **T-10:** P2 crea la sala con el script de seed (pregunta A, 7 postulados, empate → N menor, tope 60, expiración 15 min, etiqueta `simulación`). El estado queda en `registration`. Antes de abrirla, la Laptop A ya muestra el proyector.
- **T-3 (al empezar a montar en el escenario):** el QR ya está proyectado. P1 dice: **"Mientras montamos: saquen el teléfono y escaneen. Van a votar con nosotros."** P3 y P4 bajan a la sala.
  - Por qué tan temprano: escanear, aceptar permisos de cámara, prueba de vida y wallet toman unos **30–45 s por persona en paralelo** si todo va bien, pero sumando reacción, permisos y reintentos, la mayoría de la sala tarda **1–2 min**. Si se abre al empezar el pitch, no da tiempo.
- **T-0:** el contador debería marcar 20+ inscritos. Si marca menos de 5, ver plan B (§7).

---

## 5. Guion 0:00–3:00

Frases exactas entre comillas. Acciones en *cursiva*.

### 0:00–0:15 · Hook — P1
*Proyector: QR + "27 de 60 inscritos" subiendo.*
> "Cuando alguien organiza una votación y también cuenta los votos, ¿cómo sabes que el número que anuncia es el que votaron? Hoy no le van a creer a nuestro servidor. **Trust the proof, not the organizer.** Ustedes mismos lo van a comprobar desde su teléfono."

### 0:15–0:50 · Inscripción + reto 1: "inscríbete dos veces" — P1, público
> "Quien no haya entrado, todavía puede: escanea, alias, cámara. Cada uno hace una prueba de vida y el sistema compara su rostro con los ya inscritos **en esta sala**. Si ya estás, no te deja entrar otra vez."

> "**Reto:** intenten inscribirse dos veces. Otro alias, otra pestaña, incluso el teléfono del vecino."

*Teléfono del que lo intenta: "Ya estás inscrito en esta sala". Proyector: contador "Inscripciones dobles rechazadas: 3".*

> "Rechazado. No es un sistema de identidad: es una comparación por similitud en modo demo, y puede equivocarse. Lo decimos en nuestras limitaciones."

### 0:50–1:25 · Abrir y votar + reto 2: "vota dos veces" — P2, público
*P2 pulsa **Abrir votación** → `open`. Proyector:*
> "Padrón congelado: 41 personas. Desde aquí nadie entra."

*Todos votan. Proyector: participación subiendo; al llegar a 5 votos aparece el desglose 1..5.*
> "Cada voto lleva una prueba Semaphore: demuestra que quien vota está en el padrón y no ha votado antes. **La prueba no revela quién emitió cada boleta; el servidor sí ve el contenido**, por eso publicamos solo cuántos votos tiene cada opción, y solo desde 5 votos."

> "**Reto 2:** ya votaron, ahora intenten votar otra vez." *(botón "Intentar votar de nuevo" en el recibo)*

*Teléfono: "Rechazado: esta credencial ya votó (nullifier repetido)". Proyector: "Dobles votos rechazados: 7".*

### 1:25–1:35 · Cierre — P2
*P2 pulsa **Cerrar**. Proyector: resultado (N), "Paquete publicado · huella final 0x…", "Ancla en Base Sepolia: tx 0x…".*
> "Cerramos. El paquete con todas las boletas se publica, y su huella final queda anclada en una red pública de pruebas. Si mañana cambiáramos el paquete, no coincidiría."

### 1:35–2:15 · Reto 3: "Mi voto está" y el jurado altera una copia — público + jurado
> "Ahora, cada uno: toquen **Mi voto está**."

*Cada teléfono descarga el paquete, corre el verificador en el navegador y muestra "verificado" + "Tu voto está incluido (posición #k)".*

> "Ese check lo hizo **tu** teléfono, no nuestro servidor. Ahora el jurado va a hacer trampa."

*Jurado en la Laptop B, `/audit/lab`: elige una alteración sobre una **copia**:*

| Opción para el jurado | Check que falla |
|---|---|
| Cambiar el total de una opción | `tally_matches` |
| Borrar una boleta | `chain_integrity` (y `tally_matches`) |
| Cambiar la opción de una boleta | `proofs_valid` |
| Repetir una boleta | `nullifiers_unique` |
| Colar a alguien en el padrón | `group_root` |
| Cambiar un ganador del sorteo (después del sorteo) | `draw_matches` |
| Rehacer el paquete entero | `anchor_matches` (contra el ancla) |

*El jurado pulsa "Publicar copia del jurado". En los teléfonos aparece **"Verificar la copia del jurado"**; cada uno la verifica localmente.*

*Proyector y teléfonos: **FALLO DETECTADO** + causa ("total publicado ≠ recomputado: opción 3…"). El original sigue `verificado`.*

> "Fallo detectado, en todas las pantallas, y cada teléfono llegó a esa conclusión por su cuenta. El paquete original no se tocó."

### 2:15–2:45 · Reto 4: sorteo que cualquiera recomputa — P2, público
*P2 pulsa **Sortear**. Proyector: animación → N mejoras ganadoras entre las 7.*
> "Ganó **N**. La semilla del sorteo es la huella final del registro de votos: no se podía conocer antes de que entrara el último voto. Si hubiera habido empate, ganaba el número menor; estaba escrito antes de abrir."

> "Toquen **Recomputar sorteo**."

*Teléfonos: mismos ganadores. Proyector: "Recomputado en 38 teléfonos · 38 coincidencias".*
> "El fondo simulado se asigna a: [leer las N mejoras]."

### 2:45–3:00 · Cierre — P1
*Proyector: participación final, rechazos, coincidencias.*
> "41 personas votaron, 3 intentaron inscribirse dos veces, 7 intentaron votar dos veces, y todos pudieron comprobar el resultado sin creerle al organizador. Quórum es para decisiones internas: condominios, universidades, cooperativas. No para elecciones públicas, y no resuelve la coacción. **Trust the proof, not the organizer.**"

*(Las cifras se leen de la pantalla. Si no hay contador de coincidencias, no se dice.)*

### Reto 5: participación en el proyector (todo el tiempo)
Pantalla de sala, siempre visible:
- "**27 de 60 inscritos**" con barra y cuenta regresiva de la inscripción.
- Participación: "34 de 41 votaron (83 %)".
- Hitos: "5 votos: desbloqueado el desglose", "¡Mitad de la sala!".
- Retos: "Inscripciones dobles rechazadas: n" · "Dobles votos rechazados: n" · "Teléfonos que verificaron: n" · "Recomputaciones del sorteo: n (coincidencias: n)".
- **Ranking:** solo de **retos y hitos agregados**. Nunca una lista de alias de quién votó o verificó: sería una lista nominal (CLAUDE.md, regla 3). Si se quiere competencia, por **zona de la sala** elegida al entrar (Jurado / Equipos / Público), y **solo participación**, nunca opción por zona.

### Recorte si vamos tarde
Si a 1:35 vamos atrasados: el jurado solo hace la alteración en `/audit/lab` y el proyector muestra el FALLO (sin publicar la copia a los teléfonos), y el sorteo se anuncia sin pedir recomputar en vivo ("pueden recomputarlo después; el botón queda ahí").

---

## 6. Checklist de preparación

**Sala y proyector**
- [ ] Proyector probado con la Laptop A a la resolución del evento; QR legible desde la última fila (mínimo ~1/3 de la altura de la pantalla). Probar escanearlo desde el fondo.
- [ ] URL corta visible bajo el QR, por si alguien no puede escanear.
- [ ] Sala creada y **abierta antes del pitch** (T-3 min como tarde). Tope 60 y expiración 15 min comprobados; la expiración cubre todo el pitch.
- [ ] Pregunta, 7 postulados, regla de empate y hora límite en el manifiesto.

**Red**
- [ ] Wi-Fi del evento probado con 5+ teléfonos a la vez cargando `/j/` (los artefactos de la prueba pesan ~4,2 MB por teléfono: 60 teléfonos ≈ 250 MB en un minuto).
- [ ] Anunciar en la pantalla del QR: "si el Wi-Fi va lento, usa tus datos".
- [ ] Hotspot del equipo listo **solo para el equipo** (no aguanta 60).
- [ ] Deploy en Vercel con caché de `/zk/semaphore-10.*` y de los modelos de Human (cabeceras de caché largas).
- [ ] Prueba de carga: N inscripciones y votos simultáneos contra el deploy (meta ≥ 60). Anotar resultado en `docs/TEST_RESULTS.md`.

**Teléfonos (variedad)**
- [ ] Probado en iPhone Safari, Android Chrome y un Android de gama baja: cámara, prueba de vida, wallet, prueba Semaphore. Anotar tiempos (§8).
- [ ] Modelos de Human y artefactos precargados en la página de entrada (mientras la persona escribe el alias).

**Wallet y cadena**
- [ ] `NEXT_PUBLIC_ZERODEV_PROJECT_ID` configurado; creación de cuenta y firma `FaceBinding` probadas hoy. La firma no gasta UserOps; confirmarlo.
- [ ] `ORGANIZER_PRIVATE_KEY` con ETH de faucet en Base Sepolia, `BASE_SEPOLIA_RPC` responde, `QuorumRegistry` en `NEXT_PUBLIC_REGISTRY_ADDRESS`. Un ancla de prueba enviada hoy y visible en el explorador.

**Verificación, retos y sorteo**
- [ ] "Mi voto está" verifica en el navegador en los 3 tipos de teléfono.
- [ ] "Intentar votar de nuevo" → rechazo `already_voted` visible y contado en el proyector.
- [ ] Segunda inscripción de la misma cara → "Ya estás inscrito en esta sala" y contada.
- [ ] `/audit/lab` con las 7 alteraciones de §5 sobre un paquete `semaphore-ledger` real; "Publicar copia del jurado" llega a los teléfonos.
- [ ] "Recomputar sorteo" coincide en otro dispositivo; empate probado (gana N menor).
- [ ] Verificador CLI en la Laptop B: `valid.json` → exit 0, `tampered_total.json` → exit 1.

**Respaldo**
- [ ] 4 inscripciones de reserva del equipo (P3, P4) hechas en un ensayo, en una sala de respaldo.
- [ ] Carpeta `demo-backup/` en la Laptop B: paquete de la última ejecución real + variantes alteradas + `sha256` + log, etiquetado "reproducción offline".
- [ ] Grabación de un ensayo completo con público, etiquetada con hora.
- [ ] Ninguna pantalla con nombres reales, partidos ni política.

---

## 7. Plan B

Regla: **nunca fingir.** Todo respaldo se anuncia y se etiqueta en pantalla.

| Falla | Señal | Qué hacemos | Frase |
|---|---|---|---|
| **Alguien no tiene cámara**, niega el permiso o la prueba de vida no lo detecta | se queda en "buscando rostro" > 20 s | **No hay atajo sin cámara en sala abierta** (rompería la deduplicación). La persona entra como **observador**: ve resultados, verifica el paquete y recomputa el sorteo. P3/P4 ayudan con la luz o el ángulo una vez | "Sin cámara no te podemos inscribir —sería la puerta a votar dos veces—, pero puedes auditar todo igual." |
| **Falso "ya inscrito"** (dos personas distintas parecidas) | queja en la sala | Esa persona pasa a observador. Se cuenta como **falso positivo** en las métricas y se menciona | "El umbral se equivocó con ustedes dos. Por eso decimos 'modo demo' y no 'identidad'." |
| **Wi-Fi del evento saturado** | el contador no sube | En pantalla y de viva voz: "Usen datos móviles". Se alarga la inscripción hasta 0:50 | "La red está llena; con datos móviles funciona igual." |
| **Internet caído del todo** | nadie carga | Votación solo con el equipo: 4 teléfonos de reserva en el hotspot, en la sala de respaldo. Si tampoco: **reproducción offline** en la Laptop B (paquete real + verificador CLI + `/audit/lab` con archivo local); el jurado sigue eligiendo la alteración | "Sin internet no podemos votar todos. Esto es una reproducción offline de una ejecución real de hoy a las HH:MM; el verificador corre aquí, sin red." |
| **Pocos inscritos** (< 5 al abrir) | el contador no llega | Se suman los 4 de reserva del equipo; el desglose aparece al cierre si no se llega a 5 votos | — |
| **Sala llena** (60) | "Sala llena" | Los demás entran como observadores | "Llenamos la sala: el resto puede auditar." |
| **Wallet / ZeroDev** caído | error al crear la cuenta | Modo `eoa-demo` (clave local, etiqueta visible). El voto sigue validado por la prueba Semaphore | "La wallet patrocinada no responde; usamos una wallet local de demo. El voto lo protege la prueba, no la wallet." |
| **Prueba lenta** en teléfonos viejos (> 10 s) | "preparando…" | Seguir; quien no llegue antes del cierre queda fuera, y se dice | — |
| **Servidor saturado** al votar | errores 5xx | El cliente reintenta (la prueba es idempotente: el mismo nullifier no se cuenta dos veces). P2 alarga la votación 15 s | "Mucha gente a la vez; reintenta, no cuenta doble." |
| **Ancla** no sale (faucet, RPC) | sin txHash | Se cierra sin ancla; el verificador muestra `anchor_matches` "no evaluado" y no se habla de la cadena | "Hoy el ancla no salió; el verificador lo dice en vez de esconderlo." |
| **"Publicar copia del jurado"** no llega a los teléfonos | sin botón | El FALLO se muestra solo en el proyector (Laptop B) | "Lo vemos aquí; la copia está para que la verifiquen después." |
| **Sorteo** falla | error en `draw` | Recomputar con la función del adaptador en la Laptop B desde el `finalHash` publicado | "El cálculo es público; lo hacemos aquí con la huella final." |
| **Todo** | — | Grabación del ensayo, etiquetada | "Les mostramos la grabación del ensayo de las HH:MM; no es en vivo." |

---

## 8. Métricas a capturar (spec §1.3 y §11)

Se registran con fecha y hora tras cada ensayo y tras la demo. Muestra de conveniencia: no se generaliza.

| Métrica | Fuente | Ensayo | Demo |
|---|---|---|---|
| Escanearon / inscritos / votaron / verificaron "Mi voto está" | contadores de sala | | |
| Tiempo mediano de inscripción (QR → inscrito) | telemetría agregada o cronómetro con 3 personas | | |
| Tiempo mediano de voto (tocar opción → `incluido`) | ídem | | |
| Inscripciones dobles rechazadas / falsos "ya inscrito" reportados | contador + sala | | |
| Dobles votos rechazados | contador | | |
| Teléfonos que detectaron el FALLO en la copia del jurado | contador | | |
| Recomputaciones del sorteo / coincidencias | contador | | |
| Personas que quedaron como observadores (sin cámara, sala llena, tarde) | contador | | |

---

## 9. Dependencias sobre funciones aún no construidas (2026-10-24)

La fase 2 base (fases, dedupe facial, FaceBinding, identidad Semaphore, voto con prueba, cierre con verificador, sorteo) aparece integrada en `origin/integration/phase2`. **No lo he verificado en ejecución.** Lo propio del modo sala abierta:

| # | Dependencia | Bloque |
|---|---|---|
| 1 | Ruta `/j/<roomCode>`: crear sala con tope (~60) y expiración (15 min), alias libre, consentimiento, entrada sin invitación previa | Todo |
| 2 | Pantalla de proyector: QR, "X de 60 inscritos", cuenta regresiva, participación, desglose con 5+ votos, hitos | Todo |
| 3 | Contadores agregados de retos: inscripciones dobles rechazadas, dobles votos rechazados, verificaciones, recomputaciones y coincidencias (endpoint público sin PII) | Retos 1–5 |
| 4 | Mensaje "Ya estás inscrito en esta sala" para `duplicate_identity` | Reto 1 |
| 5 | Botón "Intentar votar de nuevo" que reenvía una prueba con la misma identidad y muestra el rechazo `already_voted` | Reto 2 |
| 6 | Estado de observador para quien llega tarde, no tiene cámara, recibe un falso duplicado o encuentra la sala llena | Plan B |
| 7 | "Mi voto está": verificador en el navegador + búsqueda del nullifier propio | Reto 3 |
| 8 | `/audit/lab` con las 7 alteraciones sobre `semaphore-ledger` y **"Publicar copia del jurado"** (endpoint que publica la copia alterada **aparte**, sin tocar el original) + botón "Verificar la copia del jurado" en los teléfonos | Reto 3 |
| 9 | Sorteo: animación en el proyector, "Recomputar sorteo" en el teléfono, contador de coincidencias, regla de empate (N menor) en el manifiesto | Reto 4 |
| 10 | Ancla del organizador al cierre vía `QuorumRegistry` en Base Sepolia, mostrando el `txHash` | Cierre |
| 11 | Seed de la sala con la pregunta elegida (A recomendada) y sus 7 postulados | Preparación |
| 12 | Precarga de modelos de Human y artefactos `/zk/` con caché larga; prueba de carga con ≥ 60 clientes | Red |
| 13 | Zona de la sala al entrar (Jurado / Equipos / Público) para el ranking de participación (opcional) | Reto 5 |
| 14 | Borrado de los descriptores faciales al expirar o cerrar la sala | Frase del QR / limitaciones |
