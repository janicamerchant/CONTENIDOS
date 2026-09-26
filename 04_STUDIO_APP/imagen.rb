# Motores de imagen, todos por API key (nunca la sesión web de Higgsfield). Un solo punto de entrada: generar_imagen.
#
# - nano_banana_pro: Gemini 3 Pro Image de Google (GEMINI_API_KEY). Mantiene la cara de la foto real; 4:5 nativo.
# - gpt_image: GPT Image de OpenAI directo (OPENAI_API_KEY). Vertical 2:3; el Editor recorta a 4:5.
# - hf_flare: GPT Image 2.5 Flare por la API de Higgsfield (HF_CREDENTIALS). 3:4; el Editor recorta a 4:5.
# - hf_soul: Soul 2.0 por la API de Higgsfield, con el Soul ID de la persona si lo tiene (ver soul.rb).
#
# Cada marca elige su motor por defecto en marca.json ("motor_imagen", "tamano"); Crear y el Editor pueden cambiarlo
# por carrusel o por lámina. Los precios son aproximados (USD por imagen) y solo sirven para el panel de costos.
require 'open3'

MOTORES = {
  'nano_banana_pro' => {
    nombre: 'Nano Banana Pro', proveedor: 'Google', env: 'GEMINI_API_KEY',
    tamanos: { '1k' => 0.134, '2k' => 0.134, '4k' => 0.24 }
  },
  'gpt_image' => {
    nombre: 'GPT Image', proveedor: 'OpenAI', env: 'OPENAI_API_KEY',
    tamanos: { '2k' => 0.25 }      # 1024 × 1536, calidad alta
  },
  'hf_flare' => {
    nombre: 'GPT Image 2.5 Flare', proveedor: 'Higgsfield', env: 'HF_CREDENTIALS',
    tamanos: { '2k' => 2.75 * 0.0625 }   # 2,75 créditos medidos en la cuenta × USD 0,0625 por crédito
  },
  'hf_soul' => {
    nombre: 'Soul 2.0 (Soul ID)', proveedor: 'Higgsfield', env: 'HF_CREDENTIALS',
    tamanos: { '1k' => nil }             # 1080p; precio no medido todavía
  }
}.freeze
MOTOR_DEFECTO = 'nano_banana_pro'
TAMANO_DEFECTO = '2k'
GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview'
REF_MAX_PX = 1600          # las fotos de referencia se reducen antes de enviarlas (peticiones más livianas y rápidas)

def motor_key(id)
  return hf_key if MOTORES.dig(id, :proveedor) == 'Higgsfield'
  ENV[MOTORES.dig(id, :env).to_s].to_s.strip
end

# Higgsfield acepta HF_CREDENTIALS=id:secreto o el par HF_API_KEY / HF_API_SECRET
def hf_key
  c = ENV['HF_CREDENTIALS'].to_s.strip
  return c unless c.empty?
  id, secret = ENV['HF_API_KEY'].to_s.strip, ENV['HF_API_SECRET'].to_s.strip
  id.empty? || secret.empty? ? '' : "#{id}:#{secret}"
end

def motor_disponible?(id)
  MOTORES.key?(id) && !motor_key(id).empty?
end

# Motor y tamaño efectivos: el pedido (Crear / Editor) manda sobre la marca; si no hay nada, el de por defecto.
def elegir_motor(brand, pedido = nil)
  id = [pedido, brand && brand['motor_imagen'], MOTOR_DEFECTO].map(&:to_s).find { |m| MOTORES.key?(m) }
  raise "Falta #{MOTORES[id][:env]} en 04_STUDIO_APP/.env para usar #{MOTORES[id][:nombre]}." unless motor_disponible?(id)
  id
end

def elegir_tamano(motor, brand, pedido = nil)
  t = MOTORES[motor][:tamanos]
  [pedido, brand && brand['tamano'], TAMANO_DEFECTO].map(&:to_s).find { |x| t.key?(x) } || t.keys.first
end

# Catálogo para la interfaz (Ajustes, Crear, Editor, Marcas)
def motores_publicos
  MOTORES.map do |id, m|
    { id: id, nombre: m[:nombre], proveedor: m[:proveedor], env: m[:env], disponible: motor_disponible?(id), tamanos: m[:tamanos] }
  end
end

# Copia JPEG reducida en data/cache (se reutiliza mientras el original no cambie)
def imagen_liviana(path)
  key = "#{slug(path.sub(ROOT, ''), 80)}-#{File.mtime(path).to_i}-#{REF_MAX_PX}.jpg"
  out = File.join(CACHE, key)
  File.exist?(out) || to_jpeg(path, out, REF_MAX_PX) ? out : path
end

def mime_of(path)
  { '.png' => 'image/png', '.webp' => 'image/webp', '.gif' => 'image/gif' }[File.extname(path).downcase] || 'image/jpeg'
end

def http_post(url, headers, body, timeout = 300)
  uri = URI(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  http.read_timeout = timeout
  req = Net::HTTP::Post.new(uri)
  headers.each { |k, v| req[k] = v }
  body.is_a?(Array) ? req.set_form(body, 'multipart/form-data') : (req.body = JSON.generate(body))
  res = http.request(req)
  data = JSON.parse(res.body.to_s.force_encoding('UTF-8')) rescue { 'raw' => res.body.to_s[0, 300] }
  [res.code.to_i, data]
end

# Genera una imagen y la guarda en dest. images = rutas absolutas de referencia (en orden de importancia).
# Devuelve la ruta final (la extensión puede cambiar según lo que entregue el modelo).
# soul_id solo aplica a hf_soul. status: bloque opcional que recibe el estado de Higgsfield (en cola, generando…).
def generar_imagen(motor, prompt, images, dest, tamano, soul_id: nil, status: nil)
  refs = images.map { |p| imagen_liviana(p) }
  case motor
  when 'gpt_image' then openai_image(prompt, refs, dest)
  when 'hf_flare'
    body = { prompt: prompt, aspect_ratio: '3:4', quality: 'high', resolution: '2k' }
    body[:image_urls] = refs.map { |p| hf_upload(p) } unless refs.empty?
    higgsfield_image(HF_FLARE_MODEL, body, dest, status)
  when 'hf_soul' then higgsfield_image(SOUL_MODEL, soul_body(prompt, soul_id), dest, status)
  else gemini_image(prompt, refs, dest, tamano)
  end
end

# ---------- Google: Nano Banana Pro ----------

def gemini_image(prompt, refs, dest, tamano)
  parts = refs.map { |p| { inline_data: { mime_type: mime_of(p), data: Base64.strict_encode64(File.binread(p)) } } }
  parts << { text: prompt }
  body = { contents: [{ role: 'user', parts: parts }],
           generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5', imageSize: tamano.upcase } } }
  code, data = http_post("https://generativelanguage.googleapis.com/v1beta/models/#{GEMINI_IMAGE_MODEL}:generateContent",
                         { 'x-goog-api-key' => motor_key('nano_banana_pro'), 'Content-Type' => 'application/json' }, body)
  raise "Google respondió #{code}: #{data.dig('error', 'message') || data['raw']}" unless code == 200
  cand = (data['candidates'] || []).first || {}
  img = (cand.dig('content', 'parts') || []).map { |p| p['inlineData'] || p['inline_data'] }.compact.first
  unless img
    why = cand['finishReason'] || data.dig('promptFeedback', 'blockReason')
    text = (cand.dig('content', 'parts') || []).map { |p| p['text'] }.compact.join(' ')[0, 200]
    raise(why.to_s =~ /SAFETY|PROHIBITED|BLOCK/ ? "Google rechazó la imagen por sus filtros (#{why}). Cambia la escena." : "Google no devolvió imagen (#{why || 'sin motivo'}). #{text}".strip)
  end
  ext = img['mimeType'].to_s.include?('jpeg') ? '.jpg' : '.png'
  dest = dest.sub(/\.\w+\z/, ext)
  File.binwrite(dest, Base64.decode64(img['data']))
  dest
end

# ---------- OpenAI: GPT Image ----------

# El modelo más nuevo de la familia gpt-image que tenga la cuenta (o OPENAI_IMAGE_MODEL en .env).
def openai_image_model
  return ENV['OPENAI_IMAGE_MODEL'].strip unless ENV['OPENAI_IMAGE_MODEL'].to_s.strip.empty?
  @openai_image_model ||= begin
    uri = URI('https://api.openai.com/v1/models')
    req = Net::HTTP::Get.new(uri)
    req['Authorization'] = "Bearer #{motor_key('gpt_image')}"
    res = Net::HTTP.start(uri.host, uri.port, use_ssl: true, read_timeout: 30) { |h| h.request(req) }
    ids = (JSON.parse(res.body)['data'] || []).map { |m| m['id'] }.grep(/\Agpt-image-\d+(\.\d+)?\z/)
    ids.max_by { |i| i[/\d+(\.\d+)?/].to_f } || 'gpt-image-1'
  rescue StandardError
    'gpt-image-1'
  end
end

def openai_image(prompt, refs, dest, fidelity = true)
  headers = { 'Authorization' => "Bearer #{motor_key('gpt_image')}" }
  common = { 'model' => openai_image_model, 'prompt' => prompt, 'size' => '1024x1536', 'quality' => 'high', 'n' => '1' }
  if refs.empty?
    code, data = http_post('https://api.openai.com/v1/images/generations', headers.merge('Content-Type' => 'application/json'), common)
  else
    files = refs.map { |p| File.open(p, 'rb') }
    form = common.to_a
    form << %w[input_fidelity high] if fidelity         # conserva mejor la cara de las referencias
    files.each_with_index { |f, i| form << ['image[]', f, { filename: "ref#{i}#{File.extname(f.path)}", content_type: mime_of(f.path) }] }
    begin
      code, data = http_post('https://api.openai.com/v1/images/edits', headers, form)
    ensure
      files.each(&:close)
    end
    msg = data.dig('error', 'message').to_s
    return openai_image(prompt, refs, dest, false) if code == 400 && fidelity && msg =~ /input_fidelity/
  end
  unless code == 200
    msg = data.dig('error', 'message') || data['raw']
    raise(msg.to_s =~ /safety|moderation/i ? "OpenAI rechazó la imagen por sus filtros. Cambia la escena." : "OpenAI respondió #{code}: #{msg}")
  end
  b64 = data.dig('data', 0, 'b64_json') or raise 'OpenAI no devolvió imagen.'
  File.binwrite(dest, Base64.decode64(b64))
  dest
end

# ---------- Higgsfield (solo API: cloud.higgsfield.ai) ----------

HF_API = 'https://api.higgsfield.ai'
HF_FLARE_MODEL = 'marketing-studio/image/flare'   # GPT Image 2.5 Flare

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

# Sube una imagen local (ruta absoluta) y devuelve su URL pública temporal.
def hf_upload(path)
  ctype = mime_of(path)
  up = hf_http(:post, "#{HF_API}/files/generate-upload-url", { content_type: ctype })
  uri = URI(up['upload_url'])
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true
  put = Net::HTTP::Put.new(uri)
  (up['upload_headers'] || { 'Content-Type' => ctype }).each { |k, v| put[k] = v }
  put.body = File.binread(path)
  res = http.request(put)
  raise "No se pudo subir #{File.basename(path)} (#{res.code})" unless res.code.to_i.between?(200, 299)
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

# Envía el trabajo, espera hasta 10 minutos y descarga la imagen en dest.
def higgsfield_image(model, body, dest, status = nil)
  st = hf_http(:post, "#{HF_API}/#{model}", body)
  poll = st['status_url']
  deadline = Time.now + 600
  until %w[completed failed nsfw canceled].include?(st['status'])
    status&.call(st['status'])
    raise 'Tardó más de 10 minutos' if Time.now > deadline
    sleep 4
    st = hf_http(:get, poll)
  end
  raise(st['status'] == 'nsfw' ? 'Higgsfield rechazó el contenido (no se cobra)' : "Falló (#{st['status']}, no se cobra)") unless st['status'] == 'completed'
  src = st.dig('images', 0, 'url') or raise 'Respuesta sin imagen'
  download(src, dest)
  dest
end
