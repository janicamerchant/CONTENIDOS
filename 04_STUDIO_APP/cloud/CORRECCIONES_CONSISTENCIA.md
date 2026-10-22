# Correcciones de consistencia — cloud

21 de octubre de 2026, America/Santiago.

El flujo conserva una configuración de campaña, un modo y una revisión de contenido desde la propuesta hasta la entrega. Las correcciones se aplicaron al código cloud. No se modificaron el servidor Ruby, `.env` ni datos de producción.

## Cobertura de la auditoría

| Hallazgo | Corrección |
| --- | --- |
| 1. Identidad incompleta | Contexto estructurado con paleta, familias, caja, estilo y valores por defecto. Valores históricos de CSS como respaldo para las marcas que no tenían tokens explícitos. |
| 2. Marca mutable | Configuración congelada y firmada por servidor. Se conservan personas, fotos, logos, vestuario y reglas. La actualización de marca es explícita; el motor de la imagen/proyecto se conserva al regenerar. |
| 3. Asociación por índice | ID estable, revisión del contenido e imagen anterior. Reordenar no cambia el destinatario. Un resultado incompatible permanece recuperable en «Versiones generadas». |
| 4–5. Modos inconsistentes | Un constructor compartido para Crear, Solicitudes y Recuperar, con preservación de modo, investigación, personas y advertencias. |
| 6. Fuentes en capas | Las familias autorizadas tienen prioridad sobre la clasificación visual. |
| 7. Bloques antiguos | Serialización completa de bloques/plantilla y guardado antes de generar. El servidor rechaza revisiones no guardadas. |
| 8. Lease | Renovación periódica y cancelación si se pierde la titularidad. Generar imagen y separar capas se ejecutan en invocaciones diferentes. |
| 9. Prompts truncados | Preflight antes de reservar. El contenido obligatorio nunca se corta silenciosamente. |
| 10. Deshacer incompleto | Versiones completas de imagen, capas, motor y ajustes, con deshacer/rehacer. |
| 11. Entregas mezcladas | Exportación identificada por UUID, posiciones y revisión; publicación atómica al completar el lote. Las entregas antiguas conservan el último archivo de cada nombre y su orden natural. |
| 12. Motor incompatible | Capacidades comprobadas antes de reservar. Soul solo permite foto y una identidad entrenada; editable requiere Google. |
| 13. Logos secundarios | Resolución de recursos activa para ambas marcas; las cajas conservan identidad principal/secundaria. Un logo ambiguo se conserva en la imagen en vez de sustituirse por otro. |
| 14. Aceptación visual | Revisión humana explícita de todo el carrusel; aprobación firmada e invalidada ante cambios. Bloqueo de entregas sin revisión, imágenes ausentes, capas incompletas, recursos que no cargan y texto HTML fuera del lienzo. |
| 15. Contrato editorial/formato | Validaciones compartidas de cantidad, texto, fuentes de cifras, campos por layout, plantillas repetidas e idioma. Un intento de corrección de propuesta registra el uso total. Salida final común 4:5 sin recortar letras ni estirar rostros. |
| 16. Trazabilidad/pruebas | Manifiesto con prompt final, referencias, motor, modo y versión de marca. Lógica de recuperación separada de las sustituciones del build. Regresiones de contrato, API, SQL y navegador. |

`shared/carousel.ts` contiene el contrato compartido; `src/campaign.ts` conserva y firma identidad/revisión; `src/execution.ts` mantiene el lease; `src/deliveries.ts` agrupa versiones; `web/bridge.js` contiene la adaptación de recuperación.

La firma de campaña no sustituye los permisos: las referencias se vuelven a comprobar contra su marca o asociación de persona al usarlas. No se agregaron permisos públicos ni se expusieron claves al navegador.

## Comportamiento visible

- Crear y Solicitudes respetan el modo configurado en la marca. «Foto + texto editable» mantiene tipografía y logos compuestos por el Estudio; «Completa» conserva la tipografía generada dentro de la imagen.
- «Actualizar configuración de marca» conserva el proyecto y actualiza deliberadamente su configuración para futuras generaciones. Requiere volver a revisar el carrusel.
- Un error al separar capas conserva la imagen y muestra que faltan las capas; el modo editable no queda aprobado automáticamente.
- «Versiones generadas» permite recuperar texto e imagen de una generación anterior, incluso si la lámina fue eliminada. Toda recuperación requiere una nueva revisión antes de exportar.
- «He revisado el carrusel» registra la aprobación de la revisión actual. Editar contenido, capas o posiciones la invalida. La API verifica la firma antes de aceptar y publicar una entrega.
- Cada exportación es una versión independiente. Una subida interrumpida no aparece como carrusel terminado. Las descargas conservan los nombres originales y el orden de las láminas.

Los diseños completos generados con IA siguen requiriendo inspección humana de rostros, logos y texto rasterizado. No se promete identidad visual perfecta a partir de un prompt; el modo con texto/logos compuestos por el Estudio permite controlar esos elementos directamente. La comprobación automática de texto al separar capas rechaza discrepancias con el contenido esperado, pero no certifica la corrección factual de una cifra.

Flare no documenta 4:5 entre sus ratios. Se conserva su imagen dentro de un lienzo final 4:5 con el fondo de campaña; las dimensiones y las referencias quedan registradas. Véase la [referencia oficial de Flare](https://open.higgsfield.ai/models/marketing-studio/image/flare/api-reference). Los permisos existentes se mantienen de acuerdo con la [documentación de RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Validación

- `npm run check`: TypeScript y 70 pruebas locales, incluidas migraciones reales en PGlite, permisos, atomicidad de publicación, revisión firmada, recuperación, snapshots y prompts.
- `npm run build`: compilación completa del frontend.
- `npm run test:carousel-browser`: Chrome con API en memoria; revisión, dos exportaciones independientes, orden, regeneración después de reordenar, deshacer, tipografía y móvil. El PNG de ese ensayo es una fixture; no valida al proveedor ni el rasterizador externo.
- `node scripts/layout-audit.mjs`: diagramación real en Chrome, ajuste, jerarquía y zonas.
- `node scripts/audit-carousel-consistency.mjs`: acceso a las regresiones actuales; la evidencia de los defectos originales permanece en `artifacts/audit-consistency-20261021/`.

Las capturas y el recibo de navegador se guardan en `artifacts/consistency-fix/`. El smoke remoto usa cuentas y datos temporales, comprueba exportación PNG real y elimina sus registros al finalizar. Los resultados de la activación están en `artifacts/functional-report.json`.

## Activación en producción

La migración nueva es `supabase/migrations/20261021085544_carousel_exports.sql`. Añade metadatos de exportación, restricciones y el RPC de publicación, ejecutable únicamente por service role. Mantiene las entregas históricas. Fue aplicada y comprobada en el proyecto remoto `okgjpsntveloemjrsmjd` el 21 de octubre de 2026. Se verificó que `anon` no puede ejecutar el RPC y `service_role` sí.

La migración se aplicó antes del despliegue y se comprobó su historial. No se volvió a ejecutar la importación inicial.

El smoke remoto pasó con datos temporales, incluida una propuesta real de Claude y una imagen real de Higgsfield normalizada a PNG 1080×1350. Se comprobaron exportación PNG, galería, permisos, aprobación de portada y patrón de marca; los datos temporales se eliminaron. La aceptación estética de un patrón se realiza por marca en el Editor. Un cambio de la clave secreta de servidor exige actualizar la configuración congelada de los proyectos y volver a aprobarlos, porque invalida sus firmas anteriores.


## Portada, patrones y medición

Crear guarda el proyecto y genera únicamente su primera lámina. En el Editor, «Revisar y aprobar portada» firma el contenido, configuración e imagen exactos. «Generar láminas pendientes» genera las demás imágenes. Cambiar la portada invalida su aprobación; editar otra lámina la conserva. El servidor rechaza lotes que mezclan portada y resto y bloquea el resto mientras se regenera la portada. La revisión final del carrusel continúa siendo necesaria para exportar.

Después de revisar un carrusel completo, «Usar como patrón de marca» fija su diseño, fuentes, paleta, logos y dirección visual como referencia para próximas campañas. Guardar cambios en la identidad visual elimina el patrón anterior para que pueda revisarse de nuevo. No se marcaron automáticamente como aprobados los proyectos históricos.

Las siete marcas existentes tienen ahora `modo=foto`, fuentes y paletas explícitas para nuevas campañas. Los proyectos guardados conservan su modo y configuración propios. La generación de lámina completa sigue disponible al seleccionarla.

`npm run benchmark:carousel` genera `artifacts/benchmarks/latest.json` con un brief fijo por marca, validez estructural, imágenes fallidas, intentos adicionales y costos conocidos. Los costos nulos se informan aparte. La calidad visual sigue siendo una evaluación humana; los intentos adicionales no son una medida causal de insatisfacción. Los briefs reproducibles viven en `benchmarks/carousel-briefs.json`.

Checkpoint previo de metadatos: `backups/carousel-rollout-2026-10-21T08-54-30-446Z/`. Incluye marcas, proyectos, entregas, trabajos, archivos y recursos; no es una copia de objetos Storage ni de usuarios Auth.


Activación comprobada: `estudio-content-n7wvzeff2-asuaruizs-projects.vercel.app` promovido a `https://estudio-content.vercel.app` y `https://contentstudio.nikamediaus.com`. Ambos dominios devuelven la compilación verificada, login público y 401 en rutas privadas sin sesión. Recibo: `artifacts/deployment-receipt.json`. Despliegue anterior: `estudio-content-jciaso67v-asuaruizs-projects.vercel.app`.


## Regresión real con el guion de Janica «BLOQUE 90»

El 21 de octubre se ejecutaron dos propuestas y ocho imágenes reales con el guion de prueba guardado en `tests/fixtures/janica-bloque90.txt`. La prueba detectó una oferta gratis inventada, la pérdida del matiz de promedio, la atribución de ese promedio a un solo chequeo, corte de palabras dentro de columnas y cruces entre resaltados, etiquetas y folio. Se añadieron controles de fidelidad y correcciones del ajuste tipográfico y las zonas; 74 pruebas locales y los ensayos de Chrome pasan.

La revisión editorial del borrador también restauró el paso de atender la lista al terminar el bloque y ajustó la alineación de la cifra y el CTA a las fotos generadas. Es un resultado revisado, no una salida automática sin correcciones. La fuente original de Gloria Mark se conserva en el caption y el informe. La validación de consistencia no sustituye la verificación factual.

Proyecto conservado: `janica-bloque90-087073ec`. Exportación real verificada: ocho PNG de 1080×1350, orden e IDs correctos, Entregas completa. Informe, vista previa y ZIP en `artifacts/janica-bloque90/`. La cuenta de prueba quedó revocada y borrada lógicamente, conservando las referencias de autor e historial. Se mantuvo la identidad de Janica y no se aprobó un nuevo patrón de marca.

Despliegue de estas correcciones: `estudio-content-bgyzasl6r-asuaruizs-projects.vercel.app`, promovido y comprobado en ambos dominios públicos. Evidencia específica en `artifacts/janica-bloque90/deployment-checks.json`.
