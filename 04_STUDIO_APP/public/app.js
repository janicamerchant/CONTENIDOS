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
    name: 'EVA', file: 'EVA', swatch: '#ECFE6E', bw: false, texture: true,
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
  escena: { label: 'Escena', icon: '<rect x="0" y="0" width="34" height="42" fill="currentColor" opacity=".35"/><rect x="3" y="24" width="28" height="8" fill="currentColor"/><rect x="3" y="34" width="16" height="3" fill="currentColor" opacity=".7"/>' },
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
    photo: '', photoPrompt: '', source: '', image: '', cutout: '', ix: 50, iy: 30, iz: 1,
    bw: !!BRANDS[brand]?.bw, texture: false, ts: 1,
    ...over,
  };
}

function sampleProject() {
  const b = 'eva';
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

function slideInner(p, s, i, n) {
  const eva = p.brand === 'eva';
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
    $$('.fitbox.front, .s-panel', el).forEach((box) => {
      const c = box.cloneNode(true);
      c.classList.add('over');
      c.setAttribute('aria-hidden', 'true');
      el.appendChild(c);
    });
  }
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
      ${p.brand === 'eva' ? '<p class="help">Fondo geométrico con textura, papel rasgado y adornos de borde: siempre activos en EVA (regla de acabado).</p>' : ''}
    </section>

    <section class="sec">
      <h3 class="sec-title">Texto</h3>
      ${field('Antetítulo', 'kicker')}
      ${titled ? field('Titular', 'title', 'textarea', 3, 'Marca en color de acento con <code>*asteriscos*</code>. Enter = salto de línea.') : ''}
      ${specific}
      ${field('Texto de apoyo', 'body', 'textarea', 3)}
      ${field('Fuente del dato', 'source', 'text', 2, 'Obligatoria si la lámina tiene una cifra externa. Ej.: CBO, junio 2024.')}
      ${range('Titular', 'ts', 0.6, 1.4, 0.02, '×')}
    </section>

    <section class="sec">
      <h3 class="sec-title">Foto</h3>
      ${photoStatus()}
      ${field('Escena de la foto', 'photo', 'textarea', 3, 'Qué pasa en la foto y por qué cuenta el titular: quién hace qué, dónde, con qué objeto. Janica solo si su acción explica la idea.')}
      ${field('Prompt para generar (inglés)', 'photoPrompt', 'textarea', 4, 'Es lo que se envía a Higgsfield al generar o regenerar. Si lo dejas vacío, se arma desde la escena.')}
      <div class="form-actions">
        <button type="button" class="btn sm ghost" id="copy-prompt">Copiar prompt</button>
        ${state.cfg?.hasHF && (s.photo || s.photoPrompt) ? `<button type="button" class="btn sm" id="regen-one" ${state.egen ? 'disabled' : ''}>${state.egen?.index === state.sel && state.egen?.projectId === p.id ? 'Generando…' : s.image ? 'Regenerar foto con Higgsfield' : 'Generar foto con Higgsfield'}</button>` : ''}
      </div>
      ${state.cfg?.hasHF && (s.photo || s.photoPrompt) ? `<p class="help">~${state.cfg.hfCredits?.high ?? 2.75} créditos. Usa el prompt de arriba${/janica/i.test(`${s.photo} ${s.photoPrompt}`) ? ' y la cara oficial de Janica' : ''}; la foto actual queda guardada.</p>` : ''}
      ${s.prevImage ? `<button type="button" class="btn sm ghost" id="undo-photo">Volver a la foto anterior</button>` : ''}
      ${imgSlot('image', 'Foto', s.image)}
      ${s.image ? range('Horizontal', 'ix', 0, 100, 1, '%') + range('Vertical', 'iy', 0, 100, 1, '%') + range('Zoom', 'iz', 1, 2.5, 0.02, '×') : ''}
      ${s.image ? imgSlot('cutout', 'Recorte', s.cutout, 'La misma foto sin fondo (PNG). Se pone encima del titular para que las letras queden detrás de la persona u objeto. Revisa que la palabra clave se siga leyendo.') : ''}
      ${s.image && !s.cutout ? '<button type="button" class="btn sm" id="auto-cut">Recorte automático</button>' : ''}
      <div class="checks">
        <label><input type="checkbox" data-c="bw" ${s.bw ? 'checked' : ''}> Blanco y negro</label>
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
    if (t.dataset.upload && t.files[0]) {
      const slot = t.dataset.upload;
      uploadFile(t.files[0]).then((url) => setImage(url, slot)).catch(() => {});
    }
  });
  ins.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const s = cur();
    if (b.dataset.layout) { s.layout = b.dataset.layout; refreshSlide(); renderInspector(); }
    else if (b.dataset.theme) { s.theme = b.dataset.theme; refreshSlide(); renderInspector(); }
    else if (b.dataset.pick) openAssets(b.dataset.pick);
    else if (b.dataset.clear) { s[b.dataset.clear] = ''; if (b.dataset.clear === 'image') s.cutout = ''; refreshSlide(); renderInspector(); }
    else if (b.dataset.goto) select(+b.dataset.goto);
    else if (b.id === 'copy-prompt') copyText(promptFor(s), 'Prompt copiado');
    else if (b.id === 'regen-one') regenerateInEditor(state.sel);
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

const BRAND_LOOK = {
  eva: 'natural color editorial photograph, premium tech magazine look, soft side light, modern office or real business setting',
  janica: 'warm editorial magazine photograph, ivory and beige tones, soft natural light, sophisticated executive setting',
  citykia: 'clean commercial photograph, white, black and metallic silver tones, bright natural light, Orlando car dealership setting',
};
function promptFor(s, brand = state.p.brand) {
  if (s.photoPrompt?.trim()) return s.photoPrompt.trim();
  const scene = s.photo?.trim() || `A scene that shows this idea: ${String(s.title || s.numberLabel || '').replace(/\*/g, '')}`;
  return `${scene}. ${BRAND_LOOK[brand]}. Vertical 4:5 composition with empty space for a large headline. Hyperrealistic, natural skin texture, real pores, natural hands, no text, no logos, no watermark.`;
}

// Regenera la foto de una lámina desde el Editor con la API de Higgsfield
async function regenerateInEditor(i) {
  const p = state.p, s = p.slides[i];
  clearTimeout(state.saveTimer);
  await saveProject();                    // el servidor escribe la foto nueva sobre el proyecto guardado
  try {
    const r = await api('/api/generate', {
      projectId: p.id, quality: 'high',
      items: [{ index: i, prompt: promptFor(s, p.brand), janica: /janica/i.test(`${s.photo} ${s.photoPrompt}`), photo: s.photo, photoPrompt: s.photoPrompt }],
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
    if (!job.done) { setTimeout(pollEditorGen, 3000); return; }
    const x = job.items[0] || {};
    state.egen = null;
    if (x.status === 'completed' && state.p?.id === g.projectId) {
      const s = state.p.slides[g.index];
      if (s.image) Object.assign(s, { prevImage: s.image, prevCutout: s.cutout || '' });
      Object.assign(s, { image: x.url, cutout: x.cutout || '', ix: 50, iy: 30, iz: 1 });
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
  if (slot === 'image') { s.ix = 50; s.iy = 30; s.iz = 1; }
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
      slides: (d.slides || []).map((s) => ({ ...s, image: '', bw: !!s.bw })),
    });
    state.p = p;
    state.sel = 0;
    await saveProject();
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

// ---------------------------------------------------------------- crear: idea → propuesta → costo → aprobación
// El borrador vive en state.draft y se recuerda en este navegador hasta aprobarlo.
let ideaBrand = 'eva';
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
  const d = BRANDS[ideaBrand].defaults;
  return {
    marca: ideaBrand, idea: $('#i-idea').value.trim(), laminas: $('#i-laminas').value,
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
      brief, brand: brief.marca, name: d.name || brief.idea.slice(0, 60), concept: d.concept || '', caption: d.caption || '',
      slides: (d.slides || []).map((s) => ({ ...s, gen: !!(s.photoPrompt || s.photo), janica: /janica/i.test(`${s.photo} ${s.photoPrompt}`) })),
      research: d.research || '', usage: d.usage, claudeUsd: spent, calls: (state.draft?.calls || 0) + 1,
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

function propCard(s, i) {
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
        ${pfield(i, 'Antetítulo', 'kicker')}
        ${L !== 'cifra' ? pfield(i, 'Titular (*acento*)', 'title', 2) : ''}
        ${specific}
        ${pfield(i, 'Texto de apoyo', 'body', 2, true)}
        ${pfield(i, 'Fuente del dato (visible en la lámina)', 'source', 0, true)}
      </div>
      <div class="pc-photo">
        <div class="checks">
          <label><input type="checkbox" data-i="${i}" data-c="gen" ${s.gen ? 'checked' : ''} ${busy ? 'disabled' : ''}> Generar foto con Higgsfield</label>
          ${s.gen ? `<label><input type="checkbox" data-i="${i}" data-c="janica" ${s.janica ? 'checked' : ''} ${busy ? 'disabled' : ''}> Usar la cara oficial de Janica</label>` : ''}
          ${s.gen && !locked ? `<label title="Color real por defecto; blanco y negro solo en 1 o 2 láminas"><input type="checkbox" data-i="${i}" data-c="bw" ${s.bw ? 'checked' : ''}> Blanco y negro</label>` : ''}
        </div>
        ${s.gen ? pfield(i, 'Escena de la foto', 'photo', 2, true) + `<details ${locked ? 'open' : ''}><summary>Prompt en inglés para Higgsfield</summary>
          <textarea class="inp" rows="4" data-i="${i}" data-k="photoPrompt" aria-label="Prompt lámina ${i + 1}" ${busy ? 'readonly' : ''}>${esc(s.photoPrompt)}</textarea></details>` : ''}
        ${locked && s.gen ? `<div class="form-actions">
          <button type="button" class="btn sm" data-regen="${i}" ${busy || !state.cfg?.hasHF ? 'disabled' : ''}>${running ? 'Generando…' : img ? 'Regenerar esta foto' : 'Generar esta foto'}</button>
          <span class="hint">~${state.cfg?.hfCredits?.high ?? 2.75} créditos. Cambia la escena o el prompt antes si quieres otro resultado; la foto anterior queda guardada en el Editor.</span>
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
  $('#d-research-box').hidden = !d.research;
  $('#d-research').innerHTML = esc(d.research || '')
    .replace(/(https?:\/\/[^\s<)\]]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br>');
  $('#prop-slides').innerHTML = d.slides.map(propCard).join('');
  const locked = !!d.gen;
  ['#d-name', '#d-concept', '#d-caption'].forEach((s) => { $(s).readOnly = locked; });
  $('#btn-repropose').disabled = locked || !state.hasKey;
  $('#btn-back-idea').textContent = locked ? '+ Nueva idea' : '← Cambiar idea';
}

const money = (n) => '$' + (n < 0.1 ? n.toFixed(3) : n.toFixed(2));
const credits = (n) => (Math.round(n * 100) / 100).toLocaleString('es');

function renderCost() {
  const d = state.draft, c = state.cfg || {};
  const per = c.hfCredits?.high ?? 2.75, usdPer = c.hfCreditUsd ?? 0.0625;
  const photos = d.slides.filter((s) => s.gen && (s.photoPrompt || s.photo)).length;
  const withJanica = d.slides.filter((s) => s.gen && s.janica).length;
  const hfCr = photos * per, hfUsd = hfCr * usdPer;
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
          <small>Cambia la escena o el prompt en la lámina y pulsa <b>Regenerar esta foto</b>, o regenera todas. Cada foto cuesta ~${per} créditos; la anterior queda guardada y puedes volver a ella en el Editor.</small></div>
        <button type="button" class="btn ghost" id="btn-regen-all" ${c.hasHF ? '' : 'disabled'}>Regenerar todas · ${photos} foto${photos === 1 ? '' : 's'} ≈ ${credits(hfCr)} créditos (${money(hfUsd)})</button>` : ''}` : ''}`;
  }
  $('#cost-panel').innerHTML = `
    <h2>Costo aproximado</h2>
    <div class="line"><b>Higgsfield · fotos</b><span class="v">${credits(hfCr)} créditos</span>
      <small>${photos} foto${photos === 1 ? '' : 's'} × ~${per} créditos (${esc(c.hfModel || 'GPT Image 2.5')}, calidad alta 2K) ≈ ${money(hfUsd)} USD.${withJanica ? ` ${withJanica} con la cara de Janica como referencia (suma muy poco).` : ''} Se cobra por tokens, el total real puede variar un poco. Si una foto falla o se rechaza, no se cobra.</small></div>
    <div class="line"><b>Claude · propuesta</b><span class="v">${money(d.claudeUsd || 0)}</span>
      <small>Ya gastado: ${d.calls || 1} propuesta${(d.calls || 1) > 1 ? 's' : ''} con Claude Opus 5${u.input_tokens ? ` (última: investigación con ${u.web_searches || 0} búsquedas web + guion; ${u.input_tokens.toLocaleString('es')} tokens de entrada, ${u.output_tokens.toLocaleString('es')} de salida)` : ''}. Rehacer la propuesta costaría otros ~${money(u.usd || 0)}.</small></div>
    <div class="line"><b>OpenAI</b><span class="v">$0</span>
      <small>No se usa directo. GPT Image 2.5 es un modelo de OpenAI, pero se paga dentro de los créditos de Higgsfield.</small></div>
    <div class="line total"><b>Falta por gastar</b><span class="v">≈ ${money(hfUsd)}</span>
      <small>Se descuenta del saldo de la API de Higgsfield (cloud.higgsfield.ai), que es distinto del saldo de tu plan en higgsfield.ai.</small></div>
    ${g ? genHtml : `<div class="form-actions">
      <button type="button" class="btn accent" id="btn-approve" ${c.hasHF || !photos ? '' : 'disabled'}>${photos ? `Aprobar y generar ${photos} foto${photos === 1 ? '' : 's'}` : 'Aprobar sin fotos'}</button>
    </div>${c.hasHF ? '' : '<p class="hint">Falta HF_CREDENTIALS en 04_STUDIO_APP/.env.</p>'}`}`;
}

function draftToProject() {
  const d = state.draft;
  return normalizeProject({
    id: d.projectId || 'p' + Date.now(), brand: d.brand, name: d.name, caption: d.caption, concept: d.concept,
    slides: d.slides.map(({ gen, janica, ...s }) => ({ ...s, image: '', bw: !!s.bw })),
  });
}

// Sin índices: primera aprobación (crea el proyecto y genera todas). Con índices: regenera solo esas láminas.
async function approve(indices = null) {
  const d = state.draft;
  if (!d.projectId) {
    state.p = draftToProject();
    state.sel = 0;
    await saveProject();
    d.projectId = state.p.id;
  }
  const want = indices && new Set(indices);
  const items = d.slides.map((s, i) => (s.gen && (s.photoPrompt || s.photo) && (!want || want.has(i))
    ? { index: i, prompt: promptFor(s, d.brand), janica: !!s.janica, photo: s.photo, photoPrompt: s.photoPrompt } : null)).filter(Boolean);
  if (!items.length) { d.gen = d.gen || { done: true, items: [] }; saveDraft(); renderCreate(); return; }
  try {
    const r = await api('/api/generate', { projectId: d.projectId, quality: 'high', items });
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
          Object.assign(s, { image: x.url, cutout: x.cutout || '', ix: 50, iy: 30, iz: 1, photo: ds.photo ?? s.photo, photoPrompt: ds.photoPrompt ?? s.photoPrompt });
        }
      });
    }
    saveDraft();
    if (state.view === 'create') { renderProposal(); renderCost(); }
    if (job.done) {
      if (state.p?.id === d.projectId) await saveProject();
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
  $('#i-cta').placeholder = BRANDS[b].defaults.cta;
}

function bindCreate() {
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
    }
    if (d?.gen) { state.draft = null; saveDraft(); } else if (d) { d.slides = null; saveDraft(); }
    renderCreate();
  });

  $('#d-name').addEventListener('input', (e) => { state.draft.name = e.target.value; saveDraft(); });
  $('#d-concept').addEventListener('input', (e) => { state.draft.concept = e.target.value; saveDraft(); });
  $('#d-caption').addEventListener('input', (e) => { state.draft.caption = e.target.value; saveDraft(); });

  const list = $('#prop-slides');
  list.addEventListener('input', (e) => {
    const t = e.target;
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
}

async function loadConfig() {
  try {
    const c = await api('/api/config');
    state.cfg = c;
    state.hasKey = c.hasKey;
    $('#hf-state').textContent = c.hasHF
      ? `Conectado con la API (credenciales en 04_STUDIO_APP/.env). Modelo: ${c.hfModel}.`
      : 'Sin credenciales: agrega HF_CREDENTIALS=id:secreto en 04_STUDIO_APP/.env y reinicia el Estudio.';
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

async function init() {
  bindGlobal();
  bindInspector();
  bindCreate();
  await Promise.all([loadLogos(), document.fonts.ready, loadConfig()]);
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
  showView(['editor', 'requests', 'deliveries'].includes(q.get('view')) ? q.get('view') : 'create');
  if (q.get('s')) select(parseInt(q.get('s'), 10) - 1);
  api('/api/requests').then((r) => { state.requests = r; renderRequests(); }).catch(() => {});
}

init();
