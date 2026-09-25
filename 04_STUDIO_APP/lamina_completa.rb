# Lámina completa: Higgsfield genera la foto Y la tipografía en una sola imagen, copiando la
# diagramación de las referencias aprobadas de la marca. Después Claude revisa ortografía y rostro
# y, si algo falla, se regenera sola (hasta QA_RETRIES veces).
#
# Se activa por marca en 06_MARCAS/<marca>/marca.json:
#   "modo": "completa",
#   "plantillas": { "portada": ["referencias/xxx.jpg", ...], "frase": [...], ... }

QA_RETRIES = 1          # regeneraciones automáticas si la revisión encuentra errores (cada una cuesta créditos)
MAX_LAYOUT_REFS = 3     # referencias de diagramación por lámina
FULL_FACE_REFS = 5      # fotos de cara cuando la lámina lleva persona

# Lenguaje de cámara real: evita el acabado liso, brillante y de render típico de GPT Image.
PHOTO_REALISM = 'Real unretouched photograph shot on a full-frame camera with an 85mm lens at f/2, natural window light, ' \
                'true-to-life skin with visible pores, fine facial hair, small natural imperfections and slight unevenness in tone, ' \
                'realistic hair strands and flyaways, real fabric texture and wrinkles, subtle fine film grain, natural color, slight depth of field. ' \
                'No beauty retouching, no airbrushed, waxy, glossy or plastic skin, no HDR, no oversaturation, no CGI, no 3D render, not an illustration.'

def full_mode?(brand)
  brand && brand['modo'] == 'completa'
end

# *palabra* → cursiva
def italic_words(text)
  text.to_s.scan(/\*([^*]+)\*/).flatten
end

def clean(text)
  text.to_s.gsub('*', '').strip
end

FULL_LAYOUTS = {
  'portada' => 'COVER. The headline is huge, set in the upper-left area, and may pass slightly behind the person\'s hair for depth. ' \
               'A short thin lime-yellow line sits under the headline, then the supporting text in small sans. The signature sits at the bottom-left.',
  'escena' => 'SCENE. Headline very large in the upper-left area over a clean wall or curtain, supporting text in small sans right below it. ' \
              'The subject of the photo sits to the right or lower half.',
  'frase' => 'SPLIT PHRASE. The supporting text is a short reflective paragraph in medium editorial serif at the TOP-LEFT. ' \
             'The headline is a giant uppercase condensed serif punchline at the BOTTOM of the slide, with a hand-painted lime-yellow brush stroke underlining it.',
  'lista' => 'LIST. Uppercase headline in the upper-left, then one small lime-yellow square, then each list line as a short sentence in clean sans, ' \
             'stacked with generous spacing, no bullets, no numbers, no checkboxes.',
  'cifra' => 'KEY NUMBER. A huge italic serif number in the upper-left, a short lime-yellow line, the label under it in serif, then the supporting text in small sans.',
  'comparar' => 'CONTRAST. Centered serif lines at the top of the slide, then the punchline in big uppercase serif with a lime-yellow highlight block behind it. ' \
                'The photograph below is calm and symmetrical.',
  'cta' => 'CLOSING. Headline in the upper-left, a short lime-yellow line, the supporting text, then a small round beige bookmark icon followed by the call to action in small bold sans. ' \
           'The signature sits at the bottom-left with a thin line above it. The person looks warm and confident, a different pose than the cover.'
}.freeze

# Líneas de texto exactas que deben aparecer en la imagen, en orden.
def full_texts(s, brand, count)
  lines = []
  add = ->(label, t) { lines << [label, clean(t)] unless clean(t).empty? }
  add.call('SMALL LABEL (tiny spaced uppercase sans)', s['kicker'])
  if s['layout'] == 'cifra'
    add.call('HUGE NUMBER', s['number'])
    add.call('NUMBER LABEL', s['numberLabel'])
  elsif s['layout'] == 'comparar'
    add.call('TOP LINE', s['title'])
    add.call('TOP LINE (italic)', s['leftLabel'])
    Array(s['leftItems']).each { |t| add.call('TOP LINE', t) }
    add.call('PUNCHLINE (big uppercase, lime highlight behind)', s['rightLabel'])
    Array(s['rightItems']).each { |t| add.call('SMALL LINE', t) }
  else
    add.call('HEADLINE', s['title'])
  end
  add.call(s['layout'] == 'frase' ? 'TOP PARAGRAPH (serif)' : 'SUPPORTING TEXT (sans)', s['body'])
  Array(s['items']).each { |t| add.call('LIST LINE', t) } if s['layout'] == 'lista'
  add.call('CALL TO ACTION (next to bookmark icon)', s['cta']) if s['layout'] == 'cta'
  add.call('SOURCE (tiny sans)', "Fuente: #{s['source'].to_s.sub(/\Afuente:\s*/i, '')}") unless s['source'].to_s.strip.empty?
  add.call('SIGNATURE (tiny, widely letter-spaced uppercase sans)', (brand['byline'].to_s.empty? ? brand['name'] : brand['byline']).upcase) if %w[portada cta].include?(s['layout'])
  add.call('PAGE NUMBER (tiny italic serif at bottom-right, after a thin line)', count) if count && !%w[portada cta].include?(s['layout'])
  lines
end

def full_prompt(s, brand, faces, layouts, count, persons)
  texts = full_texts(s, brand, count)
  italics = italic_words([s['title'], s['rightLabel']].join(' '))
  scene = s['photoPrompt'].to_s.strip.empty? ? s['photo'].to_s : s['photoPrompt'].to_s
  scene = scene.gsub(/,?\s*no text\b/i, '')   # la foto ahora sí lleva el texto de la lámina
  who = persons.empty? ? 'There is no approved person in this slide: do not add Janica or any look-alike; people, if any, are anonymous or seen partially.' \
                       : "#{persons.map { |p| person_lock(p) }.join(' ')}"
  <<~TXT.gsub(/\n+/, "\n").strip
    Design ONE finished vertical Instagram carousel slide: a single premium photograph with the editorial typography designed into it, like a page of a quiet-luxury magazine.
    INPUT IMAGES: #{faces.positive? ? "the first #{faces} image(s) are FACE REFERENCES (identity only); " : ''}the last #{layouts} image(s) are LAYOUT REFERENCES from the same brand. From the layout references copy exactly: the typography (condensed high-contrast editorial serif headline, clean geometric sans for small text, warm near-black ink #1F1D1B), text sizes and placement, generous margins, the warm ivory, beige and stone color palette, and ONE small lime-yellow #ECFE6E accent. Do not copy their words#{faces.positive? ? '' : ' or their people'}, and do NOT copy their smooth digital rendering: the photograph must look like it came from a real camera.
    #{who}
    PHOTO SCENE: #{scene}
    #{brand['look']}
    LAYOUT: #{FULL_LAYOUTS[s['layout']] || FULL_LAYOUTS['escena']} Leave a clean calm area in the photo where the text sits so every word is perfectly legible, no boxes or panels behind the text.
    TEXT: render EXACTLY the following Spanish text, letter by letter, with every accent (á é í ó ú ñ), capital letter and punctuation mark as written. Do not add, translate, shorten or invent any other word, number or logo.
    #{texts.map { |label, t| "#{label}: \"#{t}\"" }.join("\n")}
    #{italics.empty? ? '' : "Set only these word(s) of the headline in italic serif: #{italics.map { |w| "\"#{w}\"" }.join(', ')}."}
    Keep all text at least 8% away from the top and bottom edges and 7% from the sides (the image will be trimmed to 4:5).
    #{PHOTO_REALISM}
    Crisp professional typography, no watermark.
  TXT
end

# Referencias que pueden ir a Higgsfield como molde: activas en Marcas y sin etiqueta de otra persona
# ("no es Janica" / "solo estilo"), para que el generador no mezcle caras.
def usable_layout_refs(brand)
  resources(brand_dir(brand['id']))['referencias']
    .select { |r| r['active'] && r['tags'].none? { |t| t =~ /no es|solo estilo/i } }
    .map { |r| r['path'] }
end

# Referencias de diagramación para el diseño de la lámina (rutas relativas a CONTENIDOS).
# Primero las elegidas para ese diseño en "plantillas"; si alguna se desactiva, se completa con otras activas.
def layout_refs(brand, layout)
  usable = usable_layout_refs(brand)
  map = brand['plantillas'] || {}
  list = (Array(map[layout]) + Array(map['escena']) + usable).uniq & usable
  list.first(MAX_LAYOUT_REFS).map { |rel| File.join(brand_dir(brand['id']), rel).sub(ROOT + '/', '') }
end

QA_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: %w[texto_ok errores_texto cara_ok problemas_cara diseno_ok problemas_diseno],
  properties: {
    texto_ok: { type: 'boolean' }, errores_texto: { type: 'array', items: { type: 'string' } },
    cara_ok: { type: 'boolean' }, problemas_cara: { type: 'string' },
    diseno_ok: { type: 'boolean' }, problemas_diseno: { type: 'string' }
  }
}.freeze

# Claude compara la lámina con el texto esperado y con la cara aprobada. Devuelve [ok, nota].
def qa_slide(img_path, s, brand, count, face_paths)
  return [true, ''] if api_key.empty?
  texts = full_texts(s, brand, count)
  content = [{ type: 'text', text: 'LÁMINA GENERADA:' }, claude_image(img_path)]
  unless face_paths.empty?
    content << { type: 'text', text: 'CARA APROBADA DE LA PERSONA (referencia real):' }
    face_paths.first(2).each { |r| content << claude_image(File.join(ROOT, r)) }
  end
  content << { type: 'text', text: <<~TXT }
    Revisa esta lámina de carrusel como directora de arte exigente.
    1. Texto: debe aparecer exactamente esto (mismas palabras, tildes, ñ, signos y mayúsculas; la cursiva no importa):
    #{texts.map { |l, t| "- #{t}" }.join("\n")}
    Marca texto_ok false si falta una palabra, sobra texto inventado, hay una letra mal, falta una tilde o hay texto ilegible o cortado en el borde. Lista cada error en errores_texto (cita lo que se lee).
    2. Cara: #{face_paths.empty? ? 'la lámina no debe tener a la persona aprobada; marca cara_ok true salvo que aparezca una cara deformada.' : 'compara con la referencia. cara_ok false si no parece la misma persona, si los ojos miran a puntos distintos (estrabismo), si hay asimetrías raras, labios agrandados, manos deformes o piel plástica.'}
    3. Diseño y realismo: diseno_ok false si el texto queda sobre una zona recargada y cuesta leerlo, si hay cajas o paneles detrás del texto, si hay logos o marcas de agua, o si la foto no parece de cámara real (piel encerada o de porcelana, brillo plástico, look de render 3D o ilustración, colores sobresaturados).
    Sé estricta con el texto y la cara. Responde en español.
  TXT
  data = anthropic_post(model: 'claude-opus-5', max_tokens: 2000, fallbacks: 'default',
                        output_config: { effort: 'low', format: { type: 'json_schema', schema: QA_SCHEMA } },
                        messages: [{ role: 'user', content: content }])
  r = JSON.parse((data['content'] || []).select { |b| b['type'] == 'text' }.map { |b| b['text'] }.join)
  notes = []
  notes << "Texto: #{r['errores_texto'].join('; ')}" unless r['texto_ok']
  notes << "Cara: #{r['problemas_cara']}" unless r['cara_ok']
  notes << "Diseño: #{r['problemas_diseno']}" unless r['diseno_ok']
  [r['texto_ok'] && r['cara_ok'] && r['diseno_ok'], notes.join(' · ')]
rescue StandardError => e
  [true, "No se pudo revisar automáticamente (#{e.message[0, 120]}). Revísala a ojo."]
end
