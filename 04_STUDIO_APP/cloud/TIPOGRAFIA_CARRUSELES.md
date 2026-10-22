# Tipografía y fotografía de Janica

Predeterminada: **Instrument Serif + Montserrat**, con apoyos Montserrat 500. En el editor, «Tipografía del carrusel» permite elegir también Bodoni Moda + Jost, Playfair Display + Montserrat o Archivo + Inter. La elección se guarda en la configuración firmada de ese proyecto; conserva posiciones, tamaños y excepciones por elemento. Al cambiarla hay que volver a revisar el carrusel antes de exportar.

Instrument Serif tiene Regular 400 y Cursiva 400, sin Bold. El control de grosor muestra los pesos reales disponibles. Una excepción antigua de peso 700 se dibuja a 400 con Instrument; al cambiar a Bodoni puede volver a usar 700. La carga de fuentes solicita las variantes reales, incluidas las cursivas. Referencia: [metadatos de Google Fonts](https://github.com/google/fonts/blob/main/ofl/instrumentserif/METADATA.pb).

«Del bloque» hereda la cursiva de la plantilla y de las palabras entre `*asteriscos*`. «Sin cursiva» anula ambas; «Cursiva» aplica a todo el elemento. El panel muestra qué familia hereda del carrusel.

Al seleccionar un texto en el lienzo, «Color del texto» permite elegir su color, incluidas las palabras marcadas. «Fondo detrás del texto» añade un fondo del color elegido y «Opacidad del fondo» lo regula de 0% (apagado) a 100% (sólido), sin transparentar las letras. Los atajos blanco/fondo oscuro y negro/fondo claro parten de 80%. «Del diseño» restaura solo el color de texto; «Quitar fondo» elimina solo el fondo. Los controles funcionan en bloques, diseños clásicos y capas editables, se guardan por elemento y se aplican también a miniaturas y exportaciones. Con recorte, el fondo se dibuja una sola vez para conservar el porcentaje elegido. Una lámina con texto ya integrado en la imagen necesita convertirse en editable para modificarlo.

Las nuevas propuestas de Janica usan fotografía a color salvo petición explícita de blanco y negro. Se eliminó la instrucción que sugería una o dos láminas monocromas para dar ritmo. El contraste del texto se dirige independientemente: área oscura para letras claras y área clara para letras oscuras.

El proyecto «Ocupada no es lo mismo que productiva» tenía `bw:true` y un prompt que pedía una fotografía en blanco y negro. Su archivo original también es monocromo. «Regenerar foto a color», en Foto, envía una nueva generación con color natural y espacio para el texto; usa el motor seleccionado y su coste habitual. Quitar el filtro no restaura colores inexistentes. La foto anterior se conserva mediante el historial de regeneración.

La actualización de las fuentes predeterminadas de la marca y del proyecto se hizo con respaldo y control de versión; no se modificaron sus láminas ni se generaron imágenes de pago. Para aplicar la misma reparación de metadatos en otro entorno verificado: `npx tsx scripts/repair-janica-typography.ts [id-del-proyecto]`.

Validación: pruebas de contrato y API, Chrome con cambio de combinación y reapertura, pesos reales, cursiva explícita, conservación de movimientos y tamaño, y auditoría de diagramación. Los artefactos locales están en `artifacts/janica-typography` y `artifacts/consistency-fix`.
