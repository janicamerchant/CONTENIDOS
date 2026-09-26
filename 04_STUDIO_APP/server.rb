#!/usr/bin/env ruby
# Estudio de Carruseles · Nika Media — servidor local (Ruby del sistema, sin dependencias).
# Uso: ruby server.rb   →   http://localhost:4321

# Nombres de archivo con tildes: sin esto, Ruby los lee como binario cuando la Terminal no define UTF-8.
Encoding.default_external = Encoding::UTF_8

require 'webrick'
require 'json'
require 'net/http'
require 'uri'
require 'base64'
require 'fileutils'
require 'time'
require 'erb'
require 'date'

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
MARCAS   = File.join(ROOT, '06_MARCAS')            # una carpeta por marca: ver LEEME.md
CACHE    = File.join(DATA, 'cache')

[UPLOADS, PROJECTS, REQUESTS, DELIVER, CACHE].each { |d| FileUtils.mkdir_p(d) }

# Credenciales locales en 04_STUDIO_APP/.env (KEY=valor). Las variables del sistema tienen prioridad.
ENV_FILE = File.join(APP, '.env')
if File.exist?(ENV_FILE)
  File.readlines(ENV_FILE, chomp: true).each do |line|
    next if line.strip.empty? || line.strip.start_with?('#')
    k, v = line.split('=', 2)
    next unless k && v
    ENV[k.strip] ||= v.strip.delete_prefix('"').delete_suffix('"')
  end
end

IMAGE_EXT = %w[.png .jpg .jpeg .webp .gif].freeze

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
  s = str.to_s.dup.force_encoding('UTF-8').scrub.unicode_normalize(:nfkd).gsub(/[^\x00-\x7F]/, '')
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

def hf_key
  c = ENV['HF_CREDENTIALS'].to_s.strip
  return c unless c.empty?
  id, secret = ENV['HF_API_KEY'].to_s.strip, ENV['HF_API_SECRET'].to_s.strip
  id.empty? || secret.empty? ? '' : "#{id}:#{secret}"
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
    Marca: #{brand_name(b['marca'])}
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

require_relative 'marcas'
require_relative 'lamina_completa'
require_relative 'soul'
require_relative 'foto_real'
require_relative 'nano_banana'

# ---------- Claude: borrador de carrusel ----------

SLIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: %w[name concept caption slides],
  properties: {
    name: { type: 'string' },
    concept: { type: 'string' },
    caption: { type: 'string' },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: %w[layout theme kicker title body number numberLabel items leftLabel leftItems rightLabel rightItems cta photo photoPrompt bw source],
        properties: {
          bw: { type: 'boolean' },
          source: { type: 'string' },
          layout: { type: 'string', enum: %w[portada escena cifra frase lista comparar cta] },
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
          photo: { type: 'string' },
          photoPrompt: { type: 'string' }
        }
      }
    }
  }
}.freeze

DRAFT_RULES = <<~TXT
  Eres el equipo creativo de Nika Media. Con el brief del usuario, propone la arquitectura y el copy final de un carrusel de Instagram 4:5, siguiendo exactamente el perfil de marca y el flujo de producción que tienes abajo.

  Ortografía: escribe en el idioma del brief con ortografía completa. En español, siempre con tildes, ñ y signos de apertura (año, más, está, ¿, ¡). Nunca omitas acentos.

  Cómo llenar cada lámina:
  - layout: portada (lámina 1, foto de la situación del titular con una cara humana), escena (foto a sangre completa con titular gigante encima), cifra (un número protagonista), frase (una afirmación fuerte sobre una foto), lista (checklist práctico), comparar (antes/después o dos columnas), cta (última lámina).
  - theme: dark o light. Alterna para dar ritmo; no todas iguales.
  - title: pocas palabras. Marca con *asteriscos* la palabra o frase que va en color de acento (máximo una por titular).
  - body: una o dos frases cortas, o vacío.
  - number y numberLabel solo en layout cifra. items solo en lista (3 a 5). leftLabel/leftItems/rightLabel/rightItems solo en comparar (3 ítems por lado). cta solo en la última.
  - photo: dirección de arte en el idioma del brief. Describe una ESCENA que cuente la idea de esa lámina sin leer el texto: quién hace qué, dónde, con qué objeto o momento que lo prueba. Tienes libertad creativa para elegir protagonista: una de las personas aprobadas de la marca (lista abajo) haciendo algo relacionado (solo si su acción explica la idea), la figura pública de la noticia (foto real) u otra persona hiperrealista viviendo la situación. Objetos y lugares también pueden ser protagonistas. Nunca un retrato decorativo sin relación con el titular.
  - photoPrompt: el prompt en inglés para generar esa foto: sujeto, acción, lugar, emoción, encuadre, luz, y al final "hyperrealistic editorial photograph, natural skin texture, no text, no logos". Si la persona es una de las personas aprobadas, escribe su nombre completo y "use the approved <nombre> reference for the face". Compón la foto para que la persona u objeto quede de un lado y deje aire para el titular: el sujeto solo debe cruzar el borde del área del texto (así las letras pasan parcialmente por detrás de él sin perder la lectura). Fondo con textura o ambiente real, nunca un fondo plano de estudio.
  - Al menos 5 de cada 7 láminas llevan foto (photo y photoPrompt llenos). Como máximo una o dos pueden ser solo tipográficas, nunca dos seguidas. Varía encuadres: plano general, detalle de manos u objetos, primer plano, cenital.
  - bw: false por defecto (foto a color real). true solo en 1 o 2 láminas del carrusel, nunca dos seguidas, cuando el blanco y negro refuerce la idea (pérdida, tensión, "antes"). Las personas aprobadas y la lámina de CTA siempre a color. Los photoPrompt piden color natural salvo en esas láminas.
  - Deja vacíos ("" o []) los campos que no apliquen al layout.
  - caption: el texto del post para Instagram, con el CTA.
  - concept: la dirección creativa en 3 a 5 frases cortas: la idea central y el ángulo, el estilo visual (fotografía, paleta, tipografía), el tono y por qué la secuencia convence a la audiencia.

  Datos y fuentes:
  - Nunca inventes estadísticas, precios, fechas ni resultados. Usa solo (a) las cifras de la "Investigación verificada" que viene en el mensaje, (b) los proof points aprobados del perfil de marca, o (c) los "Datos verificados de la marca" que vienen en el mensaje, siempre con su fuente.
  - source: toda lámina con una cifra externa lleva su fuente corta y visible, por ejemplo "CBO, junio 2024" o "KFF, 2026". Los proof points de EVA llevan "Caso real anonimizado de un cliente de EVA". Si la lámina no tiene cifras, deja "".
  - Redacta la cifra con el mismo alcance que la fuente (promedio, proyección, año, país) y en el tiempo verbal correcto según la fecha de hoy: si algo ya ocurrió, no lo escribas como posibilidad.
  - Nunca escribas marcadores como [VERIFICAR], [FUENTE], "XX" ni cifras pendientes. Si una cifra no está en la investigación verificada, no la uses: reescribe la lámina sin ese número.
TXT

def anthropic_post(payload)
  uri = URI('https://api.anthropic.com/v1/messages')
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  http.read_timeout = 300
  req = Net::HTTP::Post.new(uri)
  req['x-api-key'] = api_key
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
  raise 'Claude rechazó la solicitud. Reformula el tema.' if data['stop_reason'] == 'refusal'
  data
end

RESEARCH_RULES = <<~TXT
  Eres el investigador de datos de Nika Media. Antes de escribir un carrusel, busca en la web las cifras que lo sostienen.
  - Busca de 2 a 5 estadísticas relevantes para el tema y la audiencia. Prioriza fuentes primarias u oficiales (agencias de gobierno, CBO, CMS, KFF, estudios publicados, informes de la industria). Evita blogs sin fuente.
  - Comprueba que cada cifra siga vigente en la fecha de hoy. Si el evento ya ocurrió (una ley venció, un plazo pasó), dilo.
  - Responde en español, solo con una lista. Por cada dato: la cifra exacta, qué mide y su alcance (promedio, proyección, año, país), la organización y la fecha de publicación, y la URL.
  - Si no encuentras una cifra confiable para una idea, escribe "Sin dato verificado" para esa idea. No inventes ni redondees.
TXT

# Paso 1: investigación con búsqueda web. Devuelve [notas, usage]. Maneja pause_turn del bucle de herramientas.
def claude_research(brief, brand_name)
  messages = [{ role: 'user', content: "Fecha de hoy: #{Date.today.iso8601}\nMarca: #{brand_name}\nTema: #{brief['tema']}\nAudiencia: #{brief['audiencia']}\nNotas: #{brief['notas']}" }]
  usages = []
  data = nil
  3.times do
    data = anthropic_post(model: 'claude-opus-5', max_tokens: 8000, fallbacks: 'default',
                          output_config: { effort: 'medium' },
                          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 6 }],
                          system: RESEARCH_RULES, messages: messages)
    usages << data['usage']
    break unless data['stop_reason'] == 'pause_turn'
    messages = [messages.first, { role: 'assistant', content: data['content'] }]
  end
  notes = (data['content'] || []).select { |b| b['type'] == 'text' }.map { |b| b['text'] }.join.strip
  [notes, usages]
end

MARKERS = /\s*\[\s*(VERIFICAR|VERIFY|FUENTE|SOURCE|TBD)\s*\]/i

# Quita marcadores que nunca deben llegar a una lámina publicada.
def strip_markers!(obj)
  case obj
  when String then obj.gsub!(MARKERS, '')
  when Array then obj.each { |v| strip_markers!(v) }
  when Hash then obj.each_value { |v| strip_markers!(v) }
  end
  obj
end

# Personas con cara de referencia que Claude puede poner en las fotos de esta marca
def people_rules(brand)
  people = brand_people(brand)
  return 'Esta marca no tiene personas aprobadas con foto de referencia: usa personas hiperrealistas genéricas, la figura pública real de la noticia, objetos o lugares.' if people.empty?
  list = people.map { |p| "- #{p['name']}#{p['descripcion'].to_s.empty? ? '' : ": #{p['descripcion']}"}" }.join("\n")
  "Personas aprobadas de #{brand['name']} (tienen foto de referencia de cara; si aparecen, escribe su nombre completo en photo y photoPrompt):\n#{list}"
end

def brand_facts(brand)
  facts = (brand['datos'] || []).map { |d| "- #{d['dato']} (Fuente: #{d['fuente']}#{d['url'].to_s.empty? ? '' : ", #{d['url']}"})" }
  facts.empty? ? '' : "Datos verificados de la marca (puedes usarlos citando la fuente tal cual):\n#{facts.join("\n")}"
end

def claude_draft(brief)
  key = api_key
  raise 'Falta la API key de Anthropic. Agrégala en Ajustes.' if key.empty?

  brand = (load_brand(brief['marca']) rescue nil) || all_brands.first or raise 'No hay marcas en 06_MARCAS.'
  notes, usages = claude_research(brief, brand['name'])
  kb = brand_knowledge(brand['id'])
  docs = kb[:texts].map { |d| "<documento ruta=\"#{d[:rel]}\">\n#{d[:text]}\n</documento>" }.join("\n\n")
  rules = brand_rules(brand['id'])
  system_text = [DRAFT_RULES, people_rules(brand),
                 rules.empty? ? nil : "Reglas propias de #{brand['name']} (mandan sobre las generales cuando chocan):\n#{rules}",
                 docs].compact.join("\n\n")

  user = <<~TXT
    Marca: #{brand['name']}
    Formato: carrusel de #{brief['laminas'] || 7} láminas
    Tema/oferta: #{brief['tema']}
    Objetivo: #{brief['objetivo']}
    Audiencia: #{brief['audiencia']}
    Idioma: #{brief['idioma']}
    CTA: #{brief['cta']}
    Referencias nuevas: #{brief['referencias']}
    Notas: #{brief['notas']}
    Fecha de hoy: #{Date.today.iso8601}

    #{brand_facts(brand)}

    Investigación verificada (única fuente permitida para cifras externas, además de los datos de la marca):
    #{notes.empty? ? 'Sin datos externos verificados: usa solo los proof points del perfil, los datos de la marca o escribe sin cifras.' : notes}
  TXT

  # PDF y referencias visuales de la marca van antes del brief; con caché, la segunda propuesta de la misma marca sale más barata.
  kb_blocks = kb[:pdfs].map do |d|
    { type: 'document', title: File.basename(d[:rel]), source: { type: 'base64', media_type: 'application/pdf', data: Base64.strict_encode64(File.binread(d[:path])) } }
  end
  unless kb[:images].empty?
    kb_blocks << { type: 'text', text: "Referencias visuales aprobadas de #{brand['name']}. Úsalas para el estilo, la composición, la paleta y el tono; no copies sus textos ni sus caras." }
    kb[:images].each do |im|
      kb_blocks << { type: 'text', text: File.basename(im[:rel]) + (im[:tags].empty? ? '' : " · #{im[:tags].join(', ')}") }
      kb_blocks << claude_image(im[:path])
    end
  end
  kb_blocks.last[:cache_control] = { type: 'ephemeral' } unless kb_blocks.empty?

  # Paso 2: propuesta con formato fijo (el formato estructurado no admite búsqueda web en la misma llamada)
  spanish = brief['idioma'].to_s !~ /english|ingl/i
  out = data = nil
  2.times do |attempt|
    extra = attempt.zero? ? '' : "\n\nIMPORTANTE: la versión anterior salió sin tildes. Escribe todo con ortografía española completa: tildes, ñ, ¿ y ¡."
    data = anthropic_post(model: 'claude-opus-5', max_tokens: 16_000, fallbacks: 'default',
                          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SLIDE_SCHEMA } },
                          system: [{ type: 'text', text: system_text, cache_control: { type: 'ephemeral' } }],
                          messages: [{ role: 'user', content: kb_blocks + [{ type: 'text', text: user + extra }] }])
    raise 'La respuesta se cortó antes de terminar. Intenta con menos láminas.' if data['stop_reason'] == 'max_tokens'
    usages << data['usage']
    text = (data['content'] || []).select { |b| b['type'] == 'text' }.map { |b| b['text'] }.join
    out = JSON.parse(text)
    # Control de ortografía: un texto largo en español sin ninguna tilde ni ñ casi siempre es un error
    copy = [out['caption'], *(out['slides'] || []).flat_map { |s| [s['title'], s['body'], s['kicker'], s['numberLabel']] }].join(' ')
    break unless spanish && copy.length > 200 && copy !~ /[áéíóúñÁÉÍÓÚÑ¿¡]/
  end
  out = strip_markers!(out)
  enforce_color_rule!(out['slides'] || [], brand)
  out['research'] = notes
  out['usage'] = claude_usage(usages, data['model'])
  out
end

# Regla de color (guía visual de EVA): fotos a color real; blanco y negro en máximo 2 láminas,
# nunca seguidas, nunca con una persona aprobada ni en la última (CTA). Se aplica aunque Claude marque más.
BW_WORDS = /black[- ]and[- ]white|monochrome|grayscale|greyscale|b&w/i

def enforce_color_rule!(slides, brand)
  kept = 0
  prev = false
  slides.each_with_index do |s, i|
    person = !people_in(brand, "#{s['photo']} #{s['photoPrompt']}").empty?
    ok = s['bw'] == true && kept < 2 && !prev && s['layout'] != 'cta' && !person && i != slides.size - 1
    s['bw'] = ok
    kept += 1 if ok
    prev = ok
    s['photoPrompt'] = s['photoPrompt'].to_s.gsub(BW_WORDS, 'natural color') unless ok
  end
end

# Precio de Claude Opus 5 por millón de tokens (USD): entrada, salida, lectura y escritura de caché.
CLAUDE_PRICE = { input: 5.0, output: 25.0, cache_read: 0.5, cache_write: 6.25 }.freeze

# Búsqueda web: USD 10 por cada 1,000 búsquedas (más los tokens de los resultados, ya incluidos arriba).
WEB_SEARCH_USD = 0.01

# Suma el uso de una o varias llamadas (investigación + propuesta).
def claude_usage(list, model)
  list = [list] unless list.is_a?(Array)
  inp = outp = searches = 0
  usd = 0.0
  list.compact.each do |u|
    i, o = u['input_tokens'].to_i, u['output_tokens'].to_i
    cr, cw = u['cache_read_input_tokens'].to_i, u['cache_creation_input_tokens'].to_i
    ws = u.dig('server_tool_use', 'web_search_requests').to_i
    inp += i + cr + cw
    outp += o
    searches += ws
    usd += (i * CLAUDE_PRICE[:input] + o * CLAUDE_PRICE[:output] +
            cr * CLAUDE_PRICE[:cache_read] + cw * CLAUDE_PRICE[:cache_write]) / 1_000_000.0 + ws * WEB_SEARCH_USD
  end
  { model: model, input_tokens: inp, output_tokens: outp, web_searches: searches, calls: list.compact.size, usd: usd.round(4) }
end

# ---------- Higgsfield: fotos con la API (cloud.higgsfield.ai) ----------

HF_API    = 'https://api.higgsfield.ai'
HF_MODEL  = 'marketing-studio/image/flare'   # GPT Image 2.5 Flare
HF_ASPECT = '3:4'                            # el modelo no acepta 4:5; el editor recorta a 4:5
# Créditos por imagen medidos en la cuenta (calidad alta, 2K). El cobro real es por tokens.
HF_CREDITS = { 'high' => 2.75 }.freeze
HF_CREDIT_USD = 0.0625
def hf_http(method, url, body = nil)
  uri = URI(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  http.read_timeout = 60
  req = (method == :post ? Net::HTTP::Post : Net::HTTP::Get).new(uri)
  req['Authorization'] = "Key #{hf_key}"
  req['Content-Type'] = 'application/json'
  req.body = JSON.generate(body) if body
  res = http.request(req)
  data = JSON.parse(res.body.to_s.force_encoding('UTF-8')) rescue { 'detail' => res.body.to_s[0, 300] }
  raise "Higgsfield respondió #{res.code}: #{data['detail'] || data}" unless res.code.to_i.between?(200, 299)
  data
end

# Sube una imagen local (ruta relativa a CONTENIDOS) y devuelve su URL pública temporal.
def hf_upload(rel)
  path = File.join(ROOT, rel)
  ctype = File.extname(path).downcase == '.png' ? 'image/png' : 'image/jpeg'
  up = hf_http(:post, "#{HF_API}/files/generate-upload-url", { content_type: ctype })
  uri = URI(up['upload_url'])
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  put = Net::HTTP::Put.new(uri)
  (up['upload_headers'] || { 'Content-Type' => ctype }).each { |k, v| put[k] = v }
  put.body = File.binread(path)
  res = http.request(put)
  raise "No se pudo subir #{File.basename(rel)} (#{res.code})" unless res.code.to_i.between?(200, 299)
  up['public_url']
end

def download(url, path)
  uri = URI(url)
  Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https') do |http|
    res = http.request(Net::HTTP::Get.new(uri))
    raise "Descarga falló (#{res.code})" unless res.code.to_i == 200
    File.binwrite(path, res.body)
  end
end

GEN_JOBS = {}
GEN_LOCK = Mutex.new

def gen_update(job_id, index = nil, **fields)
  GEN_LOCK.synchronize do
    job = GEN_JOBS[job_id]
    index.nil? ? job.merge!(fields) : job[:items].find { |it| it[:index] == index }.merge!(fields)
  end
end

# Recorte de la persona u objeto principal con Vision de macOS (tools/recorte.js). Gratis y local.
CUTOUT_SCRIPT = File.join(APP, 'tools', 'recorte.js')

# people_only: el recorte automático solo se hace si hay una cara clara (no recorta papeles, manos ni objetos).
def make_cutout(src, people_only = false)
  dest = src.sub(/\.\w+\z/, '-recorte.png')
  args = ['/usr/bin/osascript', '-l', 'JavaScript', CUTOUT_SCRIPT, src, dest]
  args << 'personas' if people_only
  ok = system(*args, out: File::NULL, err: File::NULL)
  ok && File.exist?(dest) ? dest : nil
end

def project_brand(project_id)
  JSON.parse(File.read(File.join(PROJECTS, "#{slug(project_id, 64)}.json")))['brand']
rescue StandardError
  nil
end

# Pone la foto descargada (y su recorte, si hay) en la lámina del proyecto guardado.
def attach_image(project_id, index, url, cutout = '', extra = {})
  GEN_LOCK.synchronize do
    path = File.join(PROJECTS, "#{slug(project_id, 64)}.json")
    p = JSON.parse(File.read(path))
    s = (p['slides'] || [])[index] or return
    # La foto anterior se guarda para poder volver a ella si la nueva no gusta.
    if s['image'].to_s != '' && s['image'] != url
      s['prevImage'] = s['image']
      s['prevCutout'] = s['cutout'].to_s
    end
    s.merge!(extra)
    # Lámina completa: la imagen ya trae el texto; se centra para recortar parejo arriba y abajo.
    s.merge!('image' => url, 'cutout' => cutout.to_s, 'ix' => 50, 'iy' => s['full'] ? 50 : 30, 'iz' => 1)
    p['updatedAt'] = Time.now.iso8601
    File.write(path, JSON.pretty_generate(p))
  end
end

def run_generation(job_id, project_id, items, quality)
  refs = {}
  refs_lock = Mutex.new
  brand = (load_brand(project_brand(project_id)) rescue nil)
  threads = items.map do |it|
    Thread.new do
      begin
        body = { prompt: it['prompt'], aspect_ratio: HF_ASPECT, quality: quality, resolution: '2k' }
        # Personas aprobadas: bloqueo de identidad + sus fotos de cara (en orden de prioridad) como referencia
        ids = Array(it['people']).map(&:to_s)
        ids |= ['janica'] if it['janica']              # proyectos guardados antes de 06_MARCAS
        persons = ids.map { |pid| load_person(pid) rescue nil }.compact
        # Persona con Soul ID entrenado: foto de cámara real con Soul 2.0; el texto lo pone el Editor
        # Foto real de la persona + escena con Grok: la cara no se genera (ver foto_real.rb)
        # Nano Banana Pro 4K (plan web de Higgsfield): manda sobre los demás motores (ver nano_banana.rb)
        nbp = nbp_mode?(brand)
        real = !nbp && edit_mode?(brand, persons)
        soul = !nbp && !real && soul_mode?(brand, persons)
        full = !nbp && !real && !soul && full_mode?(brand) && it['slide'].is_a?(Hash)
        model = HF_MODEL
        upload = ->(rel) { refs_lock.synchronize { refs[rel] ||= hf_upload(rel) } }
        if nbp
          # la herramienta de Higgsfield sube las fotos ella misma (más abajo)
        elsif real
          model = EDIT_MODEL
          body = edit_body(it, persons.first, brand, upload)
        elsif soul
          model = SOUL_MODEL
          body = soul_body(it, soul_person(persons), brand)
        elsif full
          # Lámina completa: caras aprobadas + referencias de diagramación del mismo diseño
          slide = it['slide']
          faces = persons.flat_map { |p| person_refs(p, [FULL_FACE_REFS / persons.size, 1].max) }.first(FULL_FACE_REFS)
          lays = layout_refs(brand, slide['layout'])
          base_prompt = full_prompt(slide, brand, faces.size, lays.size, it['count'], persons)
          body[:prompt] = base_prompt
          body[:image_urls] = (faces + lays).map(&upload)
          body.delete(:image_urls) if body[:image_urls].empty?
        elsif !persons.empty?
          per = [MAX_FACE_REFS / persons.size, 1].max
          body[:prompt] = "#{persons.map { |p| person_lock(p) }.join(' ')} #{body[:prompt]}"
          body[:image_urls] = persons.flat_map { |p| person_refs(p, per) }.first(MAX_FACE_REFS).map(&upload)
        end
        attempt = 0
        note = ''
        dest = nil
        loop do
          if nbp
            gen_update(job_id, it['index'], status: 'generando (Nano Banana Pro 4K)')
            prompt, images = nbp_request(it, persons, brand)
            name = "#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{slug(project_id, 24)}-#{format('%02d', it['index'] + 1)}.png"
            dest = nbp_generate(prompt, images, File.join(UPLOADS, name))
            break
          end
          sub = hf_http(:post, "#{HF_API}/#{model}", body)
          gen_update(job_id, it['index'], status: sub['status'], request_id: sub['request_id'])
          deadline = Time.now + 600
          st = sub
          until %w[completed failed nsfw canceled].include?(st['status'])
            raise 'Tardó más de 10 minutos' if Time.now > deadline
            sleep 4
            st = hf_http(:get, sub['status_url'])
            gen_update(job_id, it['index'], status: st['status'])
          end
          raise(st['status'] == 'nsfw' ? 'Higgsfield rechazó el contenido (no se cobra)' : "Falló (#{st['status']}, no se cobra)") unless st['status'] == 'completed'
          src = st.dig('images', 0, 'url') or raise 'Respuesta sin imagen'
          name = "#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{slug(project_id, 24)}-#{format('%02d', it['index'] + 1)}.png"
          dest = File.join(UPLOADS, name)
          download(src, dest)
          break unless full
          # Revisión de Claude: ortografía exacta, rostro y legibilidad. Si falla, se corrige sola.
          gen_update(job_id, it['index'], status: 'revisando')
          ok, note = qa_slide(dest, slide, brand, it['count'], faces)
          break if ok || attempt >= QA_RETRIES
          attempt += 1
          gen_update(job_id, it['index'], status: "corrigiendo (intento #{attempt + 1})", qa: note)
          body[:prompt] = "#{base_prompt}\nTHE PREVIOUS ATTEMPT WAS REJECTED FOR THESE PROBLEMS, FIX ALL OF THEM: #{note}"
        end
        cut = !full && brand && brand['cutout'] ? make_cutout(dest, true) : nil
        cut_url = cut ? file_url(cut) : ''
        extra = it.slice('photo', 'photoPrompt').compact.merge('full' => full, 'soul' => soul, 'qa' => full ? note : '')
        attach_image(project_id, it['index'], file_url(dest), cut_url, extra)
        gen_update(job_id, it['index'], status: 'completed', url: file_url(dest), cutout: cut_url, full: full, soul: soul, qa: full ? note : '')
      rescue StandardError => e
        gen_update(job_id, it['index'], status: 'failed', error: e.message)
      end
    end
  end
  threads.each(&:join)
  gen_update(job_id, done: true)
end

# ---------- servidor ----------

server = WEBrick::HTTPServer.new(
  BindAddress: '127.0.0.1',
  Port: PORT,
  AccessLog: [],
  Logger: WEBrick::Log.new($stderr, WEBrick::Log::WARN)
)

# La app se sirve con no-cache: el navegador siempre revisa si hay una versión nueva de app.js y los estilos.
class FreshFileHandler < WEBrick::HTTPServlet::FileHandler
  def do_GET(req, res)
    super
    res['Cache-Control'] = 'no-cache'
  end
end

server.mount('/', FreshFileHandler, PUBLIC)
server.mount('/files', WEBrick::HTTPServlet::FileHandler, ROOT)

# Biblioteca de imágenes: assets de marca, originales y subidas
server.mount_proc('/api/assets') do |_req, res|
  groups = [
    ['Marcas', MARCAS],
    ['Marca y referencias', File.join(ROOT, '01_SKILL_OPERATIVO/assets')],
    ['Archivos originales', File.join(ROOT, '02_ARCHIVOS_ORIGINALES')],
    ['Subidas', UPLOADS]
  ]
  out = groups.flat_map do |label, dir|
    Dir.glob(File.join(dir, '**', '*')).sort.select { |f| IMAGE_EXT.include?(File.extname(f).downcase) && f !~ %r{/(papelera|_papelera)/} }.map do |f|
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
    r['id'] = r['id'].to_s.empty? ? "#{Time.now.strftime('%Y-%m-%d_%H%M')}_#{slug(brand_name(b['marca']), 16)}_#{slug(b['tema'], 32)}" : slug(r['id'], 96)
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
  json(res, { hasKey: !api_key.empty?, fromEnv: !ENV['ANTHROPIC_API_KEY'].to_s.strip.empty?,
              hasHF: !hf_key.empty?, hfModel: 'GPT Image 2.5 Flare', hfCredits: HF_CREDITS, hfCreditUsd: HF_CREDIT_USD })
end

# Propuesta de guion y dirección creativa a partir de una idea libre
server.mount_proc('/api/propose') do |req, res|
  b = body_json(req)
  brief = {
    'marca' => b['marca'], 'laminas' => b['laminas'], 'tema' => b['idea'], 'cta' => b['cta'],
    'objetivo' => b['objetivo'], 'audiencia' => b['audiencia'], 'idioma' => b['idioma'],
    'notas' => b['notas'], 'referencias' => ''
  }
  json(res, claude_draft(brief))
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

# Recorte automático de una imagen que ya está en CONTENIDOS (url /files/...)
server.mount_proc('/api/cutout') do |req, res|
  b = body_json(req)
  rel = b['url'].to_s.sub(%r{\A/files/}, '').split('/').map { |p| URI.decode_www_form_component(p) }.join('/')
  src = File.expand_path(File.join(ROOT, rel))
  raise 'Esa imagen no existe.' unless inside?(src, ROOT) && File.exist?(src)
  # El recorte se guarda en data/uploads para no escribir dentro de las carpetas de marca.
  copy = File.join(UPLOADS, "#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{slug(File.basename(src, '.*'), 40)}#{File.extname(src)}")
  FileUtils.cp(src, copy) unless inside?(src, UPLOADS)
  cut = make_cutout(inside?(src, UPLOADS) ? src : copy)
  FileUtils.rm_f(copy) unless inside?(src, UPLOADS)
  raise 'No se encontró una persona u objeto claro para recortar.' unless cut
  json(res, { cutout: file_url(cut) })
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

# Generar fotos aprobadas: POST inicia el trabajo, GET ?id= devuelve el avance
server.mount_proc('/api/generate') do |req, res|
  if req.request_method == 'POST'
    raise 'Falta HF_CREDENTIALS en 04_STUDIO_APP/.env' if hf_key.empty?
    b = body_json(req)
    items = (b['items'] || []).select { |it| it['prompt'].to_s.strip != '' }
    raise 'No hay fotos para generar.' if items.empty?
    raise 'Guarda el proyecto antes de generar.' unless File.exist?(File.join(PROJECTS, "#{slug(b['projectId'], 64)}.json"))
    quality = HF_CREDITS.key?(b['quality']) ? b['quality'] : 'high'
    id = "g#{Time.now.to_i}#{rand(1000)}"
    GEN_LOCK.synchronize do
      GEN_JOBS[id] = { id: id, projectId: b['projectId'], done: false,
                       items: items.map { |it| { index: it['index'], status: 'enviando' } } }
    end
    Thread.new { run_generation(id, b['projectId'], items, quality) }
    json(res, { id: id })
  else
    job = GEN_LOCK.synchronize { GEN_JOBS[req.query['id']] && Marshal.load(Marshal.dump(GEN_JOBS[req.query['id']])) }
    job ? json(res, job) : json(res, { error: 'No existe ese trabajo.' }, 404)
  end
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

server.mount_proc('/api/draft') do |req, res|
  b = body_json(req)
  json(res, claude_draft(b['brief'] || {}))
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

# ---------- marcas y base de conocimiento (ver marcas.rb) ----------

# GET /api/brands                    marcas para dibujar y crear + archivadas
# GET /api/brands/<id>               ficha completa: recursos, datos, reglas, papelera, medidor (<id> puede ser _comun)
# POST /api/brands                   crear marca
# POST /api/brands/_draft            Claude arma el perfil de una marca nueva
# POST /api/brands/_restore          recuperar una marca o persona archivada
# POST /api/brands/<id>              guardar identidad, datos, personas y reglas
# POST /api/brands/<id>/<acción>     add | update | delete | restore | purge | archive
server.mount_proc('/api/brands') do |req, res|
  id, action = req.path.sub(%r{\A/api/brands/?}, '').split('/').map { |x| URI.decode_www_form_component(x) }
  if req.request_method == 'GET'
    json(res, id ? brand_detail(id) : { brands: all_brands.map { |b| brand_public(b) }, archived: archived_list })
  else
    b = body_json(req)
    case [id, action]
    when [nil, nil] then json(res, { id: create_brand(b) })
    when ['_draft', nil] then json(res, claude_brand_draft(b))
    when ['_restore', nil] then json(res, { id: restore_archived(b['name']) })
    else
      case action
      when nil then update_brand(id, b)
      when 'add' then b['added'] = add_resource(id, b)
      when 'update' then update_resource(id, b)
      when 'delete' then delete_resource(id, b['path'])
      when 'restore' then restore_resource(id, b['name'])
      when 'purge' then purge_resource(id, b['name'])
      when 'archive' then archive_brand(id)
      else raise 'Acción desconocida.'
      end
      json(res, action == 'archive' ? { ok: true } : brand_detail(id).merge('added' => b['added']))
    end
  end
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

# GET /api/people                    personas aprobadas con fotos y marcas que las usan
# POST /api/people                   crear o guardar persona
# POST /api/people/<id>/photo        op: add | update (active, move) | delete
# POST /api/people/<id>/archive
server.mount_proc('/api/people') do |req, res|
  id, action = req.path.sub(%r{\A/api/people/?}, '').split('/')
  if req.request_method == 'GET'
    json(res, people_detail)
  else
    b = body_json(req)
    case action
    when nil then json(res, { id: save_person(b) })
    when 'photo' then person_photo(id, b); json(res, { ok: true })
    when 'archive' then archive_person(id); json(res, { ok: true })
    else raise 'Acción desconocida.'
    end
  end
rescue StandardError => e
  json(res, { error: e.message }, 400)
end

trap('INT') { server.shutdown }
trap('TERM') { server.shutdown }
puts "Estudio de Carruseles listo → http://localhost:#{PORT}"
server.start
