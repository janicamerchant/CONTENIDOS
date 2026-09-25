# Marcas, base de conocimiento y personas aprobadas. Todo vive en archivos dentro de 06_MARCAS/:
#
#   06_MARCAS/<marca>/marca.json      identidad: nombre, colores, tipografías, valores por defecto, logos, personas, datos
#   06_MARCAS/<marca>/reglas.md       reglas para Claude (mandan sobre las generales)
#   06_MARCAS/<marca>/conocimiento/   perfil y documentos (.md, .txt, .pdf) que Claude lee
#   06_MARCAS/<marca>/referencias/    imágenes de estilo que Claude ve
#   06_MARCAS/<marca>/logos/
#   06_MARCAS/<marca>/recursos.json   activo/inactivo y etiquetas de cada archivo
#   06_MARCAS/<marca>/papelera/       lo eliminado, recuperable
#   06_MARCAS/_comun/                 documentos que valen para todas las marcas (misma estructura)
#   06_MARCAS/_personas/<persona>/    fotos de cara + persona.json; las marcas las enlazan por id
#   06_MARCAS/_papelera/              marcas y personas archivadas

COMUN    = File.join(MARCAS, '_comun')
PERSONAS = File.join(MARCAS, '_personas')
ARCHIVO  = File.join(MARCAS, '_papelera')
[MARCAS, File.join(COMUN, 'conocimiento'), PERSONAS, ARCHIVO].each { |d| FileUtils.mkdir_p(d) }

DOC_EXT = %w[.md .txt .pdf].freeze
KINDS = { 'conocimiento' => DOC_EXT, 'referencias' => IMAGE_EXT, 'logos' => IMAGE_EXT }.freeze
MAX_REF_IMAGES = 20     # referencias visuales activas que ve Claude en cada propuesta (van en caché)
MAX_FACE_REFS = 8       # fotos de cara que se mandan a Higgsfield por foto
BRAND_FIELDS = %w[name file swatch design theme colors fonts titleCase defaults look cutout personas datos logos byline modo plantillas motor_persona].freeze

def read_json(path, default = nil)
  File.exist?(path) ? JSON.parse(File.read(path, encoding: 'UTF-8')) : default
rescue StandardError
  default
end

def write_json(path, obj)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, JSON.pretty_generate(obj) + "\n")
end

def read_text(path)
  File.read(path, encoding: 'UTF-8').scrub
end

def stamp
  Time.now.strftime('%Y%m%d-%H%M%S')
end

# ids en minúsculas con guiones: "Nika Media" → "nika-media"
def make_id(name)
  slug(name, 40).downcase.tr('_', '-')
end

# Nombre libre dentro de una carpeta: "foto.jpg" → "foto-2.jpg" si ya existe
def free_name(dir, name)
  base, ext = File.basename(name, '.*'), File.extname(name)
  n = name
  i = 2
  while File.exist?(File.join(dir, n))
    n = "#{base}-#{i}#{ext}"
    i += 1
  end
  n
end

def safe_file_name(name, ext = nil)
  ext ||= File.extname(name.to_s).downcase
  "#{slug(File.basename(name.to_s, '.*'), 60).downcase.tr('_', '-')}#{ext}"
end

# ---------- marcas ----------

def brand_dir(id)
  return COMUN if id == '_comun'
  raise 'Marca inválida.' unless id.to_s =~ /\A[a-z0-9][a-z0-9-]{0,40}\z/
  File.join(MARCAS, id)
end

def brand_ids
  Dir.children(MARCAS).reject { |d| d.start_with?('_', '.') }
     .select { |d| File.exist?(File.join(MARCAS, d, 'marca.json')) }
end

def load_brand(id)
  b = read_json(File.join(brand_dir(id), 'marca.json')) or raise "No existe la marca #{id}."
  b.merge('id' => id)
end

def all_brands
  brand_ids.map { |id| load_brand(id) rescue nil }.compact.sort_by { |b| b['name'].to_s.downcase }
end

def brand_name(id)
  load_brand(id)['name']
rescue StandardError
  id.to_s
end

def save_brand(b)
  write_json(File.join(brand_dir(b['id']), 'marca.json'), b.reject { |k, _| k == 'id' })
end

def brand_rules(id)
  path = File.join(brand_dir(id), 'reglas.md')
  File.exist?(path) ? read_text(path).strip : ''
end

def resource_meta(dir)
  read_json(File.join(dir, 'recursos.json'), {})
end

# Archivos de cada tipo con su estado. Lo que no aparece en recursos.json está activo.
def resources(dir)
  meta = resource_meta(dir)
  KINDS.map do |kind, exts|
    folder = File.join(dir, kind)
    files = Dir.exist?(folder) ? Dir.children(folder).reject { |f| f.start_with?('.') }.select { |f| exts.include?(File.extname(f).downcase) }.sort : []
    list = files.map do |f|
      rel = "#{kind}/#{f}"
      m = meta[rel] || {}
      path = File.join(folder, f)
      { 'path' => rel, 'name' => f, 'url' => file_url(path), 'active' => m['active'] != false,
        'tags' => m['tags'] || [], 'size' => File.size(path), 'updatedAt' => File.mtime(path).iso8601 }
    end
    [kind, list]
  end.to_h
end

def trash_list(dir)
  folder = File.join(dir, 'papelera')
  return [] unless Dir.exist?(folder)
  Dir.children(folder).reject { |f| f.start_with?('.') }.sort.reverse.map do |f|
    ts, kind, name = f.split('__', 3)
    { 'name' => f, 'kind' => kind, 'original' => name || f, 'deletedAt' => (Time.strptime(ts, '%Y%m%d-%H%M%S').iso8601 rescue nil),
      'url' => file_url(File.join(folder, f)) }
  end
end

# Ruta de un recurso dentro de la carpeta de la marca, sin salirse de ella.
def resource_path(dir, rel)
  kind, name = rel.to_s.split('/', 2)
  raise 'Recurso inválido.' unless KINDS.key?(kind) && name && !name.include?('/')
  path = File.join(dir, kind, name)
  raise 'Ese archivo no existe.' unless inside?(path, dir) && File.exist?(path)
  path
end

def logo_public(dir, l)
  return nil unless l.is_a?(Hash) && l['src']
  path = File.join(dir, l['src'])
  File.exist?(path) ? l.merge('url' => file_url(path)) : nil
end

# Lo que la app necesita para dibujar y crear: sin textos largos.
def brand_public(b)
  dir = brand_dir(b['id'])
  logos = (b['logos'] || {}).map { |k, l| [k, logo_public(dir, l)] }.to_h.compact
  byline = b['byline'] && b['byline'].merge((b['byline']['logos'] || {}).map { |k, l| [k, logo_public(dir, l)] }.to_h.compact)
  people = brand_people(b).map { |p| { 'id' => p['id'], 'name' => p['name'], 'aliases' => p['aliases'] || [], 'soul' => p['soul_id'].to_s != '',
                                     'photos' => (p['photos'] || []).select { |f| f['active'] }.map { |f| f.slice('name', 'url') } } }
  b.reject { |k, _| %w[datos byline].include?(k) }.merge('logos' => logos, 'byline' => byline, 'people' => people)
end

# ---------- personas aprobadas ----------

def person_dir(id)
  raise 'Persona inválida.' unless id.to_s =~ /\A[a-z0-9][a-z0-9-]{0,40}\z/
  File.join(PERSONAS, id)
end

def person_ids
  Dir.children(PERSONAS).reject { |d| d.start_with?('_', '.') }.select { |d| File.exist?(File.join(PERSONAS, d, 'persona.json')) }
end

# Fotos en el orden guardado (el primero pesa más en la referencia de cara).
def load_person(id)
  dir = person_dir(id)
  h = read_json(File.join(dir, 'persona.json')) or return nil
  files = Dir.children(dir).reject { |f| f.start_with?('.') }.select { |f| IMAGE_EXT.include?(File.extname(f).downcase) }
  order = h['orden'] || []
  files = files.sort_by { |f| [order.index(f) || order.size, f] }
  off = h['inactivas'] || []
  h.merge('id' => id, 'photos' => files.map { |f| { 'name' => f, 'url' => file_url(File.join(dir, f)), 'active' => !off.include?(f) } })
rescue StandardError
  nil
end

def all_people
  person_ids.map { |id| load_person(id) }.compact.sort_by { |p| p['name'].to_s.downcase }
end

def brand_people(b)
  (b['personas'] || []).map { |id| load_person(id) }.compact
end

def plain(s)
  s.to_s.unicode_normalize(:nfkd).gsub(/\p{Mn}/, '').downcase
end

def person_match?(p, text)
  t = plain(text)
  words = [p['name'], *(p['aliases'] || [])].map { |a| plain(a).strip }.reject(&:empty?)
  words.any? { |w| t =~ /(?<![a-z0-9])#{Regexp.escape(w)}(?![a-z0-9])/ }
end

def people_in(b, text)
  brand_people(b).select { |p| person_match?(p, text) }
end

def person_lock(p)
  custom = p['identidad'].to_s.strip
  return custom.tr("\n", ' ') unless custom.empty?
  "IDENTITY LOCK: the person named #{p['name']} is the same real person shown in the reference images. " \
  'Reproduce the face exactly from the references: same facial geometry, same age, same skin tone and hair. ' \
  'Both eyes aligned and looking at the same point, natural symmetrical gaze. Do not blend with other people, do not beautify. ' \
  'Frame as a medium or medium-close shot so the face is large and sharp; natural hands with five fingers.'
end

def person_refs(p, max)
  (p['photos'] || []).select { |f| f['active'] }.first(max).map { |f| File.join(person_dir(p['id']), f['name']).sub(ROOT + '/', '') }
end

# ---------- lo que lee Claude ----------

# Convierte a JPEG liviano (sips viene con macOS). Se usa para referencias y para lo que va a Claude.
def to_jpeg(src, dest, max = 1600)
  ok = system('/usr/bin/sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', max.to_s, src, '--out', dest,
              out: File::NULL, err: File::NULL)
  ok && File.exist?(dest)
end

def claude_image(path)
  ext = File.extname(path).downcase
  src = path
  if File.size(path) > 3_500_000 || !%w[.jpg .jpeg .png .webp .gif].include?(ext)
    cached = File.join(CACHE, "#{slug(path.sub(ROOT + '/', ''), 90)}-#{File.mtime(path).to_i}.jpg")
    src = cached if File.exist?(cached) || to_jpeg(path, cached, 1568)
  end
  types = { '.jpg' => 'image/jpeg', '.jpeg' => 'image/jpeg', '.png' => 'image/png', '.webp' => 'image/webp', '.gif' => 'image/gif' }
  { type: 'image', source: { type: 'base64', media_type: types[File.extname(src).downcase] || 'image/jpeg', data: Base64.strict_encode64(File.binread(src)) } }
end

# Recursos activos de _comun + la marca.
def brand_knowledge(id)
  texts = []
  pdfs = []
  images = []
  [COMUN, brand_dir(id)].uniq.each do |dir|
    res = resources(dir)
    res['conocimiento'].select { |r| r['active'] }.each do |r|
      path = File.join(dir, r['path'])
      rel = path.sub(ROOT + '/', '')
      if r['name'] =~ /\.pdf\z/i
        pdfs << { rel: rel, path: path }
      else
        texts << { rel: rel, text: read_text(path) }
      end
    end
    res['referencias'].select { |r| r['active'] }.each do |r|
      images << { rel: File.join(dir, r['path']).sub(ROOT + '/', ''), path: File.join(dir, r['path']), tags: r['tags'] }
    end
  end
  { texts: texts, pdfs: pdfs, images: images.first(MAX_REF_IMAGES), images_total: images.size }
end

def pdf_pages(path)
  [File.binread(path).scan(%r{/Type\s*/Page[^s]}).size, 1].max
rescue StandardError
  1
end

# Tamaño aproximado de lo que se manda en cada propuesta (tokens y dólares con Claude Opus 5).
def brand_meter(id)
  kb = brand_knowledge(id)
  b = (load_brand(id) rescue nil)
  text_chars = kb[:texts].sum { |t| t[:text].size } + (b ? brand_rules(id).size + (b['datos'] || []).to_json.size : 0)
  text_tokens = (text_chars / 3.6).round
  image_tokens = kb[:images].size * 1_600
  pdf_tokens = kb[:pdfs].sum { |p| pdf_pages(p[:path]) * 2_300 }
  base = 3_000 # reglas generales, brief e investigación
  total = text_tokens + image_tokens + pdf_tokens + base
  { tokens: total, text_tokens: text_tokens, image_tokens: image_tokens, pdf_tokens: pdf_tokens,
    docs: kb[:texts].size + kb[:pdfs].size, images: kb[:images].size, images_total: kb[:images_total],
    usd_first: (total * CLAUDE_PRICE[:cache_write] / 1_000_000.0).round(4),
    usd_cached: (total * CLAUDE_PRICE[:cache_read] / 1_000_000.0).round(4) }
end

def brand_detail(id)
  dir = brand_dir(id)
  base = id == '_comun' ? { 'id' => '_comun', 'name' => 'Común a todas las marcas' } : brand_public(load_brand(id)).merge('datos' => load_brand(id)['datos'] || [])
  base.merge('resources' => resources(dir), 'trash' => trash_list(dir), 'rules' => id == '_comun' ? '' : brand_rules(id),
             'meter' => id == '_comun' ? nil : brand_meter(id))
end

# ---------- cambios ----------

def default_brand(name)
  {
    'name' => name, 'file' => slug(name, 24).upcase, 'swatch' => '#ECFE6E', 'design' => 'base', 'theme' => 'dark',
    'colors' => { 'accent' => '#ECFE6E', 'darkBg' => '#1E1E20', 'darkInk' => '#F2F0EA', 'lightBg' => '#F4F2EC', 'lightInk' => '#1E1E20' },
    'fonts' => { 'display' => 'Archivo', 'body' => 'Inter' }, 'titleCase' => 'upper',
    'defaults' => { 'audiencia' => '', 'cta' => '', 'idioma' => 'Español', 'objetivo' => 'Autoridad' },
    'look' => 'natural color editorial photograph, soft natural light, real premium setting',
    'cutout' => false, 'personas' => [], 'datos' => [], 'logos' => {}
  }
end

def apply_brand_fields(b, fields)
  (fields.keys & BRAND_FIELDS).each { |k| b[k] = fields[k] }
  b['swatch'] = b.dig('colors', 'accent') if b['design'] == 'base' && b.dig('colors', 'accent')
  b['file'] = slug(b['file'].to_s.empty? ? b['name'] : b['file'], 24).upcase
  b['datos'] = (b['datos'] || []).select { |d| d.is_a?(Hash) && !d['dato'].to_s.strip.empty? }
  b
end

def create_brand(f)
  name = f['name'].to_s.strip
  raise 'Escribe el nombre de la marca.' if name.empty?
  id = make_id(name)
  id = "#{id}-#{rand(100)}" if File.exist?(File.join(MARCAS, id)) || id.start_with?('-')
  b = apply_brand_fields(default_brand(name).merge('id' => id), f)
  dir = brand_dir(id)
  %w[conocimiento referencias logos].each { |k| FileUtils.mkdir_p(File.join(dir, k)) }
  save_brand(b)
  File.write(File.join(dir, 'conocimiento', 'perfil.md'), f['profile'].to_s.strip + "\n") unless f['profile'].to_s.strip.empty?
  File.write(File.join(dir, 'reglas.md'), f['rules'].to_s.strip + "\n") unless f['rules'].to_s.strip.empty?
  id
end

def update_brand(id, f)
  b = apply_brand_fields(load_brand(id), f)
  save_brand(b)
  if f.key?('rules')
    path = File.join(brand_dir(id), 'reglas.md')
    f['rules'].to_s.strip.empty? ? FileUtils.rm_f(path) : File.write(path, f['rules'].to_s.strip + "\n")
  end
end

def set_meta(dir, rel, patch)
  meta = resource_meta(dir)
  m = (meta[rel] || {}).merge(patch)
  m.delete('active') if m['active'] == true
  m.delete('tags') if m['tags'] == []
  m.empty? ? meta.delete(rel) : meta[rel] = m
  write_json(File.join(dir, 'recursos.json'), meta)
end

def decode_data_url(data_url)
  m = data_url.to_s.match(/\Adata:([\w\/+.-]*);base64,(.+)\z/m)
  raise 'Archivo inválido.' unless m
  [m[1], Base64.decode64(m[2])]
end

# Agrega un documento, una referencia o un logo. Devuelve la ruta relativa dentro de la marca.
def add_resource(id, f)
  dir = brand_dir(id)
  kind = f['kind'].to_s
  raise 'Tipo de recurso inválido.' unless KINDS.key?(kind)
  folder = File.join(dir, kind)
  FileUtils.mkdir_p(folder)
  if kind == 'conocimiento' && f['dataUrl'].to_s.empty?
    title = f['name'].to_s.strip
    raise 'Ponle un título al texto.' if title.empty?
    name = free_name(folder, safe_file_name(title, '.md'))
    File.write(File.join(folder, name), f['text'].to_s.strip + "\n")
  else
    _, bytes = decode_data_url(f['dataUrl'])
    ext = File.extname(f['name'].to_s).downcase
    raise "Formato no admitido (#{ext.empty? ? 'sin extensión' : ext})." unless KINDS[kind].include?(ext)
    if kind == 'referencias'
      # Las referencias solo las ve Claude: se guardan como JPEG de 1600 px para no inflar el repositorio.
      tmp = File.join(CACHE, "subida-#{stamp}#{ext}")
      File.binwrite(tmp, bytes)
      name = free_name(folder, safe_file_name(f['name'], '.jpg'))
      ok = to_jpeg(tmp, File.join(folder, name))
      FileUtils.rm_f(tmp)
      raise 'No se pudo convertir la imagen.' unless ok
    else
      name = free_name(folder, safe_file_name(f['name'], ext))
      File.binwrite(File.join(folder, name), bytes)
    end
  end
  rel = "#{kind}/#{name}"
  if kind == 'logos' && %w[dark light].include?(f['role']) && id != '_comun'
    b = load_brand(id)
    (b['logos'] ||= {})[f['role']] = { 'src' => rel }.merge(f['key'].is_a?(Array) ? { 'key' => f['key'] } : {})
    save_brand(b)
  end
  set_meta(dir, rel, 'tags' => Array(f['tags'])) unless Array(f['tags']).empty?
  rel
end

def update_resource(id, f)
  dir = brand_dir(id)
  path = resource_path(dir, f['path'])
  patch = {}
  patch['active'] = f['active'] == true if f.key?('active')
  patch['tags'] = Array(f['tags']).map { |t| t.to_s.strip }.reject(&:empty?).uniq if f.key?('tags')
  set_meta(dir, f['path'], patch) unless patch.empty?
  if f.key?('text')
    raise 'Solo se editan textos .md o .txt.' unless path =~ /\.(md|txt)\z/i
    File.write(path, f['text'].to_s)
  end
end

def delete_resource(id, rel)
  dir = brand_dir(id)
  path = resource_path(dir, rel)
  kind, name = rel.split('/', 2)
  FileUtils.mkdir_p(File.join(dir, 'papelera'))
  FileUtils.mv(path, File.join(dir, 'papelera', "#{stamp}__#{kind}__#{name}"))
  meta = resource_meta(dir)
  if meta.delete(rel)
    write_json(File.join(dir, 'recursos.json'), meta)
  end
  return if id == '_comun'
  b = load_brand(id)
  if (b['logos'] || {}).any? { |_, l| l['src'] == rel }
    b['logos'] = b['logos'].reject { |_, l| l['src'] == rel }
    save_brand(b)
  end
end

def trash_file(dir, name)
  raise 'Archivo inválido.' if name.to_s.include?('/') || name.to_s.empty?
  path = File.join(dir, 'papelera', name)
  raise 'Ya no está en la papelera.' unless File.exist?(path)
  path
end

def restore_resource(id, name)
  dir = brand_dir(id)
  path = trash_file(dir, name)
  _, kind, original = name.split('__', 3)
  raise 'No se sabe a qué sección pertenece.' unless KINDS.key?(kind) && original
  folder = File.join(dir, kind)
  FileUtils.mkdir_p(folder)
  FileUtils.mv(path, File.join(folder, free_name(folder, original)))
end

def purge_resource(id, name)
  FileUtils.rm_f(trash_file(brand_dir(id), name))
end

def archive_brand(id)
  raise 'La carpeta común no se archiva.' if id == '_comun'
  FileUtils.mv(brand_dir(id), File.join(ARCHIVO, "marca__#{id}__#{stamp}"))
end

def archived_list
  Dir.children(ARCHIVO).reject { |f| f.start_with?('.') }.sort.reverse.map do |f|
    type, id, ts = f.split('__', 3)
    data = read_json(File.join(ARCHIVO, f, type == 'marca' ? 'marca.json' : 'persona.json'), {})
    { 'name' => f, 'type' => type, 'id' => id, 'label' => data['name'] || id, 'archivedAt' => (Time.strptime(ts.to_s, '%Y%m%d-%H%M%S').iso8601 rescue nil) }
  end
end

def restore_archived(name)
  raise 'Archivo inválido.' if name.to_s.include?('/') || name.to_s.empty?
  src = File.join(ARCHIVO, name)
  raise 'Ya no está archivada.' unless File.directory?(src)
  type, id, = name.split('__', 3)
  base = type == 'marca' ? MARCAS : PERSONAS
  dest = id
  dest = "#{id}-#{rand(100)}" while File.exist?(File.join(base, dest))
  FileUtils.mv(src, File.join(base, dest))
  dest
end

# ---------- cambios en personas ----------

def save_person(f)
  name = f['name'].to_s.strip
  raise 'Escribe el nombre de la persona.' if name.empty?
  id = f['id'].to_s.empty? ? make_id(name) : f['id'].to_s
  dir = person_dir(id)
  h = read_json(File.join(dir, 'persona.json'), {})
  h['name'] = name
  h['aliases'] = Array(f['aliases']).map { |a| a.to_s.strip }.reject(&:empty?).uniq
  h['descripcion'] = f['descripcion'].to_s.strip
  h['identidad'] = f['identidad'].to_s.strip
  write_json(File.join(dir, 'persona.json'), h)
  if f['brands'].is_a?(Array)
    all_brands.each do |b|
      has = (b['personas'] || []).include?(id)
      want = f['brands'].include?(b['id'])
      next if has == want
      b['personas'] = want ? (b['personas'] || []) + [id] : b['personas'] - [id]
      save_brand(b)
    end
  end
  id
end

def person_photo(id, f)
  dir = person_dir(id)
  h = read_json(File.join(dir, 'persona.json')) or raise 'No existe esa persona.'
  case f['op']
  when 'add'
    _, bytes = decode_data_url(f['dataUrl'])
    ext = File.extname(f['name'].to_s).downcase
    raise 'Sube una imagen JPG, PNG o WebP.' unless IMAGE_EXT.include?(ext)
    name = free_name(dir, safe_file_name(f['name'], ext))
    File.binwrite(File.join(dir, name), bytes)
    h['orden'] = (h['orden'] || []) + [name]
  when 'update'
    name = f['photo'].to_s
    raise 'Esa foto no existe.' unless !name.include?('/') && File.exist?(File.join(dir, name))
    off = h['inactivas'] || []
    h['inactivas'] = f['active'] == false ? (off | [name]) : off - [name] if f.key?('active')
    if f['move']
      order = load_person(id)['photos'].map { |p| p['name'] }
      i = order.index(name)
      j = i + f['move'].to_i
      order[i], order[j] = order[j], order[i] if j.between?(0, order.size - 1)
      h['orden'] = order
    end
  when 'delete'
    name = f['photo'].to_s
    raise 'Esa foto no existe.' unless !name.include?('/') && File.exist?(File.join(dir, name))
    FileUtils.mkdir_p(File.join(dir, 'papelera'))
    FileUtils.mv(File.join(dir, name), File.join(dir, 'papelera', "#{stamp}__foto__#{name}"))
    h['orden'] = (h['orden'] || []) - [name]
    h['inactivas'] = (h['inactivas'] || []) - [name]
  else
    raise 'Operación inválida.'
  end
  h.delete('inactivas') if h['inactivas'] == []
  write_json(File.join(dir, 'persona.json'), h)
end

def archive_person(id)
  all_brands.each do |b|
    next unless (b['personas'] || []).include?(id)
    b['personas'] -= [id]
    save_brand(b)
  end
  FileUtils.mv(person_dir(id), File.join(ARCHIVO, "persona__#{id}__#{stamp}"))
end

def people_detail
  brands = all_brands
  all_people.map do |p|
    p.merge('brands' => brands.select { |b| (b['personas'] || []).include?(p['id']) }.map { |b| b['id'] }, 'lock' => person_lock(p))
  end
end

# ---------- Claude arma el perfil de una marca nueva ----------

BRAND_DRAFT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: %w[profile rules audiencia cta idioma objetivo look accent darkBg darkInk lightBg lightInk displayFont bodyFont titleCase theme questions],
  properties: {
    profile: { type: 'string' }, rules: { type: 'string' },
    audiencia: { type: 'string' }, cta: { type: 'string' }, idioma: { type: 'string', enum: %w[Español English] },
    objetivo: { type: 'string' }, look: { type: 'string' },
    accent: { type: 'string' }, darkBg: { type: 'string' }, darkInk: { type: 'string' }, lightBg: { type: 'string' }, lightInk: { type: 'string' },
    displayFont: { type: 'string' }, bodyFont: { type: 'string' },
    titleCase: { type: 'string', enum: %w[upper none] }, theme: { type: 'string', enum: %w[dark light] },
    questions: { type: 'array', items: { type: 'string' } }
  }
}.freeze

BRAND_DRAFT_RULES = <<~TXT
  Eres el director de marca de Nika Media. Con la descripción del usuario y la investigación, arma el primer perfil de una marca nueva para producir carruseles de Instagram.
  Escribe en español con ortografía completa. No inventes datos: lo que no sepas va en "questions" como pregunta corta para el usuario, y en el perfil queda como "Pendiente de confirmar".
  - profile: Markdown con estas secciones: Posicionamiento; Audiencia y objetivos; Ofertas y productos; Voz y tono; Pilares de contenido; Sistema visual (paleta, tipografía, fotografía, composición); Personas que aparecen; Datos y proof points aprobados (solo si vienen de la investigación, con fuente); Prohibido.
  - rules: reglas cortas para el guionista (6 a 10 viñetas): tono, qué tipo de fotos, qué evitar, cómo usar el color de acento, idioma. Deben mandar sobre reglas genéricas.
  - look: estilo de foto en inglés para el generador de imágenes (luz, paleta, lugares), una frase.
  - Colores en HEX (#RRGGBB). Si la investigación muestra los colores de la marca, úsalos. accent es el color de acento; darkBg/darkInk el fondo y el texto de las láminas oscuras; lightBg/lightInk los de las láminas claras. Contraste alto entre fondo y texto.
  - displayFont y bodyFont: familias que existan en Google Fonts (por ejemplo Archivo, Anton, Inter, Montserrat, Playfair Display, DM Serif Display, Space Grotesk, Poppins, Lora). Si la marca usa una fuente comercial, elige la más parecida de Google Fonts y dilo en el perfil.
  - titleCase: upper si los titulares van en mayúsculas.
  - No copies el sistema visual de EVA, Janica Merchant ni City Kia.
TXT

def claude_brand_draft(f)
  raise 'Falta la API key de Anthropic. Agrégala en Ajustes.' if api_key.empty?
  name = f['name'].to_s.strip
  raise 'Escribe el nombre de la marca.' if name.empty?
  usages = []
  notes = ''
  unless f['website'].to_s.strip.empty? && f['research'] == false
    q = "Fecha de hoy: #{Date.today.iso8601}\nInvestiga la marca \"#{name}\"#{f['website'].to_s.strip.empty? ? '' : " (sitio: #{f['website']})"}.\n" \
        "Descripción del usuario: #{f['description']}\n" \
        'Busca: qué vende, a quién, ubicación, tono de comunicación, colores y tipografía de su marca (HEX si aparecen), redes sociales, y 2 o 3 datos verificables útiles para contenido. Responde en español, en lista, con URL por dato.'
    data = anthropic_post(model: 'claude-opus-5', max_tokens: 6000, fallbacks: 'default', output_config: { effort: 'medium' },
                          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 4 }],
                          messages: [{ role: 'user', content: q }])
    usages << data['usage']
    notes = (data['content'] || []).select { |b| b['type'] == 'text' }.map { |b| b['text'] }.join.strip
  end
  registry = File.join(ROOT, '01_SKILL_OPERATIVO/references/brand-registry.md')
  user = "Marca: #{name}\nSitio: #{f['website']}\nDescripción del usuario:\n#{f['description']}\n\n" \
         "Investigación:\n#{notes.empty? ? 'Sin investigación web.' : notes}\n\n" \
         "Guía del registro de marcas:\n#{File.exist?(registry) ? read_text(registry) : ''}"
  data = anthropic_post(model: 'claude-opus-5', max_tokens: 12_000, fallbacks: 'default',
                        output_config: { effort: 'medium', format: { type: 'json_schema', schema: BRAND_DRAFT_SCHEMA } },
                        system: BRAND_DRAFT_RULES, messages: [{ role: 'user', content: user }])
  usages << data['usage']
  out = JSON.parse((data['content'] || []).select { |b| b['type'] == 'text' }.map { |b| b['text'] }.join)
  out.merge('research' => notes, 'usage' => claude_usage(usages, data['model']))
end
