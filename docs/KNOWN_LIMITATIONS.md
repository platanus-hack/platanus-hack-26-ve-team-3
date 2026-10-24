# Limitaciones conocidas — Quórum

**Para qué es este documento:** decir con precisión qué **no** garantiza Quórum, para que nadie (jurado, usuarios, el propio equipo) le atribuya más de lo que demuestra. Se basa en `docs/ADR-001-voting-engine.md` (Plan A `semaphore-ledger`), el Contrato v1 (`docs/API_CONTRACT.md`) y las decisiones D-09..D-12 (`docs/DECISIONS.md`). Fecha: 2026-10-24.

**Uso previsto:** demostraciones y decisiones internas de bajo riesgo (condominios, universidades, cooperativas, comunidades). No recomendamos un uso real sin revisión externa de seguridad, usabilidad, operación y marco legal (spec §12). No es para elecciones públicas.

---

## 1. Qué SÍ demuestra (para contrastar)
Con el paquete de auditoría y el verificador (`apps/verifier`, checks con causa):
- **Elegibilidad sin identificar:** cada boleta trae una prueba Semaphore de que la credencial pertenece al padrón publicado (`proofs_valid`, `group_root`).
- **Unicidad por credencial:** un nullifier por credencial y elección; una segunda boleta se **rechaza** (`nullifiers_unique`).
- **Integridad del registro:** cadena de hashes SHA-256 (`chain_integrity`).
- **Recuento reproducible:** cualquiera recuenta (`tally_matches`). Es un **recuento**, no una prueba criptográfica del escrutinio.
- **Manifiesto fijado:** opciones, fechas y (cuando se implemente) proyectos del sorteo (`manifest_hash`).
- **Sorteo reproducible** (cuando se implemente): `draw_matches` recomputa los ganadores desde `finalHash`.
- **Inclusión individual:** cada votante puede buscar su nullifier en el registro.

Todo lo demás está abajo.

---

## 2. Privacidad del voto

| Limitación | Detalle |
|---|---|
| **El contenido del voto va en claro** | El `message` de la prueba es el índice de la opción. El organizador (y cualquiera con el paquete) ve **qué** se votó en cada boleta, aunque la prueba no dice **cuál** credencial del padrón la emitió. No hay cifrado del contenido (ElGamal quedó opcional y no implementado). |
| **No decimos "anónimo"** | La prueba oculta qué miembro del padrón votó, pero no protege contra metadatos: dirección IP, hora exacta de envío, orden de llegada, el `inviteToken` si el cliente pide marcar `votedAt`. Un organizador que registre esos metadatos podría correlacionar. No hemos medido ni mitigado esa fuga. |
| **Electorados pequeños** | Con pocos votantes, el resultado agregado puede revelar votos individuales (p. ej., unanimidad, o 3 votantes con 3 opciones distintas). La regla "`count:null` si hay menos de 5 votos" solo aplica a los resultados en vivo; el paquete final trae todos los conteos. |
| **Sin resistencia a coacción ni a compra de votos** | El votante conserva su clave Semaphore y su recibo (nullifier); con eso puede **demostrar a un tercero** cómo votó, porque el `message` de su boleta es público. Alguien que presione o pague puede exigir esa prueba. Tampoco protegemos a quien vota con otra persona mirando. |
| **Doble voto = rechazo, no reemplazo** | No se puede cambiar el voto, lo que también impide el "voto de arrepentimiento" usado contra la coacción en otros sistemas. |

## 2 bis. Modo continuo «Al instante» (D-22, predeterminado)

Se inscriben y votan en el mismo momento: el grupo Semaphore crece mientras se vota. Lo que eso cuesta, dicho sin rodeos (también va en `unsupportedGuarantees` del verificador):

| Limitación | Detalle |
|---|---|
| **Quien vota temprano se esconde entre menos personas** | Cada boleta prueba pertenencia al grupo **tal como era** en la raíz de su prueba. Su conjunto de anonimato es ese tamaño (`groupSize`, publicado por boleta y recomputado por el verificador), no el total final. Con K=5, la primera boleta posible se esconde entre 5 personas aunque al final haya 200. El centro de transparencia muestra el mínimo y la mediana. |
| **K solo acota el peor caso** | No se aceptan votos mientras el grupo tenga menos de K miembros (`minAnonymitySet`, 5 por defecto, fijado en `manifestHash`; el votante ve «Tu voto se habilita cuando haya 5 personas inscritas (ahora 3)»). K no impide que un grupo pequeño revele información si casi todos votan igual. |
| **Correlación por tiempo** | El servidor del organizador ve cuándo se completa cada inscripción y cuándo llega cada boleta, y el ledger publica el orden de ambas. Si alguien se inscribe y vota segundos después cuando entra poca gente, el servidor puede intuir qué boleta es suya. No hay mezcla ni retardo criptográfico. |
| **Ventana de 32 raíces** | Una prueba vale contra cualquiera de las últimas 32 raíces del grupo. Si entran más de 32 personas mientras un teléfono genera su prueba, el servidor responde `stale_root` y el teléfono la rehace sola (hasta 2 reintentos). |
| **El padrón no se congela** | En continuo la sala sigue abierta hasta cerrar. El dedupe facial 1:N funciona durante toda la votación (las plantillas cifradas se borran al cerrar, no al abrir), así que viven más tiempo en el servidor que en el modo con fases. |
| **Laboratorio de ataques** | Las recetas del laboratorio están escritas para paquetes con fases; con un paquete continuo el laboratorio lo dice y no aplica alteraciones (el verificador sí lo verifica completo). |

## 3. Confianza en el organizador

| Limitación | Detalle |
|---|---|
| **Censo (padrón)** | El organizador decide a quién invita. El verificador comprueba que la raíz publicada sale de los compromisos publicados, **no** que esos compromisos correspondan a personas reales y elegibles. Un organizador deshonesto puede inscribir credenciales falsas y votar con ellas (relleno de urna dentro del padrón). La deduplicación facial la ejecuta **el servidor del organizador**: si él es el atacante, no la aplica. |
| **Único escritor del registro** | No hay coordinador ni secuenciador independiente: el organizador escribe el ledger. Puede **omitir** boletas que recibió (censura) y reconstruir un paquete coherente desde cero. Eso solo se detecta (a) si ancló antes el `finalHash` y el verificador lee el ancla, o (b) si un votante busca su nullifier y no aparece. El fixture `removed_record_rechained.json` documenta este límite: **sin ancla el verificador no lo detecta**. |
| **Ancla opcional y firmada por el organizador** | El ancla en Base Sepolia la firma la cuenta del organizador y solo prueba que **ese** hash existía en ese momento. Si no hay ancla, `anchor_matches` aparece como "no evaluado" y se lista en `unsupportedGuarantees`. El verificador confía en el RPC que se le pase. |
| **Influencia sobre el sorteo** | La semilla es `keccak256(finalHash)`. Nadie puede elegirla libremente, pero el organizador controla el momento de cierre y podría dejar fuera una última boleta para obtener otra semilla (pocas alternativas, pero no cero). Mitigación parcial: hora de cierre fija en el manifiesto y votantes que verifiquen su inclusión. La lista de postulados y la regla de empate (decidida: **gana el N menor**) deben quedar en el manifiesto **antes** de abrir; si no, el organizador podría ajustarlas. |
| **El verificador del navegador lo sirve el organizador** | "Verificar ahora" corre un código descargado del mismo sitio. Un sitio falso o un organizador malicioso podría servir un verificador que siempre dice "verificado" (amenaza A6 de la spec). La verificación genuinamente independiente es ejecutar el verificador desde el repositorio público, en otra máquina, sobre el paquete descargado. |
| **Disponibilidad** | Si el organizador no publica el paquete o no cierra, la interfaz debe mostrar "no verificable", no "válido" (amenaza A7). |

## 3 bis. Censo abierto en sala (modo de la demo)

En la demo cualquiera que escanee el QR (`/j/<roomCode>`) puede inscribirse con un alias libre, hasta el tope (~60) y antes de que expire la sala (15 min). Eso cambia el modelo de elegibilidad:

| Limitación | Detalle |
|---|---|
| **La elegibilidad depende de la deduplicación facial demo** | No hay lista previa de personas con derecho a voto. "Una persona, una credencial" descansa **solo** en la comparación facial por umbral dentro de la sala, que puede fallar en ambos sentidos (ver §4): alguien puede inscribirse dos veces engañando al modelo (foto, video, otro ángulo), y dos personas distintas parecidas pueden ser rechazadas como "ya inscrito". |
| **Cualquiera con el enlace entra** | El QR y la URL corta se pueden fotografiar y compartir fuera de la sala. Quien esté fuera puede ocupar lugares hasta el tope. Ni el tope ni la expiración son controles de identidad. |
| **Alias libre** | El alias no identifica a nadie ni se verifica. No sirve para saber quién votó (y no debe publicarse como lista). |
| **Sin cámara no hay voto** | Quien no tiene cámara, niega el permiso o no es detectado por el modelo solo puede observar y auditar. Es una exclusión deliberada para no abrir la puerta al doble voto, y tiene un costo de accesibilidad. |
| **Lo hace el servidor del organizador** | La deduplicación corre en el servidor de quien organiza la sala. El verificador público **no** puede comprobar que se aplicó: solo ve compromisos. |
| **No apto fuera de la demo** | Para un condominio, una universidad o una cooperativa, el padrón debe salir de su registro de miembros (invitaciones nominales), no de una sala abierta. |

## 3 ter. Credencial del evento (QR) + rostro (D-19)

Con "¿Quién puede votar?" = **Credencial del evento**, la persona escanea el QR de su credencial de Platanus Hack (`https://hack.platan.us/26-ve/id/<usuario-github>`) y luego pasa por el rostro, que es obligatorio. Declaración honesta (va en el paquete de auditoría como `rollPolicy.note` y el verificador la muestra en `unsupportedGuarantees` como `credencial-de-evento: …`): **la credencial demuestra que es participante del evento y se usa una sola vez; el rostro impide que una misma persona use varias credenciales.**

| Limitación | Detalle |
|---|---|
| **El QR de la credencial no es secreto** | El usuario está impreso y la URL es pública. Quien conozca el usuario de un participante (o fotografíe su credencial) puede entrar **una vez** en su lugar si llega antes. La credencial impide votar a quien no es participante y usar una credencial dos veces, pero **no autentica a la persona**: el rostro solo evita que una misma cara entre dos veces, no prueba que sea el titular de la credencial. |
| **La existencia depende del modo de comprobación** | `live`: el servidor consulta la URL de la credencial (HEAD, o GET si HEAD no está soportado; 3 s; positivos en caché 6 h, negativos 2 min). Si esa página no responde, la entrada falla con 503 "intenta de nuevo" (no se deja pasar a ciegas). `list`: vale la lista que cargó el organizador (guardada solo como HMAC). `none`: basta el formato; cualquiera que conozca un usuario puede entrar una vez. |
| **Una credencial gastada no se recupera desde otro teléfono** | El uso se registra al entrar. Si la persona pierde el teléfono o borra los datos del navegador antes de terminar, su credencial queda "ya usada" en esa votación; desde el mismo teléfono retoma con "Continuar". |
| **El verificador no puede comprobarlo** | Qué credenciales existían y cuáles se usaron vive solo como HMAC en el servidor del organizador; `rollPolicy` es una declaración fuera de `manifestHash`/`checksums`. |
| **Clave del HMAC** | `BADGE_KEY`; sin ella se deriva de `FACE_KEY`. Cambiarla a mitad de una votación invalida la lista y los usos registrados (permitiría reusar credenciales). |
| **Gemelos idénticos y la excepción manual (D-21)** | El dedupe facial no distingue gemelos idénticos (ni, a veces, familiares muy parecidos): el segundo en llegar coincide con el primero. Con **credencial del evento**, si la persona trae su propia credencial (distinta y no usada) no se la rechaza: queda **"en revisión"** y el organizador decide **en persona** (ve a la persona y su credencial). Aprobar es un acto de confianza en el organizador, no una prueba: el sistema no puede distinguir a un gemelo real de una misma persona con dos credenciales prestadas. Por eso el número de aprobaciones manuales se publica en el paquete (`manualApprovals.count`, sin ids) y el verificador lo muestra. Con **apodo libre** no hay excepción: sigue el rechazo automático (no hay identidad distinta que mostrar). Las revisiones pendientes al abrir la votación se rechazan solas. Tope: 10 pendientes por votación. |
