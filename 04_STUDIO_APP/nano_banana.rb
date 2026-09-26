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

# Devuelve [prompt, rutas absolutas de imágenes]
def nbp_request(it, persons, brand)
  person = persons.first
  return [nbp_scene_prompt(it, brand), []] unless person
  base = File.join(ROOT, edit_base(person, it))
  extra = (person['photos'] || []).select { |f| f['active'] }.map { |f| File.join(person_dir(person['id']), f['name']) }
  extra = (extra - [base]).first(NBP_FACE_REFS)
  prompt = edit_prompt(it, person, brand).sub('Keep this exact woman unchanged',
                                               'Keep this exact woman from the first image unchanged') +
           ' The other images are the same woman, for identity reference only. ' + PHOTO_REALISM
  [prompt, [base, *extra]]
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
