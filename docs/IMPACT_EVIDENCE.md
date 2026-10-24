# Impacto y evidencia — Quórum

**Regla de este documento (spec §1, §11, §12; agente quorum-demo):** toda afirmación factual lleva fuente y fecha de consulta. Lo que no tiene fuente se marca **[SUPUESTO]** y no se presenta como dato. No se usan porcentajes de fraude evitado, tamaños de mercado ni cifras de adopción. No se usa política real como ejemplo en el pitch.

Fecha de consulta de todas las fuentes: 2026-10-24 (America/Caracas), salvo que se indique otra.

---

## 1. Problema

En una votación interna digital (o en papel contado por la junta), **quien organiza suele ser también quien cuenta y anuncia el total**. Los participantes no tienen una forma práctica de comprobar por su cuenta que el número anunciado corresponde a los votos emitidos. La alternativa habitual para dar transparencia —listas nominales de quién votó qué— expone preferencias de vecinos, compañeros o socios que conviven a diario.

Quórum propone separar las dos cosas: el voto viaja con una prueba de que la persona está en el padrón y no ha votado antes (Semaphore), el registro de votos queda encadenado por hashes y **cualquiera puede recalcular el resultado** con un verificador que no depende de la base de datos del organizador.

## 2. Para quién

| Segmento | Decisiones típicas (ejemplos) | Por qué le sirve |
|---|---|---|
| **Condominios** (juntas y asambleas de propietarios) | priorizar obras, aprobar gastos comunes, elegir junta | Las decisiones de asamblea pueden impugnarse; tener evidencia comprobable del resultado reduce la discusión a hechos verificables **[SUPUESTO de valor, sin medir]**. |
| **Universidades** (centros de estudiantes, consejos de facultad, asociaciones) | representantes, consultas internas, presupuestos participativos | Comunidades grandes y distribuidas, con votación remota frecuente **[SUPUESTO]**. |
| **Cooperativas** | destino de excedentes, aprobación de balances, consultas | La ley venezolana exige decisiones democráticas y actas (ver §3.2). |
| **Comunidades y asociaciones civiles** (clubes, gremios, ONG) | consultas, asignación de fondos pequeños | Recursos limitados para auditorías externas **[SUPUESTO]**. |

**Alcance geográfico:** Venezuela primero (equipo y jurado locales), extensible a LatAm por idioma. **No tenemos datos de cuántas organizaciones de cada tipo existen en Venezuela o LatAm ni de cuántas votan en línea;** no se citan cifras de mercado.

**Fuera de alcance:** elecciones públicas o gubernamentales, campañas, partidos. Quórum no es alternativa a ellas (spec §12).

---

## 3. Evidencia citable

### 3.1 Condominios en Venezuela: los acuerdos de asamblea son impugnables y llegan a tribunales
- **Ley de Propiedad Horizontal (Venezuela), art. 25:** los tribunales la citan para permitir que cualquier propietario impugne ante el juez los acuerdos de la mayoría por violación de la ley o del documento de condominio, o por abuso de derecho. Varias decisiones citan un lapso de 30 días.
  - Fuentes secundarias (decisiones judiciales que citan el artículo, no el texto oficial de la ley): Acceso a la Justicia, Sala de Casación Civil, "Mayoría necesaria para modificar porcentajes de propietarios en el documento de condominio", https://accesoalajusticia.org/mayoria-necesaria-para-modificar-porcentajes-de-propietarios-en-el-documento-de-condominio/ ; vLex Venezuela, Juzgado Superior Décimo Civil de Caracas (2012), https://vlexvenezuela.com/vid/varina-marco-cecere-alinson-premier-388986464 .
  - **Limitación:** no pudimos abrir el texto oficial en Gaceta Oficial; las páginas de Acceso a la Justicia devolvieron 403 al consultarlas directamente. **Verificar el texto vigente antes de citarlo en el escenario.**
- **Disputas sobre elecciones de juntas de condominio llegan hasta la Sala Electoral del TSJ.** Acceso a la Justicia reseña una decisión que anuló la exclusión de una candidata a la presidencia de una junta de condominio. https://accesoalajusticia.org/sala-electoral-anula-elecciones-de-junta-de-condominio/
  - **Limitación:** visto solo por el resumen del buscador (403 al abrir). No se cita número ni fecha de sentencia hasta verificarlos.
- **Qué NO dice esta evidencia:** no dice cuántas disputas hay, ni que se deban a conteos falsos, ni que Quórum las evitaría. Solo muestra que la validez de acuerdos y elecciones de condominio es materia de conflicto real y formal.

### 3.2 Cooperativas en Venezuela: decisiones democráticas y actas obligatorias
- **Decreto con Fuerza de Ley Especial de Asociaciones Cooperativas** (Decreto N.º 1.440, 30-ago-2001; Gaceta Oficial N.º 37.285 del 18-sep-2001 según la copia consultada). Texto en FAOLEX: https://faolex.fao.org/docs/pdf/ven130336.pdf
  - Art. 4: entre los principios cooperativos, "gestión democrática de los asociados".
  - Art. 27: "Las decisiones se tomarán en forma democrática. Será potestad de cada organización optar por formas democráticas de consenso, votación o mixtas."
  - Art. 28: quórum y modalidades se fijan en el estatuto; "las elecciones se realizarán en forma nominal"; en asambleas "no se podrá representar a más de un asociado salvo en aquellas que se realicen por delegados".
  - Art. 29: de cada asamblea se levanta acta firmada con presentes, puntos tratados y decisiones.
  - **Implicación honesta:** Quórum encaja mejor en **consultas y decisiones** (art. 27) que en **elecciones de instancias**, porque el art. 28 exige que estas sean "en forma nominal" (interpretación jurídica pendiente: ver `docs/KNOWN_LIMITATIONS.md`). Quórum no sustituye el acta del art. 29; puede adjuntarle evidencia.
- **Alianza Cooperativa Internacional (ACI/ICA):** el 2.º principio cooperativo, "control democrático de los miembros", establece que en cooperativas de primer grado los miembros tienen iguales derechos de voto (un miembro, un voto). Estatutos de la ICA (2009): https://ica.coop/sites/default/files/attachments/2009-ica-statutes.pdf . Hay un borrador de revisión de la Declaración de Identidad Cooperativa (jun-2026) aún en discusión: https://coopidentity.ica.coop/ — no citar el borrador como vigente.

### 3.3 Votación verificable en organizaciones: existe precedente, y también fallas operativas
- **IACR usa Helios** (sistema de votación verificable) para sus elecciones internas desde 2010. Informe de la elección 2010: https://www.iacr.org/elections/2010/IACR2010ElectionReport.pdf . Ese informe reporta que la participación fue mayor que con el voto postal anterior; **no usamos el porcentaje** porque es una sola organización de criptógrafos y no es comparable con un condominio.
- **IACR, noviembre 2025:** la elección no pudo concluirse porque uno de los tres custodios de claves (trustees) perdió irremediablemente su clave privada; se repitió la votación y se anunció un esquema 2-de-3. https://www.iacr.org/news/item/27138 ; acta de junta: https://www.iacr.org/docs/minutes/minutes_bod_virtual-11-25.pdf
  - **Lección para Quórum:** la criptografía correcta no basta; la operación (custodia de claves, disponibilidad) es un riesgo propio. Quórum Plan A no depende de custodios para descifrar, pero sí del organizador como único escritor del registro (ver limitaciones).
- **Helios** documenta sus propias limitaciones frente a la coacción: https://heliosvoting.org/ (referencia de la spec §1.1).

### 3.4 Blockchain no resuelve por sí sola la seguridad del voto
- **National Academies of Sciences, Engineering, and Medicine (2018), *Securing the Vote: Protecting American Democracy*.** Concluye que el retorno de boletas por Internet no debe usarse en elecciones públicas con la tecnología actual y que la blockchain, por sí sola, no resuelve los problemas de seguridad electoral. https://nap.nationalacademies.org/catalog/25120/securing-the-vote-protecting-american-democracy
  - **Cómo lo usamos:** como límite, no como argumento a favor. Por eso Quórum se limita a decisiones internas de bajo riesgo y usa la cadena (opcional) solo como ancla de un hash, no como garantía de verdad.

### 3.5 Base técnica (fuentes del motor)
- Semaphore v4 (pruebas de pertenencia a grupo con nullifier): https://docs.semaphore.pse.dev/guides/proofs — versión `@semaphore-protocol/core@4.14.5`, probada por el equipo el 2026-10-24 (ver `docs/ADR-001-voting-engine.md` y `docs/TEST_RESULTS.md`).
- Base Sepolia, chainId 84532: https://docs.base.org/chain/network-information

### 3.6 Fuente que la spec menciona y que NO usamos en el pitch
- El informe del Carter Center (2024) sobre una elección presidencial venezolana aparece en la spec §1.1 como contexto. **No lo citamos en la demo ni en el pitch** porque se refiere a una elección política real y la política de claims prohíbe usar política real. Tampoco sería evidencia de que Quórum resuelva algo en ese ámbito.

---

## 4. Cómo mediremos impacto durante el hackathon (spec §11)

No hay usuarios reales todavía. Lo que se puede medir hoy, con muestra pequeña y sin generalizar:

| Hipótesis | Métrica | Cómo | Resultado |
|---|---|---|---|
| H1: un observador no técnico distingue un escrutinio válido de uno alterado | aciertos y tiempo | 5 sesiones con personas del evento (si se ofrecen), usando `/audit/lab` | _pendiente_ |
| H2: una persona vota en el móvil sin ayuda | tiempo de inscripción y de voto, abandonos | ensayos y demo en modo sala abierta (público con su propio teléfono) | _pendiente_ |
| H3: un tercero verifica los mismos artefactos sin acceso privilegiado | coincidencia de `sha256` del paquete y del resultado en dos máquinas | Laptop B + móvil | _pendiente_ |
| Integridad | alteraciones probadas / detectadas por tipo | fixtures + laboratorio | 7 fixtures de manipulación definidos; 1 (`removed_record_rechained`) **no** se detecta sin ancla (por diseño, documentado). Ver `packages/demo-fixtures/protocol/README.md` |

Resultados se registran en `docs/DEMO_SCRIPT.md` §8 con fecha y hora.

## 5. Lo que NO afirmamos
- Que Quórum reduzca el fraude en un porcentaje, ni que lo haya evitado en algún caso.
- Que haya demanda medida en Venezuela o LatAm.
- Que sustituya los requisitos legales de convocatoria, quórum, actas o impugnación de cada tipo de organización.
- Que sirva para elecciones públicas.

## Claims (formato quorum-demo)
```json
{"files":["docs/IMPACT_EVIDENCE.md"],
 "claims":[
  {"text":"Cualquier propietario puede impugnar acuerdos de la mayoría (LPH art. 25, según decisiones judiciales)","source":"accesoalajusticia.org; vlexvenezuela.com (secundarias)","date":"consultado 2026-10-24; texto oficial pendiente"},
  {"text":"Las decisiones en cooperativas se toman en forma democrática (consenso, votación o mixta)","source":"Decreto Ley Especial de Asociaciones Cooperativas, art. 27, FAOLEX","date":"2001; consultado 2026-10-24"},
  {"text":"IACR usa Helios para sus elecciones desde 2010","source":"iacr.org/elections/2010/IACR2010ElectionReport.pdf","date":"2010; consultado 2026-10-24"},
  {"text":"IACR no pudo concluir su elección 2025 por pérdida de la clave de un custodio","source":"iacr.org/news/item/27138","date":"2025-11-21; consultado 2026-10-24"},
  {"text":"Blockchain por sí sola no resuelve la seguridad electoral","source":"NASEM, Securing the Vote","date":"2018; consultado 2026-10-24"}
 ],
 "needs_from_team":["Verificar texto oficial LPH art. 25 en Gaceta","Revisión jurídica de 'forma nominal' (art. 28 cooperativas)"]}
```
