# Quórum

**Nadie tiene que creerle a quien cuenta.**

Infraestructura de confianza para decisiones colectivas. Cada voto trae una prueba matemática y cualquiera recalcula el resultado desde su propio teléfono, sin confiar en quien organiza.

## El problema

Toda votación la organiza alguien. Y toda la confianza termina en esa persona: si contó mal, si dejó una boleta fuera, si cambió el total, nadie puede demostrarlo. Lo vivimos en el condominio, en la universidad, en la cooperativa y, en su versión más grave, en un país entero. El votante entrega su voto y recibe a cambio una promesa.

Quórum cambia la promesa por una prueba.

## La demo: una elección presidencial simulada

Para que se sienta de verdad, en la demo montamos una **elección presidencial ficticia** (candidatos inventados, sin partidos ni nombres reales, sin premios). Todo el público vota desde su teléfono y el jurado hace de auditor:

1. **Se abre la elección.** El organizador proyecta un QR. Candidatos con foto y subtítulo en la pantalla grande.
2. **Cada persona entra desde su teléfono.** Escanea, escribe un alias y mira a la cámara: comparamos un vector numérico del rostro para que nadie se inscriba dos veces. No guardamos fotos. Se le crea una credencial y una smart wallet sin gas sin que tenga que entender nada de eso.
3. **Vota en dos toques.** Al votar, el teléfono genera una prueba criptográfica (Semaphore v4) de que la boleta la emitió alguien del padrón, sin revelar quién. Una credencial, un voto.
4. **La sala ve el escrutinio en vivo.** Inscritos, participación y el desglose por candidato cambian delante de todos. Al cerrar, aparece el ganador con su estado de verificación.
5. **Se publica el paquete y se ancla.** El organizador cierra, publica el paquete de auditoría y ancla su hash en Base Sepolia.
6. **El jurado verifica sin confiar en nosotros.** Un **verificador independiente**, que no toca la base de datos del organizador, recomputa el padrón, las pruebas, la unicidad de cada voto, la cadena de hashes, el recuento y el ancla. Cada votante comprueba que su boleta está incluida.
7. **Intentamos hacer fraude en público.** En el laboratorio de auditoría el jurado altera una copia del paquete: quita una boleta, infla el total del candidato que quiera, inventa una prueba. El verificador falla y dice exactamente qué se tocó.

Ese último paso es el producto: un resultado que no se puede manipular sin que se note.

## Qué garantiza y qué no

Lo que el verificador demuestra: elegibilidad sin identificar, un voto por credencial, integridad del registro, recuento reproducible por cualquiera y, con ancla, que el total no cambió después del cierre.

Lo que **no** afirmamos, porque no lo implementamos: secreto del contenido frente al servidor del organizador, resistencia a coacción ni verificación de identidad civil. Usamos estados honestos (`pendiente`, `recibido`, `incluido`, `verificado`, `no verificable`, `fallo detectado`) y las limitaciones están documentadas en el repositorio. Hoy Quórum es para organizaciones (condominios, universidades, cooperativas, gremios, comunidades); la elección presidencial de la demo es una simulación para mostrar, en el escenario que todos entienden, lo que una votación verificable puede ser.

## Tecnología

Next.js + TypeScript · Semaphore v4 (pruebas de pertenencia y nullifiers, sin criptografía propia) · registro encadenado con SHA-256 · ancla en Base Sepolia vía el contrato `QuorumRegistry` · smart wallets ZeroDev sin gas · prueba de vida en el navegador (TensorFlow.js, WASM) · verificador independiente en CLI y navegador · más de 480 tests unitarios, Playwright y E2E reales sin mocks.
