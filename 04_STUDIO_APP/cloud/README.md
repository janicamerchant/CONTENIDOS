> Auditoría funcional actual: [AUDITORIA_PRODUCCION.md](AUDITORIA_PRODUCCION.md). La versión publicada sigue siendo una migración parcial; consultar los bloqueos antes de usarla como reemplazo del Estudio local.

# Estudio web — implementación de la base y migración

**Estado: esquema aplicado en Supabase `okgjpsntveloemjrsmjd` (content studio), importación inicial verificada, acceso y editor conectados en una compilación local. No es todavía una versión del Estudio lista para producción.** El servidor Ruby y la interfaz actual siguen siendo la versión operativa. No se han enviado invitaciones ni gastado créditos de IA. El registro público remoto está desactivado; falta designar al primer administrador.

## Implementado

- Migración SQL con marcas, recursos, datos, personas/fotos, relaciones, proyectos, solicitudes, entregas, miembros, archivos, trabajos y auditoría.
- RLS por marca, miembros activos y roles. Datos comunes legibles por miembros; edición reservada a admin. Personas compartidas visibles solo a sus marcas. Administración de personas compartidas pendiente de API admin.
- Storage privado con metadatos autorizados, rutas por UUID, enlaces de descarga de cinco minutos y subidas directas firmadas sin reemplazo.
- Proyectos con comparación de versión atómica y protección adicional ante escritura directa por REST.
- Primitivas de cola duradera en Postgres: idempotencia, reserva de presupuesto, exclusión al reclamar y recuperación conservadora. **Falta el ejecutor que llama a los proveedores y finaliza los trabajos; la cola por sí sola no genera imágenes.**
- Inventario sin credenciales, importación repetible con SHA-256 remoto, aislamiento de archivos sin marca y negativa a sobrescribir filas diferentes.
- Copia complementaria de tablas y objetos, con manifiesto de integridad.
- Base de API TypeScript: configuración pública, sesión/miembro, lectura de marcas, proyectos, consulta de trabajos y ciclo de subida/firma de archivos. Conectada a un adaptador del frontend que conserva referencias persistentes, aísla el almacenamiento por usuario y serializa los guardados.
- Pruebas de SQL sobre PGlite (Postgres real en WASM) con roles y esquemas Auth/Storage mínimos. No sustituyen la integración contra Supabase Auth, PostgREST y Storage reales.

## Verificar localmente

Requiere Node 22 o posterior y Supabase CLI para administrar migraciones. Las pruebas no requieren Docker ni una cuenta remota.

```sh
cd 04_STUDIO_APP/cloud
npm ci
npm run check
npm run inventory
```

`artifacts/summary.json` contiene cantidades y advertencias; `artifacts/inventory.json` contiene los registros y las referencias. Ambos están excluidos de Git porque incluyen datos del negocio. El inventario no modifica los originales. Ordena los archivos de forma determinista y evita duplicados cuando distintas referencias se leen en paralelo. No lee `.env` del Estudio local ni `data/config.json`.

Los enlaces `/files/...` se convierten a `storage://<uuid>` persistente. La futura capa de cliente debe resolverlos a enlaces firmados al mostrar/exportar y renovarlos antes de caducar. Nunca guardar la URL firmada en el proyecto.

Los originales no referenciados quedan en cuarentena accesible solo al administrador. No asumir que son comunes a todas las marcas. Un archivo usado en dos marcas puede copiarse por marca para mantener el aislamiento; esto aumenta el tamaño frente al inventario del disco.

## Configurar el destino

1. Elegir organización propietaria y crear un proyecto **de pruebas** separado de producción. Crear también el proyecto Vercel de la misma organización. El destino elegido y verificado es `okgjpsntveloemjrsmjd` (`content studio`, región `ca-central-1`). El acceso por Management API ya está configurado localmente.
2. Copiar `.env.example` a `.env` dentro de esta carpeta y completar URL, `sb_publishable_...`, clave secreta, identificador de proyecto, email admin y URL final. No reutilizar secretos de producción en previews. El script comprueba que URL e identificador coincidan.
3. Aplicar las migraciones de `supabase/migrations/` en orden en un proyecto dedicado vacío usando el flujo de migraciones de Supabase. **Ya aplicadas al destino elegido**, junto con la corrección HTTP 409 y los índices de claves foráneas. No volver a ejecutar la migración inicial allí. Revisar `supabase link --help` y `supabase db push --help` antes de enlazar/aplicar. No ejecutar esta migración en un proyecto que ya contenga tablas homónimas.
4. Desactivar registro público, incluidos flujos de OAuth. El `config.toml` ya lo desactiva **localmente**; no cambia por sí solo la configuración remota. Configurar SMTP propio y redirects exactos para producción y pruebas.
5. Crear el usuario administrador en Auth y ejecutar `npm run bootstrap:admin`. Este script no envía correos y se detiene si ya existe un admin activo. El email debe ser de la persona designada por el dueño, no una suposición.
6. `npm run test:integration` ejecuta pruebas remotas con usuarios temporales admin/editor/lector, dos marcas y suspensión; verifica REST, Storage, guardados y presupuesto concurrentes. Ya pasaron contra el destino elegido. No envía emails ni llama a IA; elimina sus usuarios y datos al terminar.
7. Ejecutar `npm run inventory` y revisar cuarentena/advertencias. `npm run migrate:apply` realiza la carga al destino configurado y descarga cada objeto para verificar su checksum. Puede consumir transferencia. Dejar de escribir en el origen durante la copia final.

El esquema asume acceso por marcas asignadas. Para dar acceso a todas las marcas, crear asignaciones explícitas para cada miembro; una marca nueva no concede acceso automáticamente. El primer administrador debe gestionar las asignaciones. Ningún usuario puede autoasignarse un rol.

## Migración, repetición y corte

La importación permite repetir exactamente la misma copia tras un fallo sin duplicar datos. `npm run migrate:verify` compara las filas del destino con el origen actual y exige que todos los archivos tengan su checksum verificado antes de emitir el recibo. Los reintentos de subida usan rutas inmutables sin reemplazo y las solicitudes tienen timeout. Los objetos no se exponen hasta verificar sus bytes. Si el origen cambia durante la importación se detecta al final y no se emite recibo de éxito.

**No existe todavía sincronización incremental automática.** Si una fila u objeto del inventario ya existe con contenido diferente, el script se detiene y exige conciliación. No soluciona conflictos borrando ni sobrescribiendo datos. Antes del corte se debe implementar y probar la conciliación de cambios o realizar la copia final a un destino limpio con escrituras locales pausadas. Un recibo de copia no autoriza el corte.

Conservar una copia fechada de todos los originales fuera del repositorio. Después del corte, evitar dos sistemas aceptando escrituras. Un retorno a Ruby requiere primero recuperar cambios nuevos de nube; no basta con encender el servidor antiguo.

## Respaldo

`npm run backup` descarga tablas y objetos a una carpeta privada bajo `backups/`, con checksums. Es una copia complementaria, **no un snapshot transaccional ni un respaldo completo de Auth**. Debe acompañarse de backups de Postgres/Auth gestionados por Supabase, SQL versionado, copia externa y prueba de restauración a otro proyecto. Pausar escrituras para una exportación consistente. No publicar los respaldos.

## API disponible para integración posterior

Todas salvo `/api/public-config` requieren `Authorization: Bearer <access_token>` verificado con Supabase Auth y un miembro activo.

| Ruta | Operación |
|---|---|
| GET `/api/public-config` | URL y clave publishable; rechaza una clave secreta mal configurada |
| GET `/api/me` | Identidad y rol actual |
| GET `/api/brands` | Marcas permitidas por RLS |
| GET `/api/projects[?id=...]` | Proyectos permitidos |
| POST `/api/projects` | Documento con `id`, `brand`, `slides`, `version` (0 para nuevo); devuelve nueva versión |
| GET `/api/jobs?id=...` | Estado persistido de un trabajo autorizado |
| POST `/api/assets/upload` | Registrar `brand`, `name`, `mime`, `bytes`; recibir `path` y token de subida directa |
| POST `/api/assets/finalize` | Verificar bytes del objeto por `id` y marcarlo disponible |
| POST `/api/assets/sign` | Obtener descarga temporal por `id` |

`npm run build` genera `dist/` con login y el editor existente. `npm run dev` sirve la vista local en http://127.0.0.1:4322. La generación de IA y administración de marcas todavía están pendientes; no publicar como versión completa. `vercel.json` configura la API y esta compilación. La raíz del proyecto Vercel sería `04_STUDIO_APP/cloud`.

## Trabajo pendiente antes de producción

- Login con contraseña y cierre de sesión implementados; falta designar y configurar administrador, invitaciones y SMTP/enlace mágico. El frontend se compila desde la copia versionada `web/legacy/` de la interfaz local, sin modificar el servidor Ruby. Validar el editor/exportador completo con una sesión real antes de producción.
- Adaptar el resto de contratos de las 14 rutas y probar paridad de edición, marcas, personas, papelera, exportación y descargas.
- Ejecutores de Claude/Google/OpenAI/Higgsfield y recorte; validar API/modelos/precios vigentes. Guardar ID externo antes de consultar el resultado. Reintentar polling, no reenviar automáticamente una generación incierta. Finalizar usando lease_token para impedir escrituras de ejecutores antiguos.
- Para una imagen tardía: asociar por ID estable de lámina y verificar versión; no reemplazar el proyecto entero ni una regeneración más reciente. Guardar resultados en entregas aunque requieran reconciliación.
- Reservar el máximo acotado de cada operación en el servidor, incluidos QA/reintentos/recorte; registrar coste real y liberar solo costes confirmados. El límite SQL no limita por sí solo lo que el proveedor puede facturar.
- Realtime con recuperación por consulta al reconectar, límites de concurrencia y tareas programadas autenticadas con secreto independiente del navegador.
- Advisors de seguridad sin hallazgos y claves foráneas con índices verificados en el destino. Autorización real, suspensión y concurrencia ya probadas. Faltan URLs expiradas, subida inválida, timeout/reinicio del futuro ejecutor y restauración completa. No declarar seguridad basándose solo en un plugin.
- Conciliación de migración final, copia externa, configuración de producción/dominio y prueba completa con un post y un carrusel.

## Copia remota verificada

En el proyecto `content studio` se verificaron 3 marcas más documentos comunes, 3 personas, 9 proyectos, 20 entregas y 298 archivos (803.138.799 bytes). El recibo está en `artifacts/receipt-okgjpsntveloemjrsmjd.json`. Los 126 archivos sin marca inequívoca siguen restringidos a admin. No se ha hecho el corte de producción ni desactivado el Estudio local.

La pantalla de acceso usa contraseña para usuarios provisionados por administración; no ofrece registro público ni envía emails. El acceso por enlace mágico requiere configurar SMTP y redirects antes de activarlo.

## Conectar GitHub a Vercel

Importar `janicamerchant/CONTENIDOS`, rama `main`:

- Root Directory: `04_STUDIO_APP/cloud`
- Framework Preset: Other
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js: 24.x

Configurar las variables `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` desde el archivo local `.env`. No subir ese archivo ni configurar `SUPABASE_ACCESS_TOKEN` en Vercel: es una credencial de administración local. Los secretos no se necesitan para compilar, pero sí para ejecutar la API.

`web/legacy/` es una copia versionada de los cinco archivos de la interfaz original; permite compilar sin acceder fuera de la raíz de Vercel. Actualizarla explícitamente cuando se incorporen cambios del Estudio local. No contiene marcas, proyectos, imágenes ni credenciales.

Este despliegue permite comprobar login e integración del editor. La generación de IA y la administración completa de marcas siguen pendientes.
