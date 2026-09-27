# Estudio en Vercel + Supabase

Sitio: https://estudio-content.vercel.app

El frontend está en `web/legacy/` con su adaptación en `web/cloud.js`. El servidor Ruby y los archivos del Estudio local se mantienen independientes.

## Funciones

- Login, alta inicial de administrador, enlace privado para elegir contraseña y cierre de sesión. Registro público desactivado.
- Proyectos con autoguardado y versiones; un conflicto no sobrescribe una edición más reciente.
- Marcas: identidad, reglas, datos, documentos, logos, referencias, vestuario, papelera, archivo y restauración. Personas compartidas y sus fotos solo se administran con rol admin.
- Solicitudes: creación, consulta, actualización y borrador con IA.
- Propuestas y perfiles con Claude Sonnet 4.6, documentos de marca y búsqueda web acotada; imágenes con Higgsfield GPT Image 2.5 Flare, fotos aprobadas y vestuario como referencias.
- Cola persistente: reserva atómica del lote completo, claves de idempotencia, leases y cron cada minuto. Un envío de resultado incierto no se reenvía automáticamente. Consultar estado también impulsa la cola.
- Imágenes generadas recuperables al reabrir el proyecto. El cliente conserva referencias `storage://` al guardar, nunca URLs temporales.
- Subidas directas a Storage; archivos grandes usan TUS con firma. Galerías con URLs firmadas y carga diferida, sin descargar todos los originales antes de mostrar la página.
- Recorte de personas en el navegador con MediaPipe; no necesita una clave ni envía la imagen a un servicio de recorte.
- Exportación PNG y entregas en Storage privado.

## Seguridad y presupuesto

Las tablas mantienen RLS y los secretos solo se usan en servidor. Las APIs comprueban usuario, miembro activo, rol y marca; los RPC de escritura privilegiados solo son ejecutables por service role. Los cambios de identidad/asociaciones y las reservas de generación se guardan en transacciones.

Se reserva US$2 por propuesta/perfil o imagen. Claude registra el coste calculado desde el uso devuelto. Higgsfield tiene precio variable; si la respuesta no incluye coste confirmado, se conserva la reserva en el presupuesto del Estudio. Esta reserva no equivale a una factura del proveedor. El límite mensual se configura por miembro en `miembros.limite_mensual_usd`.

Un trabajo `uncertain` requiere revisar su ID y el historial del proveedor antes de liberar presupuesto o generar nuevamente. No hay reintentos automáticos de envíos ambiguos. Las imágenes terminadas permanecen en `trabajos.resultado` aunque se cierre el navegador; el proyecto recupera el resultado si su imagen original no fue reemplazada.

## Variables de producción

Configurar en Vercel: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ANTHROPIC_API_KEY`, `HF_CREDENTIALS` y `CRON_SECRET`. Las cuatro últimas son secretos. No subir `.env` ni `SUPABASE_ACCESS_TOKEN`.

Solo se muestran motores conectados: Google y OpenAI directos no están configurados en esta instalación. No se requieren para el motor Higgsfield disponible.

## Desarrollo y validación

- `npm run dev`: servidor local (puerto 4322; variable `PORT` para cambiarlo).
- `npm run build`: crea `dist/` desde cero, incluido el modelo de recorte y su runtime WASM.
- `npm run check`: TypeScript y pruebas de permisos, versiones y presupuesto.
- `npm run test:integration`: comprobaciones remotas con usuarios/datos temporales y limpieza.
- `npx tsx scripts/functional-test.ts`: flujos API/navegador contra `TEST_SITE` (por defecto `http://127.0.0.1:4323`). Crea y elimina una marca de prueba.
- Añadir `--cutout` para probar segmentación y subida, `--ai` para una propuesta y una imagen reales, `--profile` para un perfil real. Las opciones IA consumen créditos del proveedor.

La auditoría histórica y su estado de resolución están en [AUDITORIA_PRODUCCION.md](AUDITORIA_PRODUCCION.md).

## Datos y operación

La importación inicial incluyó 298 archivos, 9 proyectos, 20 entregas, 3 marcas, documentos comunes y 3 personas. El recibo y los hashes están en `artifacts/` local (ignorado por Git). `npm run inventory`, `npm run migrate:verify` y `npm run backup` mantienen las herramientas de inventario, comprobación y copia.

Las migraciones están en `supabase/migrations/`; el proyecto remoto es `okgjpsntveloemjrsmjd`. `scripts/apply-migration.mjs` usa Management API y sincroniza la versión del archivo con el historial remoto. No se vuelve a ejecutar la importación sobre datos editados en cloud.

SMTP e invitaciones por email no están configurados. El acceso existente usa contraseña. MediaPipe segmenta personas, no objetos generales; todo resultado generativo debe revisarse visualmente antes de publicar contenido.

Referencias de implementación: [Higgsfield API](https://open.higgsfield.ai/models/marketing-studio/image/flare/api-reference), [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Supabase TUS firmado](https://supabase.com/docs/guides/storage/uploads/resumable-uploads#presigned-uploads), [MediaPipe](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js).
