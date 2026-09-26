# Foto real + escena: parte de una foto REAL de la persona aprobada y el motor de imagen (imagen.rb) solo cambia
# el lugar, la luz, el fondo y, si hay vestuario, la ropa. La cara no se genera: es la de la foto. El texto lo pone el Editor.
#
# Se activa por marca en 06_MARCAS/<marca>/marca.json con "motor_persona": "foto_real".
# La foto base de cada lámina es s['basePhoto'] (nombre de archivo en _personas/<id>/); si falta, se elige por diseño
# con "fotos_base" de persona.json, por ejemplo { "portada": "janica-real-seria-hd.jpg", "cta": "...", "otras": "..." }.
# Vestuario: 06_MARCAS/<marca>/vestuario/ (uno distinto por lámina, o el que se elija en el Editor).

PERSONA_FACE_REFS = 2    # fotos reales extra (además de la base) para fijar la identidad

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
    "Change only the location, background and lighting to match this scene: #{scene.strip.sub(/\A[.,;\s]+/, '').sub(/[.,;]\z/, '')}.",
    EDIT_PLACEMENT[s['layout']] || EDIT_PLACEMENT['escena'],
    'Warm ivory, beige and light wood palette, soft natural window light; match the light on her to the room.',
    'Real camera photograph, natural skin texture, no text, no letters, no logos, no watermark.'
  ].join(' ')
end

# Escena sin persona: foto nueva desde el prompt de la lámina
def scene_prompt(it, brand)
  s = it['slide'].is_a?(Hash) ? it['slide'] : it
  scene = (s['photoPrompt'].to_s.strip.empty? ? s['photo'].to_s : s['photoPrompt'].to_s).dup
  scene.gsub!(/[^.,;]*\b(headline|title|text|copy|typography|lettering|logos?)\b[^.,;]*[.,;]?/i, '')
  [
    scene.strip.sub(/[.,;]\z/, '') + '.',
    EDIT_PLACEMENT[s['layout']].to_s.sub('Show her', 'Place the main subject').sub(/\bShe\b/, 'It'),
    brand['look'].to_s,
    PHOTO_REALISM,
    'No text, no letters, no logos, no watermark.'
  ].reject(&:empty?).join(' ')
end

# Outfits activos de la marca (06_MARCAS/<marca>/vestuario/), rutas absolutas
def brand_outfits(brand)
  dir = brand_dir(brand['id'])
  resources(dir)['vestuario'].select { |r| r['active'] }.map { |r| File.join(dir, r['path']) }
end

# Outfit de la lámina: s['outfit'] = nombre de archivo, 'original' (ropa de la foto base) o vacío (automático).
# En automático cada lámina del carrusel recibe un outfit distinto, fijo para ese proyecto.
def pick_outfit(it, brand)
  s = it['slide'].is_a?(Hash) ? it['slide'] : it
  choice = (it['outfit'] || s['outfit']).to_s
  return nil if choice == 'original'
  list = brand_outfits(brand)
  return nil if list.empty?
  named = list.find { |p| File.basename(p) == choice }
  return named if named
  start = it['project'].to_s.bytes.sum
  list[(start + it['index'].to_i * 7) % list.size]
end

# Devuelve [prompt, rutas absolutas de imágenes]
def persona_request(it, persons, brand)
  person = persons.first
  return [scene_prompt(it, brand), []] unless person
  base = File.join(ROOT, edit_base(person, it))
  extra = (person['photos'] || []).select { |f| f['active'] }.map { |f| File.join(person_dir(person['id']), f['name']) }
  extra = (extra - [base]).first(PERSONA_FACE_REFS)
  outfit = pick_outfit(it, brand)
  prompt = edit_prompt(it, person, brand).sub('Keep this exact woman unchanged',
                                               'Keep this exact woman from the first image unchanged')
  if outfit
    # Cambia ropa y pose; la cara sigue siendo la de la foto real
    prompt = prompt.sub('same outfit and jewelry, same pose.', 'her own jewelry and earrings.')
                   .sub('Change only the location, background and lighting', 'Change the location, background and lighting')
    prompt += " Dress her in the exact outfit shown in the LAST image: same garments, cut, fabric, colors, belt, shoes and bag. " \
              'Ignore the model, face and body in that last image; it is a clothing reference only. ' \
              'Choose a natural, elegant pose that shows the outfit and fits the scene, full body or three-quarter body.'
  end
  prompt += " The images between the first#{outfit ? ' and the last' : ''} are the same woman, for identity reference only. #{PHOTO_REALISM}"
  [prompt, [base, *extra, *outfit]]
end
