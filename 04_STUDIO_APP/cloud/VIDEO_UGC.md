# Video UGC

En Reels → Video UGC, selecciona proyecto y guion. La misma configuración aparece dentro de cada guion del historial.

## Configuración

- Higgsfield: Seedance 2.5 (4–30 s), Seedance 2.0 (4–15 s), Kling 3.0 Standard (3–15 s).
- Seedance: 480p, 720p o 1080p. Kling gestiona su propia calidad.
- Formato vertical, horizontal o cuadrado; duración orientativa, tipo de tomas y ritmo.
- Lugar, vestuario, luz, encuadre, cámara, tono, acento e instrucciones adicionales.
- Los campos se guardan en `reels_proyectos.documento.video_config[guion]`. El trabajo del plan recibe una copia de la configuración.

El selector muestra si la clave de Higgsfield está configurada; el saldo y acceso del proveedor se comprueban al generar. Los modelos y cuerpos de petición se verificaron el 21-10-2026 contra las referencias oficiales:

- https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference
- https://open.higgsfield.ai/models/bytedance/seedance-2.0/reference-to-video/api-reference
- https://open.higgsfield.ai/models/kling-video/v3.0/std/image-to-video/api-reference

## Audios de referencia de voz

En la configuración del video puedes subir hasta tres muestras de la misma voz, de hasta 15 MB cada una. Se admiten MP3, WAV, M4A, OGG, Opus (`.opus`), WebM y FLAC. Usa grabaciones cortas y limpias, sin música; con Seedance 2.0 procura que sumen hasta 15 s y con 2.5 hasta 30 s. Cada muestra tiene reproductor y botón para quitarla; se guarda automáticamente por guion. No son IDs de ElevenLabs.

Los archivos `.opus` se suben como `audio/ogg`, el tipo recomendado para [Ogg Opus (RFC 7845)](https://www.rfc-editor.org/rfc/rfc7845.html#section-9), aunque el navegador no informe su tipo o use `audio/opus`. Conservan su nombre y contenido original, sin conversión previa.

Seedance 2.5 y 2.0 reciben las muestras como `audio_urls` mediante enlaces firmados temporales de Storage privado. La voz generada se guía con ellas y el diálogo sigue siendo el guion de cada clip. Kling no admite este campo en la integración. La aplicación comprueba marca, archivo disponible, tipo y tamaño al guardar y de nuevo antes de generar; no guarda enlaces firmados en la configuración.

Las referencias requieren sonido generado y se usan como alternativa a la narración completa. Al cambiar o quitar muestras, los clips anteriores quedan obsoletos y hay que regenerarlos. Se pueden aplicar al plan existente sin rehacer las imágenes. La API de Higgsfield se contrastó de nuevo el 22-10-2026; la voz generada puede variar respecto a la muestra y la fidelidad requiere una prueba real del modelo.

## Narración completa

1. Sube tu grabación del guion (MP3, WAV, M4A, OGG, Opus, WebM o FLAC, hasta 50 MB). Se guarda en Storage privado y se puede escuchar en el formulario.
2. La narración propia desactiva el sonido del motor y pide planos de apoyo sin habla. Su identidad sonora procede del archivo original.
3. Prepara el plan y guarda cualquier ajuste. Genera y aprueba primero la imagen del clip 1, después las demás imágenes.
4. Genera los clips individualmente con Higgsfield. Se muestran la reserva de presupuesto, el resultado reproducible y la descarga MP4.
5. Cuando todos están vigentes, pulsa «Montar video con mi narración». El montaje exporta a la resolución elegida (480p, 720p o 1080p), concatena en orden y reemplaza el sonido de los clips con la narración original. Su duración sigue al audio: recorta metraje sobrante o mantiene el último fotograma si falta.

El montaje original sigue descargable después de editar, pero queda marcado como obsoleto. Cambiar el plan, el audio o las imágenes exige regenerar los clips afectados antes de montar. Los cambios de escena/dirección se aplican al rehacer el plan.

## Operación y validación

Se reutiliza `HF_CREDENTIALS`; no se envían claves al navegador. Las peticiones incluyen `Idempotency-Key`; se persiste el identificador del proveedor para retomar consultas sin reenviar generaciones. El presupuesto utiliza reservas conservadoras sin descuentos. Si Higgsfield no devuelve el importe facturado, la reserva sigue contando contra el límite mensual.

El montaje usa FFmpeg en servidor. `vercel.json` incluye el binario Linux y su metadata. Para una instalación nueva, ejecuta `npx tsx scripts/configure-video-storage.ts`: conserva el bucket privado y habilita formatos de audio y MP4 sin sustituir formatos anteriores.

Comprobaciones:

- `npm run check`: configuración, permisos de archivos, límites por modelo, revisiones y pruebas de montaje con FFmpeg real. La pista decodificada se compara con la grabación original.
- `npm run test:reels-browser`: Chrome con API en memoria, selección de modelos, carga y persistencia de voz, aprobación, clips, montaje y móvil.
- `npx tsx scripts/video-upload-integration.ts`: usuario y marca temporales contra Supabase real; carga firmada, validación de audio, persistencia y reproducción privada. Limpia sus recursos al terminar.

Estas pruebas no consumen generaciones de video de Higgsfield. La calidad visual de cada modelo requiere una generación real con las imágenes y la narración elegidas.
