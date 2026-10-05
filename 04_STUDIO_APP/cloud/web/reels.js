// Pestaña Reels del Estudio (portada del Generador de Reels): video largo → guiones, reels → transcripción,
// clientes y estilos, historial y proyecto. Los clientes son las marcas del Estudio. Todo lo pesado va a la cola (/api/reels/*).
let request,uploadBlob,uploadSigned,resolve,role;
let CLIENTES=[],CONFIG={};
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={get(k){try{return localStorage.getItem(window.cloudStorageKey('reels-'+k))||'';}catch{return '';}},set(k,v){try{localStorage.setItem(window.cloudStorageKey('reels-'+k),v);}catch{}}};
const nombreCliente=id=>(CLIENTES.find(c=>c.id===id)||{}).nombre||'';
async function cargarClientes(){CLIENTES=await request('/api/reels/clientes');return CLIENTES;}
const ETIQUETAS={transcribir:'Transcripción',guiones:'Guiones',entregable:'PDF',sugerir:'Sugerencia',muestra:'Vista previa'};

const VISTA=`
<div class="rl-wrap">
 <h1 class="h1">Generador de Reels</h1>
 <p class="lede">Convierte podcasts, entrevistas y videos largos en guiones para Reels, con el estilo de cada cliente.</p>
 <p class="banner" id="rl-aviso" hidden></p>
 <nav class="rl-nav" role="tablist">
  <button data-rl="largo" class="on">Video largo → Guiones</button>
  <button data-rl="reel">Reels → Transcripción</button>
  <button data-rl="clientes">Clientes y estilos</button>
  <button data-rl="historial">Historial</button>
 </nav>

 <section id="rl-tab-largo" class="rl-panel">
  <form id="rl-f-largo">
   <div class="rl-modo" role="radiogroup" aria-label="Qué hacer con el video">
    <label><input type="radio" name="modo" value="guiones" checked> Transcribir y escribir guiones</label>
    <label><input type="radio" name="modo" value="transcribir"> Solo transcribir</label>
   </div>
   <label class="lbl" for="rl-urls-largo">Enlace del video (YouTube, TikTok o Instagram)</label>
   <textarea class="inp" id="rl-urls-largo" name="urls" rows="2" placeholder="https://www.youtube.com/watch?v=…"></textarea>
   <p class="hint">Puedes pegar varios, uno por línea. Cada uno se procesa por separado.</p>
   <label class="lbl">…o sube el archivo de audio/video <span class="rl-meta">(hasta 50 MB; para videos largos sube solo el audio en m4a o mp3)</span></label>
   <input class="inp" type="file" name="archivo" accept="audio/*,video/*">
   <div class="rl-selector" id="rl-sel-largo"></div>
   <div class="rl-row">
    <div><label class="lbl">Idioma del video</label><select class="inp" name="idioma">
     <option value="multi">Español / inglés (mezclado)</option><option value="es">Español</option><option value="en">Inglés</option><option value="auto">Detectar automáticamente</option></select></div>
    <div class="rl-solo-guiones"><label class="lbl">Guiones por estilo</label><input class="inp" type="number" name="cantidad" value="5" min="1" max="20"></div>
   </div>
   <div class="rl-solo-guiones">
    <label class="lbl">Instrucciones adicionales (opcional)</label>
    <textarea class="inp" name="instrucciones" rows="2" placeholder="Ej.: enfocado en la campaña de este mes, evitar hablar de precios…"></textarea>
    <div class="rl-entregable-op">
     <label class="rl-chip"><input type="checkbox" name="entregable" id="rl-op-entregable"> Crear también un PDF entregable por cada guion (lead magnet del reel, máximo 4 páginas)</label>
     <div id="rl-op-guia" hidden>
      <label class="lbl">Guía de estructura para el accionable <span class="rl-meta">(opcional: si la dejas vacía se usa la del cliente)</span></label>
      <textarea class="inp" name="guia_entregable" rows="5" placeholder="Ej.: 7 pasos para automatizar tu negocio con IA. Cada paso: acción, por qué importa, herramienta sugerida y una tarea para hoy. Cierra con un checklist final."></textarea>
     </div>
    </div>
   </div>
   <button class="btn accent rl-enviar" type="submit">Generar guiones</button>
  </form>
  <div class="rl-jobs"></div>
 </section>

 <section id="rl-tab-reel" class="rl-panel" hidden>
  <form id="rl-f-reel">
   <label class="lbl">Enlaces de Reels / TikToks / Shorts</label>
   <textarea class="inp" name="urls" rows="4" placeholder="Uno por línea"></textarea>
   <label class="lbl">…o sube el archivo <span class="rl-meta">(hasta 50 MB)</span></label>
   <input class="inp" type="file" name="archivo" accept="audio/*,video/*">
   <div class="rl-row">
    <div><label class="lbl">Cliente / cuenta</label><select class="inp" name="marca" id="rl-reel-cliente"></select></div>
    <div><label class="lbl">Idioma</label><select class="inp" name="idioma">
     <option value="multi">Español / inglés (mezclado)</option><option value="es">Español</option><option value="en">Inglés</option><option value="auto">Detectar automáticamente</option></select></div>
   </div>
   <button class="btn accent" type="submit">Transcribir</button>
  </form>
  <div class="rl-jobs"></div>
 </section>

 <section id="rl-tab-clientes" class="rl-panel" hidden>
  <div class="rl-clientes"><div><div class="rl-cli-lista" id="rl-cli-lista"></div>
   ${'<button class="btn ghost sm" id="rl-cli-nuevo" style="margin-top:10px">+ Nuevo cliente</button>'}</div>
   <div id="rl-cli-editor"></div></div>
 </section>

 <section id="rl-tab-historial" class="rl-panel" hidden><h2 class="h2">Historial</h2><div id="rl-lista"></div></section>
 <section id="rl-proyecto" hidden></section>
</div>`;

// ---------- clientes: un cliente es una marca del Estudio; solo administración crea marcas nuevas
async function nuevoCliente(){
 if(role!=='admin'){alert('Solo administración puede crear clientes nuevos (se crean como marcas del Estudio).');return null;}
 const nombre=(prompt('Nombre del nuevo cliente o cuenta (se crea también como marca del Estudio):')||'').trim();if(!nombre)return null;
 const r=await request('/api/brands',{name:nombre});await cargarClientes();store.set('cliente',r.id);return r.id;
}

// ---------- selector de cliente + estilos (formulario y cada proyecto)
function selector(cont,inicial={}){
 let idSel=inicial.cliente_id||store.get('cliente')||CLIENTES[0]?.id;if(!CLIENTES.some(c=>c.id===idSel))idSel=CLIENTES[0]?.id;
 cont.innerHTML=`
  <label class="lbl">Cliente / cuenta</label>
  <div class="rl-cab"><select class="inp sel-cliente">${CLIENTES.map(c=>`<option value="${esc(c.id)}" ${c.id===idSel?'selected':''}>${esc(c.nombre)}</option>`).join('')}</select>
   <button type="button" class="btn ghost sm s-nuevo-cli">+ Nuevo cliente</button></div>
  <div class="rl-solo-guiones">
   <label class="lbl">Estilos de guion <span class="rl-meta">(marca uno o varios)</span></label>
   <div class="rl-chips sel-estilos"></div>
   <div class="rl-estilo s-form-estilo" hidden>
    <input class="inp s-e-nombre" placeholder="Nombre del estilo (ej.: Educativo, Storytelling, Polémico)">
    <textarea class="inp s-e-estructura" rows="7" placeholder="Estructura: secciones, orden, duración, reglas…"></textarea>
    <div class="rl-acciones"><button type="button" class="btn accent sm s-e-guardar">Guardar estilo</button><button type="button" class="btn ghost sm s-e-cancelar">Cancelar</button></div>
   </div>
  </div>`;
 const actual=()=>CLIENTES.find(x=>x.id===$('.sel-cliente',cont).value);
 const pintar=marcados=>{const c=actual(),estilos=c?c.estilos:[];
  $('.sel-estilos',cont).innerHTML=estilos.map((e,i)=>`<label class="rl-chip"><input type="checkbox" value="${esc(e.id)}" ${(marcados?marcados.includes(e.id):i===0)?'checked':''}> ${esc(e.nombre)}</label>`).join('')
   +`<button type="button" class="btn ghost sm s-nuevo-estilo">+ Nuevo estilo</button>`+(c?`<button type="button" class="btn ghost sm s-editar">Editar cliente y estilos</button>`:'');
  $('.s-nuevo-estilo',cont).onclick=()=>{$('.s-form-estilo',cont).hidden=false;$('.s-e-nombre',cont).focus();};
  const ed=$('.s-editar',cont);if(ed)ed.onclick=()=>abrirTab('clientes',c.id);
 };
 pintar(inicial.cliente_id===idSel?inicial.estilo_ids:null);
 $('.sel-cliente',cont).onchange=()=>{store.set('cliente',$('.sel-cliente',cont).value);pintar(null);};
 $('.s-nuevo-cli',cont).onclick=async()=>{try{const id=await nuevoCliente();if(!id)return;const leer=selector(cont,{cliente_id:id});if(cont.id==='rl-sel-largo'){leerSelLargo=leer;modoLargo();}$('.s-form-estilo',cont).hidden=false;}catch(e){alert(e.message);}};
 $('.s-e-cancelar',cont).onclick=()=>{$('.s-form-estilo',cont).hidden=true;};
 $('.s-e-guardar',cont).onclick=async()=>{
  const c=actual(),nombre=$('.s-e-nombre',cont).value.trim(),estructura=$('.s-e-estructura',cont).value.trim();
  if(!nombre||!estructura){alert('Ponle nombre y estructura al estilo.');return;}
  const marcados=$$('.sel-estilos input:checked',cont).map(i=>i.value);
  try{const g=await request('/api/reels/clientes',{...c,estilos:[...c.estilos,{nombre,estructura}]});await cargarClientes();
   $('.s-e-nombre',cont).value='';$('.s-e-estructura',cont).value='';$('.s-form-estilo',cont).hidden=true;pintar([...marcados,g.estilos.at(-1).id]);}catch(e){alert(e.message);}
 };
 return ()=>{const cliente_id=$('.sel-cliente',cont).value;store.set('cliente',cliente_id);return {cliente_id,estilo_ids:$$('.sel-estilos input:checked',cont).map(i=>i.value)};};
}

// ---------- pestañas internas
let leerSelLargo=()=>({});
async function abrirTab(nombre,abrirCliente){
 $$('.rl-nav button').forEach(b=>b.classList.toggle('on',b.dataset.rl===nombre));
 $$('#view-reels .rl-panel').forEach(s=>{s.hidden=s.id!=='rl-tab-'+nombre;});$('#rl-proyecto').hidden=true;store.set('tab',nombre);
 try{
  if(nombre==='historial')await cargarLista();
  if(nombre==='clientes')await pintarClientes(abrirCliente);
  if(nombre==='largo'){await cargarClientes();leerSelLargo=selector($('#rl-sel-largo'));modoLargo();}
  if(nombre==='reel'){await cargarClientes();const s=$('#rl-reel-cliente'),sel=store.get('cliente');s.innerHTML=CLIENTES.map(c=>`<option value="${esc(c.id)}" ${c.id===sel?'selected':''}>${esc(c.nombre)}</option>`).join('');}
 }catch(e){aviso(e.message);}
}
function aviso(t){const a=$('#rl-aviso');a.textContent=t||'';a.hidden=!t;}
function modoLargo(){
 const solo=$('#rl-f-largo').modo.value==='transcribir';
 $$('#rl-tab-largo .rl-solo-guiones').forEach(el=>{el.hidden=solo;});
 $('#rl-f-largo .rl-enviar').textContent=solo?'Transcribir':'Generar guiones';
}

// ---------- envío: archivo (subida firmada a Storage, se borra tras transcribir) o enlaces
async function enviar(form,tipo){
 const datos=new FormData(form),archivo=form.archivo.files[0],caja=$('.rl-jobs',form.parentElement);
 const modo=tipo==='largo'?form.modo.value:'transcribir';let marca,opciones={};
 if(tipo==='largo'){const sel=leerSelLargo();marca=sel.cliente_id;
  if(modo==='guiones'){if(!sel.estilo_ids.length){alert('Marca al menos un estilo de guion.');return;}
   opciones={estilo_ids:sel.estilo_ids,cantidad:Number(datos.get('cantidad')||5),instrucciones:String(datos.get('instrucciones')||''),entregable:!!datos.get('entregable'),guia_entregable:String(datos.get('guia_entregable')||'')};}
  else opciones={estilo_ids:sel.estilo_ids};
 }else{marca=String(datos.get('marca')||'');store.set('cliente',marca);}
 if(!marca){alert('Elige el cliente.');return;}
 const boton=$('button[type=submit]',form);boton.disabled=true;const antes=boton.textContent;
 try{
  const cuerpo={idempotencyKey:crypto.randomUUID(),marca,tipo,modo,idioma:String(datos.get('idioma')||'multi'),opciones};
  if(archivo){
   if(archivo.size>(CONFIG.maxMB||50)*1048576)throw new Error(`El archivo pasa de ${CONFIG.maxMB||50} MB. Pega el enlace del video o sube solo el audio (m4a/mp3).`);
   boton.textContent='Subiendo archivo…';const mime=archivo.type||'video/mp4';
   const s=await request('/api/reels/subir',{marca,nombre:archivo.name,mime,bytes:archivo.size});
   await uploadSigned(archivo,{bucket:s.bucket,path:s.ruta,token:s.token,mime});cuerpo.media={ruta:s.ruta,nombre:archivo.name};
  }else cuerpo.urls=String(datos.get('urls')||'').split('\n').map(l=>l.trim()).filter(Boolean);
  const r=await request('/api/reels/procesar',cuerpo);
  form.urls.value='';form.archivo.value='';
  if(tipo==='largo'){form.entregable.checked=false;form.guia_entregable.value='';$('#rl-op-guia').hidden=true;}
  seguir(r.grupo,caja);
 }catch(e){caja.insertAdjacentHTML('afterbegin',`<div class="rl-job error">${esc(e.message)}</div>`);}
 finally{boton.disabled=false;boton.textContent=antes;modoLargo();}
}

// ---------- seguimiento de un grupo de trabajos (transcripción → guiones → PDF)
const pendientes=()=>{try{return JSON.parse(store.get('pendientes')||'[]');}catch{return [];}};
function recordar(grupo,caja,quitar){const l=pendientes().filter(x=>x.grupo!==grupo&&Date.now()-x.t<6*3600e3);if(!quitar)l.push({grupo,caja,t:Date.now()});store.set('pendientes',JSON.stringify(l));}
function seguir(grupo,caja,alTerminar){
 const el=document.createElement('div');el.className='rl-job';el.textContent='En cola…';caja.prepend(el);
 const cajaId=caja.id||caja.closest('section')?.id||'';if(!alTerminar)recordar(grupo,cajaId);
 const linea=x=>{const que=ETIQUETAS[x.op]||x.op;const fuente=x.url?` · ${esc(x.url.length>60?x.url.slice(0,60)+'…':x.url)}`:'';
  if(x.estado==='succeeded')return `<div class="ok">✓ ${que}${fuente}${x.proyecto&&x.op!=='entregable'?` · <a href="#" class="rl-tc" data-ver="${esc(x.proyecto)}">Ver resultado →</a>`:''}${x.aviso?`<div class="rl-err">${esc(x.aviso)}</div>`:''}</div>`;
  if(['failed','uncertain','canceled'].includes(x.estado))return `<div class="rl-err">✕ ${que}${fuente}: ${esc(x.error||'No se completó.')}</div>`;
  return `<div>${que}${fuente}: ${esc(x.paso||(x.estado==='queued'?'En cola…':'Procesando…'))}</div>`;};
 const tick=async()=>{
  let t;try{t=await request('/api/reels/trabajos?grupo='+encodeURIComponent(grupo));}catch(e){el.innerHTML=`<div class="rl-err">${esc(e.message)}</div>`;setTimeout(tick,6000);return;}
  el.innerHTML=t.items.map(linea).join('');$$('[data-ver]',el).forEach(a=>a.onclick=ev=>{ev.preventDefault();verProyecto(a.dataset.ver);});
  if(!t.done){setTimeout(tick,3000);return;}
  recordar(grupo,cajaId,true);const fallo=t.items.some(x=>x.estado!=='succeeded');el.classList.add(fallo?'error':'listo');
  if(alTerminar)alTerminar(t);
  else{const p=[...new Set(t.items.map(x=>x.proyecto).filter(Boolean))];if(p.length===1&&caja.children.length===1&&!fallo&&!$('#view-reels').hidden)verProyecto(p[0]);}
 };
 tick();
}
// Un trabajo corto (sugerencia o vista previa): devuelve su resultado.
async function esperar(grupo){for(;;){await new Promise(r=>setTimeout(r,2500));const t=await request('/api/reels/trabajos?grupo='+encodeURIComponent(grupo));if(t.done){const x=t.items[0];if(x.estado!=='succeeded')throw new Error(x.error||'No se completó.');return x.resultado;}}}
// El PDF se abre en una pestaña nueva; se abre antes de pedir la URL para que el navegador no la bloquee.
async function abrirPdf(ref,descargar,nombre){
 const w=window.open('','_blank');try{const r=await request('/api/reels/pdf',{id:String(ref).replace('storage://',''),descargar:!!descargar,nombre});if(w)w.location=r.url;else location.href=r.url;}catch(e){w?.close();alert(e.message);}
}

// ---------- clientes y estilos
let clienteAbierto=null;
async function pintarClientes(abrirId){
 await cargarClientes();const id=abrirId||clienteAbierto?.id||CLIENTES[0]?.id;
 $('#rl-cli-lista').innerHTML=CLIENTES.map(c=>`<button data-cli="${esc(c.id)}" class="${c.id===id?'on':''}">${esc(c.nombre)}<span class="rl-meta">${c.estilos.length} estilo${c.estilos.length===1?'':'s'}${c.version?'':' · sin configurar'}</span></button>`).join('');
 $$('[data-cli]').forEach(b=>b.onclick=()=>pintarClientes(b.dataset.cli));
 const c=CLIENTES.find(x=>x.id===id);if(c)editarCliente(structuredClone(c));else $('#rl-cli-editor').innerHTML='<p class="rl-meta">No tienes clientes todavía.</p>';
}
function editarCliente(c){
 clienteAbierto=c;const ed=$('#rl-cli-editor');
 ed.innerHTML=`
  <h2 class="h2">${esc(c.nombre)}</h2><p class="rl-meta">Este cliente es la marca «${esc(c.nombre)}» del Estudio. El nombre se cambia en la pestaña Marcas.</p>
  <label class="lbl">Perfil de la marca</label>
  <textarea class="inp" id="rl-cli-contexto" rows="5" placeholder="A qué se dedica, cuenta de Instagram, público, tono de voz, palabras que usa o evita, idioma, llamados a la acción habituales…">${esc(c.contexto)}</textarea>
  <h3 class="rl-h3">Estilos de guion</h3><p class="rl-meta">Cada estilo es una estructura distinta. Al generar puedes marcar varios y sale una tanda de guiones por cada uno.</p>
  <div id="rl-estilos"></div><button class="btn ghost sm" id="rl-estilo-nuevo" style="margin-top:12px">+ Agregar estilo</button>
  <h3 class="rl-h3">Estructura del copy</h3><p class="rl-meta">Guía para el texto que va debajo del reel o carrusel (caption). Todos los guiones de este cliente la siguen.</p>
  <textarea class="inp" id="rl-cli-copy" rows="8" placeholder="Ej.:
1. GANCHO (1 línea): pregunta o frase que obligue a abrir el texto.
2. DESARROLLO (2-4 líneas cortas): la idea principal, con 1 emoji por línea como máximo.
3. VALOR: un consejo concreto que se pueda guardar.
4. CTA: Comenta la palabra… / Guárdalo / Compártelo con…
5. HASHTAGS: 3 a 5, al final.
Reglas: máximo 150 palabras, tuteo, sin mayúsculas sostenidas.">${esc(c.estructura_copy)}</textarea>
  <h3 class="rl-h3">Estructura del entregable PDF</h3><p class="rl-meta">Guía para el PDF descargable con accionable paso a paso. Si la dejas vacía se usa una estructura base.</p>
  <textarea class="inp" id="rl-cli-entregable" rows="8" placeholder="Ej.:
1. TÍTULO: promesa clara del resultado.
2. INTRODUCCIÓN: el problema en 2-3 frases.
3. PASOS (5 a 7): título de acción + explicación + 2-4 acciones concretas.
4. ERRORES COMUNES: 3 errores a evitar.
5. CIERRE + CTA: frase motivadora y el llamado a la acción de la marca.">${esc(c.estructura_entregable)}</textarea>
  <h3 class="rl-h3">Branding del entregable PDF</h3><p class="rl-meta">La identidad visual con la que se arma el PDF de este cliente: colores, tipografías, logo, portada, fondo, paquete gráfico y referencias.</p>
  <div id="rl-branding"></div>
  <div class="rl-acciones" style="margin-top:20px"><button class="btn accent" id="rl-cli-guardar">Guardar cliente</button><span id="rl-cli-ok" class="rl-meta"></span></div>`;
 const leer=()=>{c.contexto=$('#rl-cli-contexto').value;c.estructura_copy=$('#rl-cli-copy').value;c.estructura_entregable=$('#rl-cli-entregable').value;leerBranding(c);
  c.estilos=$$('.rl-estilo',$('#rl-estilos')).map((el,i)=>({...c.estilos[i],nombre:$('.e-nombre',el).value,estructura:$('.e-estructura',el).value}));};
 const pintarEstilos=()=>{
  $('#rl-estilos').innerHTML=c.estilos.map((e,i)=>`<div class="rl-estilo"><div class="rl-cab"><input class="inp e-nombre" value="${esc(e.nombre)}" placeholder="Nombre del estilo (ej.: Educativo, Storytelling, Polémico)">
   <button class="btn ghost sm" data-dup="${i}">Duplicar</button><button class="btn ghost sm danger" data-del="${i}">Eliminar</button></div>
   <textarea class="inp e-estructura" rows="9" placeholder="Escribe la estructura: secciones, orden, duración, reglas…">${esc(e.estructura)}</textarea></div>`).join('')||'<p class="rl-meta">Sin estilos todavía.</p>';
  $$('[data-dup]',ed).forEach(b=>b.onclick=()=>{leer();const e=c.estilos[+b.dataset.dup];c.estilos.splice(+b.dataset.dup+1,0,{nombre:e.nombre+' (copia)',estructura:e.estructura});pintarEstilos();});
  $$('[data-del]',ed).forEach(b=>b.onclick=()=>{leer();if(!confirm(`¿Eliminar el estilo "${c.estilos[+b.dataset.del].nombre}"?`))return;c.estilos.splice(+b.dataset.del,1);pintarEstilos();});
 };
 pintarEstilos();pintarBranding(c);
 $('#rl-estilo-nuevo').onclick=()=>{leer();c.estilos.push({nombre:'',estructura:''});pintarEstilos();$$('.e-nombre',ed).at(-1).focus();};
 $('#rl-cli-guardar').onclick=async e=>{leer();e.target.disabled=true;
  try{const g=await request('/api/reels/clientes',{id:c.id,version:c.version,contexto:c.contexto,estilos:c.estilos,estructura_copy:c.estructura_copy,estructura_entregable:c.estructura_entregable,branding:{colores:c.branding.colores,fuentes:c.branding.fuentes,notas:c.branding.notas}});
   await pintarClientes(g.id);$('#rl-cli-ok').textContent='Guardado ✓';setTimeout(()=>{const ok=$('#rl-cli-ok');if(ok)ok.textContent='';},2500);}
  catch(err){alert(err.message);e.target.disabled=false;}
 };
}

// ---------- branding visual del PDF (por cliente)
const BRANDING_BASE={colores:{texto:'#1F1D1B',acento:'#ECFE6E',fondo:'#FFFFFF',suave:'#F3EEE6'},fuentes:{titulos:'Instrument Serif',texto:'Montserrat'}};
const FUENTES=['Instrument Serif','Playfair Display','Bodoni Moda','Cormorant Garamond','DM Serif Display','Libre Baskerville','Montserrat','Inter','Poppins','DM Sans','Jost','Raleway','Lato','Archivo','Anton','Barlow','Bebas Neue','Oswald'];
const GALERIAS=[
 ['logo','Logos','Todas las versiones: para fondo claro, para fondo oscuro, ícono o monograma. Marca en cada una dónde se lee bien. El logo va en grande en la portada y el cierre.','image/png,image/jpeg,image/webp'],
 ['portada','Visuales de portada','Fotos o artes que pueden encabezar el PDF o ir dentro de las secciones.','image/png,image/jpeg,image/webp'],
 ['fondo','Fondos','Texturas, patrones o fotos suaves que pueden ir detrás de las páginas.','image/png,image/jpeg,image/webp'],
 ['grafico','Paquete gráfico','Ilustraciones, formas, íconos, elementos de la marca.','image/png,image/jpeg,image/webp'],
 ['referencia','Referencias','PDFs, piezas o estilos que te gustan. Claude mira las imágenes para sugerir colores, tipografías y diagramación.','image/png,image/jpeg,image/webp,application/pdf']];
const USOS={claro:'Para fondo claro',oscuro:'Para fondo oscuro',icono:'Ícono / monograma'};
function leerBranding(c){
 if(!$('#rl-b-texto'))return;const b=c.branding=c.branding||{};
 b.colores={texto:$('#rl-b-texto').value,acento:$('#rl-b-acento').value,fondo:$('#rl-b-fondo').value,suave:$('#rl-b-suave').value};
 b.fuentes={titulos:$('#rl-b-f-tit').value.trim(),texto:$('#rl-b-f-txt').value.trim()};b.notas=$('#rl-b-notas').value;
}
async function pintarBranding(c){
 const box=$('#rl-branding'),b=c.branding=c.branding||{};b.archivos=b.archivos||[];
 const col={...BRANDING_BASE.colores,...(b.colores||{})},fu={...BRANDING_BASE.fuentes,...(b.fuentes||{})};
 const urls=await resolve(Object.fromEntries(b.archivos.map(a=>[a.nombre,'storage://'+a.id]))).catch(()=>({}));
 const esImg=n=>/\.(png|jpe?g|webp|gif)$/i.test(n);
 const opciones=(actual,lista)=>Object.entries(lista).map(([k,v])=>`<option value="${k}" ${k===actual?'selected':''}>${v}</option>`).join('');
 const ficha=a=>`<figure class="rl-mini ${a.tipo==='logo'&&a.uso==='oscuro'?'oscuro':''}">${esImg(a.nombre)&&urls[a.nombre]?`<img src="${esc(urls[a.nombre])}" alt="">`:`<span class="rl-doc">${esc(a.nombre)}</span>`}
   <button type="button" class="x" data-quitar="${esc(a.nombre)}" title="Quitar">×</button></figure>
  ${a.tipo==='logo'?`<select class="inp sm" data-uso="${esc(a.nombre)}">${opciones(a.uso,USOS)}</select>`:''}
  <select class="inp sm" data-tipo="${esc(a.nombre)}" title="Mover a otra categoría">${opciones(a.tipo,Object.fromEntries(GALERIAS.map(g=>[g[0],'En '+g[1].toLowerCase()])))}</select>`;
 const galeria=([tipo,titulo,ayuda,accept])=>{const items=b.archivos.filter(a=>a.tipo===tipo);
  return `<div class="rl-grupo"><h4>${titulo} <span class="rl-meta">(${items.length})</span></h4><p class="rl-meta">${ayuda}</p>
   <div class="rl-grilla">${items.map(a=>`<div class="rl-item">${ficha(a)}</div>`).join('')||'<p class="rl-meta">Vacío.</p>'}</div>
   <label class="btn ghost sm">Subir ${titulo.toLowerCase()}<input type="file" accept="${accept}" multiple data-subir="${tipo}" hidden></label></div>`;};
 const color=(k,t)=>`<label class="rl-color"><input type="color" id="rl-b-${k}" value="${esc(col[k])}"><span>${t}<br><code>${esc(col[k])}</code></span></label>`;
 box.innerHTML=`
  <div class="rl-grupo"><h4>Colores</h4><div class="rl-colores">${color('texto','Texto')}${color('acento','Acento')}${color('fondo','Fondo de página')}${color('suave','Recuadros')}</div></div>
  <div class="rl-grupo"><h4>Tipografías <span class="rl-meta">(nombre exacto de Google Fonts)</span></h4>
   <datalist id="rl-b-fuentes">${FUENTES.map(f=>`<option value="${f}">`).join('')}</datalist>
   <div class="rl-row"><div><label class="lbl">Títulos</label><input class="inp" id="rl-b-f-tit" list="rl-b-fuentes" value="${esc(fu.titulos)}"></div>
    <div><label class="lbl">Texto</label><input class="inp" id="rl-b-f-txt" list="rl-b-fuentes" value="${esc(fu.texto)}"></div></div></div>
  ${GALERIAS.map(galeria).join('')}
  <div class="rl-grupo"><label class="lbl">Notas de estilo <span class="rl-meta">(opcional, el director de arte las sigue)</span></label>
   <textarea class="inp" id="rl-b-notas" rows="2" placeholder="Ej.: minimalista, mucho aire, fotos cálidas, títulos enormes, nada de degradados.">${esc(b.notas||'')}</textarea></div>
  <div class="rl-acciones"><button type="button" class="btn ghost sm" id="rl-b-sugerir">Sugerir colores y tipografías con Claude</button>
   <button type="button" class="btn ghost sm" id="rl-b-muestra">Vista previa rápida</button>
   <button type="button" class="btn accent sm" id="rl-b-muestra-claude">Vista previa con director de arte (Claude)</button>
   <span class="rl-meta" id="rl-b-estado"></span></div>`;
 $$('input[type=color]',box).forEach(i=>i.oninput=()=>{$('code',i.parentElement).textContent=i.value;});
 const estado=t=>{$('#rl-b-estado').textContent=t;};
 // Tras subir, mover o quitar archivos, se conservan los colores y textos que estén en pantalla sin guardar
 const aplicar=g=>{leerBranding(c);const conservar={colores:c.branding.colores,fuentes:c.branding.fuentes,notas:c.branding.notas};c.branding={...(g.branding||{}),...conservar};c.version=g.version;pintarBranding(c);};
 const archivo=async cuerpo=>{try{aplicar(await request(`/api/reels/clientes/${encodeURIComponent(c.id)}/archivos`,cuerpo));}catch(e){alert(e.message);}};
 $$('[data-subir]',box).forEach(i=>i.onchange=async()=>{
  const files=[...i.files];if(!files.length)return;estado(`Subiendo ${files.length} archivo${files.length>1?'s':''}…`);
  try{let g;for(const f of files){const fileId=await uploadBlob(f,f.name,{brand:c.id});g=await request(`/api/reels/clientes/${encodeURIComponent(c.id)}/archivos`,{op:'add',fileId,tipo:i.dataset.subir});}aplicar(g);}
  catch(e){estado('');alert(e.message);}
 });
 $$('[data-quitar]',box).forEach(x=>x.onclick=()=>archivo({op:'quitar',nombre:x.dataset.quitar}));
 $$('[data-uso]',box).forEach(s=>s.onchange=()=>archivo({op:'editar',nombre:s.dataset.uso,uso:s.value}));
 $$('[data-tipo]',box).forEach(s=>s.onchange=()=>archivo({op:'editar',nombre:s.dataset.tipo,tipo:s.value}));
 $('#rl-b-sugerir').onclick=async e=>{e.target.disabled=true;estado('Claude está mirando los logos y las referencias…');
  try{const g=await request(`/api/reels/clientes/${encodeURIComponent(c.id)}/sugerir`,{idempotencyKey:crypto.randomUUID()});const r=await esperar(g.grupo);
   leerBranding(c);c.branding={...c.branding,colores:r.colores,fuentes:r.fuentes,notas:r.notas};await pintarBranding(c);$('#rl-b-estado').textContent='Sugerencia aplicada. Revísala y pulsa Guardar cliente.';}
  catch(err){estado('');alert(err.message);}finally{e.target.disabled=false;}};
 const muestra=creativo=>async e=>{leerBranding(c);e.target.disabled=true;estado(creativo?'El director de arte está diagramando… (puede tardar un minuto)':'Armando la vista previa…');
  try{const g=await request(`/api/reels/clientes/${encodeURIComponent(c.id)}/muestra`,{idempotencyKey:crypto.randomUUID(),creativo,branding:{colores:c.branding.colores,fuentes:c.branding.fuentes,notas:c.branding.notas}});
   const r=await esperar(g.grupo);estado(r.nota?'Idea del diseño: '+r.nota:'');
   const a=document.createElement('button');a.className='btn sm';a.textContent='Abrir vista previa';a.onclick=()=>abrirPdf(r.pdf);$('#rl-b-estado').append(' ',a);}
  catch(err){estado('');alert(err.message);}finally{e.target.disabled=false;}};
 $('#rl-b-muestra').onclick=muestra(false);$('#rl-b-muestra-claude').onclick=muestra(true);
}

// ---------- historial
async function cargarLista(){
 await cargarClientes();const lista=await request('/api/reels/proyectos');
 $('#rl-lista').innerHTML=lista.length?lista.map(p=>`<div class="rl-lista-item" data-id="${esc(p.id)}"><div><b>${esc(p.titulo)}</b><div class="rl-meta">${esc(p.creado)}${nombreCliente(p.marca)?' · '+esc(nombreCliente(p.marca)):''}</div></div>
  <span class="rl-tag">${p.tipo==='largo'?(p.guiones?p.guiones+' guiones':'Solo transcripción'):'Transcripción'}</span></div>`).join(''):'<p class="rl-meta">Todavía no hay proyectos.</p>';
 $$('.rl-lista-item').forEach(el=>el.onclick=()=>verProyecto(el.dataset.id));
}

// ---------- vista de proyecto
const aSegundos=tc=>String(tc).split(':').map(Number).reduce((a,n)=>a*60+n,0);
function enlaceTiempo(url,tc){if(!url||!/youtu/.test(url))return `<span class="rl-tc">${esc(tc)}</span>`;return `<a class="rl-tc" target="_blank" rel="noopener" href="${esc(url+(url.includes('?')?'&':'?')+'t='+aSegundos(tc))}">${esc(tc)}</a>`;}
function copiar(texto,boton){navigator.clipboard.writeText(texto);const antes=boton.textContent;boton.textContent='Copiado ✓';setTimeout(()=>{boton.textContent=antes;},1500);}
async function verProyecto(pid,filtro={}){
 let p;try{await cargarClientes();p=await request('/api/reels/proyectos?id='+encodeURIComponent(pid));}catch(e){aviso(e.message);return;}
 $$('#view-reels .rl-panel').forEach(s=>{s.hidden=true;});$$('.rl-nav button').forEach(b=>b.classList.remove('on'));
 const v=$('#rl-proyecto');v.hidden=false;const url=p.info?.url,a=p.analisis,trans=p.transcripcion||{texto:'',parrafos:[]};
 const textoPlano=trans.parrafos.length?trans.parrafos.map(x=>`[${x.inicio}] ${x.texto}`).join('\n\n'):trans.texto;
 let h=`<div class="rl-panel"><h2 class="h2">${esc(p.info?.titulo||'(sin título)')}</h2>
  <div class="rl-meta">${esc(p.info?.autor||'')} ${url?`· <a class="rl-tc" href="${esc(url)}" target="_blank" rel="noopener">abrir original</a>`:''} · ${esc(p.creado)} · ${esc(nombreCliente(p.marca)||p.marca)}</div>
  ${a?`<p>${esc(a.resumen_general)}</p>`:''}
  <div class="rl-acciones"><button class="btn ghost sm" id="rl-copiar-trans">Copiar transcripción</button><button class="btn ghost sm" id="rl-descargar-trans">Descargar .txt</button><button class="btn ghost sm danger" id="rl-borrar">Borrar proyecto</button></div></div>`;
 let visibles=[];
 if(a){
  const etiqueta=g=>[g.cliente,g.estilo].filter(Boolean).join(' · ');
  const clientesG=[...new Set(a.guiones.map(g=>g.cliente||'Sin cliente'))];
  const estilosG=[...new Set(a.guiones.filter(g=>!filtro.cliente||(g.cliente||'Sin cliente')===filtro.cliente).map(g=>g.estilo||'Sin estilo'))];
  visibles=a.guiones.map((g,i)=>({g,i})).filter(({g})=>(!filtro.cliente||(g.cliente||'Sin cliente')===filtro.cliente)&&(!filtro.estilo||(g.estilo||'Sin estilo')===filtro.estilo));
  h+=`<div class="rl-panel"><h2 class="h2">Guiones (${visibles.length}${visibles.length!==a.guiones.length?' de '+a.guiones.length:''})</h2>
   <div class="rl-filtros">${clientesG.length>1?`<select class="inp sm" id="rl-f-cliente"><option value="">Todos los clientes</option>${clientesG.map(x=>`<option ${x===filtro.cliente?'selected':''}>${esc(x)}</option>`).join('')}</select>`:''}
    ${estilosG.length>1?`<select class="inp sm" id="rl-f-estilo"><option value="">Todos los estilos</option>${estilosG.map(x=>`<option ${x===filtro.estilo?'selected':''}>${esc(x)}</option>`).join('')}</select>`:''}
    <button class="btn ghost sm" id="rl-copiar-todos">Copiar ${visibles.length===a.guiones.length?'todos':'estos'}</button></div>
   ${visibles.map(({g,i},n)=>`<div class="rl-card"><div class="rl-cab-punto"><h3>${n+1}. ${esc(g.titulo)}</h3>${etiqueta(g)?`<span class="rl-tag cli">${esc(etiqueta(g))}</span>`:''}</div>
    <div class="rl-meta">Basado en: ${esc(g.punto_clave)} · ${enlaceTiempo(url,g.inicio)} – ${esc(g.fin)}</div>
    <div class="rl-guion">${esc(g.guion)}</div><div class="rl-meta" style="margin-top:10px"><b>Caption:</b> ${esc(g.caption)}</div>
    <div class="rl-acciones"><button class="btn ghost sm" data-copiar-guion="${i}">Copiar guion</button><button class="btn ghost sm" data-copiar-caption="${i}">Copiar caption</button></div>
    <div class="rl-entregable-g">${g.entregable?`<div><b>Entregable PDF:</b> ${esc(g.entregable.titulo)} <span class="rl-meta">· ${g.entregable.paginas?g.entregable.paginas+' pág.':''} · ${esc(g.entregable.creado||'')}</span></div>
      <div class="rl-acciones">${g.entregable.pdf?`<button class="btn accent sm" data-pdf-ver="${esc(g.entregable.pdf)}">Ver PDF</button><button class="btn ghost sm" data-pdf-bajar="${esc(g.entregable.pdf)}" data-nombre="${esc(g.entregable.titulo)}">Descargar PDF</button>`:''}
       <button class="btn ghost sm" data-pdf-guion="${esc(g.id)}" data-rehacer="1">Rehacer PDF</button></div>`
     :`<div class="rl-acciones"><button class="btn ghost sm" data-pdf-guion="${esc(g.id)}">Crear entregable PDF de este guion</button></div>`}
     <div class="rl-jobs" id="rl-jobs-pdf-${esc(g.id)}"></div></div></div>`).join('')}</div>
   <div class="rl-panel"><h2 class="h2">Entregables PDF</h2>
    <p class="rl-meta">Cada guion lleva su propio PDF (máximo 4 páginas): es el lead magnet que recibe quien responde al llamado a la acción de ese reel. ${a.guiones.filter(g=>g.entregable).length} de ${a.guiones.length} guiones tienen su PDF.</p>
    <label class="lbl">Guía de estructura para los entregables <span class="rl-meta">(opcional: si la dejas vacía se usa la del cliente)</span></label>
    <textarea class="inp" id="rl-guia-entregable" rows="3" placeholder="Ej.: 3 pasos con una tarea para hoy en cada uno y un checklist final.">${esc(p.guia_entregable||'')}</textarea>
    ${a.guiones.some(g=>!g.entregable)?`<button class="btn accent" id="rl-pdf-faltantes">Crear los PDF que faltan (${a.guiones.filter(g=>!g.entregable).length})</button>`:''}
    <div class="rl-jobs" id="rl-entregable-jobs"></div></div>`;
 }
 if(p.tipo==='largo'){
  h+=`<div class="rl-panel"><h2 class="h2">${a?'Generar más guiones':'Generar guiones'}</h2>
   <p class="rl-meta">${a?'Elige el cliente y los estilos. Sirve para los dos botones: "Generar más" y los de cada punto clave de abajo.':'Este video se transcribió sin guiones. Elige el cliente y los estilos para escribirlos ahora.'}</p>
   <div id="rl-sel-proyecto"></div>
   <div class="rl-row"><div><label class="lbl">Guiones por estilo</label><input class="inp" type="number" id="rl-mas-cantidad" value="${a?3:5}" min="1" max="20"></div>
    <div class="rl-span2"><label class="lbl">Instrucciones (opcional)</label><input class="inp" id="rl-mas-instrucciones" value="${esc(p.instrucciones||'')}"></div></div>
   <label class="rl-chip" style="margin-top:12px"><input type="checkbox" id="rl-mas-entregable" ${p.con_entregables?'checked':''}> Crear también el PDF entregable de cada guion nuevo</label>
   <button class="btn accent" id="rl-mas">${a?'Generar más guiones de este video':'Generar guiones'}</button><div class="rl-jobs" id="rl-mas-jobs"></div></div>`;
 }
 if(a)h+=`<div class="rl-panel" id="rl-panel-puntos"><h2 class="h2">Puntos clave del video (${a.puntos_clave.length})</h2>
   <p class="rl-meta">Crea un guion de cualquier punto con su botón, o marca varios y créalos juntos. Se usan el cliente y los estilos elegidos arriba.</p>
   <div class="rl-barra-puntos"><button class="btn accent sm" id="rl-crear-marcados" disabled>Crear guiones de los marcados (0)</button></div><div class="rl-jobs" id="rl-puntos-jobs"></div>
   ${a.puntos_clave.map((k,i)=>{const usados=a.guiones.filter(g=>g.punto_clave===k.titulo).length;return `<div class="rl-card"><div class="rl-cab-punto">
     <label class="rl-marcar"><input type="checkbox" data-punto="${i}"> <h3>${esc(k.titulo)}</h3></label>${usados?`<span class="rl-tag">${usados} guion${usados>1?'es':''}</span>`:'<span class="rl-tag nuevo">Sin guion</span>'}</div>
     <div class="rl-meta">${enlaceTiempo(url,k.inicio)} – ${esc(k.fin)}</div><p>${esc(k.resumen)}</p><div class="rl-cita">“${esc(k.cita)}”</div>
     <div class="rl-meta"><b>Por qué funciona:</b> ${esc(k.por_que_funciona)}</div>
     <div class="rl-acciones"><button class="btn ghost sm" data-crear-punto="${i}">Crear guion de este punto</button></div></div>`;}).join('')}</div>`;
 h+=`<div class="rl-panel"><details ${p.tipo==='reel'||!a?'open':''}><summary>Transcripción</summary>
  <div class="rl-trans">${trans.parrafos.length?trans.parrafos.map(x=>`<p>${enlaceTiempo(url,x.inicio)} ${esc(x.texto)}</p>`).join(''):`<p>${esc(trans.texto)}</p>`}</div></details></div>`;
 v.innerHTML=h;if(!filtro.mantenerScroll)$('#view-reels').scrollTop=0;

 $('#rl-copiar-trans').onclick=e=>copiar(textoPlano,e.target);
 $('#rl-descargar-trans').onclick=()=>{const u=URL.createObjectURL(new Blob([textoPlano],{type:'text/plain;charset=utf-8'}));const l=document.createElement('a');l.href=u;l.download=(p.info?.titulo||'transcripcion').replace(/[^\p{L}\p{N} _-]+/gu,'').slice(0,80)+'.txt';l.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
 $('#rl-borrar').onclick=async()=>{if(!confirm('¿Borrar este proyecto?'))return;try{await request(`/api/reels/proyectos/${encodeURIComponent(pid)}/borrar`,{});abrirTab('historial');}catch(e){alert(e.message);}};
 if(p.tipo!=='largo')return;
 const leerSel=selector($('#rl-sel-proyecto'),{cliente_id:p.cliente_id||p.marca,estilo_ids:p.estilo_ids});
 const pedir=async(extra,boton,caja)=>{const sel=leerSel();if(!sel.estilo_ids.length){alert('Marca al menos un estilo de guion.');return;}boton.disabled=true;
  try{const d=await request(`/api/reels/proyectos/${encodeURIComponent(pid)}/guiones`,{idempotencyKey:crypto.randomUUID(),cliente:sel.cliente_id,estilo_ids:sel.estilo_ids,cantidad:Number($('#rl-mas-cantidad').value||3),instrucciones:$('#rl-mas-instrucciones').value,entregable:!!$('#rl-mas-entregable')?.checked,guia_entregable:$('#rl-guia-entregable')?.value||'',...extra});
   seguir(d.grupo,caja,()=>verProyecto(pid,{...filtro,mantenerScroll:true}));}catch(e){caja.insertAdjacentHTML('afterbegin',`<div class="rl-job error">${esc(e.message)}</div>`);boton.disabled=false;}};
 $('#rl-mas').onclick=e=>pedir({},e.target,$('#rl-mas-jobs'));
 if(!a)return;
 const pedirPDF=async(guiones,boton,caja)=>{boton.disabled=true;
  try{const d=await request(`/api/reels/proyectos/${encodeURIComponent(pid)}/entregables`,{idempotencyKey:crypto.randomUUID(),guiones,guia_entregable:$('#rl-guia-entregable').value});
   seguir(d.grupo,caja,()=>verProyecto(pid,{...filtro,mantenerScroll:true}));}catch(e){caja.insertAdjacentHTML('afterbegin',`<div class="rl-job error">${esc(e.message)}</div>`);boton.disabled=false;}};
 $$('[data-pdf-guion]',v).forEach(b=>b.onclick=()=>{if(b.dataset.rehacer&&!confirm('¿Rehacer este entregable? El PDF actual se reemplaza.'))return;pedirPDF([b.dataset.pdfGuion],b,$('#rl-jobs-pdf-'+b.dataset.pdfGuion));});
 $$('[data-pdf-ver]',v).forEach(b=>b.onclick=()=>abrirPdf(b.dataset.pdfVer));
 $$('[data-pdf-bajar]',v).forEach(b=>b.onclick=()=>abrirPdf(b.dataset.pdfBajar,true,b.dataset.nombre));
 if($('#rl-pdf-faltantes'))$('#rl-pdf-faltantes').onclick=e=>pedirPDF(null,e.target,$('#rl-entregable-jobs'));
 const refiltrar=()=>verProyecto(pid,{cliente:$('#rl-f-cliente')?.value||'',estilo:$('#rl-f-estilo')?.value||'',mantenerScroll:true});
 if($('#rl-f-cliente'))$('#rl-f-cliente').onchange=()=>{if($('#rl-f-estilo'))$('#rl-f-estilo').value='';refiltrar();};
 if($('#rl-f-estilo'))$('#rl-f-estilo').onchange=refiltrar;
 $$('[data-copiar-guion]',v).forEach(b=>b.onclick=()=>copiar(a.guiones[b.dataset.copiarGuion].guion,b));
 $$('[data-copiar-caption]',v).forEach(b=>b.onclick=()=>copiar(a.guiones[b.dataset.copiarCaption].caption,b));
 $('#rl-copiar-todos').onclick=e=>copiar(visibles.map(({g},n)=>`${n+1}. ${g.titulo}${g.estilo?' ['+g.estilo+']':''}\n\n${g.guion}\n\nCaption: ${g.caption}`).join('\n\n——————\n\n'),e.target);
 const marcados=()=>$$('[data-punto]:checked',v).map(c=>+c.dataset.punto);
 $$('[data-punto]',v).forEach(c=>c.onchange=()=>{const n=marcados().length;$('#rl-crear-marcados').disabled=!n;$('#rl-crear-marcados').textContent=`Crear guiones de los marcados (${n})`;});
 $('#rl-crear-marcados').onclick=e=>pedir({puntos:marcados()},e.target,$('#rl-puntos-jobs'));
 $$('[data-crear-punto]',v).forEach(b=>b.onclick=()=>{$('#rl-panel-puntos').scrollIntoView({behavior:'smooth'});pedir({puntos:[+b.dataset.crearPunto]},b,$('#rl-puntos-jobs'));});
}

export function setupReels(deps){
 ({request,uploadBlob,uploadSigned,resolve,role}=deps);
 const vista=document.querySelector('#view-reels');if(!vista)return;vista.innerHTML=VISTA;
 $$('.rl-nav button').forEach(b=>b.onclick=()=>abrirTab(b.dataset.rl));
 $('#rl-op-entregable').onchange=e=>{$('#rl-op-guia').hidden=!e.target.checked;};
 $$('#rl-f-largo input[name=modo]').forEach(r=>r.onchange=modoLargo);
 $('#rl-f-largo').onsubmit=e=>{e.preventDefault();enviar(e.target,'largo');};
 $('#rl-f-reel').onsubmit=e=>{e.preventDefault();enviar(e.target,'reel');};
 if(role==='lector')$$('#view-reels form button[type=submit]').forEach(b=>{b.disabled=true;b.title='Tu rol permite solo lectura.';});
 let iniciado=false;
 const mostrar=async()=>{if(vista.hidden||iniciado)return;iniciado=true;
  try{CONFIG=await request('/api/reels/config');const faltan=[!CONFIG.deepgram&&'DEEPGRAM_API_KEY',!CONFIG.apify&&'APIFY_TOKEN',!CONFIG.anthropic&&'ANTHROPIC_API_KEY'].filter(Boolean);
   if(faltan.length)aviso(`Faltan claves en Vercel: ${faltan.join(', ')}. Sin ellas no se puede transcribir o escribir guiones.`);}catch(e){aviso(e.message);}
  await abrirTab(['largo','reel','clientes','historial'].includes(store.get('tab'))?store.get('tab'):'largo');
  // Retoma los trabajos que seguían en curso al recargar la página
  for(const x of pendientes()){const caja=document.getElementById(x.caja);if(caja)seguir(x.grupo,$('.rl-jobs',caja)||caja);}
 };
 new MutationObserver(mostrar).observe(vista,{attributes:true,attributeFilter:['hidden']});mostrar();
}
