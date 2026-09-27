# Auditoría funcional de Estudio en producción

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
