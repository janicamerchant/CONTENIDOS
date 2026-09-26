# Nano Banana Pro (Google) a 4K con la herramienta oficial de Higgsfield (~/bin/higgsfield).
# Usa la sesión y los créditos del plan de la WEB de Higgsfield (higgsfield auth login), no el saldo de la API:
# la API no ofrece este modelo. Es el motor más fotográfico probado (26-09-2026).
#
# Se activa por marca en 06_MARCAS/<marca>/marca.json con "motor_imagen": "nano_banana_pro".
# - Lámina con persona aprobada: parte de su foto REAL (selector "Tu foto real") + 2 fotos más como referencia
#   de identidad; solo cambia lugar y luz (mismo prompt que foto_real.rb).
# - Lámina sin persona: foto nueva desde la escena. El texto siempre lo pone el Editor encima.
require 'open3'

HF_CLI = File.expand_path('~/bin/higgsfield')
NBP_MODEL = 'nano_banana_pro'
NBP_RESOLUTION = '4k'
NBP_ASPECT = '4:5'       # el formato exacto del carrusel
NBP_FACE_REFS = 2        # fotos reales extra (además de la base) para fijar la identidad
NBP_CREDITS = 4          # créditos del plan web por imagen en 4K (higgsfield generate cost)

def nbp_mode?(brand)
  brand && brand['motor_imagen'] == NBP_MODEL
end

def nbp_scene_prompt(it, brand)
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
def nbp_request(it, persons, brand)
  person = persons.first
  return [nbp_scene_prompt(it, brand), []] unless person
  base = File.join(ROOT, edit_base(person, it))
  extra = (person['photos'] || []).select { |f| f['active'] }.map { |f| File.join(person_dir(person['id']), f['name']) }
  extra = (extra - [base]).first(NBP_FACE_REFS)
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

# Genera y descarga en dest. Lanza error con el mensaje de la herramienta si falla.
def nbp_generate(prompt, images, dest)
  raise 'Falta la herramienta de Higgsfield (~/bin/higgsfield). Ver LEEME.' unless File.executable?(HF_CLI)
  cmd = [HF_CLI, 'generate', 'create', NBP_MODEL, '--prompt', prompt, '--aspect_ratio', NBP_ASPECT,
         '--resolution', NBP_RESOLUTION, '--wait', '--json']
  images.each { |img| cmd += ['--image', img] }
  out, err, st = Open3.capture3(*cmd)
  raise "Higgsfield (Nano Banana Pro): #{(err + out).strip[0, 300]}" unless st.success?
  job = Array(JSON.parse(out)).first || {}
  raise "Nano Banana Pro terminó en #{job['status'] || 'error'}" unless job['status'] == 'completed' && job['result_url']
  download(job['result_url'], dest)
  dest
end
