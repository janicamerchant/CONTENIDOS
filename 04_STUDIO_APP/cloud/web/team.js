// Pantalla "Equipo" (solo administración): invitar personas, rol, marcas, límite mensual y enlaces de acceso.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLES = { admin: 'Admin · todo, incluido el equipo', editor: 'Editor · crea y genera en sus marcas', lector: 'Lector · solo ve sus marcas' };
let request, dlg, data;

function brandChecks(name, selected, disabled) {
  return data.brands.map((b) => `<label class="team-brand"><input type="checkbox" name="${name}" value="${esc(b.id)}" ${selected.includes(b.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}> ${esc(b.name)}</label>`).join('');
}
function linkBox(email, link) {
  return `<div class="team-link"><b>Enlace de acceso para ${esc(email)}</b>
    <p class="hint">Envíaselo por WhatsApp o email. Con él elige su contraseña y después entra con su email. Sirve una sola vez y vence en aproximadamente 1 hora; si vence, genera otro.</p>
    <div class="team-link-row"><input class="inp" readonly value="${esc(link)}"><button type="button" class="btn accent" data-copy="${esc(link)}">Copiar</button></div></div>`;
}
function render(note = '') {
  const m = data.members;
  dlg.querySelector('.team-body').innerHTML = `
    ${note}
    <form class="team-invite" autocomplete="off">
      <h3 class="sec-title">Invitar a una persona</h3>
      <div class="team-grid">
        <label class="lbl">Email<input class="inp" name="email" type="email" required placeholder="nombre@empresa.com"></label>
        <label class="lbl">Rol<select class="inp" name="rol">${Object.entries(ROLES).map(([v, l]) => `<option value="${v}" ${v === 'editor' ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="lbl">Límite mensual (USD)<input class="inp" name="limite" type="number" min="0" max="10000" step="1" value="25"></label>
      </div>
      <span class="lbl">Marcas a las que tiene acceso</span>
      <div class="team-brands" data-invite-brands>${brandChecks('marca', [], false)}</div>
      <p class="hint">Los administradores ven todas las marcas.</p>
      <div class="form-actions"><button type="submit" class="btn accent">Invitar y generar enlace</button></div>
    </form>
    <h3 class="sec-title">Equipo · ${m.length}</h3>
    <div class="team-list">${m.map((x) => `
      <div class="team-row ${x.activo ? '' : 'off'}" data-id="${esc(x.id)}">
        <div class="team-who"><b>${esc(x.email)}</b>${x.yo ? ' <small>(tú)</small>' : ''}
          <small>${x.activo ? (x.ultimoAcceso ? 'Último acceso: ' + new Date(x.ultimoAcceso).toLocaleString('es') : 'Todavía no ha entrado') : 'Desactivado'}</small></div>
        <select class="inp sm" data-field="rol" ${x.yo ? 'disabled' : ''}>${Object.keys(ROLES).map((v) => `<option value="${v}" ${v === x.rol ? 'selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select>
        <label class="team-limit">US$ <input class="inp sm" type="number" min="0" max="10000" step="1" value="${x.limite}" data-field="limite"> /mes</label>
        <div class="team-brands">${x.rol === 'admin' ? '<small>Todas las marcas</small>' : brandChecks('m-' + x.id, x.marcas, !x.activo)}</div>
        <div class="team-acts">
          ${x.activo ? '<button type="button" class="btn sm" data-act="link">Nuevo enlace</button>' : ''}
          ${x.yo ? '' : `<button type="button" class="btn sm ghost ${x.activo ? 'danger' : ''}" data-act="toggle">${x.activo ? 'Desactivar' : 'Activar'}</button>`}
        </div>
      </div>`).join('')}</div>`;
}
async function load(note) {
  data = await request('/api/team');
  render(note);
}
async function act(fn) {
  try { await fn(); } catch (e) { alert(e.message); }
}
function bind() {
  dlg.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    act(async () => {
      const btn = f.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        const r = await request('/api/team/invite', { email: f.email.value, rol: f.rol.value, limite: Number(f.limite.value) || 0,
          marcas: [...f.querySelectorAll('[name=marca]:checked')].map((c) => c.value) });
        await load(linkBox(r.email, r.link));
      } finally { btn.disabled = false; }
    });
  });
  dlg.addEventListener('change', (e) => {
    const row = e.target.closest('.team-row');
    if (e.target.name === 'rol' && e.target.form?.classList.contains('team-invite')) {
      dlg.querySelectorAll('[data-invite-brands] input').forEach((c) => { c.disabled = e.target.value === 'admin'; });
    }
    if (!row) return;
    const id = row.dataset.id;
    const field = e.target.dataset.field;
    const body = { id };
    if (field === 'rol') body.rol = e.target.value;
    else if (field === 'limite') body.limite = Number(e.target.value) || 0;
    else if (e.target.name === 'm-' + id) body.marcas = [...row.querySelectorAll(`[name="m-${id}"]:checked`)].map((c) => c.value);
    else return;
    act(async () => { await request('/api/team/update', body); await load('<p class="team-ok">Cambios guardados.</p>'); });
  });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.copy) { navigator.clipboard.writeText(b.dataset.copy).then(() => { b.textContent = 'Copiado'; }); return; }
    if (b.dataset.close !== undefined) { dlg.close(); return; }
    const row = b.closest('.team-row');
    if (!row) return;
    const id = row.dataset.id, member = data.members.find((x) => x.id === id);
    if (b.dataset.act === 'link') act(async () => { const r = await request('/api/team/link', { id }); await load(linkBox(r.email, r.link)); });
    if (b.dataset.act === 'toggle') {
      if (member.activo && !confirm(`¿Desactivar a ${member.email}? No podrá entrar hasta que la vuelvas a activar.`)) return;
      act(async () => { await request('/api/team/update', { id, activo: !member.activo }); await load(`<p class="team-ok">${esc(member.email)} ${member.activo ? 'desactivado' : 'activado'}.</p>`); });
    }
  });
}
export async function openTeam(req) {
  request = req;
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'dlg team-dlg';
    dlg.innerHTML = '<div class="dlg-head"><h2 class="h2">Equipo</h2><button class="icon-btn" data-close aria-label="Cerrar">×</button></div><div class="team-body"><p class="hint">Cargando…</p></div>';
    document.body.append(dlg);
    bind();
  }
  dlg.showModal();
  await act(() => load(''));
}
