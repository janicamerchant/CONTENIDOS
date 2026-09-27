# Reparación y verificación en producción

Actualización: 26 de septiembre de 2026 (27 de septiembre UTC).
Sitio: https://estudio-content.vercel.app
Despliegue: `dpl_Bp1bkM1Ye2xJ9U6NNtShALUqxMup`.

Las rutas ausentes de la auditoría inicial se implementaron y publicaron. El registro histórico aparece al final; sus fallos describen la versión anterior.

## Cambios

- Marcas, documentos comunes, recursos y personas: lectura, edición, archivos, asociaciones, archivo y restauración. Identidad/asociaciones con transacciones; edición de marcas con control de versión.
- Solicitudes: creación y actualización persistentes.
- IA: Claude Sonnet 4.6 para propuestas y perfiles; Higgsfield Flare para imágenes. Variables privadas en servidor y disponibilidad real en la interfaz. Reserva atómica de presupuesto, idempotencia, cola persistente, cron protegido y recuperación de imágenes al reabrir.
- Recorte de personas: segmentación local en el navegador y subida firmada por TUS.
- Entregas: URLs firmadas por lotes, carga de imágenes sin descargar previamente toda la biblioteca y renovación de enlaces.
- Exportación: imágenes con CORS, textura SVG compatible, ruta correcta y fondos originales de EVA asociados como copias privadas.
- Navegación y tamaño de los paneles: scroll y adaptación móvil sin desbordamiento horizontal en la ventana probada.

## Evidencia

- TypeScript, compilación y 28 pruebas automatizadas aprobadas.
- Nueve comprobaciones remotas de aislamiento, permisos, conflictos de guardado y presupuesto concurrente aprobadas; cuentas y datos temporales eliminados.
- Perfil de marca real generado con Claude; propuesta real e imagen real comprobadas durante el desarrollo.
- Producción: API de marcas/personas/documentos/solicitudes, guardado del editor, PNG, galería, recorte de una foto real y controles de acceso comprobados con cuenta temporal.
- Producción: carrusel de dos láminas con foto real exportado; móvil a 390 × 844 sin desbordamiento; sin errores de JavaScript. Propuesta Claude con idempotencia e imagen Higgsfield completadas; recuperación de imagen al reabrir confirmada. Archivo/restauración aprobados y datos temporales eliminados.
- Dependencias de producción: `npm audit --omit=dev` sin vulnerabilidades conocidas.
- Endpoint del ejecutor: 401 sin secreto; 200 con el secreto de cron.
- Escaneo de secretos: ninguna clave privada encontrada en los archivos de código ni en el frontend compilado.

## Límites que siguen aplicando

No se certifica paridad visual de todos los diseños con Ruby ni todos los navegadores. La segmentación sirve para personas; los resultados generativos requieren revisión visual. Solo están conectados Anthropic e Higgsfield; no se anuncian como disponibles motores sin credenciales. SMTP e invitaciones por email no están configurados. El asesor de Supabase todavía advierte que la protección contra contraseñas filtradas está desactivada; no se modificó la contraseña de usuarios existentes.

Higgsfield no devuelve un coste confirmado en la respuesta utilizada: la reserva de US$2 se conserva para el límite interno. No representa una factura real. Los trabajos de resultado incierto no se reenvían automáticamente para evitar cobros duplicados.

Las pruebas usan datos temporales y los eliminan. Evidencia detallada local, ignorada por Git: `artifacts/functional-report.json` y artefactos de auditoría. Las pruebas con IA consumen créditos reales.

---

# Auditoría funcional de Estudio en producción — registro inicial

Fecha: 26 de septiembre de 2026 (Santiago; ejecución 27 de septiembre UTC).
Destino: https://estudio-content.vercel.app

**Resultado: la migración es parcial. La aplicación no está lista como sustituto completo del Estudio local.** Que el despliegue compile y las claves estén configuradas no implica que todas las funciones estén implementadas.

## Hallazgos prioritarios

| Prioridad | Función | Evidencia e impacto |
| --- | --- | --- |
| Alta | Marcas | `GET /api/brands/:id` devuelve 404. La lista funciona, pero abrir una marca muestra «Ruta no disponible». Crear, editar, archivar, restaurar y gestionar recursos también carecen de rutas. |
| Alta | Documentos comunes y personas | `GET /api/brands/_comun` y `GET /api/people` devuelven 404. Tampoco están disponibles las operaciones de personas/fotos. Los datos migrados no equivalen a una interfaz operativa para administrarlos. |
| Alta | Solicitudes | La consulta responde 200; `POST /api/requests` devuelve 404. No se pueden guardar nuevas solicitudes desde el formulario. |
| Alta | IA | `/api/propose`, `/api/draft`, `/api/generate` y `/api/cutout` devuelven 404. Falta implementar y conectar ejecutores; la cola SQL por sí sola no ejecuta proveedores. |
| Alta | Estado de configuración | `/api/config` devuelve `hasKey:false` y `motores:[]` de forma fija. La interfaz muestra que falta Anthropic incluso estando la variable en Vercel. El motor predeterminado es Google aunque esa clave no está configurada. No basta con cambiar el indicador a true: también deben existir las rutas y ejecutores. |
| Alta | Galería de Entregas | La API devuelve datos, pero la prueba de navegador terminó con «Aún no hay entregas» y «Failed to fetch», sin imágenes visibles tras 60 segundos. El adaptador descarga todas las imágenes antes de renderizar; el rechazo de una descarga hace fallar la lista completa. No se ha aislado todavía cuál descarga provoca el error. |
| Media | Exportación | Un PNG real se genera, sube y registra correctamente. Sin embargo, el mensaje muestra «Guardado en /»: el adaptador devuelve solo la carpeta y el cliente espera una ruta de archivo. |
| Media | Abrir carpeta | El adaptador de `/api/open` simplemente cambia a Entregas, sin usar la ruta solicitada. «Abrir carpeta» no abre una carpeta real y desde Solicitudes lleva a otra sección. |
| Media | Móvil | Hay desplazamiento vertical, pero también desbordamiento horizontal a 390 × 844. La corrección previa del scroll no resolvió toda la adaptación móvil. |
| Corregido | Inicio de sesión antes de inicializar | Una prueba rápida podía enviar el formulario antes de que se instalara el manejador de autenticación. El botón ahora permanece deshabilitado hasta terminar la inicialización. Verificado con la respuesta de configuración retenida deliberadamente. |

## Comprobaciones que pasaron

- TypeScript y 24 pruebas automatizadas locales.
- Nueve comprobaciones remotas de seguridad/integridad: aislamiento por marca, metadata sin privilegios, rechazo de autoascenso, permisos de lector/editor, conflicto de versiones, reserva concurrente de presupuesto, Storage por marca, anonimato y suspensión de miembros.
- Login real de una cuenta temporal de administrador y cierre de sesión en Chrome.
- API de proyectos: creación, actualización y rechazo 409 de una versión obsoleta.
- Edición y autoguardado desde el navegador, comprobados después mediante API.
- Registro de archivo, subida firmada, validación y descarga de una imagen.
- Registro de una entrega.
- Exportación real de una lámina PNG desde el editor a resolución 1080 × 1350.
- Desplazamiento del inspector y tamaño del lienzo dentro de una ventana de escritorio 1440 × 900.

## Alcance y límites

Se utilizaron usuarios y proyectos temporales; las pruebas no editaron proyectos reales. Se eliminaron las cuentas, proyectos, archivos y entregas de prueba. No se llamaron proveedores de IA ni se enviaron emails.

La prueba de exportación usó una lámina sencilla: no certifica todos los diseños, recortes, tipografías, carruseles completos ni paridad visual con el servidor Ruby. No se han certificado Safari, recuperación de contraseña por email, caducidad prolongada de sesión, errores de red durante guardado, ni carga concurrente real. La presencia de secretos en Vercel no prueba saldo, vigencia o disponibilidad de los proveedores.

La galería de recursos resuelve y descarga todas las referencias antes de entregar su resultado (`web/cloud.js`, `resolve`); debe revisarse su carga progresiva para bibliotecas grandes. Esto es un riesgo detectado en código, no una medición de rendimiento.

## Orden de reparación

1. Implementar lectura y administración de marcas, documentos y personas usando las autorizaciones de Supabase existentes.
2. Implementar guardado de solicitudes y comprobarlo desde el formulario.
3. Conectar IA con reserva de presupuesto, idempotencia, seguimiento de trabajos y almacenamiento de resultados. Mostrar disponibilidad real por proveedor.
4. Corregir navegación de entregas, mensajes de exportación y adaptación móvil.
5. Ejecutar pruebas completas de los recorridos anteriores, incluida exportación de carruseles con imágenes reales, antes de considerar terminada la migración.

Evidencia local (ignorada por Git): `artifacts/audit-production.json`, `artifacts/audit-browser.json` y capturas `artifacts/audit-*.png`. No contienen claves de proveedores ni contraseñas.
