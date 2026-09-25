/* Estudio de Carruseles · pestaña Marcas: identidad, base de conocimiento y personas aprobadas.
   Todo se guarda en 06_MARCAS/ (ver marcas.rb). Este archivo solo declara funciones: app.js arranca la app. */
'use strict';

const mk = { sel: null, detail: null, people: null, draft: null };

const OBJETIVOS = ['Generar demos / DMs', 'Autoridad', 'Guardados y compartidos', 'Comunidad', 'Venta / oferta', 'Educación'];
const GOOGLE_FONTS = ['Inter', 'Archivo', 'Anton', 'Montserrat', 'Poppins', 'Playfair Display', 'DM Serif Display', 'Space Grotesk', 'Oswald',
  'Bebas Neue', 'Lora', 'Raleway', 'Work Sans', 'Manrope', 'Libre Baskerville', 'Cormorant Garamond', 'Instrument Serif', 'Barlow',
  'Jost', 'Syne', 'Outfit', 'Plus Jakarta Sans', 'Fraunces', 'Sora', 'Archivo Black', 'Roboto', 'Open Sans', 'Lato'];
const LOGO_BG = { '': 'No quitar fondo', blanco: 'Quitar fondo blanco', negro: 'Quitar fondo negro', gris: 'Quitar fondo gris oscuro' };
const LOGO_KEY = { blanco: [255, 255, 255], negro: [0, 0, 0], gris: [53, 53, 53] };
const keyName = (key) => Object.keys(LOGO_KEY).find((k) => String(LOGO_KEY[k]) === String(key)) || '';
const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const brandApi = (id, action, body) => api(`/api/brands/${encodeURIComponent(id)}${action ? '/' + action : ''}`, body);

// Botón que pide un segundo clic antes de algo que borra o archiva
function confirmClick(btn, fn) {
  if (btn.dataset.armed) { delete btn.dataset.armed; fn(); return; }
  const label = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = '¿Seguro? Pulsa otra vez';
  setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = label; } }, 4000);
}

// ---------------------------------------------------------------- navegación
async function showBrandsView() {
  if (!mk.sel) {
    // ?view=brands&marca=<id> abre una marca; &marca=_personas o _comun abren esas páginas
    const q = new URLSearchParams(location.search).get('marca');
    mk.sel = q === '_personas' ? { type: 'people' } : q === '_comun' ? { type: 'common', id: '' } : { type: 'brand', id: firstBrand(q || state.p?.brand) };
  }
  renderBrandRail();
  await openSel(mk.sel);
}

function renderBrandRail() {
  const sel = mk.sel || {};
  const item = (type, id, label, sw, extra = '') => `<button type="button" class="mk-item" data-type="${type}" data-id="${esc(id)}"
    aria-current="${sel.type === type && (sel.id || '') === id}">${sw ? `<span class="sw" style="background:${esc(sw)}"></span>` : ''}<span>${esc(label)}</span>${extra}</button>`;
  $('#mk-list').innerHTML = Object.values(BRANDS).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((b) => item('brand', b.id, b.name, b.swatch, b.design === 'base' ? '' : '<span class="mk-tag">diseño propio</span>')).join('')
    || '<p class="empty">Todavía no hay marcas.</p>';
  $('#mk-list-extra').innerHTML = item('common', '', 'Documentos comunes') + item('people', '', 'Personas aprobadas');
  const arch = state.archived || [];
  $('#mk-archived-box').hidden = !arch.length;
  $('#mk-archived').innerHTML = arch.map((a) => `<div class="mk-arch"><span>${esc(a.label)} <small>${a.type === 'marca' ? 'marca' : 'persona'}</small></span>
    <button type="button" class="btn sm ghost" data-restore-archived="${esc(a.name)}">Restaurar</button></div>`).join('');
}

async function openSel(sel) {
  mk.sel = sel;
  renderBrandRail();
  const main = $('#mk-main');
  try {
    if (sel.type === 'new') { renderNewBrand(); return; }
    if (sel.type === 'people') { mk.people = await api('/api/people'); renderPeople(); return; }
    const id = sel.type === 'common' ? '_comun' : sel.id;
    if (sel.type === 'brand' && !BRANDS[id]) { main.innerHTML = '<p class="empty">Elige una marca o crea una nueva.</p>'; return; }
    const [detail, people] = await Promise.all([brandApi(id), mk.people ? mk.people : api('/api/people')]);
    mk.detail = detail;
    mk.people = people;
    renderBrandPage();
  } catch (e) {
    main.innerHTML = `<p class="banner">${esc(e.message)}</p>`;
  }
}

// Tras guardar: la ficha nueva viene en la respuesta. Si cambió algo visible, se recargan las marcas de toda la app.
async function applyDetail(r, reloadBrands = false) {
  mk.detail = r;
  if (reloadBrands) { await loadBrands(); refreshBrandPickers(); }
  const y = $('#mk-main').scrollTop;
  renderBrandPage();
  renderBrandRail();
  $('#mk-main').scrollTop = y;
}

// ---------------------------------------------------------------- ficha de marca
function renderBrandPage() {
  const d = mk.detail, common = d.id === '_comun';
  const res = d.resources;
  $('#mk-main').innerHTML = `
    <header class="mk-head">
      ${common ? '' : `<span class="mk-swatch" style="background:${esc(d.swatch)}"></span>`}
      <div>
        <h1 class="h1">${esc(d.name)}</h1>
        <p class="hint mono">06_MARCAS/${esc(d.id)}/ <button type="button" class="btn sm ghost" data-open-folder="06_MARCAS/${esc(d.id)}">Abrir carpeta</button></p>
      </div>
      ${common ? '' : '<button type="button" class="btn sm ghost danger mk-archive" id="mk-archive">Archivar marca</button>'}
    </header>
    ${common ? '<p class="lede">Estos documentos y referencias los lee Claude en las propuestas de <b>todas</b> las marcas: el flujo de producción y el estándar de calidad humana.</p>' : meterHtml(d.meter)}
    ${common ? '' : identityHtml(d)}
    ${common ? '' : rulesHtml(d)}
    ${docsHtml(res.conocimiento)}
    ${common ? '' : factsHtml(d.datos || [])}
    ${refsHtml(res.referencias)}
    ${common ? '' : logosHtml(d, res.logos)}
    ${common ? '' : brandPeopleHtml(d)}
    ${trashHtml(d.trash)}`;
  if (!common) updatePreview();
}

function meterHtml(m) {
  if (!m) return '';
  const k = (n) => (n / 1000).toFixed(1).replace('.0', '') + ' mil';
  return `<div class="mk-meter">
    <div><b>${k(m.tokens)} tokens</b> por propuesta · ${m.docs} documento${m.docs === 1 ? '' : 's'} y ${m.images} referencia${m.images === 1 ? '' : 's'} visual${m.images === 1 ? '' : 'es'}${m.images_total > m.images ? ` (hay ${m.images_total} activas; Claude ve las primeras ${m.images})` : ''}</div>
    <div class="mk-meter-bar"><span style="width:${Math.min(100, (m.text_tokens / m.tokens) * 100)}%" title="Texto"></span><span class="img" style="width:${Math.min(100, (m.image_tokens / m.tokens) * 100)}%" title="Imágenes"></span><span class="pdf" style="width:${Math.min(100, (m.pdf_tokens / m.tokens) * 100)}%" title="PDF"></span></div>
    <small>La base de la marca suma ≈ ${money(m.usd_first)} a la primera propuesta y ≈ ${money(m.usd_cached)} si haces otra en los siguientes 5 minutos (caché). La investigación web y el guion se cobran aparte, como siempre.</small>
  </div>`;
}

// Campos de identidad. Las marcas con diseño propio (EVA, Janica, City Kia) tienen colores y tipografías en slides.css.
function identityFields(b, isNew = false) {
  const c = b.colors || {}, f = b.fonts || {}, d = b.defaults || {};
  const base = (b.design || 'base') === 'base';
  const inp = (label, name, val, extra = '') => `<div class="field"><label class="lbl" for="mk-${name}">${label}</label><input id="mk-${name}" class="inp" name="${name}" value="${esc(val ?? '')}" ${extra}></div>`;
  const color = (label, name, val) => `<label class="mk-color"><input type="color" name="${name}" value="${esc(hexRgb(val) ? val : '#888888')}"><span>${label}</span></label>`;
  return `
    <div class="req-form">
      ${inp('Nombre', 'name', b.name, 'required')}
      ${inp('Nombre corto para archivos', 'file', b.file, 'placeholder="Se arma solo con el nombre"')}
      ${inp('Audiencia por defecto', 'audiencia', d.audiencia)}
      ${inp('CTA por defecto', 'cta', d.cta)}
      <div class="field"><label class="lbl" for="mk-idioma">Idioma</label><select id="mk-idioma" class="inp" name="idioma">${['Español', 'English'].map((o) => opt(o, d.idioma || 'Español')).join('')}</select></div>
      <div class="field"><label class="lbl" for="mk-objetivo">Objetivo por defecto</label><select id="mk-objetivo" class="inp" name="objetivo">${OBJETIVOS.map((o) => opt(o, d.objetivo || 'Autoridad')).join('')}</select></div>
      <div class="field"><label class="lbl" for="mk-theme">Fondo por defecto de las láminas</label><select id="mk-theme" class="inp" name="theme">${opt('dark', b.theme || 'dark', 'Oscuro')}${opt('light', b.theme, 'Claro')}</select></div>
      <div class="field checks"><span class="lbl">Recorte automático</span><label><input type="checkbox" name="cutout" ${b.cutout ? 'checked' : ''}> Recortar a la persona de cada foto generada para que el titular pase detrás</label></div>
      <div class="field full"><label class="lbl" for="mk-look">Estilo de foto (inglés, para Higgsfield)</label><textarea id="mk-look" class="inp" name="look" rows="2" placeholder="warm editorial photograph, soft natural light, real premium setting">${esc(b.look || '')}</textarea></div>
      ${base ? `
      <div class="field full"><span class="lbl">Colores</span><div class="mk-colors">
        ${color('Acento', 'accent', c.accent)}${color('Fondo oscuro', 'darkBg', c.darkBg)}${color('Texto sobre oscuro', 'darkInk', c.darkInk)}${color('Fondo claro', 'lightBg', c.lightBg)}${color('Texto sobre claro', 'lightInk', c.lightInk)}
      </div></div>
      ${inp('Tipografía de titulares (Google Fonts)', 'display', f.display, 'list="mk-fonts" placeholder="Archivo"')}
      ${inp('Tipografía de textos (Google Fonts)', 'body', f.body, 'list="mk-fonts" placeholder="Inter"')}
      <div class="field checks full"><label><input type="checkbox" name="titleCase" ${b.titleCase === 'upper' ? 'checked' : ''}> Titulares en MAYÚSCULAS</label></div>
      <datalist id="mk-fonts">${GOOGLE_FONTS.map((x) => `<option value="${x}">`).join('')}</datalist>
      <div class="field full"><span class="lbl">Vista previa</span><div class="mk-preview" id="mk-preview"></div></div>`
    : `<div class="field"><label class="mk-color"><input type="color" name="swatch" value="${esc(hexRgb(b.swatch) ? b.swatch : '#888888')}"><span>Color del selector</span></label></div>
      <p class="hint full">Esta marca tiene diseño propio (<span class="mono">${esc(b.design)}</span>): sus colores, tipografías y composiciones están en <span class="mono">public/slides.css</span>.</p>`}
    </div>
    ${isNew ? '' : '<div class="form-actions"><button type="submit" class="btn accent">Guardar identidad</button><span class="hint" id="mk-id-hint"></span></div>'}`;
}

function identityHtml(d) {
  return `<section class="mk-sec"><h2 class="sec-title">Identidad</h2>
    <form id="mk-identity" autocomplete="off">${identityFields(d)}</form></section>`;
}

// Lee el formulario de identidad (también el de marca nueva)
function readIdentity(form, prev = {}) {
  const v = (n) => form.elements[n]?.value?.trim() ?? '';
  const out = {
    name: v('name'), file: v('file'), theme: v('theme') || 'dark', look: v('look'), cutout: !!form.elements.cutout?.checked,
    defaults: { audiencia: v('audiencia'), cta: v('cta'), idioma: v('idioma'), objetivo: v('objetivo') },
  };
  if (form.elements.accent) {
    out.colors = { accent: v('accent'), darkBg: v('darkBg'), darkInk: v('darkInk'), lightBg: v('lightBg'), lightInk: v('lightInk') };
    out.fonts = { display: v('display') || 'Archivo', body: v('body') || 'Inter' };
    out.titleCase = form.elements.titleCase.checked ? 'upper' : 'none';
  }
  if (form.elements.swatch) out.swatch = v('swatch');
  return { ...prev, ...out };
}

// Tres láminas de muestra con los colores y tipografías del formulario, sin guardar
function updatePreview() {
  const box = $('#mk-preview');
  const form = box?.closest('form');
  if (!box || !form) return;
  const br = { ...readIdentity(form, mk.sel?.type === 'brand' ? BRANDS[mk.sel.id] : {}), id: mk.sel?.id || 'nueva', design: 'base' };
  if (!br.name) br.name = 'Tu marca';
  [br.fonts?.display, br.fonts?.body].forEach(loadFont);
  const p = { brand: br.id, brandData: br, name: '' };
  const slides = [
    blankSlide('portada', br.id, { theme: 'dark', kicker: 'Antetítulo', title: 'Titular con *acento*', photo: 'Foto de la escena' }),
    blankSlide('lista', br.id, { theme: 'light', title: 'Tres ideas *clave*', items: ['Primera idea corta', 'Segunda idea corta', 'Tercera idea corta'] }),
    blankSlide('cta', br.id, { theme: 'dark', title: 'Escríbenos *hoy*', body: 'Texto de apoyo corto.', cta: br.defaults?.cta || 'Llamado' }),
  ];
  box.replaceChildren(...slides.map((s, i) => {
    const frame = document.createElement('div');
    frame.className = 'mk-pv';
    const el = buildSlide(p, s, i, slides.length);
    frame.appendChild(el);
    return frame;
  }));
  requestAnimationFrame(() => $$('.mk-pv', box).forEach((fr) => {
    const el = fr.firstElementChild;
    fitSlide(el);
    el.style.transform = `scale(${fr.clientWidth / 1080})`;
  }));
}

function rulesHtml(d) {
  return `<section class="mk-sec"><h2 class="sec-title">Reglas para Claude</h2>
    <p class="hint">Instrucciones cortas que mandan sobre las reglas generales al escribir el guion de esta marca: tono, qué fotos, qué evitar, cómo usar el acento. Se guardan en <span class="mono">reglas.md</span>.</p>
    <textarea class="inp mono-area" id="mk-rules" rows="${Math.min(18, Math.max(5, (d.rules || '').split('\n').length + 1))}" placeholder="- Tono cercano y directo&#10;- Fotos en lugares reales de la marca&#10;- Nunca usar…">${esc(d.rules || '')}</textarea>
    <div class="form-actions"><button type="button" class="btn" id="mk-save-rules">Guardar reglas</button></div></section>`;
}

function resRow(r) {
  const editable = /\.(md|txt)$/i.test(r.name);
  return `<li class="mk-res ${r.active ? '' : 'off'}" data-path="${esc(r.path)}">
    <label class="mk-on" title="Claude lo usa"><input type="checkbox" data-res-active ${r.active ? 'checked' : ''}><span>${r.active ? 'Activo' : 'Inactivo'}</span></label>
    <span class="mk-name">${esc(r.name)} <small>${kb(r.size)}</small></span>
    <input class="inp sm mk-tags" data-res-tags value="${esc(r.tags.join(', '))}" placeholder="Etiquetas" aria-label="Etiquetas de ${esc(r.name)}">
    <span class="mk-acts">
      ${editable ? '<button type="button" class="btn sm" data-res-edit>Editar</button>' : `<a class="btn sm ghost" href="${esc(r.url)}" target="_blank" rel="noopener">Abrir</a>`}
      <button type="button" class="btn sm ghost danger" data-res-delete>Eliminar</button>
    </span></li>`;
}

function docsHtml(list) {
  return `<section class="mk-sec"><h2 class="sec-title">Conocimiento · ${list.length}</h2>
    <p class="hint">Perfil, tono, ofertas, guías. Claude lee completos los documentos activos en cada propuesta (.md, .txt o .pdf).</p>
    <ul class="mk-reslist">${list.map(resRow).join('') || '<li class="empty">Sin documentos.</li>'}</ul>
    <div class="form-actions">
      <label class="btn sm">Subir archivos<input type="file" data-upload-kind="conocimiento" accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf" multiple hidden></label>
      <button type="button" class="btn sm" id="mk-new-doc">Escribir texto</button>
    </div></section>`;
}

const factRow = (f, i) => `<div class="mk-fact" data-i="${i}">
    <textarea class="inp" rows="2" data-fact="dato" placeholder="El dato, tal como se puede publicar" aria-label="Dato ${i + 1}">${esc(f.dato || '')}</textarea>
    <input class="inp" data-fact="fuente" value="${esc(f.fuente || '')}" placeholder="Fuente (ej. KFF, 2026)" aria-label="Fuente ${i + 1}">
    <input class="inp" data-fact="url" value="${esc(f.url || '')}" placeholder="Enlace (opcional)" aria-label="Enlace ${i + 1}">
    <button type="button" class="icon-btn" data-fact-del="${i}" aria-label="Quitar dato ${i + 1}">×</button></div>`;

function factsHtml(list) {
  return `<section class="mk-sec"><h2 class="sec-title">Datos verificados · ${list.length}</h2>
    <p class="hint">Cifras y hechos ya comprobados, con su fuente. Claude los puede usar sin buscarlos y los cita en la lámina.</p>
    <div id="mk-facts">${list.map(factRow).join('')}</div>
    <div class="form-actions"><button type="button" class="btn sm" id="mk-add-fact">+ Agregar dato</button><button type="button" class="btn sm accent" id="mk-save-facts">Guardar datos</button></div></section>`;
}

function refsHtml(list) {
  const on = list.filter((r) => r.active).length;
  return `<section class="mk-sec"><h2 class="sec-title">Referencias visuales · ${on} activas de ${list.length}</h2>
    <p class="hint">Carruseles, fotos o composiciones que te gustan. Claude ve hasta ${8} activas (en orden alfabético) para entender el estilo; no copia sus textos ni caras. Se guardan como JPEG de 1600 px.</p>
    <div class="mk-refs">${list.map((r) => `<figure class="mk-ref ${r.active ? '' : 'off'}" data-path="${esc(r.path)}">
      <a href="${esc(r.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${esc(r.url)}" alt="${esc(r.name)}"></a>
      <figcaption>
        <label class="mk-on"><input type="checkbox" data-res-active ${r.active ? 'checked' : ''}><span>${r.active ? 'Activa' : 'Inactiva'}</span></label>
        <input class="inp sm mk-tags" data-res-tags value="${esc(r.tags.join(', '))}" placeholder="Etiquetas" aria-label="Etiquetas de ${esc(r.name)}">
        <span class="mk-ref-name" title="${esc(r.name)}">${esc(r.name)}</span>
        <button type="button" class="btn sm ghost danger" data-res-delete>Eliminar</button>
      </figcaption></figure>`).join('') || '<p class="empty">Sin referencias.</p>'}</div>
    <div class="form-actions"><label class="btn sm">Subir imágenes<input type="file" data-upload-kind="referencias" accept="image/*" multiple hidden></label></div></section>`;
}

function logosHtml(d, files) {
  const logos = d.logos || {};
  const used = new Set(Object.values(logos).map((l) => l.src));
  const slot = (k, label) => {
    const l = logos[k];
    const prev = l ? LOGOS[`${d.id}:${k}`]?.data || l.url : '';
    return `<div class="mk-logo ${k}" data-slot="${k}">
      <span class="lbl">${label}</span>
      <div class="mk-logo-prev">${prev ? `<img src="${esc(prev)}" alt="Logo ${label}">` : '<span>Sin logo</span>'}</div>
      <select class="inp sm" data-logo-key aria-label="Fondo del logo ${label}">${Object.entries(LOGO_BG).map(([v, t]) => opt(v, keyName(l?.key), t)).join('')}</select>
      <div class="form-actions">
        <label class="btn sm">${l ? 'Cambiar' : 'Subir'}<input type="file" data-upload-kind="logos" data-role="${k}" accept="image/*" hidden></label>
        ${l ? `<button type="button" class="btn sm ghost danger" data-logo-remove="${esc(l.src)}">Quitar</button>` : ''}
      </div></div>`;
  };
  const others = files.filter((f) => !used.has(f.path));
  return `<section class="mk-sec"><h2 class="sec-title">Logos</h2>
    <p class="hint">El logo va en la firma de cada lámina. Si solo subes uno, se usa en los dos fondos. PNG con fondo transparente es lo ideal; si no, elige qué color de fondo quitar.</p>
    <div class="mk-logos">${slot('dark', 'Para fondo oscuro')}${slot('light', 'Para fondo claro')}</div>
    ${others.length ? `<p class="hint">Otros archivos en la carpeta de logos:</p><ul class="mk-reslist">${others.map((f) => `<li class="mk-res" data-path="${esc(f.path)}">
      <span class="mk-name">${esc(f.name)}</span><span class="mk-acts">
      <button type="button" class="btn sm" data-logo-use="dark">Usar en oscuro</button><button type="button" class="btn sm" data-logo-use="light">Usar en claro</button>
      <button type="button" class="btn sm ghost danger" data-res-delete>Eliminar</button></span></li>`).join('')}</ul>` : ''}
  </section>`;
}

function brandPeopleHtml(d) {
  const on = new Set(d.personas || []);
  return `<section class="mk-sec"><h2 class="sec-title">Personas aprobadas</h2>
    <p class="hint">Si el guion pone a una de estas personas en una foto, se mandan sus fotos de cara a Higgsfield para conservar su rostro. <button type="button" class="btn sm ghost" data-goto-people>Gestionar personas</button></p>
    <div class="checks mk-people-pick">${(mk.people || []).map((p) => `<label><input type="checkbox" data-brand-person="${esc(p.id)}" ${on.has(p.id) ? 'checked' : ''}>
      ${p.photos[0] ? `<img src="${esc(p.photos[0].url)}" alt="">` : ''} ${esc(p.name)}</label>`).join('') || '<p class="empty">No hay personas aprobadas.</p>'}</div></section>`;
}

function trashHtml(list) {
  if (!list.length) return '';
  const kinds = { conocimiento: 'Documento', referencias: 'Referencia', logos: 'Logo' };
  return `<section class="mk-sec"><details><summary class="sec-title">Papelera · ${list.length}</summary>
    <p class="hint">Lo eliminado queda aquí hasta que lo borres definitivamente.</p>
    <ul class="mk-reslist">${list.map((t) => `<li class="mk-res" data-trash="${esc(t.name)}">
      <span class="mk-name">${esc(t.original)} <small>${kinds[t.kind] || t.kind}${t.deletedAt ? ' · ' + new Date(t.deletedAt).toLocaleString('es') : ''}</small></span>
      <span class="mk-acts"><button type="button" class="btn sm" data-trash-restore>Restaurar</button><button type="button" class="btn sm ghost danger" data-trash-purge>Borrar definitivamente</button></span></li>`).join('')}</ul>
    </details></section>`;
}

// ---------------------------------------------------------------- personas
function renderPeople() {
  const brands = Object.values(BRANDS).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  $('#mk-main').innerHTML = `
    <header class="mk-head"><div><h1 class="h1">Personas aprobadas</h1>
      <p class="hint mono">06_MARCAS/_personas/</p></div></header>
    <p class="lede">Caras reales que el generador debe respetar. Cada persona se puede usar en varias marcas. Las fotos se mandan a Higgsfield en este orden (la primera pesa más); desactiva las que suavizan los rasgos.</p>
    <form class="mk-sec mk-inline" id="mk-new-person"><label class="lbl" for="mk-np-name">Nueva persona</label>
      <input id="mk-np-name" class="inp" placeholder="Nombre completo" required><button type="submit" class="btn accent">Agregar</button></form>
    ${(mk.people || []).map((p) => `<form class="mk-sec mk-person" data-person="${esc(p.id)}" autocomplete="off">
      <h2 class="sec-title">${esc(p.name)}</h2>
      <div class="req-form">
        <div class="field"><label class="lbl">Nombre</label><input class="inp" name="name" value="${esc(p.name)}" required></div>
        <div class="field"><label class="lbl">Otros nombres o apodos (separados por coma)</label><input class="inp" name="aliases" value="${esc((p.aliases || []).join(', '))}" placeholder="Ej. Raúl, Raul"></div>
        <div class="field full"><label class="lbl">Quién es (lo lee Claude)</label><input class="inp" name="descripcion" value="${esc(p.descripcion || '')}" placeholder="Ej. Gerente de ventas; aparece en ofertas y entregas de autos"></div>
        <div class="field full"><label class="lbl">Bloqueo de identidad (inglés, va en cada foto con esta persona)</label>
          <textarea class="inp mono-area" name="identidad" rows="4" placeholder="${esc(p.lock)}">${esc(p.identidad || '')}</textarea>
          <p class="help">Vacío = se usa el texto genérico que ves de fondo. Describe rasgos concretos (forma de la cara, cejas, ojos, cabello, piel) para que no cambie.</p></div>
        <div class="field full checks"><span class="lbl">Marcas donde puede aparecer</span><div class="mk-inline">${brands.map((b) => `<label><input type="checkbox" name="brands" value="${esc(b.id)}" ${p.brands.includes(b.id) ? 'checked' : ''}> ${esc(b.name)}</label>`).join('')}</div></div>
      </div>
      <div class="mk-photos">${p.photos.map((f, i) => `<figure class="mk-photo ${f.active ? '' : 'off'}" data-photo="${esc(f.name)}">
        <span class="mk-n">${i + 1}</span><img loading="lazy" src="${esc(f.url)}" alt="">
        <figcaption><label class="mk-on"><input type="checkbox" data-photo-active ${f.active ? 'checked' : ''}><span>${f.active ? 'Se envía' : 'No se envía'}</span></label>
          <span class="mk-acts"><button type="button" class="icon-btn" data-photo-move="-1" aria-label="Antes">←</button><button type="button" class="icon-btn" data-photo-move="1" aria-label="Después">→</button>
          <button type="button" class="btn sm ghost danger" data-photo-delete>Eliminar</button></span></figcaption></figure>`).join('') || '<p class="empty">Sin fotos: sube al menos una foto clara de la cara.</p>'}</div>
      <div class="form-actions">
        <label class="btn sm">Subir fotos<input type="file" data-person-upload accept="image/*" multiple hidden></label>
        <button type="submit" class="btn sm accent">Guardar</button>
        <button type="button" class="btn sm ghost danger" data-person-archive>Archivar persona</button>
      </div></form>`).join('')}`;
}

async function reloadPeople() {
  mk.people = await api('/api/people');
  await loadBrands();
  const y = $('#mk-main').scrollTop;
  renderPeople();
  $('#mk-main').scrollTop = y;
}

// ---------------------------------------------------------------- marca nueva
function renderNewBrand() {
  const d = mk.draft || {};
  const b = d.brand || { design: 'base', theme: 'dark', titleCase: 'upper', cutout: false,
    colors: { accent: '#ECFE6E', darkBg: '#1E1E20', darkInk: '#F2F0EA', lightBg: '#F4F2EC', lightInk: '#1E1E20' },
    fonts: { display: 'Archivo', body: 'Inter' }, defaults: { idioma: 'Español', objetivo: 'Autoridad' } };
  $('#mk-main').innerHTML = `
    <header class="mk-head"><div><h1 class="h1">Nueva marca</h1></div></header>
    <section class="mk-sec mk-assist">
      <h2 class="sec-title">Con ayuda de Claude (opcional)</h2>
      <p class="hint">Cuéntale qué es la marca, a quién le vende y cómo se ve. Si das el sitio web, Claude lo investiga. Arma el perfil, las reglas, los colores y las tipografías, y tú lo corriges abajo antes de crearla. Cuesta ≈ $0.15–0.40.</p>
      <div class="req-form">
        <div class="field"><label class="lbl" for="mk-a-name">Nombre</label><input id="mk-a-name" class="inp" value="${esc(d.name || '')}" placeholder="Ej. Viva Insurance"></div>
        <div class="field"><label class="lbl" for="mk-a-web">Sitio web o Instagram</label><input id="mk-a-web" class="inp" value="${esc(d.website || '')}" placeholder="https://…"></div>
        <div class="field full"><div class="lbl-row"><label class="lbl" for="mk-a-desc">Descripción</label>${dictateBox()}</div>
          <textarea id="mk-a-desc" class="inp" rows="5" placeholder="Qué vende, a quién, tono, colores, qué le gusta y qué no, personas que aparecen…">${esc(d.description || '')}</textarea></div>
      </div>
      <div class="form-actions"><button type="button" class="btn accent" id="mk-assist-go" ${state.hasKey ? '' : 'disabled title="Agrega la API key en Ajustes"'}>Armar perfil con Claude</button><span class="hint" id="mk-assist-hint"></span></div>
      ${d.questions?.length ? `<div class="mk-questions"><b>Claude necesita que confirmes:</b><ul>${d.questions.map((q) => `<li>${esc(q)}</li>`).join('')}</ul></div>` : ''}
      ${d.research ? `<details class="research"><summary>Investigación de Claude</summary><div class="research-body">${esc(d.research).replace(/(https?:\/\/[^\s<)\]]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>').replace(/\n/g, '<br>')}</div></details>` : ''}
    </section>
    <form class="mk-sec" id="mk-new-form" autocomplete="off">
      <h2 class="sec-title">Identidad</h2>
      ${identityFields(b, true)}
      <h2 class="sec-title">Perfil de marca</h2>
      <p class="hint">Se guarda como <span class="mono">conocimiento/perfil.md</span>. Posicionamiento, audiencia, ofertas, voz, pilares, sistema visual, personas, datos aprobados y qué está prohibido.</p>
      <textarea class="inp mono-area" name="profile" rows="14" placeholder="# Nombre de la marca&#10;&#10;## Posicionamiento&#10;…">${esc(d.profile || '')}</textarea>
      <h2 class="sec-title">Reglas para Claude</h2>
      <textarea class="inp mono-area" name="rules" rows="6" placeholder="- Tono…&#10;- Fotos…&#10;- Evitar…">${esc(d.rules || '')}</textarea>
      <div class="form-actions"><button type="submit" class="btn accent">Crear marca</button><span class="hint">Después podrás subir logos, documentos, referencias y enlazar personas.</span></div>
    </form>`;
  attachDictation($('#mk-main .dictate'), $('#mk-a-desc'));
  updatePreview();
}

async function assistBrand(btn) {
  const name = $('#mk-a-name').value.trim();
  if (!name) { toast('Escribe el nombre de la marca.', true); $('#mk-a-name').focus(); return; }
  const website = $('#mk-a-web').value.trim(), description = $('#mk-a-desc').value.trim();
  btn.disabled = true;
  btn.textContent = 'Claude está investigando…';
  $('#mk-assist-hint').textContent = 'Tarda entre 30 segundos y dos minutos.';
  try {
    const r = await api('/api/brands/_draft', { name, website, description });
    mk.draft = {
      name, website, description, profile: r.profile, rules: r.rules, questions: r.questions, research: r.research,
      brand: {
        name, design: 'base', theme: r.theme, titleCase: r.titleCase, cutout: false, look: r.look,
        colors: { accent: r.accent, darkBg: r.darkBg, darkInk: r.darkInk, lightBg: r.lightBg, lightInk: r.lightInk },
        fonts: { display: r.displayFont, body: r.bodyFont },
        defaults: { audiencia: r.audiencia, cta: r.cta, idioma: r.idioma, objetivo: OBJETIVOS.includes(r.objetivo) ? r.objetivo : 'Autoridad' },
      },
    };
    renderNewBrand();
    toast(`Perfil listo (${money(r.usage?.usd || 0)}). Revísalo y corrige lo que haga falta antes de crear la marca.`);
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = 'Armar perfil con Claude';
    $('#mk-assist-hint').textContent = '';
  }
}

// ---------------------------------------------------------------- subidas
async function uploadResources(id, input) {
  const files = [...input.files];
  input.value = '';
  let r = null;
  for (let n = 0; n < files.length; n++) {
    const f = files[n];
    toast(files.length > 1 ? `Subiendo ${n + 1} de ${files.length}…` : `Subiendo ${f.name}…`);
    try {
      const body = { kind: input.dataset.uploadKind, name: f.name, dataUrl: await readAsDataUrl(f) };
      if (input.dataset.role) {
        body.role = input.dataset.role;
        const k = input.closest('[data-slot]')?.querySelector('[data-logo-key]')?.value;
        if (LOGO_KEY[k]) body.key = LOGO_KEY[k];
      }
      r = await brandApi(id, 'add', body);
    } catch (e) { toast(`${f.name}: ${e.message}`, true); }
  }
  if (r) { await applyDetail(r, input.dataset.uploadKind === 'logos'); toast(files.length > 1 ? 'Archivos subidos.' : 'Archivo subido.'); }
}

// ---------------------------------------------------------------- documento (crear o editar)
async function openDoc(path) {
  const dlg = $('#dlg-doc');
  const r = path ? mk.detail.resources.conocimiento.find((x) => x.path === path) : null;
  $('#doc-title').textContent = r ? r.name : 'Nuevo documento';
  $('#doc-name').hidden = !!r;
  $('#doc-name-lbl').hidden = !!r;
  $('#doc-name').value = '';
  $('#doc-text').value = r ? 'Cargando…' : '';
  dlg.dataset.path = path || '';
  dlg.showModal();
  if (r) {
    try { $('#doc-text').value = await (await fetch(r.url, { cache: 'no-store' })).text(); } catch (e) { $('#doc-text').value = ''; toast(e.message, true); }
  } else $('#doc-name').focus();
}

async function saveDoc() {
  const dlg = $('#dlg-doc'), id = mk.detail.id, path = dlg.dataset.path;
  try {
    const r = path
      ? await brandApi(id, 'update', { path, text: $('#doc-text').value })
      : await brandApi(id, 'add', { kind: 'conocimiento', name: $('#doc-name').value.trim(), text: $('#doc-text').value });
    dlg.close();
    await applyDetail(r);
    toast('Documento guardado.');
  } catch (e) { toast(e.message, true); }
}

// ---------------------------------------------------------------- eventos
function readFacts() {
  return $$('#mk-facts .mk-fact').map((row) => ({
    dato: $('[data-fact="dato"]', row).value.trim(), fuente: $('[data-fact="fuente"]', row).value.trim(), url: $('[data-fact="url"]', row).value.trim(),
  }));
}

// Guarda un cambio de la marca abierta y refresca
async function saveBrand(fields, reload = true, msg = 'Guardado.') {
  try {
    const r = await brandApi(mk.detail.id, '', fields);
    await applyDetail(r, reload);
    toast(msg);
  } catch (e) { toast(e.message, true); }
}

function bindBrands() {
  $('#mk-new').addEventListener('click', () => openSel({ type: 'new' }));
  $('.mk-rail').addEventListener('click', async (e) => {
    const it = e.target.closest('.mk-item');
    if (it) { openSel({ type: it.dataset.type, id: it.dataset.id }); return; }
    const rb = e.target.closest('[data-restore-archived]');
    if (rb) {
      try {
        const r = await api('/api/brands/_restore', { name: rb.dataset.restoreArchived });
        await loadBrands();
        refreshBrandPickers();
        mk.people = null;
        toast('Restaurada.');
        openSel(BRANDS[r.id] ? { type: 'brand', id: r.id } : { type: 'people' });
      } catch (err) { toast(err.message, true); }
    }
  });

  const main = $('#mk-main');
  main.addEventListener('input', (e) => { if (e.target.closest('#mk-identity, #mk-new-form')) { clearTimeout(mk.pvTimer); mk.pvTimer = setTimeout(updatePreview, 150); } });

  main.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'mk-identity') {
      const fields = readIdentity(f);
      if (!fields.name) { toast('La marca necesita un nombre.', true); return; }
      saveBrand(fields, true, 'Identidad guardada.');
    } else if (f.id === 'mk-new-form') {
      const fields = { ...readIdentity(f), design: 'base', profile: f.elements.profile.value, rules: f.elements.rules.value };
      if (!fields.name) { toast('La marca necesita un nombre.', true); return; }
      try {
        const r = await api('/api/brands', fields);
        mk.draft = null;
        await loadBrands();
        refreshBrandPickers();
        toast('Marca creada. Ahora sube su logo, documentos y referencias.');
        openSel({ type: 'brand', id: r.id });
      } catch (err) { toast(err.message, true); }
    } else if (f.id === 'mk-new-person') {
      try {
        await api('/api/people', { name: $('#mk-np-name').value.trim(), aliases: [], brands: [] });
        await reloadPeople();
        toast('Persona agregada. Sube sus fotos de cara.');
      } catch (err) { toast(err.message, true); }
    } else if (f.dataset.person) {
      try {
        await api('/api/people', {
          id: f.dataset.person, name: f.elements.name.value, descripcion: f.elements.descripcion.value, identidad: f.elements.identidad.value,
          aliases: f.elements.aliases.value.split(','), brands: $$('input[name="brands"]:checked', f).map((x) => x.value),
        });
        await reloadPeople();
        refreshBrandPickers();
        toast('Persona guardada.');
      } catch (err) { toast(err.message, true); }
    }
  });

  main.addEventListener('change', async (e) => {
    const t = e.target;
    const id = mk.detail?.id;
    const path = t.closest('[data-path]')?.dataset.path;
    try {
      if (t.dataset.uploadKind) await uploadResources(id, t);
      else if (t.matches('[data-res-active]')) await applyDetail(await brandApi(id, 'update', { path, active: t.checked }));
      else if (t.matches('[data-res-tags]')) await applyDetail(await brandApi(id, 'update', { path, tags: t.value.split(',') }));
      else if (t.matches('[data-logo-key]')) {
        const slot = t.closest('[data-slot]').dataset.slot;
        const logos = JSON.parse(JSON.stringify(mk.detail.logos || {}));
        if (!logos[slot]) return;
        Object.values(logos).forEach((l) => delete l.url);
        if (LOGO_KEY[t.value]) logos[slot].key = LOGO_KEY[t.value]; else delete logos[slot].key;
        await saveBrand({ logos }, true, 'Logo actualizado.');
      } else if (t.matches('[data-brand-person]')) {
        await saveBrand({ personas: $$('[data-brand-person]:checked', main).map((x) => x.dataset.brandPerson) }, true, 'Personas de la marca guardadas.');
      } else if (t.matches('[data-person-upload]')) {
        const pid = t.closest('[data-person]').dataset.person;
        const files = [...t.files];
        t.value = '';
        for (const f of files) await api(`/api/people/${pid}/photo`, { op: 'add', name: f.name, dataUrl: await readAsDataUrl(f) });
        await reloadPeople();
        toast(files.length > 1 ? 'Fotos subidas.' : 'Foto subida.');
      } else if (t.matches('[data-photo-active]')) {
        const pid = t.closest('[data-person]').dataset.person;
        await api(`/api/people/${pid}/photo`, { op: 'update', photo: t.closest('[data-photo]').dataset.photo, active: t.checked });
        await reloadPeople();
      }
    } catch (err) { toast(err.message, true); }
  });

  main.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = mk.detail?.id;
    const path = b.closest('[data-path]')?.dataset.path;
    try {
      if (b.dataset.openFolder) openFolder(b.dataset.openFolder);
      else if (b.id === 'mk-archive') confirmClick(b, async () => {
        await brandApi(id, 'archive', {});
        await loadBrands();
        refreshBrandPickers();
        toast('Marca archivada. Puedes restaurarla desde "Archivadas".');
        openSel({ type: 'brand', id: firstBrand() });
      });
      else if (b.id === 'mk-save-rules') saveBrand({ rules: $('#mk-rules').value }, false, 'Reglas guardadas.');
      else if (b.id === 'mk-new-doc') openDoc('');
      else if (b.matches('[data-res-edit]')) openDoc(path);
      else if (b.matches('[data-res-delete]')) confirmClick(b, async () => { await applyDetail(await brandApi(id, 'delete', { path }), path.startsWith('logos/')); toast('Enviado a la papelera.'); });
      else if (b.matches('[data-trash-restore]')) { await applyDetail(await brandApi(id, 'restore', { name: b.closest('[data-trash]').dataset.trash })); toast('Restaurado.'); }
      else if (b.matches('[data-trash-purge]')) confirmClick(b, async () => { await applyDetail(await brandApi(id, 'purge', { name: b.closest('[data-trash]').dataset.trash })); toast('Borrado definitivamente.'); });
      else if (b.id === 'mk-add-fact') {
        $('#mk-facts').insertAdjacentHTML('beforeend', factRow({}, $$('#mk-facts .mk-fact').length));
        $$('#mk-facts [data-fact="dato"]').pop().focus();
      } else if (b.dataset.factDel !== undefined) b.closest('.mk-fact').remove();
      else if (b.id === 'mk-save-facts') {
        const facts = readFacts().filter((f) => f.dato);
        if (facts.some((f) => !f.fuente)) { toast('Cada dato necesita su fuente.', true); return; }
        saveBrand({ datos: facts }, false, 'Datos guardados.');
      } else if (b.dataset.logoRemove) confirmClick(b, async () => { await applyDetail(await brandApi(id, 'delete', { path: b.dataset.logoRemove }), true); toast('Logo quitado (queda en la papelera).'); });
      else if (b.dataset.logoUse) {
        const logos = JSON.parse(JSON.stringify(mk.detail.logos || {}));
        Object.values(logos).forEach((l) => delete l.url);
        logos[b.dataset.logoUse] = { src: path };
        saveBrand({ logos }, true, 'Logo asignado.');
      } else if (b.matches('[data-goto-people]')) openSel({ type: 'people' });
      else if (b.id === 'mk-assist-go') assistBrand(b);
      else if (b.dataset.photoMove) {
        const pid = b.closest('[data-person]').dataset.person;
        await api(`/api/people/${pid}/photo`, { op: 'update', photo: b.closest('[data-photo]').dataset.photo, move: +b.dataset.photoMove });
        await reloadPeople();
      } else if (b.matches('[data-photo-delete]')) confirmClick(b, async () => {
        const pid = b.closest('[data-person]').dataset.person;
        await api(`/api/people/${pid}/photo`, { op: 'delete', photo: b.closest('[data-photo]').dataset.photo });
        await reloadPeople();
        toast('Foto enviada a la papelera de la persona.');
      });
      else if (b.matches('[data-person-archive]')) confirmClick(b, async () => {
        await api(`/api/people/${b.closest('[data-person]').dataset.person}/archive`, {});
        await reloadPeople();
        refreshBrandPickers();
        state.archived = (await api('/api/brands')).archived;
        renderBrandRail();
        toast('Persona archivada. Puedes restaurarla desde "Archivadas".');
      });
    } catch (err) { toast(err.message, true); }
  });

  $('#doc-form').addEventListener('submit', (e) => { e.preventDefault(); saveDoc(); });
}
