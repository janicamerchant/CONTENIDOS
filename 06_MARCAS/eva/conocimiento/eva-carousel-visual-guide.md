# Guía visual de carruseles de EVA

## Regla principal: la portada abre con una cara humana

- Todos los carruseles deben empezar con una **foto de lo que se está hablando**, nunca con una portada de solo texto.
- En las primeras láminas siempre debe haber una **cara humana** relacionada con la noticia o con la sensación que se quiere transmitir (frustración, urgencia, alivio, éxito, etc.).
- Elegir a la persona según el tema:
  - **Janica Merchant**, CEO de EVA y Nika Media, cuando sea conveniente (mensajes de marca, opinión, consejos, lanzamientos de EVA). Usar siempre sus referencias oficiales.
  - **La figura pública protagonista de la noticia** cuando el tema lo pida. Ejemplo: si Meta anuncia una actualización específica, usar una foto de Mark Zuckerberg.
  - **Personas hiperrealistas** que representen la situación o emoción del contenido (ejecutivo saturado, prospecto esperando, equipo cerrando ventas).
- Esa misma cara, u otras relacionadas, puede volver a aparecer o variar en el medio o al final del carrusel.
- Figuras públicas reales: usar fotografías reales (oficiales, de prensa o de archivo con derechos de uso). No generar con IA su rostro ni escenas ficticias que parezcan reales, ni atribuirles frases o acciones que no hicieron.

## Regla de color en fotografía: color real por defecto

- Las fotos van **a color real**: personas, caras, teléfonos, pantallas, oficinas y objetos se ven con su color natural.
- El blanco y negro es un recurso de ritmo, no la norma: **máximo 1 o 2 láminas en blanco y negro por carrusel**, y nunca dos seguidas. Úsalo cuando refuerce la idea (un momento de pérdida, tensión o "antes"), no por costumbre.
- La foto de Janica y la lámina de CTA van siempre a color.
- Los acentos verde amarillo de EVA se mantienen igual sobre fotos a color o en blanco y negro.
- Las referencias con fotos en blanco y negro sirven para diagramación y superposición, no para decidir el color de todas las fotos.

## Regla de acabado: fondos con textura, bordes cuidados y texto superpuesto

Referencias de esta regla (en `02_ARCHIVOS_ORIGINALES/brands:eva:carousel-references/`):

- `ref-2026-09-24_janica-escenario-texto-detras-cifras.png`: Janica en escenario; el titular pasa por detrás de su cuerpo; fila de cifras grandes abajo; flechas y líneas tecnológicas en el fondo.
- `VISUAL-SYSTEM-IDENTICAL-ON-ALL-SEVEN (1).PNG`: "320 citas en una semana"; papel rasgado, textura, barras y marcos HUD en los bordes; la persona tapa parte de la palabra.
- `IMG_8826.jpg` ("Small wins daily") e `IMG_8819.jpg` ("Te han mentido sobre el éxito"): referencias externas **solo de superposición y composición**. No copiar su color turquesa ni su tipografía; en EVA el acento es siempre el verde amarillo del logo.

**Fondos: nunca planos.**

- Ninguna lámina lleva un fondo de color sólido liso. El fondo siempre tiene alguna de estas capas:
  - fotografía (escena a sangre, escenario, oficina, detalle);
  - fondo abstracto con textura (los geométricos `1.png` / `2.png`, grano, papel);
  - papel rasgado: bordes irregulares con textura, capas de papel que se superponen, franjas rotas que separan zonas.
- Las zonas "sólidas" (bloques de texto, franjas de cifras, paneles de CTA) también llevan textura sutil de papel o grano. No se ven como un rectángulo de color digital.

**Bordes y adornos tecnológicos: cuidar los márgenes.**

- Los bordes de la lámina llevan detalles de interfaz o IA, finos y discretos: líneas de guía, flechas (→ ←), marcos HUD, barras de progreso, pequeños bloques de color (gris, lima, un toque de verde agua), marcas de registro y números de lámina.
- Estos elementos van en los márgenes y en las zonas vacías, nunca encima de la cara ni de las palabras clave. Deben ser consistentes en todo el carrusel (mismo grosor, mismo color, misma familia de íconos).
- Revisar cada lámina antes de entregar: sin adornos cortados, torcidos o duplicados, sin barras que choquen con el texto y sin bordes rasgados que parezcan un error de recorte.

**Superposición de texto y personas.**

- El titular gigante se integra con la persona u objeto principal: una parte de las letras pasa **por detrás** del sujeto (cabeza, torso, brazo o piernas lo tapan parcialmente) y otra parte queda **delante**. Así se crean capas de profundidad.
- El texto tapado debe seguir leyéndose: tapar como máximo una o dos letras de una palabra, nunca la palabra clave completa ni su primera letra.
- Alternar entre láminas: titular detrás de la persona, titular rodeando a la persona (como "Small wins daily") o titular a un lado con la persona cruzando el borde del bloque de texto.
- Para lograrlo, generar la foto con espacio para el titular y luego poner el recorte de la persona sin fondo encima del texto (en el Estudio: campo **Recorte**).

## Referencia visual principal (prioritaria)

Los **EVA Carousel Reference** (`02_ARCHIVOS_ORIGINALES/brands:eva:carousel-references/`) son la guía prioritaria de diagramación y dirección de arte. Los nuevos carruseles deben sentirse parte de esa misma familia visual, no simplemente usar los colores de EVA. Si alguna regla de esta guía entra en conflicto con esas referencias, prevalecen las referencias.

**Principio general:** el carrusel debe sentirse como una mezcla entre revista tecnológica premium + fotografía editorial hiperrealista + data visualization + branding EVA, manteniendo la energía visual y la diagramación de los EVA Carousel Reference.

## Diagramación editorial

- Mezclar tipografía grande, protagonista y editorial con fotografía.
- Permitir que las letras se superpongan parcialmente con personas, objetos o elementos de la escena.
- Crear profundidad mediante capas: texto delante/detrás del sujeto, números grandes, elementos gráficos y fotografía.
- Evitar layouts demasiado cuadrados, rígidos o tipo "template de Canva".
- Cada slide puede variar su composición, pero debe conservar el mismo lenguaje editorial de los EVA Carousel Reference.

## Personajes y fotografía

Los protagonistas pueden ser:

- **Janica Merchant**, CEO de EVA y Nika Media, utilizando siempre sus referencias oficiales para conservar exactamente su identidad (ver `global-human-image-quality.md`).
- Personas hiperrealistas representando la acción o situación que explica el contenido.
- Escenas conceptuales hiperrealistas relacionadas con ventas, tecnología, IA, CRM, WhatsApp, seguimiento, llamadas, agentes, clientes, etc.

La fotografía debe verse humana y fotográfica, no como render de IA:

- textura real de piel;
- poros y pequeñas imperfecciones naturales;
- iluminación fotográfica realista;
- cabello y manos naturales;
- proporciones humanas correctas;
- nada plástico;
- nada excesivamente glossy;
- nada de piel artificialmente perfecta;
- ninguna deformación anatómica;
- evitar el look genérico de "AI corporate stock photo".

## Datos y estadísticas

Los carruseles de EVA deben tener un componente importante de data visualization. Siempre que el tema lo permita, utilizar:

- estadísticas reales;
- porcentajes;
- comparaciones;
- cifras grandes;
- resultados;
- timelines;
- mini gráficos;
- indicadores;
- métricas de negocio.

Los números pueden convertirse en elementos protagonistas de la composición, no solamente aparecer dentro de párrafos.

Nunca inventar estadísticas. Si hablamos de noticias, estudios, plataformas o tendencias de IA/tecnología, las cifras deben verificarse antes de utilizarlas.

**Regla de fuentes (obligatoria):**

- Toda cifra externa se verifica en una fuente primaria u oficial antes de escribir la lámina (en el Estudio, Claude hace una búsqueda web previa).
- La fuente va **visible en la lámina**, corta y discreta: "Fuente: CBO, junio 2024".
- La cifra se redacta con el mismo alcance que la fuente (promedio, proyección, año, país) y en el tiempo verbal correcto según la fecha: si el hecho ya ocurrió, no se presenta como posibilidad.
- Nunca se publica una lámina con marcadores como [VERIFICAR], [FUENTE] o "XX". Si una cifra no se puede verificar, se reescribe la lámina sin ese número.

Proof points reales del caso documentado (usar como ejemplo de un cliente, nunca como garantía universal):

- 20–25 citas agendadas manualmente por día → 70–80 diarias con EVA.
- ≈320 citas agendadas en una semana.

## Logos y marcas externas

Los logos deben mantenerse exactos y reconocibles, sin reinterpretaciones generadas por IA. Esto incluye EVA, Nika Media, WhatsApp, Meta, Facebook, Instagram y cualquier otra aplicación, plataforma o compañía mencionada.

Cuando el contenido sea sobre noticias de IA, tecnología, marketing o plataformas digitales, conservar también correctamente la identidad visual de las marcas involucradas.

## Dirección general

Los carruseles de EVA deben sentirse tecnológicos, editoriales, modernos y premium. Deben alternar recursos gráficos y fotografía hiperrealista; nunca deben convertirse en una sucesión de láminas compuestas solo por titulares o bloques de texto.

## Paleta

- Verde amarillo eléctrico de Nika Media y EVA como acento principal.
- Blanco para contraste, claridad y respiración visual.
- Gris oscuro, carbón y negro para profundidad y piezas de mayor dramatismo.
- El verde amarillo debe dirigir la atención hacia cifras, palabras clave, líneas, íconos y CTA; no debe saturar toda la composición.

No inventar códigos HEX cuando no estén suministrados. Muestrear el tono verde amarillo directamente desde los logos y recursos aprobados de EVA o Nika Media.

## Fondos aprobados

- Puede usarse el fondo geométrico abstracto oscuro disponible en `1.png`.
- Puede usarse el fondo geométrico abstracto blanco y gris disponible en `2.png`.
- Alternar fondos claros y oscuros cuando ayude al ritmo narrativo.
- No todos los carruseles deben ser oscuros ni todas las láminas de un carrusel deben usar el mismo fondo.
- Usar estos fondos en algunas piezas o secciones, no como plantilla obligatoria para todo.
- Nunca usar un color plano como fondo (ver "Regla de acabado"). Cuando no haya foto, usar el fondo geométrico, papel rasgado o grano.
- Mantener legibilidad, contraste y espacio suficiente alrededor del texto y la imagen principal.

## Diagramación

- Integrar tipografía grande y contundente con fotografía, cifras, diagramas, íconos o recursos tridimensionales relevantes.
- Una palabra, cifra o frase corta puede dominar la composición, pero debe coexistir con un recurso visual que explique o refuerce la idea.
- Variar composición y jerarquía entre láminas sin perder coherencia de marca.
- Evitar repetir el mismo layout, pose, recorte o proporción en todo el carrusel.
- Los EVA Carousel Reference mandan en diagramación; la referencia del collage sirve además para explorar la integración entre fotografía, palabras grandes y acentos verde amarillo, no para copiar una lámina literalmente (ni para poner todas las fotos en blanco y negro: ver "Regla de color").

## Fotografía narrativa

Incluir fotografías modernas e hiperrealistas que representen el concepto descrito. Ejemplos:

- Bajas ventas: equipo preocupado frente a indicadores descendentes, pipeline débil, oficina moderna con tensión contenida.
- Fallas de seguimiento: leads o mensajes acumulados, ejecutivo abrumado, oportunidades sin atender.
- Equipo comercial saturado: múltiples pantallas, llamadas, mensajes y tareas; gesto humano creíble, sin caricatura.
- Respuesta lenta: prospecto esperando, reloj o timeline integrado de forma natural, canal de contacto desatendido.
- Mejora con EVA: operación ordenada, respuesta inmediata, automatización, agenda llena y equipo enfocado en cerrar.

Las fotografías deben verse editoriales y contemporáneas, con composición creíble, iluminación suave y piel natural. Evitar clichés corporativos, poses de stock evidentes y escenas demasiado teatrales.

## Regla por lámina

Cada lámina debe combinar al menos dos de estas capas cuando sea apropiado:

1. Fotografía o imagen hiperrealista.
2. Titular o cifra principal.
3. Recurso explicativo: diagrama, interfaz, ícono, comparación o dato.
4. Elemento de marca: color, logo o firma.

Una lámina puede ser más tipográfica para crear ritmo, pero el carrusel completo nunca debe ser una secuencia de puras letras.

## Propuesta previa

Antes de producir, describir slide por slide:

- fondo claro u oscuro;
- fotografía hiperrealista prevista;
- titular y copy;
- diagramación y jerarquía;
- acentos de color;
- logos o recursos de marca;
- CTA.

Esperar aprobación de textos, estilo y estructura antes de generar imágenes finales.
