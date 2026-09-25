# Entrena el Soul ID (modelo de la cara) de una persona aprobada en Higgsfield.
# Cuesta 40 créditos de la API, una sola vez. Usa las primeras 12 fotos activas de persona.json.
#
#   ruby tools/entrenar_soul.rb janica
#
# Al terminar guarda "soul_id" en 06_MARCAS/_personas/<persona>/persona.json.
require 'json'
require 'net/http'
require 'uri'

APP = File.expand_path('..', __dir__)
KEY = File.read(File.join(APP, '.env'))[/HF_CREDENTIALS=(.+)/, 1].to_s.strip
abort 'Falta HF_CREDENTIALS en .env' if KEY.empty?
person = ARGV[0] or abort 'Uso: ruby tools/entrenar_soul.rb <persona>'
DIR = File.join(APP, '..', '06_MARCAS', '_personas', person)
FILE = File.join(DIR, 'persona.json')

def http(method, url, body = nil)
  uri = URI(url)
  h = Net::HTTP.new(uri.host, uri.port)
  h.use_ssl = true
  h.read_timeout = 90
  req = (method == :post ? Net::HTTP::Post : Net::HTTP::Get).new(uri)
  req['Authorization'] = "Key #{KEY}"
  req['Content-Type'] = 'application/json'
  req.body = JSON.generate(body) if body
  res = h.request(req)
  data = JSON.parse(res.body) rescue { 'detail' => res.body.to_s[0, 300] }
  raise "Higgsfield respondió #{res.code}: #{data['detail'] || data}" unless res.code.to_i.between?(200, 299)
  data
end

def upload(path)
  ctype = path =~ /\.png\z/i ? 'image/png' : 'image/jpeg'
  up = http(:post, 'https://api.higgsfield.ai/files/generate-upload-url', { content_type: ctype })
  uri = URI(up['upload_url'])
  h = Net::HTTP.new(uri.host, uri.port)
  h.use_ssl = true
  put = Net::HTTP::Put.new(uri)
  (up['upload_headers'] || { 'Content-Type' => ctype }).each { |k, v| put[k] = v }
  put.body = File.binread(path)
  res = h.request(put)
  raise "No se pudo subir #{File.basename(path)} (#{res.code})" unless res.code.to_i.between?(200, 299)
  up['public_url']
end

p = JSON.parse(File.read(FILE))
photos = (p['orden'] || []) - (p['inactivas'] || [])
photos = photos.select { |f| File.exist?(File.join(DIR, f)) }.first(12)
abort "Hacen falta al menos 5 fotos activas (hay #{photos.size})." if photos.size < 5

puts "Subiendo #{photos.size} fotos de #{p['name']}…"
urls = photos.map { |f| upload(File.join(DIR, f)) }
soul = http(:post, 'https://api.higgsfield.ai/v1/custom-references',
            { name: p['name'], input_images: urls.map { |u| { type: 'image_url', image_url: u } } })
puts "Entrenando (tarda unos minutos)…"
loop do
  break if %w[completed failed].include?(soul['status'])
  sleep 15
  soul = http(:get, "https://api.higgsfield.ai/v1/custom-references/#{soul['id']}")
end
abort 'El entrenamiento falló. Revisa que las fotos sean nítidas y de una sola persona.' if soul['status'] == 'failed'

p['soul_id'] = soul['id']
File.write(FILE, JSON.pretty_generate(p) + "\n")
puts "Soul listo: #{p['name']}. Guardado en persona.json."
