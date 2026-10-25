# Quórum

**Trust the proof, not the organizer.**

Votaciones internas para condominios, universidades, cooperativas y comunidades, donde el resultado no depende de la palabra de quien organiza: cualquiera puede verificarlo.

## El problema

Cuando una comunidad decide algo (un presupuesto, una junta directiva, una obra), la votación la organiza alguien de adentro. Si ese alguien cuenta mal, omite boletas o cambia el total, nadie puede demostrarlo. La confianza termina dependiendo de la persona que cuenta, no de la evidencia.

## Qué hace Quórum

1. **Organizar en un minuto.** El organizador crea la votación con pregunta y opciones (con foto y subtítulo si quiere) y proyecta un QR.
2. **Entrar desde el teléfono.** Cada persona escanea el QR, escribe un alias y hace una prueba de vida con la cámara. Comparamos un vector numérico del rostro para evitar inscripciones dobles; no guardamos fotos. Con eso se le crea una credencial y una smart wallet sin gas, sin que tenga que entender nada de eso.
3. **Votar en dos toques.** La boleta aparece sola. Al votar, el teléfono genera una prueba criptográfica (Semaphore v4) de que la boleta la emitió alguien del padrón, sin revelar quién. Una credencial solo puede votar una vez.
4. **Resultados en vivo.** La pantalla grande muestra inscritos, participación y el desglose por opción mientras se vota. Al cerrar, aparece el ganador con su estado de verificación.
5. **Verificar.** Al cerrar, el organizador publica un paquete de auditoría y ancla su hash en Base Sepolia. Un **verificador independiente** (línea de comandos y navegador), que no toca la base de datos del organizador, recomputa el padrón, las pruebas, la unicidad de cada voto, la cadena de hashes, el recuento y el ancla. Cada votante puede comprobar que su boleta está incluida.
6. **Detectar manipulación.** En el laboratorio de auditoría se puede alterar una copia del paquete (quitar una boleta, inflar el total, inventar una prueba) y ver cómo el verificador falla con la causa exacta.

## Qué se puede comprobar (y qué no)

Lo que el verificador demuestra: elegibilidad sin identificar, un voto por credencial, integridad del registro, recuento reproducible y, si hay ancla, que el total no cambió después del cierre.

Lo que **no** afirmamos, porque no lo implementamos: secreto del contenido frente al servidor del organizador, resistencia a coacción, verificación de identidad civil. Usamos estados honestos (`pendiente`, `recibido`, `incluido`, `verificado`, `no verificable`, `fallo detectado`) y las limitaciones están documentadas en el repositorio. No es para elecciones públicas.

## Tecnología

Next.js + TypeScript · Semaphore v4 (pruebas de pertenencia y nullifiers, sin criptografía propia) · registro encadenado con SHA-256 · ancla en Base Sepolia vía el contrato `QuorumRegistry` · smart wallets ZeroDev · prueba de vida en el navegador (TensorFlow.js, WASM) · verificador CLI aparte · más de 480 tests unitarios, Playwright y E2E reales sin mocks.

**Demo:** la votación es ficticia, con opciones neutrales y sin premios.
