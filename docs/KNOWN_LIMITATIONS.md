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

## 4. Biometría (prueba de vida y deduplicación facial)

| Limitación | Detalle |
|---|---|
| **Es una prueba de vida demo, no identificación** | Se usa Human (modelo local en el navegador) con una acción aleatoria (parpadear, girar). No es liveness certificada; puede engañarse con video o máscara. No verifica identidad civil ni documento. |
| **Deduplicación 1:N por umbral** | No existe un "hash del rostro": se comparan vectores con un umbral (`FACE_DEDUPE_THRESHOLD`, por defecto 0.75). Habrá **falsos positivos** (rechazar a alguien nuevo: familiares parecidos, gemelos, mala luz) y **falsos negativos** (aceptar a la misma persona dos veces con otro ángulo, gafas, maquillaje). El umbral no está calibrado con datos. |
| **El descriptor es un dato biométrico** | Aunque no guardamos imágenes, el descriptor facial (vector) **es biometría derivada**. Se guarda cifrado en el servidor para poder deduplicar. Su borrado al cerrar la elección está pendiente de implementarse. Venezuela no tiene una ley general de protección de datos; solo existen garantías constitucionales (habeas data) cuya aplicación concreta no hemos revisado con un abogado. |
| **Unicidad solo dentro de una elección** | El dedupe compara contra los inscritos de **esa** votación. No hay unicidad humana global ni entre elecciones. |
| **Accesibilidad** | Exige cámara funcional, buena luz y un rostro que el modelo detecte bien. Puede excluir a personas con ciertas discapacidades o dispositivos viejos. Si se ofrece "continuar sin prueba de vida", la deduplicación deja de aplicar a esa persona. |
| **Sesgo del modelo** | No hemos evaluado el rendimiento del modelo por edad, tono de piel o género. |

## 5. Wallet y credenciales en el dispositivo

| Limitación | Detalle |
|---|---|
| **Claves en el navegador** | El signer de la smart wallet y la identidad Semaphore viven en `localStorage` (etiquetado demo). Un borrado del navegador, cambio de teléfono o modo incógnito = pérdida de la credencial y **no se puede votar**. No hay recuperación. |
| **Credencial ligada al navegador (D-18)** | La identidad Semaphore se cifra con una clave AES-GCM **no extraíble** guardada en IndexedDB de ese navegador, para votar sin volver a firmar. Protege frente a quien copie el `localStorage` a otro equipo, **no** frente a código malicioso que corra en la misma página (XSS), que podría usar la clave sin exportarla. Al votante no se le menciona "wallet" ni "credencial": se le dice que el teléfono queda vinculado y que si borra los datos o cambia de teléfono no podrá votar. |
| **Malware / XSS** | Quien controle el navegador del votante (extensión maliciosa, XSS en nuestro sitio) puede robar la credencial y votar en su lugar. |
| **Wallet = dispositivo, no persona** | La firma del enlace rostro↔wallet prueba que esa wallet aceptó ese `faceBindingHash`; no prueba que la persona esté presente al votar. Al votar no se repite la prueba facial (en la v1). |
| **Modo `eoa-demo`** | Si no hay ZeroDev configurado, se usa una clave local simple, sin cuenta inteligente ni patrocinio. Se etiqueta en pantalla. |
| **Servicios de terceros** | ZeroDev (bundler/paymaster sandbox, cuota limitada) y el RPC pueden caer o bloquear por IP. La elegibilidad del voto no depende de ellos (la da la prueba Semaphore), pero el ancla del cierre depende del RPC y de la cuenta del organizador. |

## 6. Red de pruebas (testnet) y componentes de cadena

- **Base Sepolia es una testnet**: sin valor económico, puede reiniciarse o cambiar; no ofrece la seguridad de una red principal. Es apropiada para demostrar el mecanismo, no para garantizar persistencia a largo plazo.
- **Ninguna transacción real se había enviado** a la fecha del ADR-001. Si el día de la demo no hay ancla, se dice.
- **"Recursos asignados" es simulado**: no hay fondos ni contratos que transfieran dinero. Un contrato de ejecución real quedó como idea (ADR-001 §3), no implementada.
- **Solo hay un ancla del organizador al cierre** (contrato `QuorumRegistry` en Base Sepolia). No hay registro on-chain por votante: la cadena no ve boletas individuales y **no** verifica pruebas on-chain.

## 7. Criptografía y dependencias

- **No inventamos criptografía.** Identidad, árbol, prueba y verificación son de `@semaphore-protocol/core@4.14.5` sin modificar. Lo propio es el formato del ledger, el paquete y el verificador.
- **Trusted setup de Semaphore** (ceremonia de PSE) y corrección de `snarkjs`/`circom`: confiamos en ellos como cualquier usuario del protocolo.
- **Artefactos vendorizados**: el repositorio de origen (`snark-artifacts`) está archivado; usamos copias con SHA-256 registrado. Actualizaciones futuras requieren revisión manual.
- **No es "ZK completo"**: la prueba de conocimiento cero cubre **pertenencia al padrón y unicidad**. El escrutinio es un recuento público; no hay prueba de conocimiento cero del resultado ni de validez de boletas cifradas (no hay boletas cifradas).
- **Profundidad fija 10**: hasta 1024 credenciales por elección.
- **Tiempo de prueba en móvil sin medir** (estimado 1–3 s; ~0,4–0,5 s medido en Node 22).
- Solo se soporta voto de **una opción** (`message` = índice). Ranking o presupuesto requieren otra codificación.

## 8. Marco legal y organizativo

- Quórum **no reemplaza** convocatoria, quórum, actas ni procedimientos de impugnación que exijan la ley o los estatutos. Puede aportar evidencia adjunta a un acta.
- **Cooperativas (Venezuela):** el Decreto Ley Especial de Asociaciones Cooperativas (2001), art. 28, dice que "las elecciones se realizarán en forma nominal". Si "nominal" se interpreta como voto con nombre del votante, Quórum no serviría para **elecciones de instancias** de una cooperativa, solo para otras decisiones (art. 27). Interpretación pendiente de revisión jurídica.
- **Condominios (Venezuela):** la Ley de Propiedad Horizontal regula convocatoria, mayorías e impugnación; no hemos revisado si una votación digital remota cumple esos requisitos. Ver `docs/IMPACT_EVIDENCE.md` §3.1.
- La legitimidad de una decisión depende de reglas, padrón, libertad de participación y disponibilidad, no solo de una prueba criptográfica.

## 9. Producto y demo

- **Fase 2 en construcción:** inscripción con rostro + wallet, voto con prueba Semaphore desde el navegador, verificación en la app y sorteo están definidos en el Contrato v1 pero se implementan en paralelo; ver `docs/DEMO_SCRIPT.md` §9.
- **Datos ficticios:** la elección, los vecinos, los proyectos y los montos son ficticios y se etiquetan `fixture` / `simulación`.
- **Sin pruebas con usuarios reales** todavía; métricas del hackathon con muestra pequeña.
- **Regla de empate** en la votación de N: gana el N menor (decisión del 2026-10-24). Debe publicarse en el manifiesto antes de abrir.
- **Invitaciones por WhatsApp:** en modo `dry-run` o `wa.me` salvo aprobación humana; el envío real depende de Kapso y de la aprobación de la plantilla.

## 10. Frases prohibidas (política de claims)
No usar en producto, pitch ni docs: "anónimo", "voto secreto", "ZK completo", "prueba ZK del escrutinio", "end-to-end verificable" (salvo "puedes comprobar que tu nullifier está en el registro"), "100 % seguro", "imposible de manipular", "resistente a coacción", "identidad verificada", "un voto por persona" (decir "una credencial por persona inscrita, con deduplicación facial demo"), "la blockchain garantiza el resultado". Nada de política real.
