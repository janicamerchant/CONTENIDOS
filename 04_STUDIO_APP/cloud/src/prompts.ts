export const prompts = {
  "draft_schema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "name",
      "concept",
      "caption",
      "slides"
    ],
    "properties": {
      "name": {
        "type": "string"
      },
      "concept": {
        "type": "string"
      },
      "caption": {
        "type": "string"
      },
      "slides": {
        "type": "array",
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "layout",
            "theme",
            "kicker",
            "title",
            "body",
            "number",
            "numberLabel",
            "items",
            "leftLabel",
            "leftItems",
            "rightLabel",
            "rightItems",
            "cta",
            "photo",
            "photoPrompt",
            "bw",
            "source"
          ],
          "properties": {
            "bw": {
              "type": "boolean"
            },
            "source": {
              "type": "string"
            },
            "layout": {
              "type": "string",
              "enum": [
                "portada",
                "escena",
                "cifra",
                "frase",
                "lista",
                "comparar",
                "cta"
              ]
            },
            "theme": {
              "type": "string",
              "enum": [
                "dark",
                "light"
              ]
            },
            "kicker": {
              "type": "string"
            },
            "title": {
              "type": "string"
            },
            "body": {
              "type": "string"
            },
            "number": {
              "type": "string"
            },
            "numberLabel": {
              "type": "string"
            },
            "items": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "leftLabel": {
              "type": "string"
            },
            "leftItems": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "rightLabel": {
              "type": "string"
            },
            "rightItems": {
              "type": "array",
              "items": {
                "type": "string"
              }
            },
            "cta": {
              "type": "string"
            },
            "photo": {
              "type": "string"
            },
            "photoPrompt": {
              "type": "string"
            }
          }
        }
      }
    }
  },
  "brand_schema": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "profile",
      "rules",
      "audiencia",
      "cta",
      "idioma",
      "objetivo",
      "look",
      "accent",
      "darkBg",
      "darkInk",
      "lightBg",
      "lightInk",
      "displayFont",
      "bodyFont",
      "titleCase",
      "theme",
      "questions"
    ],
    "properties": {
      "profile": {
        "type": "string"
      },
      "rules": {
        "type": "string"
      },
      "audiencia": {
        "type": "string"
      },
      "cta": {
        "type": "string"
      },
      "idioma": {
        "type": "string",
        "enum": [
          "Español",
          "English"
        ]
      },
      "objetivo": {
        "type": "string"
      },
      "look": {
        "type": "string"
      },
      "accent": {
        "type": "string"
      },
      "darkBg": {
        "type": "string"
      },
      "darkInk": {
        "type": "string"
      },
      "lightBg": {
        "type": "string"
      },
      "lightInk": {
        "type": "string"
      },
      "displayFont": {
        "type": "string"
      },
      "bodyFont": {
        "type": "string"
      },
      "titleCase": {
        "type": "string",
        "enum": [
          "upper",
          "none"
        ]
      },
      "theme": {
        "type": "string",
        "enum": [
          "dark",
          "light"
        ]
      },
      "questions": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    }
  },
  "draft_rules": "  Eres el equipo creativo de Nika Media. Con el brief del usuario, propone la arquitectura y el copy final de un carrusel de Instagram 4:5 (o de un post único, si el formato lo pide), siguiendo exactamente el perfil de marca y el flujo de producción que tienes abajo.\n\n  Ortografía: escribe en el idioma del brief con ortografía completa. En español, siempre con tildes, ñ y signos de apertura (año, más, está, ¿, ¡). Nunca omitas acentos.\n\n  Cómo llenar cada lámina:\n  - layout: portada (lámina 1, foto de la situación del titular con una cara humana), escena (foto a sangre completa con titular gigante encima), cifra (un número protagonista), frase (una afirmación fuerte sobre una foto), lista (checklist práctico), comparar (antes/después o dos columnas), cta (última lámina).\n  - theme: dark o light. Alterna para dar ritmo; no todas iguales.\n  - title: pocas palabras. Marca con *asteriscos* la palabra o frase que va en color de acento (máximo una por titular).\n  - body: una o dos frases cortas, o vacío.\n  - number y numberLabel solo en layout cifra. items solo en lista (3 a 5). leftLabel/leftItems/rightLabel/rightItems solo en comparar (3 ítems por lado). cta solo en la última.\n  - photo: dirección de arte en el idioma del brief. Describe una ESCENA que cuente la idea de esa lámina sin leer el texto: quién hace qué, dónde, con qué objeto o momento que lo prueba. Tienes libertad creativa para elegir protagonista: una de las personas aprobadas de la marca (lista abajo) haciendo algo relacionado (solo si su acción explica la idea), la figura pública de la noticia (foto real) u otra persona hiperrealista viviendo la situación. Objetos y lugares también pueden ser protagonistas. Nunca un retrato decorativo sin relación con el titular.\n  - photoPrompt: el prompt en inglés para generar esa foto: sujeto, acción, lugar, emoción, encuadre, luz, y al final \"hyperrealistic editorial photograph, natural skin texture, no text, no logos\". Si la persona es una de las personas aprobadas, escribe su nombre completo y \"use the approved <nombre> reference for the face\". Compón la foto para que la persona u objeto quede de un lado y deje aire para el titular: el sujeto solo debe cruzar el borde del área del texto (así las letras pasan parcialmente por detrás de él sin perder la lectura). Fondo con textura o ambiente real, nunca un fondo plano de estudio.\n  - Al menos 5 de cada 7 láminas llevan foto (photo y photoPrompt llenos). Como máximo una o dos pueden ser solo tipográficas, nunca dos seguidas. Varía encuadres: plano general, detalle de manos u objetos, primer plano, cenital.\n  - bw: false por defecto (foto a color real). true solo en 1 o 2 láminas del carrusel, nunca dos seguidas, cuando el blanco y negro refuerce la idea (pérdida, tensión, \"antes\"). Las personas aprobadas y la lámina de CTA siempre a color. Los photoPrompt piden color natural salvo en esas láminas.\n  - Deja vacíos (\"\" o []) los campos que no apliquen al layout.\n  - caption: el texto del post para Instagram, con el CTA.\n  - concept: la dirección creativa en 3 a 5 frases cortas: la idea central y el ángulo, el estilo visual (fotografía, paleta, tipografía), el tono y por qué la secuencia convence a la audiencia.\n\n  Post único (formato de 1 imagen): devuelve exactamente 1 lámina que cuente la idea completa por sí sola, sin depender de otras.\n  - layout: portada, escena, cifra o frase (no uses lista, comparar ni cta). Titular fuerte y corto; body opcional de una frase.\n  - Siempre con foto (photo y photoPrompt llenos), a color (bw false). Las reglas de proporción de fotos y de la última lámina no aplican.\n  - El CTA va en el caption, no en la imagen.\n\n  Datos y fuentes:\n  - Nunca inventes estadísticas, precios, fechas ni resultados. Usa solo (a) las cifras de la \"Investigación verificada\" que viene en el mensaje, (b) los proof points aprobados del perfil de marca, o (c) los \"Datos verificados de la marca\" que vienen en el mensaje, siempre con su fuente.\n  - source: toda lámina con una cifra externa lleva su fuente corta y visible, por ejemplo \"CBO, junio 2024\" o \"KFF, 2026\". Los proof points de EVA llevan \"Caso real anonimizado de un cliente de EVA\". Si la lámina no tiene cifras, deja \"\".\n  - Redacta la cifra con el mismo alcance que la fuente (promedio, proyección, año, país) y en el tiempo verbal correcto según la fecha de hoy: si algo ya ocurrió, no lo escribas como posibilidad.\n  - Nunca escribas marcadores como [VERIFICAR], [FUENTE], \"XX\" ni cifras pendientes. Si una cifra no está en la investigación verificada, no la uses: reescribe la lámina sin ese número.",
  "brand_rules": "  Eres el director de marca de Nika Media. Con la descripción del usuario y la investigación, arma el primer perfil de una marca nueva para producir carruseles de Instagram.\n  Escribe en español con ortografía completa. No inventes datos: lo que no sepas va en \"questions\" como pregunta corta para el usuario, y en el perfil queda como \"Pendiente de confirmar\".\n  - profile: Markdown con estas secciones: Posicionamiento; Audiencia y objetivos; Ofertas y productos; Voz y tono; Pilares de contenido; Sistema visual (paleta, tipografía, fotografía, composición); Personas que aparecen; Datos y proof points aprobados (solo si vienen de la investigación, con fuente); Prohibido.\n  - rules: reglas cortas para el guionista (6 a 10 viñetas): tono, qué tipo de fotos, qué evitar, cómo usar el color de acento, idioma. Deben mandar sobre reglas genéricas.\n  - look: estilo de foto en inglés para el generador de imágenes (luz, paleta, lugares), una frase.\n  - Colores en HEX (#RRGGBB). Si la investigación muestra los colores de la marca, úsalos. accent es el color de acento; darkBg/darkInk el fondo y el texto de las láminas oscuras; lightBg/lightInk los de las láminas claras. Contraste alto entre fondo y texto.\n  - displayFont y bodyFont: familias que existan en Google Fonts (por ejemplo Archivo, Anton, Inter, Montserrat, Playfair Display, DM Serif Display, Space Grotesk, Poppins, Lora). Si la marca usa una fuente comercial, elige la más parecida de Google Fonts y dilo en el perfil.\n  - titleCase: upper si los titulares van en mayúsculas.\n  - No copies el sistema visual de EVA, Janica Merchant ni City Kia."
};
