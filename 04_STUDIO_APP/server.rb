#!/usr/bin/env ruby
# Estudio de Carruseles · Nika Media — servidor local (Ruby del sistema, sin dependencias).
# Uso: ruby server.rb   →   http://localhost:4321

require 'webrick'
require 'json'
require 'net/http'
require 'uri'
require 'base64'
require 'fileutils'
require 'time'
require 'erb'

APP      = File.expand_path(__dir__)
ROOT     = File.expand_path('..', APP)                 # CONTENIDOS
PUBLIC   = File.join(APP, 'public')
DATA     = File.join(APP, 'data')
UPLOADS  = File.join(DATA, 'uploads')
PROJECTS = File.join(DATA, 'proyectos')
CONFIG   = File.join(DATA, 'config.json')
REQUESTS = File.join(ROOT, '05_SOLICITUDES')
DELIVER  = File.join(ROOT, '03_ENTREGAS')
PORT     = (ENV['PORT'] || 4321).to_i

[UPLOADS, PROJECTS, REQUESTS, DELIVER].each { |d| FileUtils.mkdir_p(d) }

IMAGE_EXT = %w[.png .jpg .jpeg .webp .gif].freeze

SHARED_REFS = [
  '01_SKILL_OPERATIVO/SKILL.md',
  '01_SKILL_OPERATIVO/references/production-workflow.md',
  '02_ARCHIVOS_ORIGINALES/brand-standards/global-human-image-quality.md'
].freeze

BRANDS = {
  'eva'     => { name: 'EVA', refs: ['01_SKILL_OPERATIVO/references/eva.md',
                                     '02_ARCHIVOS_ORIGINALES/brand-standards/eva-carousel-visual-guide.md'] },
  'janica'  => { name: 'Janica Merchant', refs: ['01_SKILL_OPERATIVO/references/janica-merchant.md'] },
  'citykia' => { name: 'City Kia', refs: ['01_SKILL_OPERATIVO/references/city-kia.md'] }
}.freeze

# ---------- helpers ----------

def json(res, obj, status = 200)
  res.status = status
  res['Content-Type'] = 'application/json; charset=utf-8'
  res['Cache-Control'] = 'no-store'
  res.body = JSON.generate(obj)
end

def body_json(req)
  JSON.parse((req.body || '{}').dup.force_encoding('UTF-8'))
end

def slug(str, max = 48)
  s = str.to_s.unicode_normalize(:nfkd).gsub(/[^\x00-\x7F]/, '')
  s = s.gsub(/[^A-Za-z0-9]+/, '_').gsub(/^_+|_+$/, '')
  s = 'sin_nombre' if s.empty?
  s[0, max]
end

def file_url(abs)
  rel = abs.sub(ROOT + '/', '')
  '/files/' + rel.split('/').map { |p| ERB::Util.url_encode(p) }.join('/')
end

def inside?(abs, base)
  File.expand_path(abs).start_with?(File.expand_path(base) + '/')
end

def read_config
  File.exist?(CONFIG) ? JSON.parse(File.read(CONFIG)) : {}
rescue StandardError
  {}
end

def api_key
  k = ENV['ANTHROPIC_API_KEY'].to_s.strip
  k.empty? ? read_config['apiKey'].to_s.strip : k
end

def write_data_url(data_url, path)
  m = data_url.to_s.match(/\Adata:([\w\/+.-]+);base64,(.+)\z/m)
  raise 'Imagen inválida' unless m
  File.binwrite(path, Base64.decode64(m[2]))
end

def request_markdown(r)
  b = r['brief'] || {}
  <<~MD
    # Solicitud: #{b['tema']}

    - ID: #{r['id']}
    - Estado: #{r['status']}
    - Creada: #{r['createdAt']}
    - Solicitado por: #{b['solicitante']}
    - Entrega: #{b['entrega']}

    ```text
    Marca: #{BRANDS.dig(b['marca'], :name) || b['marca']}
    Formato: #{b['formato']} (#{b['laminas']} láminas)
    Tema/oferta: #{b['tema']}
    Objetivo: #{b['objetivo']}
    Audiencia: #{b['audiencia']}
    Idioma: #{b['idioma']}
    CTA: #{b['cta']}
    Referencias nuevas: #{b['referencias']}
    ```

    ## Notas

    #{b['notas']}
  MD
end

# ---------- Claude: borrador de carrusel ----------

SLIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: %w[name caption slides],
  properties: {
    name: { type: 'string' },
    caption: { type: 'string' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: %w[layout theme kicker title body number numberLabel items leftLabel leftItems rightLabel rightItems cta photo],
        properties: {
          layout: { type: 'string', enum: %w[portada cifra frase lista comparar cta] },
          theme: { type: 'string', enum: %w[dark light] },
          kicker: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          number: { type: 'string' },
          numberLabel: { type: 'string' },
          items: { type: 'array', items: { type: 'string' } },
          leftLabel: { type: 'string' },
          leftItems: { type: 'array', items: { type: 'string' } },
          rightLabel: { type: 'string' },
          rightItems: { type: 'array', items: { type: 'string' } },
          cta: { type: 'string' },
          photo: { type: 'string' }
        }
      }
    }
  }
}.freeze

DRAFT_RULES = <<~TXT
  Eres el equipo creativo de Nika Media. Con el brief del usuario, propone la arquitectura y el copy final de un carrusel de Instagram 4:5, siguiendo exactamente el perfil de marca y el flujo de producción que tienes abajo.

  Cómo llenar cada lámina:
  - layout: portada (lámina 1, siempre con foto de una cara humana en la marca EVA), cifra (un número protagonista), frase (una afirmación fuerte), lista (checklist práctico), comparar (antes/después o dos columnas), cta (última lámina).
  - theme: dark o light. Alterna para dar ritmo; no todas iguales.
  - title: pocas palabras. Marca con *asteriscos* la palabra o frase que va en color de acento (máximo una por titular).
  - body: una o dos frases cortas, o vacío.
  - number y numberLabel solo en layout cifra. items solo en lista (3 a 5). leftLabel/leftItems/rightLabel/rightItems solo en comparar (3 ítems por lado). cta solo en la última.
  - photo: dirección de arte para la fotografía de esa lámina (persona, emoción, encuadre, luz), o vacío si la lámina no lleva foto.
  - Deja vacíos ("" o []) los campos que no apliquen al layout.
  - caption: el texto del post para Instagram, con el CTA.

  Datos: nunca inventes estadísticas, precios, fechas ni resultados. Usa solo los proof points aprobados del perfil. Si una cifra necesita verificarse en una fuente oficial, escríbela seguida de [VERIFICAR].
TXT

def claude_draft(brief)
  key = api_key
  raise 'Falta la API key de Anthropic. Agrégala en Ajustes.' if key.empty?

  brand = BRANDS[brief['marca']] || BRANDS['eva']
  docs = (SHARED_REFS + brand[:refs]).map do |rel|
    path = File.join(ROOT, rel)
    File.exist?(path) ? "<documento ruta=\"#{rel}\">\n#{File.read(path)}\n</documento>" : ''
  end.join("\n\n")

  user = <<~TXT
    Marca: #{brand[:name]}
    Formato: carrusel de #{brief['laminas'] || 7} láminas
    Tema/oferta: #{brief['tema']}
    Objetivo: #{brief['objetivo']}
    Audiencia: #{brief['audiencia']}
    Idioma: #{brief['idioma']}
    CTA: #{brief['cta']}
    Referencias nuevas: #{brief['referencias']}
    Notas: #{brief['notas']}
  TXT

  payload = {
    model: 'claude-opus-5',
    max_tokens: 16_000,
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SLIDE_SCHEMA } },
    system: "#{DRAFT_RULES}\n\n#{docs}",
    messages: [{ role: 'user', content: user }]
  }

  uri = URI('https://api.anthropic.com/v1/messages')
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  http.read_timeout = 300
  req = Net::HTTP::Post.new(uri)
  req['x-api-key'] = key
  req['anthropic-version'] = '2023-06-01'
  req['anthropic-beta'] = 'server-side-fallback-2026-07-01'
  req['content-type'] = 'application/json'
  req.body = JSON.generate(payload)
  res = http.request(req)
  data = JSON.parse(res.body.force_encoding('UTF-8'))

  unless res.code.to_i == 200
    msg = data.dig('error', 'message') || res.body
    raise "La API respondió #{res.code}: #{msg}"
  end
  raise 'Claude rechazó la solicitud. Reformula el tema del brief.' if data['stop_reason'] == 'refusal'
  raise 'La respuesta se cortó antes de terminar. Intenta con menos láminas.' if data['stop_reason'] == 'max_tokens'

  text = (data['content'] || []).select { |b| b['type'] == 'text' }.map { |b| b['text'] }.join
  JSON.parse(text)
end

# ---------- servidor ----------

server = WEBrick::HTTPServer.new(
  BindAddress: '127.0.0.1',
  Port: PORT,
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN)
)

server.mount('/', WEBrick::HTTPServlet::FileHandler, PUBLIC)
server.mount('/files', WEBrick::HTTPServlet::FileHandler, ROOT)

# Biblioteca de imágenes: assets de marca, originales y subidas
server.mount_proc('/api/assets') do |_req, res|
  groups = [
    ['Marca y referencias', File.join(ROOT, '01_SKILL_OPERATIVO/assets')],
    ['Archivos originales', File.join(ROOT, '02_ARCHIVOS_ORIGINALES')],
    ['Subidas', UPLOADS]
  ]
  out = groups.flat_map do |label, dir|
    Dir.glob(File.join(dir, '**', '*')).sort.select { |f| IMAGE_EXT.include?(File.extname(f).downcase) }.map do |f|
      { group: label, name: File.basename(f), folder: File.dirname(f).sub(ROOT + '/', ''), url: file_url(f) }
    end
  end
  json(res, out)
end

server.mount_proc('/api/upload') do |req, res|
  b = body_json(req)
  ext = b['dataUrl'].to_s[%r{\Adata:image/(\w+)}, 1].to_s.sub('jpeg', 'jpg')
  ext = 'png' if ext.empty?
  name = "#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{slug(File.basename(b['name'].to_s, '.*'), 40)}.#{ext}"
  path = File.join(UPLOADS, name)
  write_data_url(b['dataUrl'], path)
  json(res, { url: file_url(path), name: name })
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

# Proyectos (carruseles en edición)
server.mount_proc('/api/projects') do |req, res|
  if req.request_method == 'POST'
    p = body_json(req)
    p['id'] = slug(p['id'].to_s.empty? ? "p#{Time.now.to_i}" : p['id'], 64)
    p['updatedAt'] = Time.now.iso8601
    File.write(File.join(PROJECTS, "#{p['id']}.json"), JSON.pretty_generate(p))
    json(res, { ok: true, id: p['id'], updatedAt: p['updatedAt'] })
  elsif (id = req.query['id'])
    path = File.join(PROJECTS, "#{slug(id, 64)}.json")
    File.exist?(path) ? json(res, JSON.parse(File.read(path))) : json(res, { error: 'No existe ese proyecto.' }, 404)
  else
    list = Dir.glob(File.join(PROJECTS, '*.json')).map do |f|
      p = JSON.parse(File.read(f)) rescue next
      { id: p['id'], name: p['name'], brand: p['brand'], slides: (p['slides'] || []).size, updatedAt: p['updatedAt'] }
    end.compact.sort_by { |p| p[:updatedAt].to_s }.reverse
    json(res, list)
  end
end

# Solicitudes del equipo → 05_SOLICITUDES/<id>.json + .md
server.mount_proc('/api/requests') do |req, res|
  if req.request_method == 'POST'
    r = body_json(req)
    b = r['brief'] || {}
    r['id'] = r['id'].to_s.empty? ? "#{Time.now.strftime('%Y-%m-%d_%H%M')}_#{slug(BRANDS.dig(b['marca'], :name) || 'marca', 16)}_#{slug(b['tema'], 32)}" : slug(r['id'], 96)
    r['createdAt'] ||= Time.now.iso8601
    r['status'] ||= 'pendiente'
    r['updatedAt'] = Time.now.iso8601
    File.write(File.join(REQUESTS, "#{r['id']}.json"), JSON.pretty_generate(r))
    File.write(File.join(REQUESTS, "#{r['id']}.md"), request_markdown(r))
    json(res, r)
  else
    list = Dir.glob(File.join(REQUESTS, '*.json')).map { |f| JSON.parse(File.read(f)) rescue nil }.compact
    json(res, list.sort_by { |r| r['createdAt'].to_s }.reverse)
  end
end

# Guardar PNG exportado en 03_ENTREGAS/<carpeta>/
server.mount_proc('/api/export') do |req, res|
  b = body_json(req)
  dir = File.join(DELIVER, slug(b['folder'], 64))
  FileUtils.mkdir_p(dir)
  path = File.join(dir, "#{slug(b['filename'], 64)}.png")
  write_data_url(b['dataUrl'], path)
  json(res, { ok: true, path: path.sub(ROOT + '/', ''), url: file_url(path) })
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

server.mount_proc('/api/deliveries') do |_req, res|
  out = Dir.glob(File.join(DELIVER, '*')).select { |d| File.directory?(d) }.map do |d|
    imgs = Dir.glob(File.join(d, '*')).sort.select { |f| IMAGE_EXT.include?(File.extname(f).downcase) }
    { folder: File.basename(d), updatedAt: File.mtime(d).iso8601, images: imgs.map { |f| file_url(f) } }
  end
  json(res, out.sort_by { |d| d[:updatedAt] }.reverse)
end

# Abrir una carpeta en Finder
server.mount_proc('/api/open') do |req, res|
  b = body_json(req)
  path = File.expand_path(File.join(ROOT, b['path'].to_s))
  if inside?(path, ROOT) && File.exist?(path)
    system('open', path)
    json(res, { ok: true })
  else
    json(res, { error: 'Esa carpeta no existe.' }, 404)
  end
end

server.mount_proc('/api/config') do |req, res|
  if req.request_method == 'POST'
    b = body_json(req)
    cfg = read_config
    cfg['apiKey'] = b['apiKey'].to_s.strip
    File.write(CONFIG, JSON.pretty_generate(cfg))
    File.chmod(0o600, CONFIG)
  end
  json(res, { hasKey: !api_key.empty?, fromEnv: !ENV['ANTHROPIC_API_KEY'].to_s.strip.empty? })
end

server.mount_proc('/api/draft') do |req, res|
  b = body_json(req)
  json(res, claude_draft(b['brief'] || {}))
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }
puts "Estudio de Carruseles listo → http://localhost:#{PORT}"
server.start
