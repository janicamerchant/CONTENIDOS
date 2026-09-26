# Fotos con Soul 2.0 + Soul ID (modelo entrenado con las fotos reales de una persona aprobada).
# Da fotografía de cámara real; la tipografía la pone el Editor encima (plantilla de la marca).
#
# Es el motor "hf_soul" de imagen.rb (API de Higgsfield). La cara entrenada se usa cuando la lámina nombra a una
# persona con "soul_id" en persona.json (lo escribe tools/entrenar_soul.rb); si no, Soul hace una foto sin persona fija.

SOUL_MODEL = 'higgsfield-ai/soul/v2/standard'
SOUL_STRENGTH = 1.0     # 0 a 1: cuánto manda la cara entrenada sobre el prompt

# Dónde va la persona según el diseño, para dejar limpia la zona del texto de la plantilla
SOUL_PLACEMENT = {
  'portada' => 'She is placed on the RIGHT third of the frame; the whole LEFT half and the upper area are a clean, plain, softly lit wall with nothing on it.',
  'cta' => 'She is placed on the RIGHT third of the frame; the whole LEFT half is a clean, plain, softly lit wall with nothing on it.',
  'escena' => 'She is placed on the RIGHT side or lower half of the frame; the upper-left area is a clean, plain wall.',
  'frase' => 'She is in the middle band of the frame; the top quarter and the bottom quarter are calm and plain.',
  'lista' => 'She is placed on the RIGHT third of the frame; the LEFT half is a clean, plain wall.',
  'cifra' => 'She is placed on the RIGHT third of the frame; the upper-left area is a clean, plain wall.',
  'comparar' => 'She is centered in the LOWER half of the frame; the upper half is a clean, plain wall.'
}.freeze

def soul_person(persons)
  persons.find { |p| p['soul_id'].to_s != '' }
end

# El prompt de Soul no usa nombres ni instrucciones de referencia: la cara viene del Soul ID.
def soul_prompt(it, person, brand)
  s = it['slide'].is_a?(Hash) ? it['slide'] : it
  scene = (s['photoPrompt'].to_s.strip.empty? ? s['photo'].to_s : s['photoPrompt'].to_s).dup
  names = [person['name'], *(person['aliases'] || [])].compact.sort_by { |n| -n.length }
  scene.gsub!(/,?\s*use the approved [^.,]*reference[^.,]*/i, '')
  names.each { |n| scene.gsub!(/#{Regexp.escape(n)}/i, 'the woman') }
  scene.gsub!(/,?\s*(hyperrealistic editorial photograph|natural skin texture|no text|no logos)\b/i, '')
  # Soul dibuja letras falsas si lee "headline", "title" o "text": se quitan esas frases de la escena
  scene.gsub!(/[^.,;]*\b(headline|title|text|copy|typography|lettering)\b[^.,;]*[.,;]?/i, '')
  # Soul ya es fotográfico y falla con prompts muy largos: bloque de realismo corto y sin repetir el "look" de la marca.
  [
    scene,
    person['soul_look'].to_s,
    SOUL_PLACEMENT[s['layout']] || SOUL_PLACEMENT['escena'],
    'Warm ivory, beige and light wood palette, soft window light, 85mm lens, real skin texture, subtle film grain',
    'No text, no logos'
  ].map { |t| t.strip.sub(/[.,;]\z/, '') }.reject(&:empty?).map { |t| "#{t[0].upcase}#{t[1..]}." }.join(' ')
end

def soul_body(prompt, soul_id)
  body = { prompt: prompt, aspect_ratio: '3:4', resolution: '1080p', enhance_prompt: false, batch_size: 1 }
  soul_id.to_s.empty? ? body : body.merge(custom_reference_id: soul_id, custom_reference_strength: SOUL_STRENGTH)
end
