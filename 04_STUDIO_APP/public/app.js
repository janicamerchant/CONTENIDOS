/* Estudio de Carruseles · Nika Media — lógica del cliente */
'use strict';

// ---------------------------------------------------------------- utilidades
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (t) => esc(t).replace(/\*([^*]+)\*/g, '<em class="acc">$1</em>').replace(/\n/g, '<br>');
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
const BRANDS = {
  eva: {
    name: 'EVA', file: 'EVA', swatch: '#ECFE6E', bw: true, texture: true,
    defaults: { audiencia: 'Dueños de agencias de seguros y negocios de servicios', cta: 'Escribe EVA por DM', idioma: 'Español', objetivo: 'Generar demos / DMs' },
  },
  janica: {
    name: 'Janica Merchant', file: 'JANICA', swatch: '#E6DCCD', bw: false,
    defaults: { audiencia: 'Mujeres emprendedoras y profesionales ambiciosas', cta: 'Guárdalo y compártelo con alguien que lo necesite', idioma: 'Español', objetivo: 'Autoridad' },
  },
  citykia: {
    name: 'City Kia', file: 'CITYKIA', swatch: '#D7141A', bw: false,
    defaults: { audiencia: 'Compradores de auto en Greater Orlando', cta: 'Visit City Kia of Greater Orlando', idioma: 'English', objetivo: 'Venta / oferta' },
  },
};

// Logos oficiales. EVA viene sobre fondo gris: se quita el fondo en canvas sin tocar el trazo.
const LOGO_DEFS = {
  evaDark: { src: '01_SKILL_OPERATIVO/assets/eva-logo-dark-lime.png', key: [53, 53, 53] },
  evaLight: { src: '02_ARCHIVOS_ORIGINALES/Asset 1xxxhdpi.png', key: [255, 255, 255] },
  nikaDark: { src: '02_ARCHIVOS_ORIGINALES/Asset 6@4x (3).png', tint: [239, 235, 224] },
  nikaLight: { src: '02_ARCHIVOS_ORIGINALES/Asset 6@4x (3).png' },
  kiaDark: { src: '01_SKILL_OPERATIVO/assets/city-kia-logo-white.png', key: [0, 0, 0] },
  kiaLight: { src: '01_SKILL_OPERATIVO/assets/city-kia-logo-dark.png' },
};
const LOGOS = {};

function loadImage(src) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(new Error('No se pudo cargar ' + src));
    img.src = src;
  });
}

async function prepareLogo(def) {
  const img = await loadImage(fileUrl(def.src));
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

async function loadLogos() {
  await Promise.all(Object.entries(LOGO_DEFS).map(async ([k, def]) => {
    try { LOGOS[k] = await prepareLogo(def); } catch (e) { console.warn(e); }
  }));
}

// ---------------------------------------------------------------- modelo
const LAYOUTS = {
  portada: { label: 'Portada', icon: '<rect x="3" y="4" width="28" height="7" fill="currentColor"/><rect x="0" y="16" width="34" height="26" fill="currentColor" opacity=".35"/>' },
  cifra: { label: 'Cifra', icon: '<rect x="3" y="8" width="18" height="14" fill="currentColor"/><rect x="3" y="25" width="14" height="4" fill="currentColor" opacity=".6"/><rect x="21" y="0" width="13" height="42" fill="currentColor" opacity=".3"/>' },
  frase: { label: 'Frase', icon: '<rect x="3" y="10" width="28" height="24" fill="currentColor" opacity=".35"/><rect x="7" y="16" width="20" height="4" fill="currentColor"/><rect x="7" y="23" width="14" height="4" fill="currentColor"/>' },
  lista: { label: 'Lista', icon: '<rect x="3" y="4" width="22" height="5" fill="currentColor"/><g fill="currentColor" opacity=".6"><rect x="3" y="15" width="4" height="4"/><rect x="10" y="16" width="18" height="2"/><rect x="3" y="23" width="4" height="4"/><rect x="10" y="24" width="18" height="2"/><rect x="3" y="31" width="4" height="4"/><rect x="10" y="32" width="18" height="2"/></g>' },
  comparar: { label: 'Comparar', icon: '<rect x="3" y="4" width="22" height="5" fill="currentColor"/><rect x="3" y="14" width="13" height="24" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="18" y="14" width="13" height="24" fill="currentColor" opacity=".6"/>' },
  cta: { label: 'CTA', icon: '<rect x="3" y="10" width="26" height="8" fill="currentColor"/><rect x="3" y="22" width="16" height="5" fill="currentColor" opacity=".6"/><rect x="3" y="34" width="10" height="4" fill="currentColor" opacity=".4"/>' },
};

function blankSlide(layout = 'frase', brand = 'eva', over = {}) {
  return {
    id: uid(), layout, theme: 'dark',
    kicker: '', title: '', body: '', number: '', numberLabel: '', items: [],
    leftLabel: '', leftItems: [], rightLabel: '', rightItems: [], cta: '',
    photo: '', image: '', ix: 50, iy: 30, iz: 1,
    bw: !!BRANDS[brand]?.bw, textBack: false, texture: false, ts: 1,
    ...over,
  };
}

function sampleProject() {
  const b = 'eva';
  return {
    id: 'p' + Date.now(), brand: b, name: 'EVA · Velocidad de respuesta',
    caption: 'Cada minuto que un lead espera, la conversación se enfría. EVA responde, califica y agenda por tu equipo, incluso fuera de horario.\n\nEscribe EVA por DM y te mostramos cómo funciona.',
    slides: [
      blankSlide('portada', b, {
        kicker: 'Ventas · Seguimiento', title: 'Tu lead no esperó.\n*Se fue con otro.*',
        image: fileUrl('01_SKILL_OPERATIVO/assets/janica-serious-face.png'), iy: 22, iz: 1,
        photo: 'Janica Merchant, expresión seria, luz lateral suave, B/N editorial',
      }),
      blankSlide('frase', b, {
        theme: 'light', kicker: 'El problema',
        title: 'Cada minuto sin respuesta *enfría* la conversación.',
        body: 'Cuando alguien escribe, está listo para hablar. Si nadie contesta, sigue buscando.',
      }),
      blankSlide('comparar', b, {
        kicker: 'Antes y después', title: 'Lo que cambia con *EVA*',
        leftLabel: 'Hoy', leftItems: ['Respuestas manuales cuando alguien se acuerda', 'Leads acumulados en WhatsApp', 'Sin visibilidad del pipeline'],
        rightLabel: 'Con EVA', rightItems: ['Respuesta inmediata, también de noche', 'Calificación y agenda automáticas', 'Cada cita visible en el dashboard'],
      }),
      blankSlide('cifra', b, {
        kicker: 'Caso real de un cliente', number: '70–80', numberLabel: 'citas *diarias* con EVA',
        body: 'Una agencia pasó de 20–25 citas agendadas a mano por día a 70–80 diarias. Es el resultado de un cliente, no una garantía.',
      }),
      blankSlide('lista', b, {
        theme: 'light', kicker: 'Checklist', title: 'Antes de contratar más gente, *revisa esto*',
        items: ['¿Cuánto tarda tu equipo en responder el primer mensaje?', '¿Quién da seguimiento después del tercer día?', '¿Cuántas citas se pierden fuera de horario?', '¿Ves en un solo lugar en qué etapa está cada lead?'],
      }),
      blankSlide('cta', b, {
        kicker: 'Agenda una demo', title: 'Escribe *EVA* por DM',
        body: 'Te mostramos cómo responde, califica y agenda por ti.', cta: 'Escribe EVA',
      }),
    ],
  };
}

function normalizeProject(p) {
  p.slides = (p.slides || []).map((s) => blankSlide(s.layout || 'frase', p.brand, s));
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

function torn(s, edge) {
  const clip = tornClip(hash(s.id + edge), edge);
  const clipEdge = tornClip(hash(s.id + edge + 'e'), edge);
  const shift = edge === 'top' ? 'translateY(-8px)' : 'translateY(8px)';
  return `<div class="s-torn-edge" style="clip-path:${clipEdge};-webkit-clip-path:${clipEdge};transform:${shift}"></div>
          <div class="s-torn" style="clip-path:${clip};-webkit-clip-path:${clip}"></div>`;
}

function logoFor(p, s) {
  const dark = s.theme === 'dark';
  if (p.brand === 'eva') return LOGOS[dark ? 'evaDark' : 'evaLight'];
  if (p.brand === 'citykia') return LOGOS[dark ? 'kiaDark' : 'kiaLight'];
  return null;
}

function signature(p, s, big = false) {
  if (p.brand === 'janica') return `<div class="s-sign"><span class="wordmark">Janica Merchant</span></div>`;
  const src = logoFor(p, s);
  const logo = src ? `<img class="logo" src="${src}" alt="">` : '';
  let by = '';
  if (big && p.brand === 'eva') {
    const nk = LOGOS[s.theme === 'dark' ? 'nikaDark' : 'nikaLight'];
    by = `<div class="by">Desarrollado y comercializado por ${nk ? `<img src="${nk}" alt="Nika Media">` : '<b>NIKA MEDIA</b>'}</div>`;
  }
  return `<div class="s-sign${big ? ' big' : ''}">${logo}${by}</div>`;
}

function photo(s, required) {
  if (s.image) return `<div class="s-photo ${s.textBack ? 'front' : ''}"><img src="${esc(s.image)}" alt=""></div>`;
  if (required || s.photo) return `<div class="s-photo empty"><span class="ph-note"><b>FOTO</b> · ${esc(s.photo || 'Agrega la dirección de foto o sube una imagen')}</span></div>`;
  return '';
}

const kicker = (s) => (s.kicker ? `<div class="s-kicker">${esc(s.kicker)}</div>` : '');
const body = (s) => (s.body ? `<p class="s-body">${fmt(s.body)}</p>` : '');

function slideInner(p, s, i, n) {
  const eva = p.brand === 'eva';
  const hasImg = !!(s.image || s.photo);
  switch (s.layout) {
    case 'portada':
      return `${photo(s, true)}
        <div class="s-head fitbox ${s.textBack ? 'back' : 'front'}">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>${body(s)}</div>
        ${eva ? torn(s, 'bottom') : ''}${signature(p, s)}`;
    case 'cifra': {
      const num = esc(s.number);
      return `${photo(s, false)}
        <div class="s-flow fitbox ${s.textBack ? 'back' : 'front'} ${hasImg ? 'has-photo' : ''}">${kicker(s)}
          <div class="s-number"><span class="hl">${num}</span></div>
          <div class="s-numlabel">${fmt(s.numberLabel)}</div>${body(s)}</div>
        ${eva ? torn(s, 'top') : ''}${signature(p, s)}`;
    }
    case 'frase':
      return `${photo(s, false)}<div class="quote">“</div>
        <div class="s-panel"><div class="fitbox">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>${body(s)}</div></div>
        ${signature(p, s)}`;
    case 'lista':
      return `${photo(s, false)}
        <div class="s-flow fitbox">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>
          <ul class="s-items">${s.items.filter(Boolean).map((t) => `<li><i class="mk"></i><span>${fmt(t)}</span></li>`).join('')}</ul>${body(s)}</div>
        ${signature(p, s)}`;
    case 'comparar':
      return `<div class="s-flow fitbox">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>
          <div class="s-cols">
            <div class="s-col a"><h4>${esc(s.leftLabel)}</h4><ul>${s.leftItems.filter(Boolean).map((t) => `<li>${fmt(t)}</li>`).join('')}</ul></div>
            <div class="s-col b"><h4>${esc(s.rightLabel)}</h4><ul>${s.rightItems.filter(Boolean).map((t) => `<li>${fmt(t)}</li>`).join('')}</ul></div>
          </div>${body(s)}</div>
        ${signature(p, s)}`;
    case 'cta':
    default:
      return `${photo(s, false)}
        <div class="s-flow fitbox front">${kicker(s)}<h2 class="s-title">${fmt(s.title)}</h2>${body(s)}${s.cta ? `<div class="s-chip">${esc(s.cta)}</div>` : ''}</div>
        ${eva ? torn(s, 'bottom') : ''}${signature(p, s, true)}`;
  }
}

function counter(p, i, n) {
  return p.brand === 'janica' ? `${pad(i + 1)} — ${pad(n)}` : `${i + 1}/${n}`;
}

function buildSlide(p, s, i, n) {
  const el = document.createElement('div');
  const hasImg = !!(s.image || s.photo);
  el.className = [
    'slide', `b-${p.brand}`, `t-${s.theme}`, `l-${s.layout}`,
    s.bw ? 'bw' : '', s.texture ? 'tex' : '', hasImg ? 'has-photo' : '',
  ].filter(Boolean).join(' ');
  el.style.setProperty('--ts', s.ts);
  el.style.setProperty('--ix', s.ix + '%');
  el.style.setProperty('--iy', s.iy + '%');
  el.style.setProperty('--iz', s.iz);
  el.innerHTML = `<div class="s-bg"></div>
    <div class="s-hud"><i class="hb1"></i><i class="hb2"></i><span class="ln"></span><span class="ar">→</span></div>
    <div class="s-ticks"><i></i><i></i><i></i><i></i></div>
    <div class="s-frame"></div>
    <div class="s-count">${counter(p, i, n)}</div>
    ${slideInner(p, s, i, n)}
    <div class="s-grain"></div><div class="s-safe"></div>`;
  return el;
}

// Reduce el texto hasta que quepa en su caja (el slider de titular sigue mandando)
function fitSlide(el) {
  $$('.fitbox', el).forEach((box) => {
    let k = 1;
    box.style.setProperty('--fit', 1);
    let guard = 0;
    while ((box.scrollHeight > box.clientHeight + 2 || box.scrollWidth > box.clientWidth + 2) && guard++ < 16) {
      k *= 0.94;
      box.style.setProperty('--fit', k.toFixed(3));
    }
  });
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
  } catch (e) {
    $('#save-state').textContent = 'No se pudo guardar';
    toast('No se pudo guardar el proyecto: ' + e.message, true);
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
  container.innerHTML = Object.entries(BRANDS).map(([k, b]) =>
    `<button type="button" role="radio" aria-checked="${k === value}" data-brand="${k}"><span class="sw" style="background:${b.swatch}"></span>${b.name}</button>`).join('');
  container.onclick = (e) => {
    const b = e.target.closest('[data-brand]');
    if (b) onPick(b.dataset.brand);
  };
}

function renderEditor() {
  $('#p-name').value = state.p.name || '';
  renderBrandPick($('#brand-pick'), state.p.brand, (b) => {
    state.p.brand = b;
    renderEditor();
    scheduleSave();
  });
  renderStrip();
  renderStage();
  renderInspector();
}

function refreshSlide() {
  renderStage();
  renderThumb(state.sel);
  scheduleSave();
}

function select(i) {
  state.sel = Math.max(0, Math.min(state.p.slides.length - 1, i));
  $$('#strip .thumb').forEach((t) => t.setAttribute('aria-current', String(+t.dataset.i === state.sel)));
  renderStage();
  renderInspector();
  $(`#strip .thumb[data-i="${state.sel}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// ---------------------------------------------------------------- inspector
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
  const canBack = L === 'portada' || L === 'cifra';

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
      ${p.brand === 'eva' ? `<div class="checks"><label><input type="checkbox" data-c="texture" ${s.texture ? 'checked' : ''}> Fondo geométrico aprobado (1.png / 2.png)</label></div>` : ''}
    </section>

    <section class="sec">
      <h3 class="sec-title">Texto</h3>
      ${field('Antetítulo', 'kicker')}
      ${titled ? field('Titular', 'title', 'textarea', 3, 'Marca en color de acento con <code>*asteriscos*</code>. Enter = salto de línea.') : ''}
      ${specific}
      ${field('Texto de apoyo', 'body', 'textarea', 3)}
      ${range('Titular', 'ts', 0.6, 1.4, 0.02, '×')}
    </section>

    <section class="sec">
      <h3 class="sec-title">Foto</h3>
      <div class="img-box">
        <div class="img-prev" style="${s.image ? `background-image:url('${esc(s.image)}')` : ''}">${s.image ? '' : 'Sin foto'}</div>
        <div class="img-actions">
          <button type="button" class="btn sm" id="img-pick">Biblioteca</button>
          <label class="btn sm">Subir<input type="file" id="img-upload" accept="image/*" hidden></label>
          ${s.image ? '<button type="button" class="btn sm ghost danger" id="img-clear">Quitar</button>' : ''}
        </div>
      </div>
      ${field('Dirección de foto', 'photo', 'textarea', 2, 'Qué debe mostrar la foto. Si no hay imagen, aparece como marcador en la lámina.')}
      ${s.image ? range('Horizontal', 'ix', 0, 100, 1, '%') + range('Vertical', 'iy', 0, 100, 1, '%') + range('Zoom', 'iz', 1, 2.5, 0.02, '×') : ''}
      <div class="checks">
        <label><input type="checkbox" data-c="bw" ${s.bw ? 'checked' : ''}> Blanco y negro</label>
        ${canBack ? `<label><input type="checkbox" data-c="textBack" ${s.textBack ? 'checked' : ''}> Foto delante del texto (usa PNG recortado)</label>` : ''}
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
    if (t.dataset.k) {
      const k = t.dataset.k;
      s[k] = Array.isArray(s[k]) ? t.value.split('\n') : t.value;
      refreshSlide();
    } else if (t.dataset.r) {
      s[t.dataset.r] = parseFloat(t.value);
      t.nextElementSibling.textContent = t.value + (t.dataset.r === 'ix' || t.dataset.r === 'iy' ? '%' : '×');
      refreshSlide();
    } else if (t.id === 'p-caption') {
      state.p.caption = t.value;
      scheduleSave();
    }
  });
  ins.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.c) { cur()[t.dataset.c] = t.checked; refreshSlide(); }
    if (t.id === 'img-upload' && t.files[0]) uploadFile(t.files[0]).then((url) => setImage(url));
  });
  ins.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = cur();
    if (b.dataset.layout) { s.layout = b.dataset.layout; refreshSlide(); renderInspector(); }
    else if (b.dataset.theme) { s.theme = b.dataset.theme; refreshSlide(); renderInspector(); }
    else if (b.id === 'img-pick') openAssets();
    else if (b.id === 'img-clear') { s.image = ''; refreshSlide(); renderInspector(); }
    else if (b.id === 'copy-caption') copyText(state.p.caption, 'Caption copiado');
  });
}

function setImage(url) {
  const s = cur();
  s.image = url; s.ix = 50; s.iy = 30; s.iz = 1;
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

async function openAssets() {
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
let fontCSS = null;
async function renderForExport(i) {
  const host = $('#export-stage');
  const el = buildSlide(state.p, state.p.slides[i], i, state.p.slides.length);
  host.replaceChildren(el);
  await Promise.all($$('img', el).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = r; }))));
  await document.fonts.ready;
  fitSlide(el);
  if (fontCSS === null) {
    try { fontCSS = await htmlToImage.getFontEmbedCSS(el); } catch (e) { console.warn('Fuentes sin incrustar', e); fontCSS = ''; }
  }
  const opts = { width: 1080, height: 1350, pixelRatio: parseFloat($('#exp-scale').value) || 1, fontEmbedCSS: fontCSS || undefined, cacheBust: false };
  // Safari a veces pinta el primer render sin imágenes: se descarta una pasada de calentamiento.
  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) await htmlToImage.toPng(el, opts);
  return htmlToImage.toPng(el, opts);
}

const exportFolder = () => `${BRANDS[state.p.brand].file}_${slugify(state.p.name)}`;
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
      const r = await api('/api/export', { folder, filename: `${BRANDS[state.p.brand].file}_${pad(i + 1)}`, dataUrl });
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

function newProject(brand = state.p?.brand || 'eva', over = {}) {
  const p = normalizeProject({
    id: 'p' + Date.now(), brand, name: 'Nuevo carrusel', caption: '',
    slides: [
      blankSlide('portada', brand, { title: 'Titular con *gancho*' }),
      blankSlide('frase', brand, { theme: 'light', title: 'Una idea por lámina' }),
      blankSlide('cta', brand, { title: 'Llamado a la acción', cta: BRANDS[brand].defaults.cta }),
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
  for (let i = 0; i < n - 2; i++) slides.push(blankSlide(middle[i % middle.length], b.marca, { theme: i % 2 ? 'dark' : 'light', title: 'Idea ' + (i + 1) }));
  slides.push(blankSlide('cta', b.marca, { title: b.cta || BRANDS[b.marca].defaults.cta, cta: b.cta }));
  return slides;
}

// ---------------------------------------------------------------- solicitudes
const STATUS = { pendiente: 'Pendiente', produccion: 'En producción', entregado: 'Entregado' };
const NEXT = { pendiente: 'produccion', produccion: 'entregado', entregado: 'pendiente' };
let reqBrand = 'eva';

function fillBriefDefaults(brand, prev) {
  const d = BRANDS[brand].defaults, old = prev ? BRANDS[prev].defaults : {};
  [['r-audiencia', 'audiencia'], ['r-cta', 'cta']].forEach(([id, k]) => {
    const el = $('#' + id);
    if (!el.value || el.value === old[k]) el.value = d[k];
  });
  $('#r-idioma').value = d.idioma;
  $('#r-objetivo').value = d.objetivo;
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
      slides: (d.slides || []).map((s) => ({ ...s, image: '', bw: !!BRANDS[r.brief.marca].bw })),
    });
    state.p = p;
    state.sel = 0;
    await saveProject();
    r.projectId = p.id;
    r.status = 'produccion';
    await saveRequest(r);
    showView('editor');
    renderEditor();
    toast('Borrador listo. Revisa los datos marcados [VERIFICAR].');
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
  $('#deliv-list').innerHTML = list.length ? list.map((d) => `
    <section class="deliv">
      <h3>${esc(d.folder)} <span class="mono">${d.images.length} imágenes · ${new Date(d.updatedAt).toLocaleDateString('es')}</span>
        <button type="button" class="btn sm ghost" data-open="03_ENTREGAS/${esc(d.folder)}">Abrir carpeta</button></h3>
      <div class="deliv-row">${d.images.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(u)}" alt=""></a>`).join('')}</div>
    </section>`).join('') : '<p class="empty">Aún no hay entregas.</p>';
}

async function openFolder(path) {
  try { await api('/api/open', { path }); } catch (e) { toast(e.message, true); }
}

// ---------------------------------------------------------------- vistas y ajustes
function showView(v) {
  state.view = v;
  $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + v; });
  $$('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === v)));
  store.set('view', v);
  if (v === 'editor' && state.p) requestAnimationFrame(() => { fitStage(); state.p.slides.forEach((_, i) => renderThumb(i)); });
  if (v === 'requests') loadRequests();
  if (v === 'deliveries') loadDeliveries();
}

async function loadConfig() {
  try {
    const c = await api('/api/config');
    state.hasKey = c.hasKey;
    $('#key-state').textContent = c.hasKey ? (c.fromEnv ? 'Usando la variable ANTHROPIC_API_KEY del sistema.' : 'API key guardada.') : 'Sin API key: los borradores con IA están desactivados.';
    $('#btn-draft').disabled = !c.hasKey;
    $('#btn-draft').title = c.hasKey ? '' : 'Agrega la API key en Ajustes';
  } catch { /* servidor sin config */ }
}

// ---------------------------------------------------------------- arranque
function bindGlobal() {
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
    if (a) { $('#dlg-assets').close(); setImage(a.dataset.url); }
  });
  $('#asset-upload').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = await uploadFile(f).catch(() => null);
    if (url) { $('#dlg-assets').close(); setImage(url); }
    e.target.value = '';
  });

  // Solicitudes
  const pickReqBrand = (b) => {
    const prev = reqBrand;
    reqBrand = b;
    renderBrandPick($('#r-brand'), reqBrand, pickReqBrand);
    fillBriefDefaults(b, prev);
  };
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
      await saveProject();
      saveRequest(r).catch((err) => toast(err.message, true));
    }
  });
  $('#btn-open-reqs').addEventListener('click', () => openFolder('05_SOLICITUDES'));
  $('#btn-open-deliv').addEventListener('click', () => openFolder('03_ENTREGAS'));
  $('#deliv-list').addEventListener('click', (e) => {
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
      toast('Ajustes guardados');
      $('#dlg-settings').close();
    } catch (err) { toast(err.message, true); }
  });

  new ResizeObserver(() => fitStage()).observe($('#stage'));
}

async function init() {
  bindGlobal();
  bindInspector();
  await Promise.all([loadLogos(), document.fonts.ready, loadConfig()]);
  let p = null;
  const last = store.get('lastProject');
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
  showView(store.get('view') || 'editor');
  api('/api/requests').then((r) => { state.requests = r; renderRequests(); }).catch(() => {});
}

init();
