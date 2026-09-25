# Foto real + escena con IA: parte de una foto REAL de la persona aprobada y Grok Imagine 2.0 solo cambia
# el lugar, la luz y el fondo. La cara no se genera, así que es la de la foto. El texto lo pone el Editor.
#
# Se activa por marca en 06_MARCAS/<marca>/marca.json con "motor_persona": "foto_real".
# La foto base de cada lámina es s['basePhoto'] (nombre de archivo en _personas/<id>/); si falta, se elige por diseño
# con "fotos_base" de persona.json, por ejemplo { "portada": "janica-real-seria-hd.jpg", "cta": "...", "otras": "..." }.

EDIT_MODEL = 'xai/grok-imagine-image-2.0'

EDIT_PLACEMENT = {
  'portada' => 'Show her smaller in the frame, on the RIGHT THIRD of the image. The LEFT 55 percent is an empty, clean, softly lit wall with nothing on it.',
  'cta' => 'Show her smaller in the frame, on the RIGHT THIRD of the image. The LEFT 55 percent is an empty, clean, softly lit wall with nothing on it.',
  'lista' => 'Show her smaller in the frame, on the RIGHT THIRD of the image. The LEFT 55 percent is an empty, clean, softly lit wall with nothing on it.',
  'cifra' => 'Show her on the RIGHT THIRD of the image. The upper-left area is an empty, clean wall.',
  'escena' => 'Show her on the RIGHT side of the image. The upper-left area is an empty, clean wall.',
  'frase' => 'Show her in the middle band of the image; the top quarter and the bottom quarter are calm and plain.',
  'comparar' => 'Show her centered in the LOWER half; the upper half is an empty, clean wall.'
}.freeze

def edit_mode?(brand, persons)
  brand && brand['motor_persona'] == 'foto_real' && !persons.empty?
end

# Foto base (ruta relativa a CONTENIDOS) para la lámina
def edit_base(person, it)
  s = it['slide'].is_a?(Hash) ? it['slide'] : it
  active = (person['photos'] || []).select { |f| f['active'] }.map { |f| f['name'] }
  bases = person['fotos_base'] || {}
  name = [it['basePhoto'], s['basePhoto'], bases[s['layout']], bases['otras'], active.first].compact.find { |n| active.include?(n) }
  raise "#{person['name']} no tiene fotos activas." unless name
  File.join(person_dir(person['id']), name).sub(ROOT + '/', '')
end

def edit_prompt(it, person, brand)
  s = it['slide'].is_a?(Hash) ? it['slide'] : it
  scene = (s['photoPrompt'].to_s.strip.empty? ? s['photo'].to_s : s['photoPrompt'].to_s).dup
  [person['name'], *(person['aliases'] || [])].compact.sort_by { |n| -n.length }.each { |n| scene.gsub!(/#{Regexp.escape(n)}/i, 'the woman') }
  scene.gsub!(/,?\s*use the approved [^.,]*reference[^.,]*/i, '')
  scene.gsub!(/[^.,;]*\b(headline|title|text|copy|typography|lettering|logos?)\b[^.,;]*[.,;]?/i, '')
  [
    'Keep this exact woman unchanged: same face, same facial features, same expression, same hair, same outfit and jewelry, same pose. ' \
    'Do not retouch, smooth, beautify or redraw her face.',
    "Change only the location, background and lighting to match this scene: #{scene.strip.sub(/[.,;]\z/, '')}.",
    EDIT_PLACEMENT[s['layout']] || EDIT_PLACEMENT['escena'],
    'Warm ivory, beige and light wood palette, soft natural window light; match the light on her to the room.',
    'Real camera photograph, natural skin texture, no text, no letters, no logos, no watermark.'
  ].join(' ')
end

def edit_body(it, person, brand, upload)
  { prompt: edit_prompt(it, person, brand), image_urls: [upload.call(edit_base(person, it))], resolution: '2k', aspect_ratio: '3:4' }
end
