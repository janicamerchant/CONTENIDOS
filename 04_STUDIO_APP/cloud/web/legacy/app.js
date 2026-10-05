/* Estudio de Carruseles · Nika Media — lógica del cliente */
'use strict';

// ---------------------------------------------------------------- utilidades
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t) => esc(t).replace(/==([^=]+)==/g, '<mark class="hl">$1</mark>').replace(/__([^_]+)__/g, '<span class="ul">$1</span>')
  .replace(/\*([^*]+)\*/g, '<em class="acc">$1</em>').replace(/\n/g, '<br>');
const fileUrl = (rel) => '/files/' + rel.split('/').map(encodeURIComponent).join('/');
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = (n) => String(n).padStart(2, '0');
const slugify = (s) => String(s || '').normalize('NFKD').replace(/[^\x00-\x7F]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'carrusel';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

async function api(path, body) {
  const opt = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(path, opt);
  const data = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor.' }));
  if (!res.ok || data.error) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', err);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), err ? 6000 : 2800);
}

// ---------------------------------------------------------------- marcas
// Vienen de 06_MARCAS/ (GET /api/brands). design = familia de estilos en slides.css:
// eva, janica y citykia tienen diseño propio; las marcas nuevas usan "base" con sus colores y tipografías.
let BRANDS = {};
const LOGOS = {};
const FALLBACK_BRAND = { id: 'sin-marca', name: 'Sin marca', file: 'CARRUSEL', swatch: '#888', design: 'base', theme: 'dark', defaults: { audiencia: '', cta: '', idioma: 'Español', objetivo: 'Autoridad' }, look: '', people: [], logos: {} };
const brandIds = () => Object.keys(BRANDS);
const brandOf = (id) => BRANDS[id] || BRANDS[brandIds()[0]] || FALLBACK_BRAND;
const brandFor = (p) => p.brandData || brandOf(p.brand);
const designOf = (p) => brandFor(p).design || 'base';
// Marcas en modo "lámina completa": el motor genera foto + tipografía juntas (ver lamina_completa.rb)
const fullMode = (id) => brandOf(id).modo === 'completa';
// Tipo de lámina del carrusel (propuesta o proyecto): se elige en Crear; si no trae, manda el de la marca
const isFull = (x) => (x?.modo ? ['completa', 'editable'].includes(x.modo) : fullMode(x?.brand));

// ---------------------------------------------------------------- motores de imagen (imagen.rb)
// Todos por API key. Cada marca tiene su motor por defecto; Crear y el Editor pueden cambiarlo.
const motores = () => state.cfg?.motores || [];
const motorInfo = (id) => motores().find((m) => m.id === id);
// El de la marca; si su API key no está en .env, el primero conectado (Soul solo si no hay otro)
const brandMotor = (brandId) => {
  const b = brandOf(brandId);
  let id = motorInfo(b.motor_imagen) ? b.motor_imagen : state.cfg?.motorDefecto || 'nano_banana_pro';
  if (!motorInfo(id)?.disponible) {
    const ok = motores().filter((m) => m.disponible);
    id = (ok.find((m) => m.id !== 'hf_soul') || ok[0] || { id }).id;
  }
  return { motor: id, tamano: sizeFor(id, b.tamano) };
};
const sizeFor = (motor, want) => {
  const t = Object.keys(motorInfo(motor)?.tamanos || {});
  return t.includes(want) ? want : t.includes(state.cfg?.tamanoDefecto) ? state.cfg.tamanoDefecto : t[0] || '2k';
};
const motorUsd = (motor, tamano) => motorInfo(motor)?.tamanos?.[tamano] ?? null;
const motorLabel = (motor, tamano) => {
  const m = motorInfo(motor);
  if (!m) return motor || '';
  return `${m.nombre}${Object.keys(m.tamanos).length > 1 ? ' ' + String(tamano).toUpperCase() : ''} · ${m.proveedor}`;
};
const usdLabel = (n) => (n == null ? 'precio sin medir' : `~$${n.toFixed(2)}`);
// Selector de motor + tamaño. key distingue dónde vive (crear / editor).
function motorPicker(key, sel, disabled = false) {
  const m = motorInfo(sel.motor);
  const sizes = Object.keys(m?.tamanos || {});
  return `<div class="motor-pick">
    <label class="lbl" for="${key}-motor">Motor de imagen</label>
    <select id="${key}-motor" class="inp sm" data-motor="${key}" ${disabled ? 'disabled' : ''}>${motores().map((x) => `<option value="${esc(x.id)}" ${x.id === sel.motor ? 'selected' : ''} ${x.disponible ? '' : 'disabled'}>${esc(x.nombre)} · ${esc(x.proveedor)}${x.disponible ? '' : ` (falta ${esc(x.env)})`}</option>`).join('')}</select>
    ${sizes.length > 1 ? `<select id="${key}-tamano" class="inp sm" data-tamano="${key}" aria-label="Tamaño" ${disabled ? 'disabled' : ''}>${sizes.map((t) => `<option value="${t}" ${t === sel.tamano ? 'selected' : ''}>${t.toUpperCase()} · ${usdLabel(m.tamanos[t])}</option>`).join('')}</select>` : `<span class="hint">${usdLabel(motorUsd(sel.motor, sel.tamano))} por foto</span>`}
    ${m && !m.disponible ? `<p class="hint">Falta ${esc(m.env)} en 04_STUDIO_APP/.env. Agrégala y reinicia el Estudio.</p>` : ''}
  </div>`;
}
const motorReady = (sel) => !!motorInfo(sel.motor)?.disponible;

// Textos de la lámina que el servidor manda al motor de imagen y luego revisa letra por letra
const slidePayload = (s) => ({
  layout: s.layout, kicker: s.kicker, title: s.title, body: s.body, number: s.number, numberLabel: s.numberLabel,
  items: s.items, leftLabel: s.leftLabel, leftItems: s.leftItems, rightLabel: s.rightLabel, rightItems: s.rightItems,
  cta: s.cta, source: s.source, photo: s.photo, photoPrompt: s.photoPrompt, basePhoto: s.basePhoto || '', outfit: s.outfit || '',
});
// La lámina nombra a una persona aprobada y la marca usa "foto real + escena" (ver foto_real.rb):
// devuelve esa persona con su lista de fotos reales, o null.
const realPerson = (id, s) => {
  if (brandOf(id).motor_persona !== 'foto_real') return null;
  const pid = peopleIn(id, `${s.photo} ${s.photoPrompt}`)[0];
  return pid ? (brandOf(id).people || []).find((x) => x.id === pid) || null : null;
};
// Selector de la foto real que Grok usa como base (vacío = la de "fotos_base" de persona.json según el diseño)
function basePhotoPicker(p, s) {
  const rp = realPerson(p.brand, s);
  if (!rp?.photos?.length) return '';
  const val = s.basePhoto || '';
  const o = (v, label) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(label)}</option>`;
  const thumb = rp.photos.find((f) => f.name === val)?.url;
  return `<label class="lbl" for="base-photo">Tu foto real (la IA solo cambia el lugar)</label>
    <select id="base-photo" class="inp">${o('', 'Automática según el diseño')}${rp.photos.map((f) => o(f.name, f.name.replace(/\.\w+$/, ''))).join('')}</select>
    ${thumb ? `<img class="base-thumb" src="${esc(thumb)}" alt="">` : ''}
    <p class="help">La IA toma esta foto tuya y cambia el fondo, la luz y el lugar. Tu cara no se genera.</p>
    ${outfitPicker(p, s)}`;
}

// Outfit de la lámina (06_MARCAS/<marca>/vestuario): automático = uno distinto por lámina
function outfitPicker(p, s) {
  const list = brandOf(p.brand).outfits || [];
  if (!list.length) return '';
  const val = s.outfit || '';
  const o = (v, label) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(label)}</option>`;
  const thumb = list.find((f) => f.name === val)?.url;
  const busy = !!state.egen, ready = motorReady(editorMotor());
  return `<label class="lbl" for="outfit">Vestuario</label>
    <select id="outfit" class="inp">${o('', 'Automático (uno distinto por lámina)')}${o('original', 'El de la foto real')}${list.map((f) => o(f.name, f.name.replace(/\.\w+$/, '').replace(/-/g, ' '))).join('')}</select>
    ${thumb ? `<img class="base-thumb" src="${esc(thumb)}" alt="">` : ''}
    <div class="form-actions"><button type="button" class="btn sm accent" id="regen-outfit" ${busy || !ready ? 'disabled' : ''}>${busy ? (state.egen.status || 'Generando…') : 'Regenerar con este outfit'}</button></div>
    <p class="help">${ready ? `${usdLabel(motorUsd(editorMotor().motor, editorMotor().tamano))} con ${esc(motorLabel(editorMotor().motor, editorMotor().tamano))} (cámbialo en "Motor de imagen", más arriba). La foto actual queda guardada.` : 'El motor elegido no tiene API key: elige otro en "Motor de imagen", más arriba.'}</p>`;
}
const firstBrand = (pref) => (BRANDS[pref] ? pref : brandIds()[0] || 'sin-marca');

async function loadBrands() {
  const r = await api('/api/brands');
  BRANDS = Object.fromEntries(r.brands.map((b) => [b.id, b]));
  state.archived = r.archived || [];
  Object.values(BRANDS).forEach((b) => { if (b.design === 'base') [b.fonts?.display, b.fonts?.body].forEach(loadFont); });
  await loadLogos();
}

// Tipografías de Google Fonts de las marcas nuevas. Si la familia no tiene todos los pesos, se pide la básica.
const loadedFonts = new Set(['Anton', 'Archivo', 'Barlow', 'Bodoni Moda', 'IBM Plex Mono', 'Instrument Serif', 'Jost', 'Montserrat']);
function loadFont(family) {
  const f = String(family || '').trim();
  if (!f || loadedFonts.has(f)) return;
  loadedFonts.add(f);
  const fam = encodeURIComponent(f).replace(/%20/g, '+');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.crossOrigin = 'anonymous';
  link.href = `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,400;0,500;0,700;0,800;1,400&display=swap`;
  link.onerror = () => { link.onerror = null; link.href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`; };
  link.onload = () => document.fonts.ready.then(() => { if (state.p && state.view === 'editor') renderEditor(); });
  document.head.appendChild(link);
}

// Fuente elegida para un elemento en el Editor: se piden todos los grosores y la cursiva.
// Prueba primero como variable (300–900), luego pesos sueltos y al final la básica.
const fullFonts = new Set();
function loadFontFull(family) {
  const f = String(family || '').trim();
  if (!f || fullFonts.has(f)) return;
  fullFonts.add(f);
  const fam = encodeURIComponent(f).replace(/%20/g, '+');
  const urls = [
    `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,300..900;1,300..900&display=swap`,
    `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,400;0,700;1,400;1,700&display=swap`,
    `https://fonts.googleapis.com/css2?family=${fam}&display=swap`,
  ];
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.crossOrigin = 'anonymous';
  let i = 0;
  link.href = urls[0];
  link.onerror = () => { if (++i < urls.length) link.href = urls[i]; };
  link.onload = () => document.fonts.ready.then(() => { if (state.p && state.view === 'editor') { renderStage(); state.p.slides.forEach((_, i) => renderThumb(i)); } });
  document.head.appendChild(link);
}
// Fuentes para el selector: las de los diseños propios primero, luego la lista de Google Fonts de Marcas
const EDIT_FONTS = () => [...new Set(['Bodoni Moda', 'Instrument Serif', 'Montserrat', 'Cormorant Garamond', 'Playfair Display',
  'DM Serif Display', 'Libre Baskerville', 'Lora', 'Fraunces', 'Archivo', 'Anton', 'Barlow', 'Jost', ...(typeof GOOGLE_FONTS !== 'undefined' ? GOOGLE_FONTS : [])])].sort((a, b) => a.localeCompare(b));

// Personas aprobadas que aparecen en un texto (por nombre o alias, sin importar tildes)
const plain = (t) => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function peopleIn(brandId, text) {
  const t = plain(text);
  return (brandOf(brandId).people || []).filter((p) => [p.name, ...(p.aliases || [])].map(plain).filter(Boolean)
    .some((w) => new RegExp(`(^|[^a-z0-9])${reEsc(w)}($|[^a-z0-9])`).test(t))).map((p) => p.id);
}
const personName = (brandId, id) => (brandOf(brandId).people || []).find((p) => p.id === id)?.name || id;

// Colores de una marca con diseño base. El acento va como texto si contrasta con el fondo; si no, como resaltado.
function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lum(h) { const c = hexRgb(h); if (!c) return 0; const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
function contrast(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
function baseVars(br, theme) {
  const c = br.colors || {}, dark = theme === 'dark', f = br.fonts || {};
  const bg = (dark ? c.darkBg : c.lightBg) || (dark ? '#1E1E20' : '#F4F2EC');
  const ink = (dark ? c.darkInk : c.lightInk) || (dark ? '#F2F0EA' : '#1E1E20');
  const acc = hexRgb(c.accent) ? c.accent : ink;
  const accText = contrast(acc, bg) >= 3;
  const onAcc = contrast('#FFFFFF', acc) >= contrast('#141414', acc) ? '#FFFFFF' : '#141414';
  const body = `'${f.body || 'Inter'}', 'Helvetica Neue', Arial, sans-serif`;
  return {
    '--s-bg': bg, '--s-ink': ink, '--s-deep': `color-mix(in srgb, ${bg} 86%, ${dark ? '#000' : ink})`,
    '--s-muted': `color-mix(in srgb, ${ink} 64%, ${bg})`, '--s-line': `color-mix(in srgb, ${ink} 24%, transparent)`,
    '--s-mark': contrast(acc, bg) >= 1.6 ? acc : ink, '--s-num': accText ? acc : ink,
    '--s-acc-ink': accText ? acc : (contrast(onAcc, acc) >= 4.5 ? onAcc : ink), '--s-acc-bg': accText ? 'transparent' : acc,
    '--s-panel': ink, '--s-panel-ink': bg, '--s-panel-acc': contrast(acc, ink) >= 3 ? acc : bg, '--s-panel-acc-bg': 'transparent',
    '--s-chip': acc, '--s-chip-ink': onAcc, '--s-edge': 'transparent', '--lime': acc,
    '--f-display': `'${f.display || 'Archivo'}', 'Helvetica Neue', Arial, sans-serif`, '--f-body': body, '--f-kicker': body,
    '--t-case': br.titleCase === 'upper' ? 'uppercase' : 'none',
  };
}

function loadImage(src) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('No se pudo cargar la imagen.'));
    img.src = src;
  });
}

async function prepareLogo(def) {
  const img = await loadImage(def.url);
  const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  const px = d.data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (def.key) {
      const dist = Math.max(Math.abs(px[i] - def.key[0]), Math.abs(px[i + 1] - def.key[1]), Math.abs(px[i + 2] - def.key[2]));
      if (dist < 16) px[i + 3] = 0;
      else if (dist < 64) px[i + 3] = Math.round(px[i + 3] * (dist - 16) / 48);
    }
    if (def.tint && px[i + 3] > 0) { px[i] = def.tint[0]; px[i + 1] = def.tint[1]; px[i + 2] = def.tint[2]; }
    if (px[i + 3] > 12) {
      const p = i / 4, x = p % w, y = (p - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  ctx.putImageData(d, 0, 0);
  if (x1 <= x0 || y1 <= y0) return c.toDataURL('image/png');
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// Logos de cada marca, con el fondo quitado (key) o teñidos (tint) según marca.json
async function loadLogos() {
  const defs = [];
  Object.values(BRANDS).forEach((b) => {
    Object.entries(b.logos || {}).forEach(([k, d]) => defs.push([`${b.id}:${k}`, d]));
    ['dark', 'light'].forEach((k) => { if (b.byline?.[k]) defs.push([`${b.id}:by-${k}`, b.byline[k]]); });
  });
  await Promise.all(defs.map(async ([k, def]) => {
    if (LOGOS[k]?.url === def.url && LOGOS[k]?.key === String(def.key) && LOGOS[k]?.tint === String(def.tint)) return;
    try { LOGOS[k] = { url: def.url, key: String(def.key), tint: String(def.tint), data: await prepareLogo(def) }; } catch (e) { console.warn(e); }
  }));
}
const logo = (brandId, k) => LOGOS[`${brandId}:${k}`]?.data || null;

// ---------------------------------------------------------------- modelo
const LAYOUTS = {
  portada: { label: 'Portada', icon: '<rect x="3" y="4" width="28" height="7" fill="currentColor"/><rect x="0" y="16" width="34" height="26" fill="currentColor" opacity=".35"/>' },
  escena: { label: 'Escena', icon: '<rect x="0" y="0" width="34" height="42" fill="currentColor" opacity=".35"/><rect x="3" y="24" width="28" height="8" fill="currentColor"/><rect x="3" y="34" width="16" height="3" fill="currentColor" opacity=".7"/>' },
  cifra: { label: 'Cifra', icon: '<rect x="3" y="8" width="18" height="14" fill="currentColor"/><rect x="3" y="25" width="14" height="4" fill="currentColor" opacity=".6"/><rect x="21" y="0" width="13" height="42" fill="currentColor" opacity=".3"/>' },
  frase: { label: 'Frase', icon: '<rect x="3" y="10" width="28" height="24" fill="currentColor" opacity=".35"/><rect x="7" y="16" width="20" height="4" fill="currentColor"/><rect x="7" y="23" width="14" height="4" fill="currentColor"/>' },
  lista: { label: 'Lista', icon: '<rect x="3" y="4" width="22" height="5" fill="currentColor"/><g fill="currentColor" opacity=".6"><rect x="3" y="15" width="4" height="4"/><rect x="10" y="16" width="18" height="2"/><rect x="3" y="23" width="4" height="4"/><rect x="10" y="24" width="18" height="2"/><rect x="3" y="31" width="4" height="4"/><rect x="10" y="32" width="18" height="2"/></g>' },
  comparar: { label: 'Comparar', icon: '<rect x="3" y="4" width="22" height="5" fill="currentColor"/><rect x="3" y="14" width="13" height="24" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="18" y="14" width="13" height="24" fill="currentColor" opacity=".6"/>' },
  bloques: { label: 'Bloques', icon: '<rect x="3" y="4" width="24" height="6" fill="currentColor"/><rect x="3" y="13" width="16" height="3" fill="currentColor" opacity=".6"/><rect x="3" y="28" width="28" height="8" fill="currentColor"/><rect x="3" y="38" width="12" height="2" fill="currentColor" opacity=".6"/>' },
  cta: { label: 'CTA', icon: '<rect x="3" y="10" width="26" height="8" fill="currentColor"/><rect x="3" y="22" width="16" height="5" fill="currentColor" opacity=".6"/><rect x="3" y="34" width="10" height="4" fill="currentColor" opacity=".4"/>' },
};

function blankSlide(layout = 'frase', brand = 'eva', over = {}) {
  return {
    id: uid(), layout, theme: brandOf(brand).theme || 'dark',
    kicker: '', title: '', body: '', number: '', numberLabel: '', items: [],
    leftLabel: '', leftItems: [], rightLabel: '', rightItems: [], cta: '',
    photo: '', photoPrompt: '', source: '', image: '', cutout: '', ix: 50, iy: 30, iz: 1, dx: 0, dy: 0, blocks: [], template: '',
    bw: false, texture: false, ts: 1,
    ...over,
  };
}

function sampleProject() {
  const b = firstBrand('eva');
  const look = 'natural color editorial photograph, premium tech magazine look, hyperrealistic, natural skin texture, real pores, natural hands, no text, no logos';
  return {
    id: 'p' + Date.now(), brand: b, name: 'EVA · Velocidad de respuesta',
    caption: 'Cada minuto que un lead espera, la conversación se enfría. EVA responde, califica y agenda por tu equipo, incluso fuera de horario.\n\nEscribe EVA por DM y te mostramos cómo funciona.',
    slides: [
      blankSlide('portada', b, {
        kicker: 'Ventas · Seguimiento', title: 'Tu lead no esperó.\n*Se fue con otro.*',
        photo: 'Asesor de seguros de noche en su oficina, mirando el celular con 14 chats de WhatsApp sin responder. El último mensaje dice "Gracias, ya contraté con otra agencia". Frustración, luz fría del teléfono en la cara.',
        photoPrompt: `A 45-year-old Latino insurance agent alone in his office at night, staring at his smartphone full of unanswered chat notifications, the latest message reads like a customer saying they already hired another agency, frustrated expression, hand on forehead, cold phone light on his face, blurred desk with papers, medium close-up, lower two thirds of frame, empty dark space above for headline, ${look}`,
      }),
      blankSlide('escena', b, {
        kicker: 'Mientras tanto', title: '*9:47 p.m.*\nNadie contestó.',
        body: 'El prospecto escribió, esperó y siguió buscando.',
        photo: 'Manos de una mujer en el sofá de su casa, de noche, sosteniendo el celular con un chat en "visto" y sin respuesta. Al lado, una póliza impresa y una taza de té.',
        photoPrompt: `Close-up of a woman's hands on a living room sofa at night holding a smartphone showing an unanswered chat, a printed insurance quote and a cup of tea beside her, shallow depth of field, warm lamp light, overhead three-quarter angle, ${look}`,
      }),
      blankSlide('frase', b, {
        theme: 'light', kicker: 'El problema',
        title: 'Cada minuto sin respuesta *enfría* la conversación.',
        photo: 'Oficina de ventas vacía al final del día: reloj de pared marcando las 6:40, sillas vacías y un monitor encendido lleno de notificaciones sin atender.',
        photoPrompt: `Empty sales office at the end of the day, wall clock showing 6:40, empty office chairs, one monitor still on with a stack of unread notifications, wide shot, late afternoon light through blinds, ${look}`,
      }),
      blankSlide('comparar', b, {
        kicker: 'Antes y después', title: 'Lo que cambia con *EVA*',
        leftLabel: 'Hoy', leftItems: ['Respuestas manuales cuando alguien se acuerda', 'Leads acumulados en WhatsApp', 'Sin visibilidad del pipeline'],
        rightLabel: 'Con EVA', rightItems: ['Respuesta inmediata, también de noche', 'Calificación y agenda automáticas', 'Cada cita visible en el dashboard'],
        photo: 'Equipo comercial saturado: tres asesores con teléfonos en la mano, pantallas llenas de mensajes, gesto de estrés contenido.',
        photoPrompt: `Three insurance sales agents in a busy modern office, each on the phone, screens full of chat messages, restrained stress on their faces, wide horizontal framing, subjects in the upper half, ${look}`,
      }),
      blankSlide('cifra', b, {
        kicker: 'Caso real de un cliente', number: '70–80', numberLabel: 'citas *diarias* con EVA',
        body: 'Una agencia pasó de 20–25 citas agendadas a mano por día a 70–80 diarias. Es el resultado de un cliente, no una garantía.',
        photo: 'Janica Merchant de pie junto a una pantalla grande con el dashboard de EVA y la agenda llena, explicándole los resultados a un dueño de agencia. Plano medio.',
        photoPrompt: `Janica Merchant (use the approved Janica Merchant reference for the face) standing next to a large wall screen showing a full appointment calendar dashboard, explaining results to an agency owner, confident and warm, medium shot, subject on the right side of the frame, modern glass office, ${look}`,
      }),
      blankSlide('lista', b, {
        theme: 'light', kicker: 'Checklist', title: 'Antes de contratar más gente, *revisa esto*',
        items: ['¿Cuánto tarda tu equipo en responder el primer mensaje?', '¿Quién da seguimiento después del tercer día?', '¿Cuántas citas se pierden fuera de horario?', '¿Ves en un solo lugar en qué etapa está cada lead?'],
      }),
      blankSlide('cta', b, {
        kicker: 'Agenda una demo', title: 'Escribe *EVA* por DM',
        body: 'Te mostramos cómo responde, califica y agenda por ti.', cta: 'Escribe EVA',
        photo: 'Asesor tranquilo por la mañana, sonriendo al ver en su celular una cita confirmada automáticamente. Escritorio ordenado, café.',
        photoPrompt: `Relaxed insurance agent in the morning smiling at his phone showing a confirmed appointment, tidy desk with coffee, soft morning light, medium close-up, subject on the right side of the frame, ${look}`,
      }),
    ],
  };
}

// Los bloques que escribe Claude llegan sin id: se les pone uno para poder moverlos y editarlos
const withBlockIds = (s) => { (s.blocks || []).forEach((b) => { b.id ||= uid(); }); return s; };
function normalizeProject(p) {
  p.slides = (p.slides || []).map((s) => withBlockIds(blankSlide(s.layout || 'frase', p.brand, s)));
  if (!p.slides.length) p.slides.push(blankSlide('portada', p.brand));
  p.caption = p.caption || '';
  return p;
}

// ---------------------------------------------------------------- render de láminas
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h; }

// Contorno de papel rasgado: borde superior (top) o inferior (bottom) irregular
function tornClip(seed, edge) {
  const r = mulberry(seed);
  const pts = [];
  let y = 14;
  for (let x = 0; x <= 100; x += 0.9 + r() * 1.4) {
    y = Math.max(2, Math.min(34, y + (r() - 0.5) * 12));
    if (r() > 0.93) y = Math.min(40, y + 16);
    pts.push(`${x.toFixed(2)}% ${edge === 'top' ? y.toFixed(1) + 'px' : `calc(100% - ${y.toFixed(1)}px)`}`);
  }
  pts.push(`100% ${edge === 'top' ? '12px' : 'calc(100% - 12px)'}`);
  return edge === 'top'
    ? `polygon(0 100%, 0 16px, ${pts.join(', ')}, 100% 100%)`
    : `polygon(0 0, 100% 0, ${pts.reverse().join(', ')}, 0 calc(100% - 16px))`;
}

// Pestaña de esquina: rasgada por la izquierda y por abajo (arriba y derecha quedan fuera del lienzo)
function tabClip(seed) {
  const r = mulberry(seed);
  const pts = ['100% 0', '18px 0'];
  let x = 18;
  for (let y = 0; y <= 100; y += 4 + r() * 7) {
    x = Math.max(2, Math.min(34, x + (r() - 0.5) * 14));
    pts.push(`${x.toFixed(1)}px ${y.toFixed(1)}%`);
  }
  let y = 14;
  for (let px = 4; px <= 100; px += 0.9 + r() * 1.6) {
    y = Math.max(2, Math.min(30, y + (r() - 0.5) * 12));
    if (r() > 0.93) y = Math.min(38, y + 14);
    pts.push(`${px.toFixed(2)}% calc(100% - ${y.toFixed(1)}px)`);
  }
  pts.push('100% calc(100% - 12px)');
  return `polygon(${pts.join(', ')})`;
}

function torn(s, edge) {
  const clip = tornClip(hash(s.id + edge), edge);
  const clipEdge = tornClip(hash(s.id + edge + 'e'), edge);
  const shift = edge === 'top' ? 'translateY(-8px)' : 'translateY(8px)';
  return `<div class="s-torn-edge" style="clip-path:${clipEdge};-webkit-clip-path:${clipEdge};transform:${shift}"></div>
          <div class="s-torn" style="clip-path:${clip};-webkit-clip-path:${clip}"></div>`;
}

// Logo según el fondo; si la marca solo tiene uno, se usa ese.
function logoFor(p, s) {
  const id = brandFor(p).id, dark = s.theme === 'dark';
  return logo(id, dark ? 'dark' : 'light') || logo(id, dark ? 'light' : 'dark');
}

function signature(p, s, big = false) {
  const br = brandFor(p);
  const src = logoFor(p, s);
  const mark = src ? `<img class="logo" src="${src}" alt="">` : `<span class="wordmark">${esc(br.name)}</span>`;
  let by = '';
  if (big && br.byline) {
    const bl = logo(br.id, s.theme === 'dark' ? 'by-dark' : 'by-light');
    by = `<div class="by">${esc(br.byline.text || '')} ${bl ? `<img src="${bl}" alt="${esc(br.byline.alt || '')}">` : `<b>${esc(br.byline.alt || '')}</b>`}</div>`;
  }
  return `<div class="s-sign${big ? ' big' : ''}">${mark}${by}</div>`;
}

// Foto de la lámina. Sin imagen, muestra la dirección de arte como marcador.
function photo(s, required) {
  if (s.image) return `<div class="s-photo"><img src="${esc(s.image)}" alt=""></div>`;
  if (required || s.photo) return `<div class="s-photo empty"><span class="ph-note"><b>FOTO</b> · ${esc(s.photo || 'Describe la escena que cuenta este titular o sube una imagen')}</span></div>`;
  return '';
}
// Recorte (misma foto sin fondo) que va encima del texto: las letras quedan entre el sujeto y el fondo.
const cut = (s) => (s.image && s.cutout ? `<div class="s-photo s-cut"><img src="${esc(s.cutout)}" alt=""></div>` : '');

const kicker = (s) => (s.kicker ? `<div class="s-kicker">${esc(s.kicker)}</div>` : '');
const body = (s) => (s.body ? `<p class="s-body">${fmt(s.body)}</p>` : '')
  + (s.source ? `<p class="s-source">Fuente: ${esc(s.source.replace(/^fuente:\s*/i, ''))}</p>` : '');

// Janica Merchant v2: foto a sangre, texto sobre la zona limpia de la foto, un solo gesto lima.
// Ver "Sistema editorial del carrusel" en 01_SKILL_OPERATIVO/references/janica-merchant.md
const lime = (kind = 'rule') => `<i class="j-lime j-${kind}" aria-hidden="true"></i>`;
const jSign = (p) => `<div class="s-sign"><span class="jm">${esc(brandFor(p).name)}</span></div>`;
const jSave = (t) => (t ? `<div class="j-save"><span class="j-bm" aria-hidden="true"></span><span>${fmt(t)}</span></div>` : '');

function janicaInner(p, s) {
  const head = (extra = '') => `${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>${extra}`;
  switch (s.layout) {
    case 'portada':
      return `${photo(s, true)}<div class="j-wash"></div>
        <div class="s-flow fitbox front">${head(lime('rule'))}${body(s)}</div>${cut(s)}${jSign(p)}`;
    case 'escena':
      return `${photo(s, true)}<div class="j-wash"></div>
        <div class="s-flow fitbox front">${head()}${body(s)}</div>${cut(s)}`;
    case 'frase':
      return `${photo(s, false)}<div class="j-wash"></div>
        <div class="s-flow fitbox front">
          <div class="j-top">${kicker(s)}${s.body ? `<p class="j-lede">${fmt(s.body)}</p>` : ''}</div>
          <div class="j-bottom"><h2 class="s-title">${fmt(s.title)}</h2>${lime('brush')}
            ${s.source ? `<p class="s-source">Fuente: ${esc(s.source.replace(/^fuente:\s*/i, ''))}</p>` : ''}</div>
        </div>${cut(s)}`;
    case 'lista':
      return `${photo(s, false)}<div class="j-wash"></div>
        <div class="s-flow fitbox front">${head(lime('square'))}
          <ul class="s-items">${s.items.filter(Boolean).map((t) => `<li>${fmt(t)}</li>`).join('')}</ul>${body(s)}</div>${cut(s)}`;
    case 'cifra':
      return `${photo(s, false)}<div class="j-wash"></div>
        <div class="s-flow fitbox front">${kicker(s)}
          <div class="s-number">${esc(s.number)}</div>${lime('rule')}
          <div class="s-numlabel">${fmt(s.numberLabel)}</div>${body(s)}</div>${cut(s)}`;
    case 'comparar':
      return `${photo(s, false)}<div class="j-wash"></div>
        <div class="s-flow fitbox front">${s.title ? `<h2 class="s-title">${fmt(s.title)}</h2>` : ''}
          ${s.leftLabel ? `<p class="j-line j-lab">${fmt(s.leftLabel)}</p>` : ''}
          ${s.leftItems.filter(Boolean).map((t) => `<p class="j-line">${fmt(t)}</p>`).join('')}
          ${s.rightLabel ? `<div class="j-punch"><span>${fmt(s.rightLabel)}</span></div>` : ''}
          ${s.rightItems.filter(Boolean).map((t) => `<p class="j-line sm">${fmt(t)}</p>`).join('')}
          ${body(s)}</div>${cut(s)}`;
    case 'cta':
    default:
      return `${photo(s, false)}<div class="j-wash"></div>
        <div class="s-flow fitbox front">${head(lime('rule'))}${body(s)}${jSave(s.cta)}</div>${cut(s)}${jSign(p)}`;
  }
}


// ---------------------------------------------------------------- diseño por bloques
// Una lámina "bloques" es una lista de bloques de texto con estilo, zona, alineación y ancho. Marcas en el texto:
// *cursiva* · ==resaltador== · __subrayado de pincel__. Plantillas basadas en las láminas aprobadas de Janica.
const BLOCK_STYLES = {
  'titulo': 'Titular', 'titulo-xl': 'Remate gigante', 'serif': 'Serif', 'sans': 'Texto', 'sans-grande': 'Texto grande',
  'etiqueta': 'Etiqueta (versalitas)', 'espaciado': 'Frase espaciada', 'cifra': 'Cifra', 'fuente': 'Fuente del dato',
  'guardar': 'Guardar (con icono)', 'firma': 'Firma', 'linea': 'Línea de acento',
};
const BLOCK_ZONES = { arriba: 'Arriba', centro: 'Centro', abajo: 'Abajo', izquierda: 'Lateral izquierdo', derecha: 'Lateral derecho' };
const BLOCK_ALIGN = { izq: 'Izquierda', centro: 'Centrado', der: 'Derecha' };
const bk = (style, text, zone = 'arriba', align = 'izq', extra = {}) => ({ style, text, zone, align, ...extra });
const BLOCK_TEMPLATES = {
  'portada-subrayado': { name: 'Portada con subrayado', words: 18, blocks: [
    bk('titulo-xl', 'LA CULPA QUE NADIE __TE__ QUITÓ', 'arriba', 'izq', { ancho: 'medio' }),
    bk('sans', 'Hay una culpa que nadie te enseñó a soltar.', 'arriba', 'izq', { ancho: 'medio' }),
    bk('firma', '', 'arriba', 'izq')] },
  'a-ti-si': { name: 'Contraste · A ti sí', words: 45, blocks: [
    bk('serif', 'Pero nadie le pregunta a un hombre *si se siente* culpable por trabajar demasiado.', 'arriba', 'centro'),
    bk('serif', 'Nadie lo juzga por tener *ambición*.', 'arriba', 'centro'),
    bk('titulo-xl', '==A TI SÍ.==', 'arriba', 'centro'),
    bk('etiqueta', 'MIS POSIBILIDADES TAMBIÉN CUENTAN', 'izquierda', 'izq'),
    bk('etiqueta', 'EXPECTATIVAS QUE NO SON MÍAS', 'derecha', 'izq')] },
  'cifra-resaltada': { name: 'Cifra con resaltado', words: 25, blocks: [
    bk('titulo', 'TU DÍA NO SE LLENA. *SE FRAGMENTA.*'),
    bk('cifra', '==275=='),
    bk('serif', 'INTERRUPCIONES AL DÍA'),
    bk('serif', 'Una cada 2 minutos.'),
    bk('fuente', 'Microsoft Work Trend Index 2025')] },
  'arriba-abajo': { name: 'Titular arriba · remate abajo', words: 35, blocks: [
    bk('titulo', 'Y eso no es un defecto tuyo', 'arriba', 'izq', { ancho: 'medio', punto: true }),
    bk('sans', 'Es el peso de un sistema que nunca fue diseñado para que una mujer pudiera tenerlo todo…', 'arriba', 'izq', { ancho: 'medio' }),
    bk('titulo-xl', 'SIN DESTRUIRSE EN EL INTENTO.', 'abajo')] },
  'voz-interior': { name: 'Voz interior', words: 45, blocks: [
    bk('serif', 'Y *lo más injusto* es que aparece'),
    bk('sans-grande', 'incluso cuando lo estás haciendo bien.'),
    bk('sans', 'Cuando eres buena madre.\nBuena profesional.\nBuena pareja.', 'arriba', 'izq', { ancho: 'medio' }),
    bk('sans', 'Cuando das todo lo que tienes…\ny aun así una voz te dice:', 'abajo'),
    bk('titulo-xl', 'NO ES __SUFICIENTE.__', 'abajo')] },
  'escalera': { name: 'Escalera', words: 40, blocks: [
    bk('titulo', 'La culpa de trabajar'), bk('sans', 'cuando tus hijos te necesitan.'),
    bk('titulo', 'De descansar'), bk('sans', 'cuando todavía hay cosas pendientes.'),
    bk('titulo', 'De querer'), bk('titulo-xl', 'ALGO __PARA TI__'), bk('sans', 'cuando todos parecen necesitar algo de ti primero.')] },
  'dato-centrado': { name: 'Dato centrado', words: 40, blocks: [
    bk('titulo', 'COMPRAR IA NO ES INTEGRAR IA.', 'arriba', 'centro'),
    bk('cifra', 'SOLO ==1 %==', 'centro', 'der', { ancho: 'medio' }),
    bk('sans', 'describe su despliegue como maduro: integrado al flujo de trabajo y conectado con resultados.', 'centro', 'der', { ancho: 'medio' }),
    bk('serif', 'La brecha no está en la herramienta. *Está en el sistema.*', 'abajo', 'centro'),
    bk('fuente', 'McKinsey · Superagency in the Workplace, 2025.', 'abajo', 'centro')] },
  'cierre-guardar': { name: 'Cierre con guardar', words: 55, blocks: [
    bk('titulo', 'LOS HIJOS DE MADRES FELICES Y REALIZADAS APRENDEN CON EL EJEMPLO.', 'arriba', 'izq', { ancho: 'medio' }),
    bk('sans', 'Aprenden que una mujer puede construir algo propio.\nQue puede tener ambición.', 'arriba', 'izq', { ancho: 'medio' }),
    bk('etiqueta', 'NO LE ESTÁS FALLANDO A NADIE.'),
    bk('titulo-xl', 'LA CULPA NO ES TUYA. *__NUNCA LO FUE.__*', 'abajo'),
    bk('guardar', 'Guarda este carrusel para volver a él cuando la culpa intente hacerte dudar.', 'abajo', 'izq', { ancho: 'medio' }),
    bk('firma', '', 'abajo')] },
  'remate-linea': { name: 'Remate con línea', words: 35, blocks: [
    bk('serif', 'Si hoy te sientes culpable por crecer, invertir en tu negocio o reservar un espacio para ti…', 'arriba', 'izq', { ancho: 'medio' }),
    bk('espaciado', 'necesitas recordar esto:'),
    bk('titulo-xl', 'NO LE ESTÁS FALLANDO A NADIE.', 'arriba', 'izq', { ancho: 'medio' }),
    bk('linea', '')] },
};
const newBlocks = (tpl) => BLOCK_TEMPLATES[tpl].blocks.map((b) => ({ ...b, id: uid() }));
function blockHtml(p, b) {
  const cls = `blk blk-${b.style} a-${b.align || 'izq'}${b.ancho === 'medio' ? ' w-medio' : ''}${['titulo', 'titulo-xl', 'cifra'].includes(b.style) ? ' s-title' : ''}`;
  if (b.style === 'linea') return `<i class="${cls}" data-block="${esc(b.id)}"></i>`;
  if (b.style === 'firma') return `<div class="${cls}" data-block="${esc(b.id)}">${esc(brandFor(p).name)}</div>`;
  if (b.style === 'guardar') return `<div class="${cls}" data-block="${esc(b.id)}"><span class="j-bm" aria-hidden="true"></span><span>${fmt(b.text)}</span></div>`;
  return `<div class="${cls}" data-block="${esc(b.id)}">${fmt(b.text)}${b.punto ? '<span class="blk-dot">.</span>' : ''}</div>`;
}
function blocksInner(p, s) {
  const zones = {};
  (s.blocks || []).forEach((b) => { (zones[b.zone || 'arriba'] ||= []).push(b); });
  return `${photo(s, false)}<div class="j-wash"></div>
    ${Object.entries(zones).map(([z, list]) => `<div class="s-blocks z-${z} front">${list.map((b) => blockHtml(p, b)).join('')}</div>`).join('')}
    ${cut(s)}`;
}
// Editor de bloques (panel derecho)
function blocksEditor(s) {
  const o = (map, v) => Object.entries(map).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  return `<label class="lbl" for="blk-template">Plantilla</label>
    <select id="blk-template" class="inp"><option value="">Aplicar una plantilla…</option>${Object.entries(BLOCK_TEMPLATES).map(([k, t]) => `<option value="${k}" ${k === s.template ? 'selected' : ''}>${esc(t.name)} · hasta ${t.words} palabras</option>`).join('')}</select>
    <p class="help">Marcas en el texto: <code>*cursiva*</code> · <code>==resaltador==</code> · <code>__subrayado__</code>. Enter = salto de línea.</p>
    <div class="blk-list">${(s.blocks || []).map((b, i) => `<div class="blk-item ${state.part === 'b:' + b.id ? 'sel' : ''}" data-bi="${i}">
      <div class="blk-head">
        <select class="inp sm" data-bf="style" aria-label="Estilo">${o(BLOCK_STYLES, b.style)}</select>
        <select class="inp sm" data-bf="zone" aria-label="Zona">${o(BLOCK_ZONES, b.zone || 'arriba')}</select>
        <select class="inp sm" data-bf="align" aria-label="Alineación">${o(BLOCK_ALIGN, b.align || 'izq')}</select>
        <label class="blk-chk" title="Ocupa solo la mitad del ancho"><input type="checkbox" data-bf="ancho" ${b.ancho === 'medio' ? 'checked' : ''}> ½</label>
        <span class="blk-btns"><button type="button" class="icon-btn" data-bmove="-1" aria-label="Subir">↑</button><button type="button" class="icon-btn" data-bmove="1" aria-label="Bajar">↓</button><button type="button" class="icon-btn" data-bdel aria-label="Quitar bloque">×</button></span>
      </div>
      ${['linea', 'firma'].includes(b.style) ? '' : `<textarea class="inp" rows="${Math.min(4, Math.max(1, String(b.text || '').split('\n').length))}" data-bf="text">${esc(b.text || '')}</textarea>`}
    </div>`).join('')}</div>
    <button type="button" class="btn sm" id="blk-add">+ Añadir bloque</button>
    <p class="help">${(() => { const w = (s.blocks || []).filter((b) => b.style !== 'fuente').map((b) => String(b.text || '').replace(/[*=_]/g, '')).join(' ').split(/\s+/).filter(Boolean).length; const max = BLOCK_TEMPLATES[s.template]?.words; return `${w} palabras${max ? ` · la plantilla pide hasta ${max}` : ''}`; })()}</p>`;
}
// Al pasar una lámina a "bloques" sin bloques: titular arriba, apoyo debajo, con el texto que ya tenía
function blocksFromFields(s) {
  const out = [];
  if (s.kicker) out.push(bk('etiqueta', s.kicker));
  if (s.title) out.push(bk('titulo', s.title, 'arriba', 'izq', { ancho: 'medio' }));
  if (s.number) out.push(bk('cifra', s.number));
  if (s.numberLabel) out.push(bk('serif', s.numberLabel));
  (s.items || []).filter(Boolean).forEach((t) => out.push(bk('sans', t, 'arriba', 'izq', { ancho: 'medio' })));
  if (s.body) out.push(bk('sans', s.body, 'arriba', 'izq', { ancho: 'medio' }));
  if (s.cta) out.push(bk('guardar', s.cta, 'abajo'));
  if (s.source) out.push(bk('fuente', s.source, 'abajo'));
  return (out.length ? out : newBlocks('arriba-abajo')).map((b) => ({ ...b, id: b.id || uid() }));
}

function slideInner(p, s, i, n) {
  if (s.layout === 'bloques') return blocksInner(p, s);
  if (designOf(p) === 'janica') return janicaInner(p, s);
  const eva = designOf(p) === 'eva';
  const hasImg = !!(s.image || s.photo);
  switch (s.layout) {
    case 'portada':
      return `${photo(s, true)}
        <div class="s-head fitbox front">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>${body(s)}</div>
        ${cut(s)}${eva ? torn(s, 'bottom') : ''}${signature(p, s)}`;
    case 'escena':
      return `${photo(s, true)}<div class="s-shade"></div>
        <div class="s-flow fitbox front">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>${body(s)}</div>
        ${cut(s)}${eva ? torn(s, 'bottom') : ''}${signature(p, s)}`;
    case 'cifra':
      return `${photo(s, false)}
        <div class="s-flow fitbox front ${hasImg ? 'has-photo' : ''}">${kicker(s)}
          <div class="s-number"><span class="hl">${esc(s.number)}</span></div>
          <div class="s-numlabel">${fmt(s.numberLabel)}</div>${body(s)}</div>
        ${cut(s)}${eva ? torn(s, 'top') : ''}${signature(p, s)}`;
    case 'frase':
      return `${photo(s, false)}<div class="quote">“</div>
        <div class="s-panel"><div class="fitbox">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>${body(s)}</div></div>
        ${cut(s)}${eva ? torn(s, 'top') : ''}${signature(p, s)}`;
    case 'lista':
      return `${photo(s, false)}
        <div class="s-flow fitbox front">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>
          <ul class="s-items">${s.items.filter(Boolean).map((t) => `<li><i class="mk"></i><span>${fmt(t)}</span></li>`).join('')}</ul>${body(s)}</div>
        ${cut(s)}${eva ? torn(s, 'bottom') : ''}${signature(p, s)}`;
    case 'comparar':
      return `${photo(s, false)}
        <div class="s-flow fitbox front">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>
          <div class="s-cols">
            <div class="s-col a"><h4>${esc(s.leftLabel)}</h4><ul>${s.leftItems.filter(Boolean).map((t) => `<li>${fmt(t)}</li>`).join('')}</ul></div>
            <div class="s-col b"><h4>${esc(s.rightLabel)}</h4><ul>${s.rightItems.filter(Boolean).map((t) => `<li>${fmt(t)}</li>`).join('')}</ul></div>
          </div>${body(s)}</div>
        ${cut(s)}${eva ? torn(s, 'bottom') : ''}${signature(p, s)}`;
    case 'cta':
    default:
      return `${photo(s, false)}
        <div class="s-flow fitbox front">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>${body(s)}${s.cta ? `<div class="s-chip">${esc(s.cta)}</div>` : ''}</div>
        ${cut(s)}${eva ? torn(s, 'bottom') : ''}${signature(p, s, true)}`;
  }
}

function counter(p, i, n) {
  return `${i + 1}/${n}`;
}

function buildSlide(p, s, i, n) {
  const el = document.createElement('div');
  const hasImg = !!(s.image || s.photo);
  const br = brandFor(p);
  el.className = [
    'slide', `b-${br.design || 'base'}`, `t-${s.theme}`, `l-${s.layout}`,
    s.bw ? 'bw' : '', s.texture ? 'tex' : '', hasImg ? 'has-photo' : '',
  ].filter(Boolean).join(' ');
  if ((br.design || 'base') === 'base') Object.entries(baseVars(br, s.theme)).forEach(([k, v]) => el.style.setProperty(k, v));
  const background = br.backgrounds?.[s.theme];
  if (background) el.style.setProperty('--brand-background', 'url(' + JSON.stringify(background) + ')');
  el.style.setProperty('--ts', s.ts);
  el.style.setProperty('--ix', s.ix + '%');
  el.style.setProperty('--iy', s.iy + '%');
  el.style.setProperty('--iz', s.iz);
  el.style.setProperty('--dx', (s.dx || 0) + '%');
  el.style.setProperty('--dy', (s.dy || 0) + '%');
  // Lámina completa: la imagen ya trae la tipografía; no se dibuja nada encima.
  if (s.full && s.image) {
    el.classList.add('full');
    if (s.layers?.on && s.layers.plate) {
      el.classList.add('layered');
      el.innerHTML = layeredHtml(p, s);
      applyMoves(el, s);
      return el;
    }
    // La imagen entra completa (Flare la entrega en 3:4, la lámina es 4:5); el sobrante se rellena con la misma imagen desenfocada.
    el.innerHTML = `<div class="s-photo s-full"><img class="s-full-bg" src="${esc(s.image)}" alt="" aria-hidden="true"><img class="s-full-img" src="${esc(s.image)}" alt=""></div><div class="s-safe"></div>`;
    return el;
  }
  const tab = tabClip(hash(s.id + 'tab')), tabEdge = tabClip(hash(s.id + 'tabe'));
  el.innerHTML = `<div class="s-bg"></div>
    <div class="s-tab-edge" style="clip-path:${tabEdge};-webkit-clip-path:${tabEdge}"></div>
    <div class="s-tab" style="clip-path:${tab};-webkit-clip-path:${tab}"></div>
    <div class="s-hud"><i class="hb1"></i><i class="hb2"></i><span class="ln"></span><span class="ar">→</span></div>
    <div class="s-ticks"><i></i><i></i><i></i><i></i></div>
    <div class="s-dots"><i></i><i></i><i></i></div><div class="s-win"></div>
    <div class="s-hudb"><i class="bk"></i><span class="ln"></span><span class="ar">» →</span></div>
    <div class="s-frame"></div>
    <div class="s-count">${counter(p, i, n)}</div>
    ${slideInner(p, s, i, n)}
    <div class="s-grain"></div><div class="s-safe"></div>`;
  // Con recorte, solo el titular grande (y la cifra) pasa detrás de la persona: se duplica el bloque
  // de texto encima del recorte con el titular oculto, así antetítulo, apoyo, listas y botón se leen siempre.
  if (s.image && s.cutout) {
    $$('.fitbox.front, .s-panel, .s-blocks', el).forEach((box) => {
      const c = box.cloneNode(true);
      c.classList.add('over');
      c.setAttribute('aria-hidden', 'true');
      el.appendChild(c);
    });
  }
  applyMoves(el, s);
  return el;
}

// Lámina completa en capas: fondo limpio + textos reales + recorte de la persona + logo oficial.
// La caja .ly-box tiene la proporción de la imagen (cabe entera en la lámina); cada capa se ubica en % de esa caja.
const LY_SPACING = { tight: -0.01, normal: 0, wide: 0.16 };
// Familias de un solo grosor: pedirles negrita la deforma (negrita falsa)
const LY_SINGLE = new Set(['Anton', 'Archivo Black', 'Bebas Neue', 'Dancing Script']);
// Fuentes de las capas: Google rechaza la hoja si se piden grosores que la familia no tiene, así que se prueba de más a menos
const layerFonts = new Set();
function loadLayerFont(family) {
  const f = String(family || '').trim();
  if (!f || layerFonts.has(f)) return;
  layerFonts.add(f);
  const fam = encodeURIComponent(f).replace(/%20/g, '+');
  const urls = [`https://fonts.googleapis.com/css2?family=${fam}:ital,wght@0,400;0,500;0,700;0,800;0,900;1,400;1,700;1,900&display=swap`,
    `https://fonts.googleapis.com/css2?family=${fam}:wght@400;700;900&display=swap`, `https://fonts.googleapis.com/css2?family=${fam}&display=swap`];
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.crossOrigin = 'anonymous';
  let i = 0;
  link.href = urls[0];
  link.onerror = () => { if (++i < urls.length) link.href = urls[i]; };
  // La hoja no descarga la fuente hasta que se usa: se pide y, al llegar, se vuelve a medir y dibujar
  link.onload = () => Promise.all([400, 700, 900].map((w) => document.fonts.load(`${w} 40px '${f}'`))).catch(() => {}).then(() => {
    if (state.p && state.view === 'editor') { renderStage(); state.p.slides.forEach((_, i) => renderThumb(i)); }
  });
  document.head.appendChild(link);
}
const LY_FX = { shadow: 'ly-shadow', glow: 'ly-glow', outline: 'ly-outline', '3d': 'ly-3d', gradient: 'ly-shadow' };
function layeredHtml(p, s) {
  const L = s.layers, r = (L.w || 4) / (L.h || 5), R = 1080 / 1350;
  const bw = r < R ? (r / R) * 100 : 100, bh = r < R ? 100 : (R / r) * 100;
  const pos = (b) => `left:${b[0] * 100}%;top:${b[1] * 100}%;width:${b[2] * 100}%;height:${b[3] * 100}%`;
  const text = (t) => {
    loadLayerFont(t.font);
    const ls = LY_SPACING[t.spacing] || 0;
    const body = esc(t.text).replace(/\*([^*]+)\*/g, '<b class="ly-acc">$1</b>');
    return `<div class="ly-t ${LY_FX[t.effect] || ''}" data-ly="${esc(t.id)}" data-ls="${ls}" data-al="${esc(t.align)}" style="${pos(t.box)};--c:${esc(t.color)};--a:${esc(t.accent || t.color)};font-family:'${esc(t.font)}', 'Archivo', sans-serif;font-weight:${LY_SINGLE.has(t.font) ? 400 : +t.weight || 700};font-style:${t.italic ? 'italic' : 'normal'};text-transform:${t.upper ? 'uppercase' : 'none'};letter-spacing:${ls}em"><span>${body}</span></div>`;
  };
  const id = brandFor(p).id;
  const logos = (L.logos || []).map((g) => { const src = logo(id, g.bg === 'light' ? 'light' : 'dark') || logo(id, g.bg === 'light' ? 'dark' : 'light'); return src ? `<img class="ly-logo" data-ly="${esc(g.id)}" src="${src}" alt="" style="${pos(g.box)}">` : ''; }).join('');
  const back = (L.texts || []).filter((t) => layerOf(s, 'l:' + t.id) === 'back'), front = (L.texts || []).filter((t) => layerOf(s, 'l:' + t.id) !== 'back');
  return `<div class="s-photo s-full"><img class="s-full-bg" src="${esc(L.plate)}" alt="" aria-hidden="true"></div>
    <div class="ly-box" style="left:${(100 - bw) / 2}%;top:${(100 - bh) / 2}%;width:${bw}%;height:${bh}%">
      <img class="ly-plate" src="${esc(L.plate)}" alt="">${back.map(text).join('')}${L.cutout ? `<img class="ly-cut" src="${esc(L.cutout)}" alt="">` : ''}${front.map(text).join('')}${logos}
    </div><div class="s-safe"></div>`;
}
// Tamaño de cada texto: llena el ancho o el alto de su caja (lo que llegue primero) y queda centrado en vertical
const lyCtx = document.createElement('canvas').getContext('2d');
function fitLayers(el) {
  $$('.ly-t', el).forEach((box) => {
    const span = box.firstElementChild, W = box.offsetWidth, H = box.offsetHeight;
    if (!span || !W || !H) return;
    const cs = getComputedStyle(span);
    const txt = cs.textTransform === 'uppercase' ? span.textContent.toUpperCase() : span.textContent;
    lyCtx.font = `${cs.fontStyle} ${cs.fontWeight} 100px ${cs.fontFamily}`;
    const m = lyCtx.measureText(txt || ' ');
    const inkW = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + (+box.dataset.ls || 0) * 100 * Math.max(0, txt.length - 1);
    const inkA = m.actualBoundingBoxAscent, inkH = inkA + m.actualBoundingBoxDescent;
    const fA = m.fontBoundingBoxAscent || inkA, fD = m.fontBoundingBoxDescent || 0;
    const k = Math.max(0.04, Math.min(W / Math.max(1, inkW), H / Math.max(1, inkH)));
    span.style.fontSize = (100 * k) + 'px';
    span.style.top = ((H - inkH * k) / 2 - ((100 * k - (fA + fD) * k) / 2 + (fA - inkA) * k)) + 'px';
    const al = box.dataset.al;
    span.style.left = al === 'center' ? '50%' : al === 'right' ? 'auto' : (-m.actualBoundingBoxLeft * k) + 'px';
    span.style.right = al === 'right' ? '0' : 'auto';
    span.style.transform = al === 'center' ? 'translateX(-50%)' : '';
  });
}

// Elementos que se pueden arrastrar en el Editor. Cada uno guarda su desplazamiento en s.move[clave] = [x, y]
// (px de la lámina de 1080). Se aplica con la propiedad translate, que no choca con los transform del diseño.
const MOVABLE = [
  ['kicker', '.s-kicker'], ['title', '.s-title'], ['body', '.s-body, .j-lede'], ['source', '.s-source'],
  ['accent', '.j-lime'], ['number', '.s-number'], ['numlabel', '.s-numlabel'], ['items', '.s-items'],
  ['cols', '.s-cols'], ['lines', '.j-line'], ['punch', '.j-punch'], ['cta', '.s-chip, .j-save'],
  ['sign', '.s-sign'], ['count', '.s-count'], ['quote', '.quote'],
];
const PART_LABEL = { kicker: 'Antetítulo', title: 'Titular', body: 'Texto de apoyo', source: 'Fuente del dato', accent: 'Línea de acento',
  number: 'Cifra', numlabel: 'Texto de la cifra', items: 'Lista', cols: 'Columnas', lines: 'Líneas', punch: 'Remate', cta: 'Botón / CTA',
  sign: 'Firma', count: 'Contador', quote: 'Comillas' };
// s.fx[clave] = { scale, font, weight, italic: 'si' | 'no' }: tamaño con el mouse y tipografía desde el panel
function applyMoves(el, s) {
  const parts = [];
  MOVABLE.forEach(([k, sel]) => $$(sel, el).forEach((n) => parts.push([k, n])));
  $$('[data-block]', el).forEach((n) => parts.push(['b:' + n.dataset.block, n]));   // los bloques mandan sobre los selectores genéricos
  $$('[data-ly]', el).forEach((n) => parts.push(['l:' + n.dataset.ly, n]));            // capas de la lámina completa editable
  parts.forEach(([k, n]) => {
    n.classList.add('mv');
    n.dataset.mv = k;
    const m = s.move?.[k];
    const f = s.fx?.[k] || {};
    n.style.translate = m ? `${m[0]}px ${m[1]}px` : '';
    n.style.scale = f.scale && f.scale !== 1 ? String(f.scale) : '';
    // Las capas traen su propia letra en línea: solo se pisa si se eligió otra en el panel
    const keep = !!n.dataset.ly;
    if (f.font || !keep) n.style.fontFamily = f.font ? `'${f.font}', serif` : '';
    if (f.weight || !keep) n.style.fontWeight = f.weight || '';
    if (f.italic || !keep) n.style.fontStyle = f.italic === 'si' ? 'italic' : f.italic === 'no' ? 'normal' : '';
    if (f.font) loadFontFull(f.font);
    // Capa respecto a la persona (solo con recorte): la copia de encima (.over) se muestra u oculta
    if (n.closest('.over')) {
      const layer = s.layer?.[k];
      n.style.visibility = layer === 'front' ? 'visible' : layer === 'back' ? 'hidden' : '';
    }
  });
}
// Por defecto (slides.css) solo el titular y la cifra pasan detrás de la persona
const layerOf = (s, k) => s.layer?.[k] || (k.startsWith('l:') ? ((s.layers?.texts || []).find((t) => 'l:' + t.id === k)?.behind ? 'back' : 'front') : null) || ((['title', 'number'].includes(k) || (k.startsWith('b:') && ['titulo', 'titulo-xl', 'cifra'].includes((s.blocks || []).find((b) => 'b:' + b.id === k)?.style))) ? 'back' : 'front');
const partLabel = (s, k) => (k.startsWith('l:') ? (() => { const t = (s.layers?.texts || []).find((x) => 'l:' + x.id === k); return t ? `Texto · ${String(t.text).replace(/\*/g, '').slice(0, 24)}` : 'Logo'; })() : k.startsWith('b:') ? `Bloque · ${BLOCK_STYLES[(s.blocks || []).find((b) => 'b:' + b.id === k)?.style] || ''}` : PART_LABEL[k] || k);

// Reduce el texto hasta que quepa en su caja (el slider de titular sigue mandando)
function fitSlide(el) {
  // Se mide sin los desplazamientos manuales y luego se devuelven
  const moved = $$('.mv', el).filter((n) => n.style.translate || n.style.scale).map((n) => [n, n.style.translate, n.style.scale]);
  moved.forEach(([n]) => { n.style.translate = ''; n.style.scale = ''; });
  $$('.fitbox', el).forEach((box) => {
    let k = 1;
    box.style.setProperty('--fit', 1);
    let guard = 0;
    while ((box.scrollHeight > box.clientHeight + 2 || box.scrollWidth > box.clientWidth + 2) && guard++ < 16) {
      k *= 0.94;
      box.style.setProperty('--fit', k.toFixed(3));
    }
  });
  fitLayers(el);
  moved.forEach(([n, t, sc]) => { n.style.translate = t; n.style.scale = sc; });
}

// ---------------------------------------------------------------- estado
const state = { p: null, sel: 0, assets: [], requests: [], hasKey: false, view: 'editor', saveTimer: null };
const cur = () => state.p.slides[state.sel];

function scheduleSave() {
  $('#save-state').textContent = 'Sin guardar…';
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(saveProject, 700);
}
async function saveProject() {
  try {
    const r = await api('/api/projects', state.p);
    state.p.id = r.id;
    store.set('lastProject', r.id);
    $('#save-state').textContent = 'Guardado ' + new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    return true;
  } catch (e) {
    $('#save-state').textContent = 'No se pudo guardar';
    toast('No se pudo guardar el proyecto: ' + e.message, true);
    return false;
  }
}

// ---------------------------------------------------------------- editor: vista
const safeOn = () => $('#safe-toggle').checked;

function renderStage() {
  const p = state.p, n = p.slides.length;
  const inner = $('#stage-inner');
  const el = buildSlide(p, cur(), state.sel, n);
  if (safeOn()) el.classList.add('show-safe');
  inner.replaceChildren(el);
  fitSlide(el);
  fitStage();
  markSelection();
  $('#pos').textContent = `${state.sel + 1} / ${n}`;
}

function fitStage() {
  const stage = $('#stage'), inner = $('#stage-inner');
  const cs = getComputedStyle(stage);
  const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const h = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const k = Math.max(0.1, Math.min(w / 1080, h / 1350));
  inner.style.width = 1080 * k + 'px';
  inner.style.height = 1350 * k + 'px';
  const sl = inner.firstElementChild;
  if (sl) sl.style.transform = `scale(${k})`;
}

function renderThumb(i) {
  const li = $(`#strip .thumb[data-i="${i}"]`);
  if (!li) return;
  const frame = $('.frame', li);
  const el = buildSlide(state.p, state.p.slides[i], i, state.p.slides.length);
  frame.replaceChildren(el);
  fitSlide(el);
  el.style.transform = `scale(${frame.clientWidth / 1080})`;
}

function renderStrip() {
  const strip = $('#strip');
  strip.innerHTML = state.p.slides.map((s, i) => `
    <li class="thumb" data-i="${i}" aria-current="${i === state.sel}" tabindex="0" aria-label="Lámina ${i + 1}">
      <span class="n">${pad(i + 1)}</span>
      <div class="frame"></div>
      <div class="t-tools">
        <button data-act="up" title="Subir" aria-label="Subir lámina">↑</button>
        <button data-act="down" title="Bajar" aria-label="Bajar lámina">↓</button>
        <button data-act="dup" title="Duplicar" aria-label="Duplicar lámina">⧉</button>
        <button data-act="del" title="Eliminar" aria-label="Eliminar lámina">×</button>
      </div>
    </li>`).join('');
  state.p.slides.forEach((_, i) => renderThumb(i));
}

function renderBrandPick(container, value, onPick) {
  container.innerHTML = Object.entries(BRANDS).sort((x, y) => x[1].name.localeCompare(y[1].name, 'es')).map(([k, b]) =>
    `<button type="button" role="radio" aria-checked="${k === value}" data-brand="${k}"><span class="sw" style="background:${esc(b.swatch)}"></span>${esc(b.name)}</button>`).join('')
    || '<p class="hint">No hay marcas. Crea una en la pestaña Marcas.</p>';
  container.onclick = (e) => {
    const b = e.target.closest('[data-brand]');
    if (b) onPick(b.dataset.brand);
  };
}

function renderEditor() {
  $('#p-name').value = state.p.name || '';
  $('#btn-export-all').textContent = state.p.slides.length === 1 ? 'Exportar post' : 'Exportar carrusel';
  renderBrandPick($('#brand-pick'), state.p.brand, (b) => {
    state.p.brand = b;
    renderEditor();
    scheduleSave();
  });
  renderStrip();
  renderStage();
  renderInspector();
}

// Elemento seleccionado en la lámina (clave de MOVABLE). Se marca con un recuadro y una esquina para cambiar su tamaño.
function markSelection() {
  const inner = $('#stage-inner');
  const slide = inner?.firstElementChild;
  $('#sel-handle')?.remove();
  if (!slide || !state.part) return;
  const nodes = $$(`[data-mv="${state.part}"]`, slide);
  if (!nodes.length) { state.part = null; return; }
  nodes.forEach((n) => n.classList.add('sel'));
  const main = nodes.find((n) => !n.closest('.over')) || nodes[0];
  const r = main.getBoundingClientRect(), ir = inner.getBoundingClientRect();
  const h = document.createElement('div');
  h.id = 'sel-handle';
  h.title = 'Arrastra para agrandar o achicar';
  h.style.left = `${r.right - ir.left}px`;
  h.style.top = `${r.bottom - ir.top}px`;
  inner.appendChild(h);
}

// Mouse sobre la lámina: clic selecciona un elemento (titular, texto, línea, firma…) y arrastrarlo lo mueve;
// la esquina del recuadro cambia su tamaño; en una zona sin texto se arrastra la foto con su recorte.
// Doble clic devuelve el elemento (o la foto) a su lugar. Esc quita la selección.
function bindPhotoDrag() {
  const inner = $('#stage-inner');
  let drag = null;
  const setOut = (k, v) => {
    const r = $(`#r-${k}`);
    if (r) { r.value = v; r.nextElementSibling.textContent = v + '%'; }
  };
  const hitPart = (e) => {
    const slide = inner.firstElementChild;
    return document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.dataset?.mv && slide?.contains(n));
  };
  const nodesOf = (slide, key) => $$(`[data-mv="${key}"]`, slide);
  inner.addEventListener('pointerdown', (e) => {
    const s = state.p && cur();
    const slide = inner.firstElementChild;
    if (!s || !slide || e.button !== 0 || (slide.classList.contains('full') && !slide.classList.contains('layered'))) return;
    if (e.target.id === 'sel-handle' && state.part) {
      // Tamaño: distancia al centro del elemento
      const main = nodesOf(slide, state.part).find((n) => !n.closest('.over'));
      const r = main.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      drag = { mode: 'scale', key: state.part, cx, cy, d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1,
        s0: s.fx?.[state.part]?.scale || 1, nodes: nodesOf(slide, state.part) };
    } else {
      const part = hitPart(e);
      if (part) {
        const key = part.dataset.mv;
        if (state.part !== key) { state.part = key; renderInspector(); markSelection(); }
        drag = { mode: 'move', key, x: e.clientX, y: e.clientY, start: s.move?.[key] || [0, 0],
          k: slide.getBoundingClientRect().width / 1080, nodes: nodesOf(slide, key) };
      } else {
        if (state.part) { state.part = null; renderInspector(); markSelection(); }
        const box = slide.querySelector('.s-photo:not(.s-cut)');
        if (!s.image || !box) return;
        const r = box.getBoundingClientRect();
        drag = { mode: 'photo', x: e.clientX, y: e.clientY, dx: s.dx || 0, dy: s.dy || 0, w: r.width, h: r.height };
      }
    }
    drag.el = slide;
    drag.changed = false;
    inner.setPointerCapture(e.pointerId);
    inner.classList.add('dragging');
    e.preventDefault();
  });
  inner.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const s = cur();
    drag.changed = true;
    if (drag.mode === 'scale') {
      const sc = Math.max(0.3, Math.min(4, Math.round(drag.s0 * (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) / drag.d0) * 100) / 100));
      s.fx = { ...(s.fx || {}), [drag.key]: { ...(s.fx?.[drag.key] || {}), scale: sc } };
      drag.nodes.forEach((n) => { n.style.scale = String(sc); });
      const out = $('#fx-scale');
      if (out) { out.value = sc; out.nextElementSibling.textContent = sc + '×'; }
    } else if (drag.mode === 'move') {
      const x = Math.round(drag.start[0] + (e.clientX - drag.x) / drag.k);
      const y = Math.round(drag.start[1] + (e.clientY - drag.y) / drag.k);
      s.move = { ...(s.move || {}), [drag.key]: [x, y] };
      drag.nodes.forEach((n) => { n.style.translate = `${x}px ${y}px`; });
    } else {
      const clamp = (v) => Math.max(-100, Math.min(100, Math.round(v)));
      s.dx = clamp(drag.dx + ((e.clientX - drag.x) / drag.w) * 100);
      s.dy = clamp(drag.dy + ((e.clientY - drag.y) / drag.h) * 100);
      drag.el.style.setProperty('--dx', s.dx + '%');
      drag.el.style.setProperty('--dy', s.dy + '%');
      setOut('dx', s.dx);
      setOut('dy', s.dy);
    }
    markSelection();
  });
  const end = () => {
    if (!drag) return;
    const { changed, mode } = drag;
    drag = null;
    inner.classList.remove('dragging');
    if (!changed) return;
    renderThumb(state.sel);
    scheduleSave();
    if (mode !== 'photo') renderInspector();
  };
  inner.addEventListener('pointerup', end);
  inner.addEventListener('pointercancel', end);
  inner.addEventListener('dblclick', (e) => {
    const s = state.p && cur();
    if (!s) return;
    const part = hitPart(e);
    if (part) { const m = { ...(s.move || {}) }; delete m[part.dataset.mv]; s.move = m; }
    else if (s.image) Object.assign(s, { dx: 0, dy: 0 });
    else return;
    refreshSlide();
    renderInspector();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.part && state.view === 'editor' && !e.target.closest('input, textarea, select')) {
      state.part = null; renderInspector(); markSelection();
    }
  });
}

// Panel del elemento seleccionado: tamaño, tipo de letra, grosor y cursiva
function partPanel(s) {
  const k = state.part;
  if (!k) return '';
  const f = s.fx?.[k] || {};
  const o = (v, cur, label) => `<option value="${esc(v)}" ${String(v) === String(cur ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
  const weights = [['', 'Del diseño'], ['300', 'Light 300'], ['400', 'Regular 400'], ['500', 'Medium 500'], ['600', 'Semibold 600'], ['700', 'Bold 700'], ['800', 'Extra bold 800'], ['900', 'Black 900']];
  const sc = f.scale || 1;
  return `<section class="sec part-sec">
      <h3 class="sec-title">Seleccionado · ${esc(partLabel(s, k))}</h3>
      <label class="range"><span>Tamaño</span><input type="range" id="fx-scale" min="0.3" max="4" step="0.01" value="${sc}" data-fx="scale"><output>${sc}×</output></label>
      <label class="lbl" for="fx-font">Tipo de letra</label>
      <select id="fx-font" class="inp" data-fx="font">${o('', f.font, 'Del diseño')}${EDIT_FONTS().map((x) => o(x, f.font, x)).join('')}</select>
      <span class="lbl">Capa</span>
      ${(s.layers?.on ? s.layers.cutout && k.startsWith('l:t') : s.image && s.cutout) ? `<div class="seg" role="group" aria-label="Capa">
        <button type="button" data-layer="front" aria-pressed="${layerOf(s, k) === 'front'}">Delante de la persona</button>
        <button type="button" data-layer="back" aria-pressed="${layerOf(s, k) === 'back'}">Detrás de la persona</button></div>`
      : `<p class="help">Para poner el texto detrás de la persona, la foto necesita su <b>Recorte</b> (sección Foto → Recorte automático).</p>`}
      <div class="fx-row">
        <select class="inp" data-fx="weight" aria-label="Grosor">${weights.map(([v, l]) => o(v, f.weight, l)).join('')}</select>
        <select class="inp" data-fx="italic" aria-label="Cursiva">${o('', f.italic, 'Cursiva: del diseño')}${o('no', f.italic, 'Sin cursiva')}${o('si', f.italic, 'Cursiva')}</select>
      </div>
      <p class="help">Arrastra el elemento para moverlo y la esquina lima para agrandarlo o achicarlo. Doble clic lo devuelve a su lugar; Esc quita la selección.</p>
      <div class="form-actions">
        <button type="button" class="btn sm ghost" id="fx-reset">Restablecer este elemento</button>
        <button type="button" class="btn sm ghost" id="fx-done">Listo</button>
      </div>
    </section>`;
}

function refreshSlide() {
  renderStage();
  renderThumb(state.sel);
  scheduleSave();
}

// Lámina en capas sin recorte (p. ej. recuperada al abrir el proyecto): se recorta la persona del fondo limpio una vez
const cutting = new Set();
function ensureLayerCut(s) {
  if (!s?.layers?.on || s.layers.cutout || !s.layers.plate || cutting.has(s.layers.plate)) return;
  const L = s.layers;
  cutting.add(L.plate);
  api('/api/cutout', { url: L.plate }).then((r) => { if (s.layers === L) { L.cutout = r.cutout; refreshSlide(); renderInspector(); } }).catch(() => cutting.delete(L.plate));
}
function select(i) {
  state.sel = Math.max(0, Math.min(state.p.slides.length - 1, i));
  ensureLayerCut(state.p.slides[state.sel]);
  state.part = null;
  $$('#strip .thumb').forEach((t) => t.setAttribute('aria-current', String(+t.dataset.i === state.sel)));
  renderStage();
  renderInspector();
  $(`#strip .thumb[data-i="${state.sel}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------------------------------------------------------------- inspector
// Lámina completa: botón para separarla en capas o, si ya lo está, la lista de textos editables
function layersPanel(s) {
  const L = s.layers, busy = state.lgen && state.lgen.index === state.sel && state.lgen.projectId === state.p.id;
  if (!L) return `<div class="photo-status ${s.qa ? 'low' : 'ok'}"><b>Lámina completa</b> · el texto está dentro de la imagen y no se puede mover.${s.qa ? `<div class="missing">Revisión: ${esc(s.qa)}</div>` : ''}</div>
    <div class="form-actions"><button type="button" class="btn sm accent" id="ly-make" ${state.lgen ? 'disabled' : ''}>${busy ? 'Separando capas… (30–60 s)' : 'Hacer editable'}</button></div>
    <p class="help">Separa el texto y el logo de la imagen: después puedes moverlos, cambiarlos y corregirlos sin tocar la foto. ~US$0,10 por lámina.</p>`;
  return `<div class="photo-status ok"><b>Lámina en capas</b> · haz clic en un texto de la lámina para moverlo o agrandarlo. Aquí cambias lo que dice y su color.</div>
    <label class="ly-orig"><input type="checkbox" id="ly-orig" ${L.on ? '' : 'checked'}> Ver la lámina original (sin capas)</label>
    ${L.on ? `<div class="ly-list">${(L.texts || []).map((t, i) => `<div class="ly-item ${state.part === 'l:' + t.id ? 'sel' : ''}" data-li="${i}">
        <textarea class="inp" rows="1" data-lf="text" aria-label="Texto ${i + 1}">${esc(t.text)}</textarea>
        <div class="ly-row">
          <label>Color <input type="color" data-lf="color" value="${esc(t.color)}"></label>
          ${String(t.text).includes('*') ? `<label>Acento <input type="color" data-lf="accent" value="${esc(t.accent || t.color)}"></label>` : ''}
          <label><input type="checkbox" data-lf="upper" ${t.upper ? 'checked' : ''}> Mayúsculas</label>
          <button type="button" class="btn sm ghost danger" data-ldel="${i}">Quitar</button>
        </div></div>`).join('')}</div>
    <div class="form-actions">
      <button type="button" class="btn sm" id="ly-add">Agregar texto</button>
      ${!L.cutout ? `<button type="button" class="btn sm ghost" id="ly-cut">Recortar persona</button>` : ''}
      <button type="button" class="btn sm ghost" id="ly-redo" ${state.lgen ? 'disabled' : ''}>${busy ? 'Separando…' : 'Volver a separar'}</button>
    </div>
    <p class="help">Color de acento con <code>*asteriscos*</code>. Para cambiar letra, grosor o poner un texto detrás de la persona, selecciónalo en la lámina.${L.cutout ? '' : ' Para poner texto detrás de la persona falta el recorte.'}</p>` : ''}`;
}

// Movimientos y estilos guardados de las capas anteriores (claves l:…): no sirven para capas nuevas; el resto se conserva
const dropLayerKeys = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => !k.startsWith('l:')));

// Separa la lámina en capas en el servidor (fondo limpio + textos + logo) y la deja editable
async function makeLayersInEditor(i) {
  const p = state.p;
  clearTimeout(state.saveTimer);
  if (await saveProject() === false) return;
  try {
    const r = await api('/api/layers', { projectId: p.id, index: i });
    state.lgen = { id: r.id, index: i, projectId: p.id };
    renderInspector();
    toast('Separando la lámina en capas… tarda entre 30 y 60 segundos.');
    pollLayers();
  } catch (e) { toast(e.message, true); }
}
async function pollLayers() {
  const g = state.lgen;
  if (!g) return;
  try {
    const job = await api('/api/generate?id=' + encodeURIComponent(g.id));
    if (!job.done) { setTimeout(pollLayers, 3000); return; }
    const x = job.items[0] || {};
    state.lgen = null;
    if (x.status === 'completed' && x.layers && state.p?.id === g.projectId) {
      const s = state.p.slides[g.index];
      // Los movimientos y estilos guardados eran de otras capas
      Object.assign(s, { layers: x.layers, move: dropLayerKeys(s.move), fx: dropLayerKeys(s.fx), layer: dropLayerKeys(s.layer) });
      renderThumb(g.index);
      if (state.sel === g.index) renderStage();
      scheduleSave();
      toast(`Lámina ${g.index + 1} en capas: ya puedes mover y cambiar sus textos.`);
    } else if (x.status !== 'completed') toast(x.error || 'No se pudo separar en capas.', true);
    if (state.view === 'editor') renderInspector();
  } catch (e) {
    state.lgen = null;
    toast(e.message, true);
    if (state.view === 'editor') renderInspector();
  }
}

function field(label, key, type = 'text', rows = 2, help = '') {
  const s = cur();
  const id = 'f-' + key;
  const val = Array.isArray(s[key]) ? s[key].join('\n') : s[key];
  const ctl = type === 'textarea'
    ? `<textarea id="${id}" class="inp" rows="${rows}" data-k="${key}">${esc(val)}</textarea>`
    : `<input id="${id}" class="inp" type="text" data-k="${key}" value="${esc(val)}">`;
  return `<div><label class="lbl" for="${id}">${label}</label>${ctl}${help ? `<p class="help">${help}</p>` : ''}</div>`;
}
function range(label, key, min, max, step, unit = '') {
  const s = cur();
  return `<label class="range"><span>${label}</span><input type="range" id="r-${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}" data-r="${key}"><output>${s[key]}${unit}</output></label>`;
}

function renderInspector() {
  const s = cur(), p = state.p;
  const L = s.layout;
  const specific = {
    cifra: field('Cifra', 'number') + field('Texto bajo la cifra', 'numberLabel', 'textarea', 2),
    lista: field('Puntos (uno por línea)', 'items', 'textarea', 5),
    comparar: `<div class="row">${field('Columna A', 'leftLabel')}${field('Columna B', 'rightLabel')}</div>`
      + field('Puntos columna A (uno por línea)', 'leftItems', 'textarea', 3)
      + field('Puntos columna B (uno por línea)', 'rightItems', 'textarea', 3),
    cta: field('Botón / llamado', 'cta'),
  }[L] || '';
  const titled = L !== 'cifra';

  $('#inspector').innerHTML = `
    <section class="sec">
      <h3 class="sec-title">Lámina ${state.sel + 1}</h3>
      <div class="layouts" role="group" aria-label="Diseño">
        ${Object.entries(LAYOUTS).map(([k, l]) => `<button type="button" data-layout="${k}" aria-pressed="${k === L}"><svg viewBox="0 0 34 42" aria-hidden="true">${l.icon}</svg>${l.label}</button>`).join('')}
      </div>
      <div class="seg" role="group" aria-label="Fondo">
        <button type="button" data-theme="dark" aria-pressed="${s.theme === 'dark'}">Oscuro</button>
        <button type="button" data-theme="light" aria-pressed="${s.theme === 'light'}">Claro</button>
      </div>
      ${designOf(p) === 'eva' ? '<p class="help">Fondo geométrico con textura, papel rasgado y adornos de borde: siempre activos en EVA (regla de acabado).</p>' : ''}
    </section>

    ${partPanel(s)}
    <section class="sec">
      <h3 class="sec-title">Texto</h3>
      ${s.full && s.image ? layersPanel(s) : ''}
      ${L === 'bloques' ? blocksEditor(s) : `${field('Antetítulo', 'kicker')}
      ${titled ? field('Titular', 'title', 'textarea', 3, 'Marca en color de acento con <code>*asteriscos*</code>. Enter = salto de línea.') : ''}
      ${specific}
      ${field('Texto de apoyo', 'body', 'textarea', 3)}
      ${field('Fuente del dato', 'source', 'text', 2, 'Obligatoria si la lámina tiene una cifra externa. Ej.: CBO, junio 2024.')}`}
      ${range('Titular', 'ts', 0.6, 1.4, 0.02, '×')}
      <p class="help">Haz clic en cualquier elemento de la lámina (titular, texto, línea, firma…) para seleccionarlo: se arrastra para moverlo y su esquina cambia el tamaño; aquí arriba eliges letra, grosor y cursiva.</p>
      ${Object.keys(s.move || {}).length || Object.keys(s.fx || {}).length || Object.keys(s.layer || {}).length ? '<button type="button" class="btn sm ghost" id="reset-moves">Devolver todo a su lugar y estilo</button>' : ''}
    </section>

    <section class="sec">
      <h3 class="sec-title">Foto</h3>
      ${photoStatus()}
      ${field('Escena de la foto', 'photo', 'textarea', 3, 'Qué pasa en la foto y por qué cuenta el titular: quién hace qué, dónde, con qué objeto. Una persona aprobada de la marca solo si su acción explica la idea.')}
      ${field('Prompt para generar (inglés)', 'photoPrompt', 'textarea', 4, 'Es lo que se envía al motor de imagen al generar o regenerar. Si lo dejas vacío, se arma desde la escena.')}
      ${s.image && s.motor ? `<p class="help">Foto actual hecha con ${esc(motorLabel(s.motor, s.tamano))}.</p>` : ''}
      ${s.photo || s.photoPrompt || isFull(p) ? motorPicker('editor', editorMotor(), !!state.egen) : ''}
      <div class="form-actions">
        <button type="button" class="btn sm ghost" id="copy-prompt">Copiar prompt</button>
        ${s.photo || s.photoPrompt || isFull(p) ? `<button type="button" class="btn sm" id="regen-one" ${state.egen || !motorReady(editorMotor()) ? 'disabled' : ''}>${state.egen?.index === state.sel && state.egen?.projectId === p.id ? (state.egen.status || 'Generando…') : editorMotor().motor === 'hf_soul' ? (s.image ? 'Regenerar foto con Soul' : 'Generar foto con Soul') : realPerson(p.brand, s) ? (s.image ? 'Regenerar escena con tu foto real' : 'Crear escena con tu foto real') : isFull(p) ? (s.image ? 'Regenerar lámina completa' : 'Generar lámina completa') : s.image ? 'Regenerar foto' : 'Generar foto'}</button>` : ''}
      </div>
      ${s.photo || s.photoPrompt ? `<p class="help">${usdLabel(motorUsd(editorMotor().motor, editorMotor().tamano))}. Usa el prompt de arriba${peopleIn(p.brand, `${s.photo} ${s.photoPrompt}`).map((id) => ` y la cara de ${esc(personName(p.brand, id))}`).join('')}; la foto actual queda guardada.</p>` : ''}
      ${s.prevImage ? `<button type="button" class="btn sm ghost" id="undo-photo">Volver a la foto anterior</button>` : ''}
      ${imgSlot('image', 'Foto', s.image)}
      ${s.image ? `<p class="help">Arrastra la foto en la lámina (en una zona sin texto) para moverla; doble clic la centra. Foto y recorte se mueven juntos.</p>`
        + range('Horizontal', 'dx', -100, 100, 1, '%') + range('Vertical', 'dy', -100, 100, 1, '%') + range('Zoom', 'iz', s.full ? 0.5 : 1, 2.5, 0.02, '×')
        + `<details class="fine"><summary>Encuadre dentro de la foto</summary>${range('Recorte horizontal', 'ix', 0, 100, 1, '%')}${range('Recorte vertical', 'iy', 0, 100, 1, '%')}</details>` : ''}
      ${s.image ? imgSlot('cutout', 'Recorte', s.cutout, 'La misma foto sin fondo (PNG). Se pone encima del titular para que las letras queden detrás de la persona u objeto. Revisa que la palabra clave se siga leyendo.') : ''}
      ${s.image && !s.cutout ? '<button type="button" class="btn sm" id="auto-cut">Recorte automático</button><p class="help">Con el recorte puedes poner la persona delante o detrás del texto.</p>' : ''}
      ${s.image && s.cutout ? `<span class="lbl">Persona y texto</span><div class="seg" role="group" aria-label="Persona y texto">
        <button type="button" data-layer-all="back">Persona delante de todo</button>
        <button type="button" data-layer-all="front">Texto delante de todo</button>
        <button type="button" data-layer-all="diseno">Como el diseño</button></div>
        <p class="help">Para un solo elemento, selecciónalo en la lámina y elige su capa arriba.</p>` : ''}
      ${basePhotoPicker(p, s)}
      <div class="checks">
        <label><input type="checkbox" data-c="bw" ${s.bw ? 'checked' : ''}> Blanco y negro</label>
        ${s.image && !s.soul && (s.full || isFull(p)) ? `<label title="Apagado: muestra la foto con la plantilla y el texto editable encima"><input type="checkbox" data-c="full" ${s.full ? 'checked' : ''}> Lámina completa (texto dentro de la imagen)</label>` : ''}
      </div>
    </section>

    <section class="sec caption-box">
      <h3 class="sec-title">Caption del post</h3>
      <textarea id="p-caption" class="inp" rows="6">${esc(p.caption)}</textarea>
      <button type="button" class="btn sm ghost" id="copy-caption">Copiar caption</button>
    </section>`;
}

function bindInspector() {
  const ins = $('#inspector');
  ins.addEventListener('input', (e) => {
    const t = e.target;
    const s = cur();
    if (t.dataset.lf && t.dataset.lf !== 'upper' && s.layers) {
      s.layers.texts[+t.closest('[data-li]').dataset.li][t.dataset.lf] = t.value;
      refreshSlide();
      return;
    }
    if (t.dataset.bf === 'text') {
      const bi = +t.closest('[data-bi]').dataset.bi;
      s.blocks[bi].text = t.value;
      refreshSlide();
      return;
    }
    if (t.dataset.fx && state.part) {
      const v = t.dataset.fx === 'scale' ? parseFloat(t.value) : t.value;
      const fx = { ...(s.fx?.[state.part] || {}), [t.dataset.fx]: v };
      if (!v || v === 1) delete fx[t.dataset.fx];
      s.fx = { ...(s.fx || {}), [state.part]: fx };
      if (t.dataset.fx === 'scale') t.nextElementSibling.textContent = v + '×';
      refreshSlide();
      return;
    }
    if (t.dataset.k) {
      const k = t.dataset.k;
      s[k] = Array.isArray(s[k]) ? t.value.split('\n') : t.value;
      refreshSlide();
    } else if (t.dataset.r) {
      s[t.dataset.r] = parseFloat(t.value);
      t.nextElementSibling.textContent = t.value + (t.dataset.r === 'iz' ? '×' : '%');
      refreshSlide();
    } else if (t.id === 'p-caption') {
      state.p.caption = t.value;
      scheduleSave();
    }
  });
  ins.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'ly-orig' && cur().layers) { cur().layers.on = !t.checked; state.part = null; refreshSlide(); renderInspector(); return; }
    if (t.dataset.lf === 'upper' && cur().layers) { cur().layers.texts[+t.closest('[data-li]').dataset.li].upper = t.checked; refreshSlide(); return; }
    if (t.dataset.c) { cur()[t.dataset.c] = t.checked; refreshSlide(); }
    if (t.id === 'base-photo') { cur().basePhoto = t.value; scheduleSave(); renderInspector(); }
    if (t.id === 'outfit') { cur().outfit = t.value; scheduleSave(); renderInspector(); }
    if (t.dataset.bf && t.dataset.bf !== 'text') {
      const b = cur().blocks[+t.closest('[data-bi]').dataset.bi];
      if (t.dataset.bf === 'ancho') b.ancho = t.checked ? 'medio' : ''; else b[t.dataset.bf] = t.value;
      refreshSlide(); renderInspector();
    }
    if (t.id === 'blk-template' && t.value) {
      const s = cur();
      const hasText = (s.blocks || []).some((b) => String(b.text || '').trim());
      if (!hasText || confirm('Se reemplazan los bloques de esta lámina por los de la plantilla (con textos de ejemplo). ¿Continuar?')) {
        Object.assign(s, { blocks: newBlocks(t.value), template: t.value, move: {}, fx: {}, layer: {} });
        state.part = null;
        refreshSlide();
      }
      renderInspector();
    }
    if (t.dataset.motor === 'editor' || t.dataset.tamano === 'editor') {
      const motor = $('#editor-motor').value;
      state.emotor = { projectId: state.p.id, motor, tamano: sizeFor(motor, $('#editor-tamano')?.value) };
      renderInspector();
    }
    if (t.dataset.upload && t.files[0]) {
      const slot = t.dataset.upload;
      uploadFile(t.files[0]).then((url) => setImage(url, slot)).catch(() => {});
    }
  });
  ins.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = cur();
    if (b.dataset.bmove || b.dataset.bdel !== undefined) {
      const i = +b.closest('[data-bi]').dataset.bi;
      if (b.dataset.bdel !== undefined) s.blocks.splice(i, 1);
      else { const j = i + +b.dataset.bmove; if (j >= 0 && j < s.blocks.length) [s.blocks[i], s.blocks[j]] = [s.blocks[j], s.blocks[i]]; }
      refreshSlide(); renderInspector(); return;
    }
    if (b.id === 'ly-make' || b.id === 'ly-redo') { makeLayersInEditor(state.sel); return; }
    if (b.id === 'ly-add' && s.layers) {
      const br = brandFor(state.p);
      s.layers.texts.push({ id: 't' + Date.now().toString(36), text: 'Texto nuevo', box: [0.1, 0.44, 0.8, 0.07], color: '#FFFFFF', accent: br.colors?.accent || '#FFFFFF',
        font: br.fonts?.display || 'Anton', weight: 800, italic: false, upper: true, align: 'center', spacing: 'normal', behind: false, effect: 'shadow' });
      refreshSlide(); renderInspector(); return;
    }
    if (b.dataset.ldel !== undefined && s.layers) {
      const [t] = s.layers.texts.splice(+b.dataset.ldel, 1);
      if (state.part === 'l:' + t.id) state.part = null;
      refreshSlide(); renderInspector(); return;
    }
    if (b.id === 'ly-cut' && s.layers) {
      b.disabled = true; b.textContent = 'Recortando…';
      api('/api/cutout', { url: s.layers.plate })
        .then((r) => { s.layers.cutout = r.cutout; refreshSlide(); renderInspector(); toast('Recorte listo: ya puedes poner texto detrás de la persona.'); })
        .catch((err) => { toast(err.message, true); b.disabled = false; b.textContent = 'Recortar persona'; });
      return;
    }
    if (b.id === 'blk-add') { (s.blocks ||= []).push({ ...bk('sans', 'Texto nuevo'), id: uid() }); refreshSlide(); renderInspector(); return; }
    if (b.id === 'reset-moves') { s.move = {}; s.fx = {}; s.layer = {}; refreshSlide(); renderInspector(); return; }
    if (b.id === 'fx-reset' && state.part) {
      const m = { ...(s.move || {}) }, f = { ...(s.fx || {}) }, l = { ...(s.layer || {}) };
      delete m[state.part]; delete f[state.part]; delete l[state.part];
      Object.assign(s, { move: m, fx: f, layer: l });
      refreshSlide(); renderInspector(); return;
    }
    if (b.dataset.layer && state.part) { s.layer = { ...(s.layer || {}), [state.part]: b.dataset.layer }; refreshSlide(); renderInspector(); return; }
    if (b.dataset.layerAll) {
      // Todo el texto delante o detrás de la persona; "diseño" vuelve a lo de siempre
      s.layer = b.dataset.layerAll === 'diseno' ? {} : Object.fromEntries(MOVABLE.map(([k]) => [k, b.dataset.layerAll]));
      refreshSlide(); renderInspector(); return;
    }
    if (b.id === 'fx-done') { state.part = null; renderStage(); renderInspector(); return; }
    if (b.dataset.layout) { s.layout = b.dataset.layout; if (s.layout === 'bloques' && !(s.blocks || []).length) s.blocks = blocksFromFields(s); refreshSlide(); renderInspector(); }
    else if (b.dataset.theme) { s.theme = b.dataset.theme; refreshSlide(); renderInspector(); }
    else if (b.dataset.pick) openAssets(b.dataset.pick);
    else if (b.dataset.clear) { s[b.dataset.clear] = ''; if (b.dataset.clear === 'image') s.cutout = ''; refreshSlide(); renderInspector(); }
    else if (b.dataset.goto) select(+b.dataset.goto);
    else if (b.id === 'copy-prompt') copyText(promptFor(s), 'Prompt copiado');
    else if (b.id === 'regen-one' || b.id === 'regen-outfit') regenerateInEditor(state.sel);
    else if (b.id === 'undo-photo') {
      // Intercambia foto actual y anterior, así también se puede volver a la nueva
      [s.image, s.prevImage] = [s.prevImage, s.image];
      [s.cutout, s.prevCutout] = [s.prevCutout || '', s.cutout || ''];
      refreshSlide();
      renderInspector();
    }
    else if (b.id === 'auto-cut') {
      b.disabled = true;
      b.textContent = 'Recortando…';
      api('/api/cutout', { url: s.image })
        .then((r) => { setImage(r.cutout, 'cutout'); toast('Recorte listo: la persona queda delante del titular.'); })
        .catch((err) => { toast(err.message, true); b.disabled = false; b.textContent = 'Recorte automático'; });
    }
    else if (b.id === 'copy-caption') copyText(state.p.caption, 'Caption copiado');
  });
}

// Espacio para una imagen (foto principal o recorte)
function imgSlot(slot, label, url, help = '') {
  return `<div>
    <span class="lbl">${label}</span>
    <div class="img-box">
      <div class="img-prev" style="${url ? `background-image:url('${esc(url)}')` : ''}">${url ? '' : 'Vacío'}</div>
      <div class="img-actions">
        <button type="button" class="btn sm" data-pick="${slot}">Biblioteca</button>
        <label class="btn sm">Subir<input type="file" data-upload="${slot}" accept="image/*" hidden></label>
        ${url ? `<button type="button" class="btn sm ghost danger" data-clear="${slot}">Quitar</button>` : ''}
      </div>
    </div>
    ${help ? `<p class="help" style="margin-top:6px">${help}</p>` : ''}
  </div>`;
}

// Cuántas láminas tienen foto. La regla: al menos 5 de 7, nunca dos tipográficas seguidas.
function photoStatus() {
  const sl = state.p.slides;
  const withPhoto = sl.filter((x) => x.image || x.photo).length;
  const need = Math.ceil(sl.length * 5 / 7);
  const missing = sl.map((x, i) => (x.image ? null : i)).filter((i) => i !== null);
  const ok = withPhoto >= need;
  return `<div class="photo-status ${ok ? 'ok' : 'low'}">
    <b>${withPhoto} de ${sl.length} láminas con foto</b> · ${ok ? 'cumple la regla' : `faltan ${need - withPhoto} para llegar a ${need}`}
    ${missing.length ? `<div class="missing">Sin imagen todavía: ${missing.map((i) => `<button type="button" data-goto="${i}">${i + 1}</button>`).join('')}</div>` : ''}
  </div>`;
}

function promptFor(s, brand = state.p.brand) {
  if (s.photoPrompt?.trim()) return s.photoPrompt.trim();
  const scene = s.photo?.trim() || `A scene that shows this idea: ${String(s.title || s.numberLabel || '').replace(/\*/g, '')}`;
  return `${scene}. ${brandOf(brand).look || ''}. Vertical 4:5 composition with empty space for a large headline. Hyperrealistic, natural skin texture, real pores, natural hands, no text, no logos, no watermark.`;
}

// Motor elegido en el Editor para este proyecto (si no se tocó, el de la marca)
const editorMotor = () => (state.emotor?.projectId === state.p?.id ? state.emotor : brandMotor(state.p?.brand));

// Regenera la foto de una lámina desde el Editor con el motor elegido
async function regenerateInEditor(i) {
  const p = state.p, s = p.slides[i];
  clearTimeout(state.saveTimer);
  if (await saveProject() === false) return;                    // el servidor escribe la foto nueva sobre el proyecto guardado
  try {
    const r = await api('/api/generate', {
      projectId: p.id, ...editorMotor(),
      items: [{ index: i, prompt: promptFor(s, p.brand), people: peopleIn(p.brand, `${s.photo} ${s.photoPrompt}`), photo: s.photo, photoPrompt: s.photoPrompt,
        slide: slidePayload(s), count: `${i + 1}/${p.slides.length}` }],
    });
    state.egen = { id: r.id, index: i, projectId: p.id };
    renderInspector();
    toast('Generando la foto nueva… puedes seguir editando.');
    pollEditorGen();
  } catch (e) { toast(e.message, true); }
}

async function pollEditorGen() {
  const g = state.egen;
  if (!g) return;
  try {
    const job = await api('/api/generate?id=' + encodeURIComponent(g.id));
    if (!job.done) {
      // Muestra en el botón si está generando, revisando o corrigiendo (lámina completa)
      const st = job.items[0]?.status;
      g.status = /revisando/.test(st) ? 'Claude revisando…' : /corrigiendo/.test(st) ? 'Corrigiendo errores…' : 'Generando…';
      if (state.sel === g.index) $$('#regen-one, #regen-outfit').forEach((btn) => { btn.textContent = g.status; });
      setTimeout(pollEditorGen, 3000);
      return;
    }
    const x = job.items[0] || {};
    state.egen = null;
    if (x.status === 'completed' && state.p?.id === g.projectId) {
      const s = state.p.slides[g.index];
      if (s.image) Object.assign(s, { prevImage: s.image, prevCutout: s.cutout || '' });
      Object.assign(s, { image: x.url, cutout: x.cutout || '', ix: 50, iy: x.full ? 50 : 30, iz: 1, dx: 0, dy: 0, full: !!x.full, soul: !!x.soul, qa: x.qa || '', motor: x.motor || '', tamano: x.tamano || '', layers: x.layers || null, move: dropLayerKeys(s.move), fx: dropLayerKeys(s.fx), layer: dropLayerKeys(s.layer) });
      renderThumb(g.index);
      if (state.sel === g.index) renderStage();
      scheduleSave();
      toast(`Foto nueva en la lámina ${g.index + 1}. Si no te gusta, usa "Volver a la foto anterior".`);
    } else if (x.status !== 'completed') toast(`La foto de la lámina ${g.index + 1} falló: ${x.error || 'sin detalle'}`, true);
    if (state.view === 'editor') renderInspector();
  } catch (e) {
    state.egen = null;
    toast(e.message, true);
    if (state.view === 'editor') renderInspector();
  }
}

function setImage(url, slot = 'image') {
  const s = cur();
  s[slot] = url;
  if (slot === 'image') Object.assign(s, { ix: 50, iy: 30, iz: 1, dx: 0, dy: 0 });
  refreshSlide();
  renderInspector();
}

async function copyText(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); } catch { toast('No se pudo copiar. Selecciona el texto manualmente.', true); }
}

// ---------------------------------------------------------------- imágenes
function readAsDataUrl(file) {
  return new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => fail(r.error);
    r.readAsDataURL(file);
  });
}
async function uploadFile(file) {
  try {
    const dataUrl = await readAsDataUrl(file);
    const r = await api('/api/upload', { name: file.name, dataUrl });
    state.assets = [];
    toast('Imagen subida');
    return r.url;
  } catch (e) {
    toast('No se pudo subir la imagen: ' + e.message, true);
    throw e;
  }
}

async function openAssets(slot = 'image') {
  state.pickSlot = slot;
  const dlg = $('#dlg-assets');
  if (!state.assets.length) {
    try { state.assets = await api('/api/assets'); } catch (e) { toast(e.message, true); }
  }
  renderAssets();
  dlg.showModal();
  $('#asset-q').focus();
}
function renderAssets() {
  const q = $('#asset-q').value.trim().toLowerCase();
  const list = state.assets.filter((a) => !q || (a.name + ' ' + a.folder).toLowerCase().includes(q));
  const groups = {};
  list.forEach((a) => (groups[a.group] ||= []).push(a));
  $('#asset-grid').innerHTML = Object.keys(groups).length
    ? Object.entries(groups).map(([g, items]) => `<h4>${esc(g)} · ${items.length}</h4><div class="agrid">${items.map((a) =>
      `<button type="button" class="asset" data-url="${esc(a.url)}" title="${esc(a.folder + '/' + a.name)}"><img loading="lazy" src="${esc(a.url)}" alt=""><span>${esc(a.name)}</span></button>`).join('')}</div>`).join('')
    : '<p class="empty">Ningún archivo coincide con la búsqueda.</p>';
}

// ---------------------------------------------------------------- exportar
const fontCSS = {};                       // por marca: cada una tiene sus tipografías
async function renderForExport(i) {
  const host = $('#export-stage');
  const el = buildSlide(state.p, state.p.slides[i], i, state.p.slides.length);
  host.replaceChildren(el);
  await Promise.all($$('img', el).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }))));
  await document.fonts.ready;
  fitSlide(el);
  const fk = state.p.brand + '|' + [...new Set(state.p.slides.flatMap((x) => [...Object.values(x.fx || {}).map((f) => f.font), ...(x.layers?.on ? x.layers.texts.map((t) => t.font) : [])].filter(Boolean)))].sort().join(',');
  if (fontCSS[fk] === undefined) {
    try { fontCSS[fk] = await htmlToImage.getFontEmbedCSS(el); } catch (e) { console.warn('Fuentes sin incrustar', e); fontCSS[fk] = ''; }
  }
  const opts = { width: 1080, height: 1350, pixelRatio: parseFloat($('#exp-scale').value) || 1, fontEmbedCSS: fontCSS[fk] || undefined, cacheBust: false };
  // Safari a veces pinta el primer render sin imágenes: se descarta una pasada de calentamiento.
  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) await htmlToImage.toPng(el, opts);
  return htmlToImage.toPng(el, opts);
}

const exportFolder = () => `${brandOf(state.p.brand).file}_${slugify(state.p.name)}`;
let lastExportDir = '';

async function exportSlides(indices) {
  if (typeof htmlToImage === 'undefined') { toast('No cargó la librería de exportación. Revisa la conexión a internet.', true); return; }
  const dlg = $('#dlg-export');
  $('#exp-title').textContent = 'Exportando…';
  $('#exp-actions').hidden = true;
  $('#exp-bar').style.width = '0';
  $('#exp-msg').textContent = '';
  dlg.showModal();
  const folder = exportFolder();
  const missing = [];
  try {
    for (let n = 0; n < indices.length; n++) {
      const i = indices[n];
      const s = state.p.slides[i];
      if (!s.image && (s.layout === 'portada' || s.photo)) missing.push(i + 1);
      $('#exp-msg').textContent = `Lámina ${i + 1} de ${state.p.slides.length}`;
      const dataUrl = await renderForExport(i);
      const r = await api('/api/export', { folder, filename: `${brandOf(state.p.brand).file}_${pad(i + 1)}`, dataUrl });
      lastExportDir = r.path.split('/').slice(0, -1).join('/');
      $('#exp-bar').style.width = `${((n + 1) / indices.length) * 100}%`;
    }
    $('#exp-title').textContent = indices.length > 1 ? 'Carrusel exportado' : 'Lámina exportada';
    $('#exp-msg').innerHTML = `Guardado en <span class="mono">${esc(lastExportDir)}/</span>`
      + (missing.length ? `<br>Ojo: ${missing.length > 1 ? 'las láminas' : 'la lámina'} ${missing.join(', ')} ${missing.length > 1 ? 'tienen' : 'tiene'} el marcador de foto en lugar de una imagen.` : '');
    $('#exp-actions').hidden = false;
  } catch (e) {
    $('#exp-title').textContent = 'La exportación falló';
    $('#exp-msg').textContent = e.message || String(e);
    $('#exp-actions').hidden = false;
  } finally {
    $('#export-stage').replaceChildren();
  }
}

// ---------------------------------------------------------------- proyectos
async function openProject(id) {
  try {
    state.p = normalizeProject(await api('/api/projects?id=' + encodeURIComponent(id)));
    state.sel = 0;
    store.set('lastProject', state.p.id);
    showView('editor');
    renderEditor();
    $('#save-state').textContent = 'Abierto';
  } catch (e) { toast(e.message, true); }
}

async function openProjectsDialog() {
  const dlg = $('#dlg-projects');
  let list = [];
  try { list = await api('/api/projects'); } catch (e) { toast(e.message, true); }
  $('#proj-list').innerHTML = list.length ? list.map((p) => `
    <button type="button" class="proj-item" data-id="${esc(p.id)}">
      <b>${esc(p.name || 'Sin nombre')}</b><span>${esc(BRANDS[p.brand]?.name || p.brand)}</span>
      <span>${p.slides} láminas</span><span>${p.updatedAt ? new Date(p.updatedAt).toLocaleString('es') : ''}</span>
    </button>`).join('') : '<p class="empty" style="padding:16px">Todavía no hay proyectos guardados.</p>';
  dlg.showModal();
}

function newProject(brand = firstBrand(state.p?.brand), over = {}) {
  const p = normalizeProject({
    id: 'p' + Date.now(), brand, name: 'Nuevo carrusel', caption: '',
    slides: [
      blankSlide('portada', brand, { title: 'Titular con *gancho*' }),
      blankSlide('frase', brand, { theme: 'light', title: 'Una idea por lámina' }),
      blankSlide('cta', brand, { title: 'Llamado a la acción', cta: brandOf(brand).defaults?.cta || '' }),
    ],
    ...over,
  });
  state.p = p;
  state.sel = 0;
  showView('editor');
  renderEditor();
  scheduleSave();
}

// Estructura base desde un brief, sin IA
function skeletonFromBrief(b) {
  const n = parseInt(b.laminas, 10) || 7;
  const middle = ['frase', 'cifra', 'comparar', 'lista', 'frase', 'cifra', 'lista', 'frase'];
  const slides = [blankSlide('portada', b.marca, { title: b.tema, photo: 'Cara humana relacionada con el tema' })];
  for (let i = 0; i < n - 2; i++) slides.push(blankSlide(middle[i % middle.length], b.marca, { theme: brandOf(b.marca).theme === 'light' || i % 2 === 0 ? 'light' : 'dark', title: 'Idea ' + (i + 1) }));
  slides.push(blankSlide('cta', b.marca, { title: b.cta || brandOf(b.marca).defaults?.cta || '', cta: b.cta }));
  return slides;
}

// ---------------------------------------------------------------- solicitudes
const STATUS = { pendiente: 'Pendiente', produccion: 'En producción', entregado: 'Entregado' };
const NEXT = { pendiente: 'produccion', produccion: 'entregado', entregado: 'pendiente' };
let reqBrand = 'eva';                     // se corrige a una marca existente al cargar

function fillBriefDefaults(brand, prev) {
  const d = brandOf(brand).defaults || {}, old = prev ? brandOf(prev).defaults || {} : {};
  [['r-audiencia', 'audiencia'], ['r-cta', 'cta']].forEach(([id, k]) => {
    const el = $('#' + id);
    if (!el.value || el.value === old[k]) el.value = d[k];
  });
  if (d.idioma) $('#r-idioma').value = d.idioma;
  if (d.objetivo) $('#r-objetivo').value = d.objetivo;
}

function readBrief() {
  return {
    marca: reqBrand, formato: 'Carrusel', tema: $('#r-tema').value.trim(), objetivo: $('#r-objetivo').value,
    laminas: $('#r-laminas').value, audiencia: $('#r-audiencia').value.trim(), idioma: $('#r-idioma').value,
    cta: $('#r-cta').value.trim(), entrega: $('#r-entrega').value, referencias: $('#r-referencias').value.trim(),
    notas: $('#r-notas').value.trim(), solicitante: $('#r-solicitante').value.trim(),
  };
}

function briefText(b) {
  return `Marca: ${BRANDS[b.marca]?.name || b.marca}\nFormato: ${b.formato} (${b.laminas} láminas)\nTema/oferta: ${b.tema}\nObjetivo: ${b.objetivo}\nAudiencia: ${b.audiencia}\nIdioma: ${b.idioma}\nCTA: ${b.cta}\nReferencias nuevas: ${b.referencias}${b.notas ? '\nNotas: ' + b.notas : ''}`;
}

async function loadRequests() {
  try { state.requests = await api('/api/requests'); } catch (e) { toast(e.message, true); }
  renderRequests();
}

function renderRequests() {
  const open = state.requests.filter((r) => r.status !== 'entregado').length;
  $('#req-count').textContent = open ? open : '';
  $('#req-list').innerHTML = state.requests.length ? state.requests.map((r) => {
    const b = r.brief || {};
    return `<article class="req st-${r.status}" data-id="${esc(r.id)}">
      <h3>${esc(b.tema || 'Sin tema')}</h3>
      <button type="button" class="pill ${r.status}" data-act="status" title="Cambiar estado">${STATUS[r.status] || r.status}</button>
      <div class="meta"><span>${esc(BRANDS[b.marca]?.name || b.marca)}</span><span>${esc(b.laminas)} láminas</span><span>${esc(b.idioma)}</span>
        ${b.entrega ? `<span>Entrega ${esc(b.entrega)}</span>` : ''}${b.solicitante ? `<span>${esc(b.solicitante)}</span>` : ''}</div>
      <div class="acts">
        ${r.projectId ? '<button type="button" class="btn sm" data-act="open">Abrir carrusel</button>' : '<button type="button" class="btn sm" data-act="skeleton">Crear carrusel</button>'}
        <button type="button" class="btn sm ghost" data-act="draft" ${state.hasKey ? '' : 'disabled title="Agrega la API key en Ajustes"'}>Borrador IA</button>
        <button type="button" class="btn sm ghost" data-act="copy">Copiar brief</button>
      </div>
    </article>`;
  }).join('') : '<p class="empty">No hay solicitudes todavía. La primera que guardes aparece aquí.</p>';
}

async function saveRequest(r) {
  const saved = await api('/api/requests', r);
  const i = state.requests.findIndex((x) => x.id === saved.id);
  if (i >= 0) state.requests[i] = saved; else state.requests.unshift(saved);
  renderRequests();
  return saved;
}

async function draftFromRequest(r, btn) {
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = 'Claude está escribiendo…'; }
  $('#draft-hint').textContent = 'Esto tarda entre 30 segundos y un par de minutos.';
  try {
    const d = await api('/api/draft', { brief: r.brief });
    const p = normalizeProject({
      id: 'p' + Date.now(), brand: r.brief.marca, name: d.name || r.brief.tema, caption: d.caption || '', requestId: r.id,
      slides: (d.slides || []).map((s) => ({ ...s, image: '', bw: !!s.bw })),
    });
    state.p = p;
    state.sel = 0;
    if (await saveProject() === false) return;
    r.projectId = p.id;
    r.status = 'produccion';
    await saveRequest(r);
    showView('editor');
    renderEditor();
    toast('Borrador listo. Revisa las cifras y sus fuentes antes de publicar.');
  } catch (e) {
    toast(e.message, true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
    $('#draft-hint').textContent = '';
  }
}

// ---------------------------------------------------------------- entregas
async function loadDeliveries() {
  let list = [];
  try { list = await api('/api/deliveries'); } catch (e) { toast(e.message, true); }
  state.deliveries = list;
  $('#deliv-list').innerHTML = list.length ? list.map((d, di) => `
    <section class="deliv">
      <h3>${esc(d.folder)} <span class="mono">${d.images.length} imágenes · ${new Date(d.updatedAt).toLocaleDateString('es')}</span>
        <button type="button" class="btn sm accent" data-dl-all="${di}">Descargar .zip</button></h3>
      <div class="deliv-row">${d.images.map((u, ii) => `<figure class="deliv-img"><a href="${esc(u)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(u)}" alt=""></a>
        <button type="button" class="deliv-dl" data-dl="${di}:${ii}" title="Descargar esta imagen" aria-label="Descargar imagen ${ii + 1}">↓</button></figure>`).join('')}</div>
    </section>`).join('') : '<p class="empty">Aún no hay entregas.</p>';
}

// ---------------------------------------------------------------- descargar entregas
// ZIP sin compresión, armado en el navegador (las PNG ya vienen comprimidas): una entrega = un archivo .zip
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(files) {
  const enc = new TextEncoder(), now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, size, 4], [22, size, 4], [26, name.length, 2], [28, 0, 2]]
      .forEach(([o, v, n]) => (n === 4 ? h.setUint32(o, v, true) : h.setUint16(o, v, true)));
    const c = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, size, 4], [24, size, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
      .forEach(([o, v, n]) => (n === 4 ? c.setUint32(o, v, true) : c.setUint16(o, v, true)));
    parts.push(h, name, f.data);
    central.push(c, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((n, x) => n + x.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, cdSize, 4], [16, offset, 4], [20, 0, 2]]
    .forEach(([o, v, n]) => (n === 4 ? end.setUint32(o, v, true) : end.setUint16(o, v, true)));
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
const extOf = (type) => (/jpe?g/.test(type) ? '.jpg' : /webp/.test(type) ? '.webp' : '.png');
async function fetchImage(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo descargar una imagen.');
  return r.blob();
}
// Una imagen: con su nombre de entrega (MARCA_proyecto_01.png)
async function downloadDeliveryImage(di, ii) {
  const d = state.deliveries[di];
  try { const b = await fetchImage(d.images[ii]); saveBlob(b, `${d.folder}_${pad(ii + 1)}${extOf(b.type)}`); } catch (e) { toast(e.message, true); }
}
// Toda la entrega en un .zip
async function downloadDelivery(di, btn) {
  const d = state.deliveries[di];
  const label = btn.textContent;
  btn.disabled = true;
  try {
    const files = [];
    for (const [i, url] of d.images.entries()) {
      btn.textContent = `Descargando ${i + 1}/${d.images.length}…`;
      const b = await fetchImage(url);
      files.push({ name: `${d.folder}_${pad(i + 1)}${extOf(b.type)}`, data: new Uint8Array(await b.arrayBuffer()) });
    }
    saveBlob(makeZip(files), `${d.folder}.zip`);
    toast(`${d.folder}.zip descargado.`);
  } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.textContent = label; }
}

async function openFolder(path) {
  try { await api('/api/open', { path }); } catch (e) { toast(e.message, true); }
}

// ---------------------------------------------------------------- crear: idea → propuesta → costo → aprobación
// El borrador vive en state.draft y se recuerda en este navegador hasta aprobarlo.
let ideaBrand = 'eva';                    // se corrige a una marca existente al cargar
const saveDraft = () => store.set('draft', JSON.stringify(state.draft || null));

function loadDraft() {
  try { state.draft = JSON.parse(store.get('draft') || 'null'); } catch { state.draft = null; }
  if (state.draft?.gen && !state.draft.gen.done) pollGeneration();
}

function setStep(step) {
  $('#st-idea').hidden = step !== 'idea';
  $('#st-prop').hidden = step === 'idea';
  const order = ['idea', 'prop', 'cost'];
  const at = step === 'idea' ? 0 : 2;
  $$('#steps li').forEach((li) => {
    const k = order.indexOf(li.dataset.step);
    li.classList.toggle('on', step === 'idea' ? k === 0 : k >= 1);
    li.classList.toggle('done', k < at && step !== 'idea');
  });
}

function renderCreate() {
  $('#idea-nokey').hidden = state.hasKey;
  $('#btn-propose').disabled = !state.hasKey;
  if (!state.draft?.slides) { setStep('idea'); return; }
  setStep('prop');
  renderProposal();
  renderCost();
}

function readIdea() {
  const d = brandOf(ideaBrand).defaults || {};
  return {
    marca: ideaBrand, idea: $('#i-idea').value.trim(), laminas: $('#i-laminas').value, modo: $('#i-modo').value,
    cta: $('#i-cta').value.trim() || d.cta, notas: $('#i-notas').value.trim(),
    objetivo: d.objetivo, audiencia: d.audiencia, idioma: d.idioma,
  };
}

async function propose(brief, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Claude está escribiendo…';
  $('#idea-hint').textContent = 'Tarda entre 30 segundos y un par de minutos.';
  try {
    const d = await api('/api/propose', brief);
    const spent = (state.draft?.claudeUsd || 0) + (d.usage?.usd || 0);
    state.draft = {
      brief, brand: brief.marca, modo: brief.modo || (fullMode(brief.marca) ? 'editable' : 'foto'), name: d.name || brief.idea.slice(0, 60), concept: d.concept || '', caption: d.caption || '', visualSystem: d.visualSystem || '', avoid: d.avoid || '',
      slides: (d.slides || []).map((s) => ({ ...s, gen: isFull({ modo: brief.modo, brand: brief.marca }) || !!(s.photoPrompt || s.photo), people: peopleIn(brief.marca, `${s.photo} ${s.photoPrompt}`) })),
      research: d.research || '', missingModels: d.missingModels || [], usage: d.usage, claudeUsd: spent, calls: (state.draft?.calls || 0) + 1,
    };
    saveDraft();
    renderCreate();
    toast('Propuesta lista. Edítala y revisa el costo antes de aprobar.');
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = !state.hasKey;
    btn.textContent = label;
    $('#idea-hint').textContent = '';
  }
}

const opt = (v, cur, label = v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;

function pfield(i, label, key, rows = 0, full = false) {
  const s = state.draft.slides[i];
  const val = Array.isArray(s[key]) ? s[key].join('\n') : (s[key] ?? '');
  const id = `d-${i}-${key}`;
  // Tras aprobar, los textos se editan en el Editor; aquí solo la foto, y no mientras se genera.
  const g = state.draft.gen;
  const ro = g && (!['photo', 'photoPrompt'].includes(key) || !g.done) ? 'readonly' : '';
  const ctl = rows
    ? `<textarea id="${id}" class="inp" rows="${rows}" data-i="${i}" data-k="${key}" ${ro}>${esc(val)}</textarea>`
    : `<input id="${id}" class="inp" type="text" data-i="${i}" data-k="${key}" value="${esc(val)}" ${ro}>`;
  return `<div class="${full ? 'full' : ''}"><label class="lbl" for="${id}">${label}</label>${ctl}</div>`;
}

// Personas de una lámina de la propuesta (las propuestas guardadas antes de 06_MARCAS traían janica: true)
const slidePeople = (s) => s.people || (s.janica ? ['janica'] : []);

function propCard(s, i) {
  withBlockIds(s);
  const g = state.draft.gen;
  const locked = !!g;                    // textos y diseño se editan en el Editor después de aprobar
  const busy = g && !g.done;             // mientras genera, nada de la foto se toca
  const st = g?.items.find((x) => x.index === i)?.status;
  const running = busy && st && !['completed', 'failed'].includes(st);
  const L = s.layout;
  const specific = {
    cifra: pfield(i, 'Cifra', 'number') + pfield(i, 'Texto bajo la cifra', 'numberLabel'),
    lista: pfield(i, 'Puntos (uno por línea)', 'items', 4, true),
    comparar: pfield(i, 'Columna A', 'leftLabel') + pfield(i, 'Columna B', 'rightLabel')
      + pfield(i, 'Puntos A (uno por línea)', 'leftItems', 3) + pfield(i, 'Puntos B (uno por línea)', 'rightItems', 3),
    cta: pfield(i, 'Botón / llamado', 'cta', 0, true),
  }[L] || '';
  const img = state.p && state.draft.projectId === state.p.id ? state.p.slides[i]?.image : '';
  return `<li class="pcard ${s.gen ? '' : 'off'}" data-i="${i}">
    <span class="num">${pad(i + 1)}</span>
    <div class="pc-top">
      <select class="inp sm" data-i="${i}" data-k="layout" aria-label="Diseño lámina ${i + 1}" ${locked ? 'disabled' : ''}>${Object.entries(LAYOUTS).map(([k, l]) => opt(k, L, l.label)).join('')}</select>
      <select class="inp sm" data-i="${i}" data-k="theme" aria-label="Fondo lámina ${i + 1}" ${locked ? 'disabled' : ''}>${opt('dark', s.theme, 'Oscuro')}${opt('light', s.theme, 'Claro')}</select>
      ${img ? `<img class="thumb-img" src="${esc(img)}" alt="Foto generada lámina ${i + 1}">` : ''}
    </div>
    <div>
      <div class="pc-body">
        ${L === 'bloques' ? `<p class="help">Plantilla: ${esc(BLOCK_TEMPLATES[s.template]?.name || 'libre')}. Zona y estilo se ajustan en el Editor.</p>${(s.blocks || []).filter((b) => !['linea', 'firma'].includes(b.style)).map((b) => `<label class="lbl">${esc(BLOCK_STYLES[b.style] || b.style)} · ${esc(BLOCK_ZONES[b.zone] || '')}</label><textarea class="inp" rows="2" data-i="${i}" data-bid="${esc(b.id)}" ${locked ? 'readonly' : ''}>${esc(b.text || '')}</textarea>`).join('')}` : `${pfield(i, 'Antetítulo', 'kicker')}
        ${L !== 'cifra' ? pfield(i, 'Titular (*acento*)', 'title', 2) : ''}
        ${specific}
        ${pfield(i, 'Texto de apoyo', 'body', 2, true)}
        ${pfield(i, 'Fuente del dato (visible en la lámina)', 'source', 0, true)}`}
      </div>
      <div class="pc-photo">
        <div class="checks">
          <label><input type="checkbox" data-i="${i}" data-c="gen" ${s.gen ? 'checked' : ''} ${busy ? 'disabled' : ''}> Generar foto</label>
          ${s.gen ? (brandOf(state.draft.brand).people || []).map((pp) => `<label><input type="checkbox" data-i="${i}" data-person="${esc(pp.id)}" ${slidePeople(s).includes(pp.id) ? 'checked' : ''} ${busy ? 'disabled' : ''}> Usar la cara de ${esc(pp.name)}</label>`).join('') : ''}
          ${s.gen && !locked ? `<label title="Color real por defecto; blanco y negro solo en 1 o 2 láminas"><input type="checkbox" data-i="${i}" data-c="bw" ${s.bw ? 'checked' : ''}> Blanco y negro</label>` : ''}
        </div>
        ${s.gen ? pfield(i, 'Escena de la foto', 'photo', 2, true) + `<details ${locked ? 'open' : ''}><summary>Prompt en inglés para el motor de imagen</summary>
          <textarea class="inp" rows="4" data-i="${i}" data-k="photoPrompt" aria-label="Prompt lámina ${i + 1}" ${busy ? 'readonly' : ''}>${esc(s.photoPrompt)}</textarea></details>` : ''}
        ${locked && s.gen ? `<div class="form-actions">
          <button type="button" class="btn sm" data-regen="${i}" ${busy || !motorReady(draftMotor()) ? 'disabled' : ''}>${running ? 'Generando…' : img ? 'Regenerar esta foto' : 'Generar esta foto'}</button>
          <span class="hint">${usdLabel(motorUsd(draftMotor().motor, draftMotor().tamano))} con ${esc(motorLabel(draftMotor().motor, draftMotor().tamano))}. Cambia la escena o el prompt antes si quieres otro resultado; la foto anterior queda guardada en el Editor.</span>
        </div>` : ''}
      </div>
    </div>
  </li>`;
}

function renderProposal() {
  const d = state.draft;
  $('#d-name').value = d.name || '';
  $('#d-concept').value = d.concept || '';
  $('#d-caption').value = d.caption || '';
  $('#d-visual').value = d.visualSystem || '';
  $('#d-avoid').value = d.avoid || '';
  $('#d-visual-box').hidden = !(d.visualSystem || d.avoid);
  $('#d-research-box').hidden = !d.research;
  const missing = d.missingModels || [];
  $('#d-missing').hidden = !missing.length;
  $('#d-missing').textContent = missing.length ? `Sin foto de referencia: ${missing.join(', ')}. Súbela en Marcas → Referencias visuales y márcala «Vehículo / producto»; si no, el motor dibuja el modelo de memoria y puede salir de otro año.` : '';
  $('#d-research').innerHTML = esc(d.research || '')
    .replace(/(https?:\/\/[^\s<)\]]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
  $('#prop-slides').innerHTML = d.slides.map(propCard).join('');
  const locked = !!d.gen;
  ['#d-name', '#d-concept', '#d-caption', '#d-visual', '#d-avoid'].forEach((s) => { $(s).readOnly = locked; });
  $('#btn-repropose').disabled = locked || !state.hasKey;
  $('#btn-back-idea').textContent = locked ? '+ Nueva idea' : '← Cambiar idea';
}

const money = (n) => '$' + (n < 0.1 ? n.toFixed(3) : n.toFixed(2));

// Motor elegido en Crear para este borrador (si no se tocó, el de la marca)
const draftMotor = () => {
  const d = state.draft;
  return d?.motor && motorInfo(d.motor) ? { motor: d.motor, tamano: sizeFor(d.motor, d.tamano) } : brandMotor(d?.brand);
};

function renderCost() {
  const d = state.draft;
  const sel = draftMotor();
  const per = motorUsd(sel.motor, sel.tamano);
  const photos = d.slides.filter((s) => s.gen && (s.photoPrompt || s.photo || isFull(d))).length;
  const withPeople = d.slides.filter((s) => s.gen && slidePeople(s).length).length;
  const imgUsd = photos * (state.cfg?.reservationPerImage || 2);
  const ready = motorReady(sel);
  const prov = motorInfo(sel.motor)?.proveedor || '';
  const u = d.usage || {};
  const g = d.gen;
  let genHtml = '';
  if (g) {
    const st = { completed: ['Lista', 'ok'], failed: ['Falló', 'bad'], queued: ['En cola', ''], in_progress: ['Generando…', ''], enviando: ['Enviando…', ''] };
    genHtml = `<div class="line"><b>${g.done ? 'Fotos terminadas' : 'Generando fotos…'}</b></div>
      <div class="bar"><span style="width:${(g.items.filter((x) => ['completed', 'failed'].includes(x.status)).length / g.items.length) * 100}%"></span></div>
      <ul class="gen-list">${g.items.map((x) => {
        const [lbl, cls] = st[x.status] || [x.status, ''];
        return `<li>Lámina ${x.index + 1}<span class="st ${cls}" title="${esc(x.error || '')}">${esc(x.error ? `${lbl}: ${x.error}` : lbl)}</span></li>`;
      }).join('')}</ul>
      ${g.done ? `<div class="form-actions"><button type="button" class="btn accent" id="btn-open-editor">Abrir en el editor</button>
        ${g.items.some((x) => x.status === 'failed') ? '<button type="button" class="btn ghost" id="btn-retry">Reintentar fallidas</button>' : ''}</div>
        ${photos ? `<div class="line"><b>¿No te gustó alguna?</b>
          <small>Cambia la escena o el prompt en la lámina y pulsa <b>Regenerar esta foto</b>, o regenera todas. Puedes cambiar de motor arriba antes de regenerar. La foto anterior queda guardada y puedes volver a ella en el Editor.</small></div>
        <button type="button" class="btn ghost" id="btn-regen-all" ${ready ? '' : 'disabled'}>Regenerar todas · ${photos} foto${photos === 1 ? '' : 's'}${imgUsd == null ? '' : ` ≈ ${money(imgUsd)}`}</button>` : ''}` : ''}`;
  }
  $('#cost-panel').innerHTML = `
    <h2>Presupuesto de generación</h2>
    ${photos ? motorPicker('crear', sel, !!(g && !g.done)) : ''}
    <div class="line"><b>Reserva · ${esc(prov)}</b><span class="v">${imgUsd == null ? '—' : money(imgUsd)}</span>
      <small>${photos} foto${photos === 1 ? '' : 's'} × ${usdLabel(per)} con ${esc(motorLabel(sel.motor, sel.tamano))}.${withPeople ? ` ${withPeople} con la cara de una persona aprobada como referencia.` : ''} Precio aproximado del proveedor. El Estudio reserva hasta US$2 por foto para controlar el presupuesto; una ejecución incierta conserva la reserva hasta revisarse.</small></div>
    ${photos && d.modo === 'editable' ? `<div class="line"><b>Separar en capas · Google</b><span class="v">≈ ${money(photos * 0.11)}</span>
      <small>Completa editable: después de generar, cada lámina se separa en fondo limpio + textos + logo para moverlos en el Editor (~US$0,11 y 30–60 s por lámina). Usa la cuenta de Google aunque el motor sea otro.</small></div>` : ''}
    <div class="line"><b>Claude · propuesta</b><span class="v">${money(d.claudeUsd || 0)}</span>
      <small>Ya gastado: ${d.calls || 1} propuesta${(d.calls || 1) > 1 ? 's' : ''} con Claude Sonnet 4.6${u.input_tokens ? ` (última: investigación con ${u.web_searches || u.server_tool_use?.web_search_requests || 0} búsquedas web + guion; ${u.input_tokens.toLocaleString('es')} tokens de entrada, ${u.output_tokens.toLocaleString('es')} de salida)` : ''}. Rehacer la propuesta costaría otros ~${money(u.usd || 0)}.</small></div>
    <div class="line total"><b>Falta por gastar</b><span class="v">${imgUsd == null ? '—' : `≈ ${money(imgUsd)}`}</span>
      <small>Se cobra en la cuenta de ${esc(prov)} de la API key que está en 04_STUDIO_APP/.env.</small></div>
    ${g ? genHtml : `<div class="form-actions">
      <button type="button" class="btn accent" id="btn-approve" ${ready || !photos ? '' : 'disabled'}>${photos ? `Aprobar y generar ${photos} foto${photos === 1 ? '' : 's'}` : 'Aprobar sin fotos'}</button>
    </div>`}`;
}

function draftToProject() {
  const d = state.draft;
  return normalizeProject({
    id: d.projectId || 'p' + Date.now(), brand: d.brand, modo: d.modo || '', name: d.name, caption: d.caption, concept: d.concept, visualSystem: d.visualSystem || '', avoid: d.avoid || '',
    slides: d.slides.map(({ gen, janica, people, ...s }) => ({ ...s, image: '', bw: !!s.bw })),
  });
}

// Sin índices: primera aprobación (crea el proyecto y genera todas). Con índices: regenera solo esas láminas.
async function approve(indices = null) {
  const d = state.draft;
  if (!d.projectId) {
    state.p = draftToProject();
    state.sel = 0;
    if (await saveProject() === false) return;
    d.projectId = state.p.id;
  }
  const want = indices && new Set(indices);
  const items = d.slides.map((s, i) => (s.gen && (s.photoPrompt || s.photo || isFull(d)) && (!want || want.has(i))
    ? { index: i, prompt: promptFor(s, d.brand), people: slidePeople(s), photo: s.photo, photoPrompt: s.photoPrompt,
      slide: slidePayload(s), count: `${i + 1}/${d.slides.length}` } : null)).filter(Boolean);
  if (!items.length) { d.gen = d.gen || { done: true, items: [] }; saveDraft(); renderCreate(); return; }
  try {
    const r = await api('/api/generate', { projectId: d.projectId, ...draftMotor(), items });
    const keep = (d.gen?.items || []).filter((x) => !items.some((it) => it.index === x.index));
    d.gen = { id: r.id, done: false, keep, items: [...keep, ...items.map((x) => ({ index: x.index, status: 'enviando' }))].sort((a, b) => a.index - b.index) };
    saveDraft();
    renderCreate();
    pollGeneration();
  } catch (e) { toast(e.message, true); renderCreate(); }
}

let pollTimer;
async function pollGeneration() {
  clearTimeout(pollTimer);
  const d = state.draft;
  if (!d?.gen?.id) return;
  try {
    const job = await api('/api/generate?id=' + encodeURIComponent(d.gen.id));
    d.gen.items = [...(d.gen.keep || []), ...job.items].sort((a, b) => a.index - b.index);
    d.gen.done = job.done;
    if (state.p?.id === d.projectId) {
      job.items.forEach((x) => {
        const s = state.p.slides[x.index];
        if (x.url && s && s.image !== x.url) {
          if (s.image) Object.assign(s, { prevImage: s.image, prevCutout: s.cutout || '' });
          const ds = d.slides[x.index] || {};
          Object.assign(s, { image: x.url, cutout: x.cutout || '', ix: 50, iy: x.full ? 50 : 30, iz: 1, dx: 0, dy: 0, full: !!x.full, soul: !!x.soul, qa: x.qa || '', motor: x.motor || '', tamano: x.tamano || '', layers: x.layers || null, move: dropLayerKeys(s.move), fx: dropLayerKeys(s.fx), layer: dropLayerKeys(s.layer), photo: ds.photo ?? s.photo, photoPrompt: ds.photoPrompt ?? s.photoPrompt });
        }
      });
    }
    saveDraft();
    if (state.view === 'create') { renderProposal(); renderCost(); }
    if (job.done) {
      if (state.p?.id === d.projectId) if (await saveProject() === false) return;
      const bad = job.items.filter((x) => x.status === 'failed').length;
      toast(bad ? `Fotos listas, ${bad} fallaron. Puedes reintentarlas.` : 'Fotos listas. Ya están en las láminas.', !!bad);
      return;
    }
  } catch (e) {
    // Si el servidor se reinició se pierde el trabajo en memoria: las fotos ya descargadas siguen en el proyecto.
    if (/No existe/.test(e.message)) { d.gen.done = true; saveDraft(); renderCreate(); toast('Se perdió el seguimiento del trabajo. Abre el proyecto para ver las fotos que alcanzaron a llegar.', true); return; }
  }
  pollTimer = setTimeout(pollGeneration, 3000);
}

function pickIdeaBrand(b) {
  ideaBrand = b;
  renderBrandPick($('#i-brand'), ideaBrand, pickIdeaBrand);
  $('#i-cta').placeholder = brandOf(b).defaults?.cta || '';
  $('#i-modo').value = fullMode(b) ? 'editable' : 'foto';
  renderOutfits();
}

// Vestuario de la marca en Crear: outfits que la IA usa en las fotos de sus personas (06_MARCAS/<marca>/vestuario)
function renderOutfits() {
  const box = $('#i-outfits');
  if (!box) return;
  const br = brandOf(ideaBrand);
  const show = (br.people || []).length > 0;
  box.hidden = !show;
  if (!show) return;
  const list = br.outfits || [];
  const who = br.people.map((x) => x.name).join(', ');
  const open = box.querySelector('details')?.open ?? false;
  box.innerHTML = `<details ${open ? 'open' : ''}><summary class="lbl">Vestuario de ${esc(who)} · ${list.length} outfit${list.length === 1 ? '' : 's'}</summary>
    <p class="help">Cuando una lámina parte de la foto real de ${esc(who)}, la IA la viste con uno de estos outfits (uno distinto por lámina). En el Editor puedes elegir otro. Para activar, desactivar o etiquetar outfits: <button type="button" class="btn sm ghost" id="outfit-manage">Gestionar en Marcas</button></p>
    <div class="outfits">${list.map((f) => `<figure><img src="${esc(f.url)}" alt="${esc(f.name)}" title="${esc(f.name.replace(/\.\w+$/, '').replace(/-/g, ' '))}"><button type="button" class="x" data-outfit-del="${esc(f.path)}" aria-label="Quitar ${esc(f.name)}">×</button></figure>`).join('') || '<p class="empty">Todavía no hay outfits.</p>'}</div>
    <label class="btn sm">Agregar outfits<input type="file" id="outfit-upload" accept="image/*" multiple hidden></label></details>`;
}

async function outfitRequest(action, body) {
  const r = await api(`/api/brands/${encodeURIComponent(ideaBrand)}/${action}`, body);
  BRANDS[ideaBrand] = { ...BRANDS[ideaBrand], outfits: r.outfits || [] };
  renderOutfits();
}

function bindOutfits() {
  const box = $('#i-outfits');
  if (!box) return;
  box.addEventListener('change', async (e) => {
    if (e.target.id !== 'outfit-upload' || !e.target.files.length) return;
    const files = [...e.target.files];
    toast(`Subiendo ${files.length} outfit${files.length > 1 ? 's' : ''}…`);
    try {
      for (const f of files) await outfitRequest('add', { kind: 'vestuario', name: f.name, dataUrl: await readAsDataUrl(f) });
      toast('Outfits agregados al vestuario.');
    } catch (err) { toast(err.message, true); }
  });
  box.addEventListener('click', async (e) => {
    if (e.target.id === 'outfit-manage') { mk.sel = { type: 'brand', id: ideaBrand }; showView('brands'); return; }
    const b = e.target.closest('[data-outfit-del]');
    if (!b) return;
    try { await outfitRequest('delete', { path: b.dataset.outfitDel }); toast('Outfit quitado (queda en la papelera de la marca).'); } catch (err) { toast(err.message, true); }
  });
}

function bindCreate() {
  bindOutfits();
  pickIdeaBrand(ideaBrand);

  $('#idea-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const brief = readIdea();
    if (!brief.idea) { toast('Describe tu idea primero.', true); $('#i-idea').focus(); return; }
    propose(brief, $('#btn-propose'));
  });
  $('#btn-repropose').addEventListener('click', (e) => propose(state.draft.brief, e.currentTarget));
  $('#btn-back-idea').addEventListener('click', () => {
    const d = state.draft;
    if (d?.brief) {
      $('#i-idea').value = d.gen ? '' : d.brief.idea;
      $('#i-laminas').value = d.brief.laminas;
      $('#i-cta').value = d.gen ? '' : d.brief.cta;
      $('#i-notas').value = d.gen ? '' : d.brief.notas;
      pickIdeaBrand(d.brand);
      if (d.brief.modo) $('#i-modo').value = d.brief.modo;
    }
    if (d?.gen) { state.draft = null; saveDraft(); } else if (d) { d.slides = null; saveDraft(); }
    renderCreate();
  });

  $('#d-name').addEventListener('input', (e) => { state.draft.name = e.target.value; saveDraft(); });
  $('#d-concept').addEventListener('input', (e) => { state.draft.concept = e.target.value; saveDraft(); });
  $('#d-caption').addEventListener('input', (e) => { state.draft.caption = e.target.value; saveDraft(); });
  $('#d-visual').addEventListener('input', (e) => { state.draft.visualSystem = e.target.value; saveDraft(); });
  $('#d-avoid').addEventListener('input', (e) => { state.draft.avoid = e.target.value; saveDraft(); });

  const list = $('#prop-slides');
  list.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.bid) { const b = (state.draft.slides[+t.dataset.i].blocks || []).find((x) => x.id === t.dataset.bid); if (b) { b.text = t.value; saveDraft(); } return; }
    if (!t.dataset.k || t.tagName === 'SELECT') return;
    const s = state.draft.slides[+t.dataset.i];
    s[t.dataset.k] = Array.isArray(s[t.dataset.k]) ? t.value.split('\n') : t.value;
    saveDraft();
    if (t.dataset.k === 'photoPrompt' || t.dataset.k === 'photo') renderCost();
  });
  list.addEventListener('change', (e) => {
    const t = e.target;
    const i = +t.dataset.i;
    const s = state.draft?.slides[i];
    if (!s) return;
    if (t.tagName === 'SELECT') s[t.dataset.k] = t.value;
    else if (t.dataset.c) s[t.dataset.c] = t.checked;
    else if (t.dataset.person) {
      const set = new Set(slidePeople(s));
      if (t.checked) set.add(t.dataset.person); else set.delete(t.dataset.person);
      s.people = [...set];
      delete s.janica;
    }
    else return;
    saveDraft();
    list.children[i].outerHTML = propCard(s, i);
    renderCost();
  });

  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-regen]');
    if (!b) return;
    b.disabled = true;
    approve([+b.dataset.regen]);
  });

  $('#cost-panel').addEventListener('change', (e) => {
    if (e.target.dataset.motor !== 'crear' && e.target.dataset.tamano !== 'crear') return;
    const motor = $('#crear-motor').value;
    Object.assign(state.draft, { motor, tamano: sizeFor(motor, $('#crear-tamano')?.value) });
    saveDraft();
    renderProposal();
    renderCost();
  });
  $('#cost-panel').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'btn-approve') { b.disabled = true; approve(); }
    else if (b.id === 'btn-retry') { b.disabled = true; approve(state.draft.gen.items.filter((x) => x.status === 'failed').map((x) => x.index)); }
    else if (b.id === 'btn-regen-all') { b.disabled = true; approve(state.draft.slides.map((_, i) => i)); }
    else if (b.id === 'btn-open-editor') openProject(state.draft.projectId);
  });
  $$('[data-settings]').forEach((b) => b.addEventListener('click', () => { loadConfig(); $('#dlg-settings').showModal(); }));
}

// ---------------------------------------------------------------- vistas y ajustes
function showView(v) {
  state.view = v;
  $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + v; });
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  store.set('view', v);
  if (v === 'editor' && state.p) requestAnimationFrame(() => { fitStage(); state.p.slides.forEach((_, i) => renderThumb(i)); });
  if (v === 'create' && state.draft !== undefined) renderCreate();
  if (v === 'requests') loadRequests();
  if (v === 'deliveries') loadDeliveries();
  if (v === 'brands') showBrandsView();
}

async function loadConfig() {
  try {
    const c = await api('/api/config');
    state.cfg = c;
    state.hasKey = c.hasKey;
    // Una línea por proveedor: la API key sale de 04_STUDIO_APP/.env
    const prov = {};
    (c.motores || []).forEach((m) => { (prov[m.proveedor] ||= { env: m.env, ok: m.disponible, nombres: [] }).nombres.push(m.nombre); });
    $('#hf-state').innerHTML = Object.entries(prov).map(([p, x]) => `<span class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✓' : '✗'}</span> <b>${esc(p)}</b> (${esc(x.nombres.join(', '))}): ${x.ok ? 'conectado' : `falta <span class="mono">${esc(x.env)}</span>`}`).join('<br>');
    $('#key-state').textContent = c.hasKey ? (c.fromEnv ? 'Usando la variable ANTHROPIC_API_KEY del sistema.' : 'API key guardada.') : 'Sin API key: los borradores con IA están desactivados.';
    $('#btn-draft').disabled = !c.hasKey;
    $('#btn-draft').title = c.hasKey ? '' : 'Agrega la API key en Ajustes';
  } catch { /* servidor sin config */ }
}

// ---------------------------------------------------------------- arranque
function bindGlobal() {
  bindPhotoDrag();
  $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  $$('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  $('#p-name').addEventListener('input', (e) => { state.p.name = e.target.value; scheduleSave(); });
  $('#prev').addEventListener('click', () => select(state.sel - 1));
  $('#next').addEventListener('click', () => select(state.sel + 1));
  $('#safe-toggle').addEventListener('change', renderStage);
  $('#btn-add').addEventListener('click', () => {
    const s = cur();
    state.p.slides.splice(state.sel + 1, 0, blankSlide('frase', state.p.brand, { theme: s.theme === 'dark' ? 'light' : 'dark', title: 'Nueva idea' }));
    state.sel += 1;
    renderEditor();
    scheduleSave();
  });
  $('#btn-new').addEventListener('click', () => newProject());
  $('#btn-projects').addEventListener('click', openProjectsDialog);
  $('#proj-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) { $('#dlg-projects').close(); openProject(b.dataset.id); }
  });

  $('#strip').addEventListener('click', (e) => {
    const li = e.target.closest('.thumb');
    if (!li) return;
    const i = +li.dataset.i;
    const act = e.target.closest('[data-act]')?.dataset.act;
    const sl = state.p.slides;
    if (!act) return select(i);
    if (act === 'up' && i > 0) { [sl[i - 1], sl[i]] = [sl[i], sl[i - 1]]; state.sel = i - 1; }
    else if (act === 'down' && i < sl.length - 1) { [sl[i + 1], sl[i]] = [sl[i], sl[i + 1]]; state.sel = i + 1; }
    else if (act === 'dup') { sl.splice(i + 1, 0, { ...structuredClone(sl[i]), id: uid() }); state.sel = i + 1; }
    else if (act === 'del') {
      if (sl.length === 1) return toast('El carrusel necesita al menos una lámina.', true);
      sl.splice(i, 1);
      state.sel = Math.min(state.sel, sl.length - 1);
    }
    renderEditor();
    scheduleSave();
  });
  $('#strip').addEventListener('keydown', (e) => {
    const li = e.target.closest('.thumb');
    if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(+li.dataset.i); }
  });
  document.addEventListener('keydown', (e) => {
    if (state.view !== 'editor' || e.target.closest('input, textarea, select, dialog')) return;
    if (e.key === 'ArrowLeft') select(state.sel - 1);
    if (e.key === 'ArrowRight') select(state.sel + 1);
  });

  $('#btn-export-one').addEventListener('click', () => exportSlides([state.sel]));
  $('#btn-export-all').addEventListener('click', () => exportSlides(state.p.slides.map((_, i) => i)));
  $('#exp-open').addEventListener('click', () => lastExportDir && openFolder(lastExportDir));

  $('#asset-q').addEventListener('input', renderAssets);
  $('#asset-grid').addEventListener('click', (e) => {
    const a = e.target.closest('[data-url]');
    if (a) { $('#dlg-assets').close(); setImage(a.dataset.url, state.pickSlot); }
  });
  $('#asset-upload').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = await uploadFile(f).catch(() => null);
    if (url) { $('#dlg-assets').close(); setImage(url, state.pickSlot); }
    e.target.value = '';
  });

  // Solicitudes
  const pickReqBrand = (b) => {
    const prev = reqBrand;
    reqBrand = b;
    renderBrandPick($('#r-brand'), reqBrand, pickReqBrand);
    fillBriefDefaults(b, prev);
  };
  state.pickReqBrand = pickReqBrand;
  renderBrandPick($('#r-brand'), reqBrand, pickReqBrand);
  fillBriefDefaults(reqBrand);

  $('#req-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = e.submitter?.dataset.mode || 'save';
    const brief = readBrief();
    if (!brief.tema) { toast('Escribe el tema u oferta.', true); $('#r-tema').focus(); return; }
    try {
      const r = await saveRequest({ brief, status: 'pendiente' });
      toast('Solicitud guardada en 05_SOLICITUDES');
      $('#r-tema').value = ''; $('#r-referencias').value = ''; $('#r-notas').value = '';
      if (mode === 'draft') await draftFromRequest(r, e.submitter);
    } catch (err) { toast(err.message, true); }
  });

  $('#req-list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const r = state.requests.find((x) => x.id === b.closest('.req').dataset.id);
    if (!r) return;
    const act = b.dataset.act;
    if (act === 'status') { r.status = NEXT[r.status] || 'pendiente'; await saveRequest(r).catch((err) => toast(err.message, true)); }
    else if (act === 'open') openProject(r.projectId);
    else if (act === 'copy') copyText(briefText(r.brief), 'Brief copiado');
    else if (act === 'draft') draftFromRequest(r, b);
    else if (act === 'skeleton') {
      newProject(r.brief.marca, { name: r.brief.tema, requestId: r.id, slides: skeletonFromBrief(r.brief) });
      r.projectId = state.p.id;
      r.status = 'produccion';
      if (await saveProject() === false) return;
      saveRequest(r).catch((err) => toast(err.message, true));
    }
  });
  $('#btn-open-reqs').addEventListener('click', () => openFolder('05_SOLICITUDES'));
  $('#btn-open-deliv').addEventListener('click', () => openFolder('03_ENTREGAS'));
  $('#deliv-list').addEventListener('click', (e) => {
    const all = e.target.closest('[data-dl-all]');
    if (all) { downloadDelivery(+all.dataset.dlAll, all); return; }
    const one = e.target.closest('[data-dl]');
    if (one) { const [di, ii] = one.dataset.dl.split(':').map(Number); downloadDeliveryImage(di, ii); return; }
    const b = e.target.closest('[data-open]');
    if (b) openFolder(b.dataset.open);
  });

  // Ajustes
  $('#btn-settings').addEventListener('click', () => { loadConfig(); $('#dlg-settings').showModal(); });
  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/config', { apiKey: $('#api-key').value });
      $('#api-key').value = '';
      await loadConfig();
      renderRequests();
      if (state.view === 'create') renderCreate();
      toast('Ajustes guardados');
      $('#dlg-settings').close();
    } catch (err) { toast(err.message, true); }
  });

  // La leyenda de ayuda recuerda si la cerraste (en este navegador)
  const help = $('#editor-help');
  if (store.get('editorHelp') === 'closed') help.open = false;
  help.addEventListener('toggle', () => store.set('editorHelp', help.open ? 'open' : 'closed'));

  new ResizeObserver(() => fitStage()).observe($('#stage'));
}

// Tras crear o cambiar una marca: vuelve a pintar todos los selectores y la lámina abierta
function refreshBrandPickers() {
  ideaBrand = firstBrand(ideaBrand);
  reqBrand = firstBrand(reqBrand);
  pickIdeaBrand(ideaBrand);
  renderBrandPick($('#r-brand'), reqBrand, state.pickReqBrand);
  if (state.p) renderEditor();
}

async function init() {
  try { await loadBrands(); } catch (e) { toast('No se pudieron cargar las marcas: ' + e.message, true); }
  ideaBrand = firstBrand(ideaBrand);
  reqBrand = firstBrand(reqBrand);
  bindGlobal();
  bindInspector();
  bindCreate();
  bindBrands();
  await Promise.all([document.fonts.ready, loadConfig()]);
  loadDraft();
  let p = null;
  // ?p=<id>&view=editor abre un proyecto directo (útil para revisar o compartir el enlace local)
  const q = new URLSearchParams(location.search);
  const last = q.get('p') || store.get('lastProject');
  try {
    if (last) p = await api('/api/projects?id=' + encodeURIComponent(last));
  } catch { p = null; }
  if (!p) {
    const list = await api('/api/projects').catch(() => []);
    if (list[0]) p = await api('/api/projects?id=' + encodeURIComponent(list[0].id)).catch(() => null);
  }
  state.p = normalizeProject(p || sampleProject());
  if (!p) saveProject();
  renderEditor();
  // El Estudio siempre abre en Crear, para empezar describiendo la idea.
  showView(['editor', 'requests', 'deliveries', 'brands'].includes(q.get('view')) ? q.get('view') : 'create');
  if (q.get('s')) select(parseInt(q.get('s'), 10) - 1);
  api('/api/requests').then((r) => { state.requests = r; renderRequests(); }).catch(() => {});
}

// Dictado por voz (Web Speech API del navegador: Chrome, Edge o Safari). box contiene un <select> de idioma y un botón.
// es-US entiende español, inglés mezclado (spanglish) y términos en inglés; en-US para dictar solo en inglés.
// Devuelve una función para detenerlo.
function attachDictation(box, ta) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || !box) return () => {};
  box.hidden = false;
  const btn = $('button', box), lang = $('select', box);
  lang.value = store.get('dictateLang') || 'es-US';
  let rec = null, base = '';
  const join = (a, b) => (a && b && !/\s$/.test(a) ? a + ' ' + b : a + b);
  const stop = () => { if (rec) { const r = rec; rec = null; r.stop(); } btn.setAttribute('aria-pressed', 'false'); btn.textContent = '🎙 Hablar'; };
  const start = () => {
    rec = new SR();
    rec.lang = lang.value;
    rec.continuous = true;
    rec.interimResults = true;
    base = ta.value;
    rec.onresult = (e) => {
      let fin = '', tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t; else tmp += t;
      }
      if (fin) base = join(base, fin.trim());
      ta.value = join(base, tmp.trim());
      ta.scrollTop = ta.scrollHeight;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      toast(e.error === 'not-allowed' ? 'Permite el micrófono en el navegador para dictar.' : 'Dictado: ' + e.error, true);
      stop();
    };
    // El navegador corta el dictado tras un silencio; lo reanudamos mientras el botón siga activo.
    rec.onend = () => { if (rec) { ta.value = base; try { rec.start(); } catch { stop(); } } };
    rec.start();
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = '■ Detener';
  };
  lang.addEventListener('change', () => { store.set('dictateLang', lang.value); if (rec) { stop(); start(); } });
  btn.addEventListener('click', () => (rec ? stop() : start()));
  return stop;
}
const dictateBox = () => `<div class="dictate" hidden>
  <select class="inp sm" aria-label="Idioma del dictado" title="Idioma del dictado"><option value="es-US">Español / Spanglish</option><option value="en-US">English</option></select>
  <button type="button" class="btn sm dictate-btn" aria-pressed="false">🎙 Hablar</button></div>`;

function setupDictation() {
  const stop = attachDictation($('#dictate'), $('#i-idea'));
  $('#idea-form').addEventListener('submit', stop);
}

setupDictation();
init();
