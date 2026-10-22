# Auditoría de consistencia de carruseles — cloud

Fecha: 21 de octubre de 2026, America/Santiago.

**Estado posterior:** las correcciones se implementaron en cloud. Consulta [CORRECCIONES_CONSISTENCIA.md](CORRECCIONES_CONSISTENCIA.md) para la cobertura, pruebas y migración. Los hallazgos siguientes describen la versión anterior a la reparación.

## Dictamen

El flujo cloud no garantiza que el carrusel conserve su modo, dirección de arte, tipografías, asociación entre texto e imagen y orden de entrega a lo largo de su ciclo de vida. Hay defectos de estado reproducibles, además de variabilidad propia de generar diseños completos con IA. Modificar únicamente el prompt no resuelve el conjunto.

TypeScript, las 39 pruebas existentes, la compilación y la prueba de diagramación en Chrome pasan. Esas comprobaciones no cubren los escenarios que explican la inconsistencia. Se añadieron 13 reproducciones locales de diagnóstico; todas confirmaron el comportamiento descrito. No son pruebas de correcciones: afirman la presencia de los defectos actuales.

## Alcance y límites

- Solo `CONTENIDOS/04_STUDIO_APP/cloud`: API, generación, prompts, biblioteca, cola SQL, adaptación del frontend, editor, exportación y pruebas relacionadas con carruseles.
- `web/legacy/` sí está incluido: `scripts/build.mjs` lo usa para construir el frontend cloud. Su nombre no significa que sea código fuera de uso.
- Se revisaron también los controles de autenticación y las pruebas de aislamiento y presupuesto que protegen este flujo. No constituye una auditoría exhaustiva de Reels ni una certificación general de seguridad.
- El servidor Ruby y la configuración de marcas fuera de cloud quedan excluidos del diagnóstico.
- No se consultó ni modificó producción, no se cargó `.env` y no se hicieron generaciones pagadas. Las configuraciones y salidas guardadas en `artifacts/` son evidencia histórica del 7 de octubre, no el estado remoto del 21 de octubre.

## Flujo que realmente se ejecuta

```text
Crear / Solicitudes / Recuperar propuesta
  → trabajo de texto: brief + documentos + referencias seleccionadas
  → propuesta estructurada de Claude
  → borrador del navegador → proyecto guardado
  → lote de trabajos por posición de lámina
  → configuración actual de la marca + prompt por lámina
  → foto / diseño completo / diseño completo seguido de separación en capas
  → resultado aceptado + aplicación en editor / recuperación al abrir
  → render HTML a PNG → archivos → agrupación de entregas por nombre
```

## Hallazgos prioritarios

P1: puede alterar contenido, identidad visual o resultados de una operación normal. P2: defecto condicionado a un modo, configuración o caso límite. No se identificó un P0 demostrado en este alcance.

### 1. [P1] El contexto de la propuesta no transmite toda la identidad estructurada — C01

**Código:** [src/generation.ts:77](src/generation.ts#L77), especialmente la construcción del texto en la línea 86.

`knowledge()` transmite nombre, reglas, datos, personas y documentos. Omite `colors`, `fonts`, `titleCase`, `look` y `defaults` como campos estructurados. En modo completo se añade `sistema_visual` si existe, pero eso no sustituye el resto de la identidad cuando falta ese texto o está desactualizado.

**Reproducción:** una marca con un HEX, fuente e idioma exclusivos no transmite ninguno de esos valores en el contexto, si no están repetidos en documentos/reglas/brief.

**Impacto:** editar colores o fuentes en Marcas no asegura que Claude dirija la siguiente propuesta con esos valores. El generador de imágenes puede recibir una dirección distinta a la configurada.

**Corrección verificable:** serializar un contrato de identidad efectivo, con precedencia explícita entre configuración, documentos y brief. Comprobar que un cambio de fuente o paleta aparece en el contexto y en el plan visual.

### 2. [P1] La configuración visual no queda congelada por carrusel — C02

**Código:** [src/generation.ts:28](src/generation.ts#L28), [src/generation.ts:120](src/generation.ts#L120), [src/generation.ts:159](src/generation.ts#L159); [web/legacy/app.js:1461](web/legacy/app.js#L1461).

El trabajo guarda parte del proyecto, pero `imageRequest()` vuelve a leer la marca. `brand.sistema_visual` y `brand.evitar` tienen precedencia sobre el proyecto. Rostros, logos, vestuario y tratamiento también se seleccionan de la biblioteca vigente. El editor elige por defecto el motor actual de la marca, sin tomar el de la imagen ya generada como primera opción.

**Reproducción:** el mismo payload produce un prompt distinto después de cambiar `sistema_visual`, sin editar el proyecto ni el trabajo.

**Impacto:** cambiar la marca durante una cola o antes de regenerar una lámina puede mezclar sistemas visuales o motores dentro del mismo carrusel.

**Corrección verificable:** guardar la dirección de arte efectiva, versión de marca, motor y referencias exactas al aprobar. La regeneración usa esa versión hasta que el usuario elige actualizarla.

### 3. [P1] Reordenar láminas puede aplicar una imagen al contenido equivocado — C08

**Código:** [src/generation.ts:28](src/generation.ts#L28), [src/generation.ts:222](src/generation.ts#L222); [web/legacy/app.js:1497](web/legacy/app.js#L1497), [web/legacy/app.js:2110](web/legacy/app.js#L2110), [web/legacy/app.js:2322](web/legacy/app.js#L2322).

Los trabajos identifican la lámina por índice. El editor permite mover, duplicar y eliminar mientras hay generaciones. Tanto el polling como la recuperación usan ese índice. La recuperación comprueba la imagen anterior, pero no el ID de la lámina ni la versión del contenido; dos láminas vacías pasan la misma comprobación.

**Reproducción:** generar para A en posición 0, mover B a esa posición y recuperar el resultado coloca la imagen de A en B.

**Corrección verificable:** asociar trabajos con el ID estable de la lámina y un hash de la revisión solicitada. Reordenar durante la generación no cambia el destinatario; una revisión incompatible queda pendiente de aplicar.

### 4. [P1] Recuperar una propuesta pierde el modo elegido — C06

**Código:** [scripts/build.mjs:10](scripts/build.mjs#L10); [web/legacy/app.js:2064](web/legacy/app.js#L2064).

El adaptador que inyecta `cloudRecoverProposal` guarda `brief` pero omite `state.draft.modo`. `draftToProject()` consume este último campo y guarda modo vacío. El servidor puede entonces recurrir al modo actual de la marca. La recuperación también omite personas seleccionadas, investigación y modelos faltantes.

**Reproducción:** recuperar un brief `modo='editable'` deja `draft.modo` sin valor. La inferencia por nombres puede recuperar algunas personas, pero no reemplaza una selección explícita.

**Corrección verificable:** usar el mismo constructor de borrador en creación normal y recuperación; el documento resultante debe conservar modo, personas, advertencias e investigación.

### 5. [P1] Crear y Solicitudes toman modos distintos para la misma marca — C13

**Código:** [web/legacy/app.js:2137](web/legacy/app.js#L2137), [web/legacy/app.js:1768](web/legacy/app.js#L1768); [src/generation.ts:106](src/generation.ts#L106).

Para una marca `modo='completa'`, Crear selecciona `editable`, mientras Solicitudes selecciona `completa`. La primera vía genera el diseño y después lo reconstruye mediante detección, limpieza y texto HTML; la segunda conserva la imagen rasterizada.

**Impacto:** pedir el mismo carrusel por pantallas diferentes cambia su tratamiento, tiempos, coste y tipografías. Si fallan las capas, el trabajo termina como exitoso con una advertencia, por lo que también pueden mezclarse láminas editables y rasterizadas.

**Corrección verificable:** un único resolvedor de modo para todas las entradas; comprobar capacidades antes de aprobar. Separar los estados «imagen generada» y «edición por capas lista».

### 6. [P1] La separación en capas sustituye la fuente de marca — C12

**Código:** [src/layers.ts:61](src/layers.ts#L61), [src/layers.ts:81](src/layers.ts#L81).

`family()` asigna siempre Playfair Display/Lora a texto detectado como serif, Anton a condensada y otras familias fijas según categoría. Las fuentes de marca solo se consultan en la rama restante.

**Reproducción:** una marca con Instrument Serif recibe Playfair Display al convertir un titular serif a editable.

**Impacto:** «Hacer editable» puede cambiar el diseño aprobado y producir diferencias de tipografía entre láminas. La detección independiente por imagen tampoco fija una única escala tipográfica de campaña.

**Corrección verificable:** preferir las familias autorizadas de marca para cada rol y mantener tokens de tamaño/peso comunes. Una conversión a editable conserva las familias aprobadas.

### 7. [P1] La regeneración desde Crear puede conservar bloques antiguos — C07

**Código:** [web/legacy/app.js:91](web/legacy/app.js#L91), [web/legacy/app.js:2075](web/legacy/app.js#L2075); [src/generation.ts:28](src/generation.ts#L28).

`slidePayload()` omite `blocks` y `template`. La primera aprobación los conserva porque ya están en el proyecto guardado. Si después se edita el borrador antes de reintentar y `projectId` ya existe —por ejemplo, tras un rechazo de encolado—, `approve()` no vuelve a sincronizar ese contenido. El servidor mezcla el payload parcial con los bloques guardados.

**Reproducción:** borrador con titular de bloque «NUEVO», proyecto con «ANTIGUO» y reintento: la lista de texto exacto conserva «ANTIGUO». Esta lista tiene precedencia sobre el prompt libre.

**Corrección verificable:** enviar y guardar una revisión completa de la lámina antes de cada generación. Un rechazo de presupuesto seguido de edición y reintento debe usar el texto nuevo.

### 8. [P1] El lease vence antes del tiempo permitido a Google — C11

**Código:** [src/generation.ts:13](src/generation.ts#L13), [src/generation.ts:43](src/generation.ts#L43), [src/generation.ts:175](src/generation.ts#L175); [supabase/migrations/20260927005259_studio_cloud_foundation.sql:247](supabase/migrations/20260927005259_studio_cloud_foundation.sql#L247).

La llamada Google permite 720 segundos; el lease dura 600. Otra llamada al worker puede convertir el trabajo activo en `uncertain` y borrar su token. La respuesta tardía ya no puede guardarse con ese token. La separación automática en capas añade más tiempo después de generar la imagen, con lo que el margen también debe contemplar esa fase.

**Reproducción:** con las migraciones reales en PGlite, expirar el lease, reclamar y guardar con el token original deja el trabajo incierto y actualiza cero filas.

**Corrección verificable:** renovar el lease o dividir las fases con límites coherentes. Una respuesta válida entre los minutos 10 y 12 debe persistirse una sola vez.

### 9. [P2] El recorte de prompts puede eliminar texto obligatorio — C04

**Código:** [src/generation.ts:163](src/generation.ts#L163).

Se reducen tres segmentos, pero identidad, leyenda, bloques y lista exacta no tienen presupuesto conjunto garantizado. Si todavía se excede el límite, el `slice()` final corta el prompt completo silenciosamente. La longitud de `blocks` y sus textos no está acotada en el endpoint.

**Reproducción:** una lámina con bloques extensos produce 5.000 caracteres y pierde el último texto obligatorio. Es una prueba de estrés admitida por el contrato actual; no demuestra que todos los prompts habituales se corten.

**Corrección verificable:** preservar primero texto exacto, identidad y restricciones indispensables; rechazar el contenido que no cabe. Nunca enviar una cadena cortada a mitad de una sección obligatoria.

### 10. [P2] Deshacer una foto deja activas las capas nuevas — C09

**Código:** [web/legacy/app.js:1408](web/legacy/app.js#L1408), [web/legacy/app.js:671](web/legacy/app.js#L671).

Deshacer intercambia `image` y `cutout`, pero conserva `layers`, `full`, motor, tamaño y ajustes del resultado nuevo. Cuando hay capas activas, el render usa su `plate` y textos.

**Reproducción:** después de deshacer, `image='old'` y `layers.plate='new-plate'`.

**Corrección verificable:** conservar versiones completas del resultado visual. Restaurar una versión debe recuperar imagen, capas y metadatos de esa misma versión.

### 11. [P1] Entregas invierte el orden y mezcla exportaciones — C10

**Código:** [api/index.ts:63](api/index.ts#L63); [web/legacy/app.js:1593](web/legacy/app.js#L1593), [web/legacy/app.js:1841](web/legacy/app.js#L1841).

La exportación sube secuencialmente 01, 02… Cada subida crea un archivo nuevo. El API consulta por fecha descendente y agrupa exclusivamente por marca/carpeta. La unicidad es por archivo, no por versión de exportación o posición. La descarga vuelve a numerar las imágenes según el orden recibido.

**Reproducción:** dos exportaciones de dos láminas se presentan como un grupo de cuatro: 02-v2, 01-v2, 02-v1, 01-v1.

**Impacto:** un carrusel puede generarse bien y descargarse narrativamente invertido o con láminas de versiones anteriores.

**Corrección verificable:** identificar cada exportación, guardar posiciones y revisionar sus archivos. Descargar dos veces no duplica láminas; el ZIP mantiene exactamente la secuencia aprobada.

### 12. [P2] Un motor incompatible cambia silenciosamente el tipo de salida — C05

**Código:** [src/generation.ts:18](src/generation.ts#L18), [src/generation.ts:25](src/generation.ts#L25), [src/generation.ts:122](src/generation.ts#L122), [src/generation.ts:184](src/generation.ts#L184).

Soul se anuncia entre los motores disponibles cuando existe la credencial de Higgsfield. Se acepta para proyectos completos/editables, pero `imageRequest()` devuelve `full=false`, pide ausencia de texto y no exige una persona con Soul ID completado.

**Corrección verificable:** una matriz de capacidades debe filtrar o rechazar combinaciones incompatibles antes de reservar. No convertir un diseño completo en foto sin avisar.

### 13. [P2] Los logos secundarios no tienen la misma resolución que el principal — C03

**Código:** [src/library.ts:29](src/library.ts#L29), [src/library.ts:31](src/library.ts#L31); [src/generation.ts:144](src/generation.ts#L144).

El logo principal resuelve su `src` contra los recursos; `byline.logos` se copia sin ese paso. Si solo tiene `src`, el motor no recibe su imagen. Una identidad importada que ya conserve `url` puede funcionar, por lo que este defecto depende de cómo fue configurada o actualizada la marca.

Además, las capas de logo no conservan identidad de marca: la detección devuelve `name`, pero el mapeo lo descarta. `layeredHtml()` usa el logo principal para todas las cajas detectadas ([src/layers.ts:84](src/layers.ts#L84), [web/legacy/app.js:749](web/legacy/app.js#L749)). Un cierre con EVA y Nika Media puede reconstruirse con el mismo logo en ambas posiciones.

**Corrección verificable:** resolver y validar ambas familias de logos, conservar el ID del recurso en cada caja y probar un cierre con marca principal y respaldo.

## Riesgos de diseño confirmados por inspección

Estos puntos se deducen de la implementación; no son nuevas generaciones de prueba.

### 14. [P1] No hay aceptación visual del resultado ni del conjunto

[src/generation.ts:104](src/generation.ts#L104), [src/generation.ts:178](src/generation.ts#L178), [src/generation.ts:193](src/generation.ts#L193).

Una imagen descargada o recibida se guarda como exitosa sin cotejar textos, logos, márgenes o coherencia entre láminas. La limpieza de capas revisa restos de texto; no verifica que el resultado editorial coincida íntegramente con la propuesta. El exportador tampoco exige revisión aprobada y puede exportar marcadores de foto.

En modo completo, cada imagen vuelve a generar tipografía y logos. No recibe una plantilla aprobada ni la portada producida como contrato visual del conjunto. Compartir un bloque de estilo ayuda, pero no fija coordenadas, fuentes, escalas ni geometría de marca.

**Dirección recomendada:** generar fotografías/escenas y componer texto y logos con recursos deterministas para el flujo que exige consistencia. Si se mantiene diseño completo, incluir una revisión de texto por lámina y una revisión visual del conjunto antes de marcarlo listo para entrega. Añadir un estado de revisión humana sin confundir «proveedor terminó» con «carrusel aprobado».

### 15. [P2] Formato y validaciones no forman un contrato único

- Google pide 4:5; Flare y Soul se solicitan en 3:4 ([src/generation.ts:175](src/generation.ts#L175), [src/generation.ts:184](src/generation.ts#L184)). El frontend conserva la imagen y rellena con fondo desenfocado ([web/legacy/app.js:679](web/legacy/app.js#L679)). Cambiar motor puede cambiar área útil y márgenes. No se verificó qué formatos admiten hoy los proveedores; el hallazgo describe las solicitudes del código.
- La propuesta acepta entre 1 y 30 láminas; el encolado acepta un máximo de 10 por lote. No se verifica la cantidad pedida en el brief, el límite de palabras, la correspondencia layout/campos, la presencia de fuentes o la no repetición de plantillas. El esquema estructurado controla forma y enums, no estas reglas editoriales.
- Las instrucciones genéricas de modo completo piden titulares condensados en mayúsculas y tipografía en español, mientras las reglas editoriales posteriores piden respetar fuentes y caja de la marca. El encabezado de texto exacto también fija «Spanish» para marcas con contenido en inglés. Deben resolverse las reglas por marca, modo e idioma antes de enviar el prompt.

**Criterio:** contrato compartido de cantidad, idioma, dimensiones, campos y capacidades; validación antes de reservar imágenes y antes de exportar.

### 16. [P2] Faltan trazabilidad y cobertura del contrato visual

Se guarda el prompt base, pero no el prompt final ya ensamblado/recortado, la lista efectiva de referencias ni la versión de la configuración de marca usada. El hash del payload no permite reconstruir esos valores si cambia la marca. El armado mediante sustituciones de strings en `build.mjs` también concentra lógica de recuperación fuera del constructor normal.

Las pruebas actuales protegen especialmente permisos, presupuesto, versiones y una parte de diagramación. Las de Solicitudes sustituyen funciones como `slidePayload`, por lo que no detectan la omisión real de bloques. No hay regresión integrada para reordenar durante generación, recuperar modos, restaurar capas, preservar fuentes ni versionar entregas.

**Criterio:** guardar un manifiesto por ejecución con identidad efectiva, texto aprobado, prompt final, referencias, modo, motor y resultado de revisión. Convertir las reproducciones de esta auditoría en pruebas que afirmen el comportamiento corregido.

## Evidencia visual histórica

Se inspeccionaron las hojas de contacto de EVA, Janica y City Kia guardadas en `artifacts/audit-flare-20261007/`. Las tres mantienen rasgos generales de campaña; eso no equivale a respetar cada restricción.

- Janica muestra contadores `1/5`…`5/5` y firmas gráficas variables. El prompt final actual prohíbe contadores. Sin el prompt final guardado de aquella ejecución no se puede atribuir el incumplimiento a una versión concreta; sí demuestra por qué una respuesta exitosa del proveedor no debe considerarse aprobación visual.
- EVA alterna tamaño, posición y tratamiento de firmas entre láminas. Parte puede ser dirección creativa intencional; el sistema no define qué diferencias acepta ni las comprueba.
- Los originales de Flare inspeccionados miden 1744 × 2336; el exportador trabaja sobre 1080 × 1350. El relleno lateral es parte del flujo actual, no un fallo de carga del visor.

No se usaron estas muestras para afirmar que el estado de producción actual sea idéntico.

## Orden de corrección propuesto

1. **Integridad del flujo:** IDs estables de lámina, revisión de contenido, sincronización completa de bloques, conservación del modo, restauración completa de resultados, lease coherente y exportaciones con orden/versiones.
2. **Contrato de marca:** contexto estructurado, configuración congelada por proyecto, capacidades de motor, fuentes de marca en capas y correspondencia exacta de logos.
3. **Control de calidad:** composición determinista para texto/logos, validación editorial y visual, manifiesto de ejecución y regresiones con ejemplos de las marcas.

La aceptación debe incluir el mismo brief desde Crear, Solicitudes y Recuperar; regeneración después de cambiar la marca; reordenación con un trabajo pendiente; conversión a editable; deshacer; doble exportación y descarga del ZIP. Cada caso debe preservar el modo y la revisión aprobada, las familias tipográficas y los logos, la asociación texto/imagen y el orden final.

## Validación ejecutada y archivos generados

| Comprobación | Resultado | Alcance |
| --- | --- | --- |
| `npm run check` | TypeScript y 39 pruebas aprobadas | Suite existente, incluida DB local PGlite |
| `npm run build` | Aprobada | Frontend cloud regenerado en `dist/` |
| `node scripts/layout-audit.mjs` | Aprobada | Chrome: jerarquía, agrupación, overflow, zonas y copia del recorte |
| `node scripts/audit-carousel-consistency.mjs` | 13 observaciones reproducidas | Código real aislado con dobles locales y migraciones reales en PGlite; sin red |

Diagnóstico reproducible: [scripts/audit-carousel-consistency.mjs](scripts/audit-carousel-consistency.mjs).

Resultados estructurados: `artifacts/audit-consistency-20261021/reproductions.json` (carpeta ignorada por la configuración del proyecto).

Esta auditoría añade el informe y el diagnóstico; no implementa correcciones de comportamiento ni despliegues. La compilación y la comprobación visual regeneraron sus artefactos locales habituales.
