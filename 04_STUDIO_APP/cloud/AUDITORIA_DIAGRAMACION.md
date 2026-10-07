# Auditoría de diagramación — 7 de octubre de 2026

Referencia: captura del editor, Janica Merchant, lámina 5 de 6.

La captura presenta tres pasos con pesos similares, apoyos cercanos en tamaño a sus titulares y un acento casi imperceptible. El cierre «elige una» no domina. La fotografía incorpora letras dentro del cuaderno; estas compiten con el texto editorial. La imagen completa puede incluir tipografía rasterizada: cambiar CSS no recompone esas letras.

## Causas comprobadas en el código

- El servidor reducía los bloques a etiquetas genéricas al construir el prompt del motor: descartaba zona, alineación, ancho y diferencia entre titular y remate.
- El sistema visual de respaldo imponía titulares condensados en mayúsculas incluso si la marca usaba otra familia.
- `fitSlide` medía `.fitbox`, pero no `.s-blocks`. Las zonas por bloques no tenían ajuste ante desbordamiento o colisión entre arriba y abajo.
- Un mismo gap separaba todos los bloques, sin distinguir titular/apoyo de separación entre pasos.

## Cambios

El generador cloud conserva la composición de los bloques en una sección propia del prompt; añade reglas de jerarquía a la propuesta y respeta la familia y caja de la marca en el sistema de respaldo. La plantilla escalera da predominio al último titular, incluso en propuestas anteriores que lo marcaban como titular normal.

Los editores cloud y local agrupan cada titular con su apoyo, separan pasos y ajustan el tamaño de las zonas por bloques cuando falta espacio. Las copias sobre el recorte reciben el mismo ajuste. El ajuste respeta movimientos manuales y tiene un mínimo de 55%; textos excesivos todavía requieren edición.

## Validación y alcance

TypeScript, 39 pruebas, compilación y comprobación con Chrome de jerarquía, agrupación, desbordamiento, separación de zonas y sincronización de las copias. `node scripts/layout-audit.mjs` guarda una muestra tipográfica sin fotografía en `artifacts/layout-audit/escalera.png`.

Validación previa al despliegue: no se regeneraron imágenes de clientes. No se consumieron créditos de IA. Las nuevas reglas de prompt mejoran la dirección del motor pero no equivalen a una comprobación visual automática de su resultado. Las imágenes con texto integrado requieren regeneración; el generador Ruby local conserva su flujo independiente.

## Solicitudes

El flujo anterior pedía solo el guion a `/api/draft` y creaba láminas con imágenes vacías. Ahora la acción «Guardar y generar carrusel con imágenes» guarda y vincula el proyecto, conserva el sistema visual y las personas aprobadas, envía el lote a `/api/generate` y presenta avance y reintentos en Crear. La recuperación de un guion pendiente retoma el mismo flujo. La opción manual se llama «Crear estructura sin imágenes». Cuatro pruebas de regresión verifican envío de imágenes, referencias y modo, guardado fallido, motor ausente y fallos recuperables.
