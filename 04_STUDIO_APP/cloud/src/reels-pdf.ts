// Diseño del PDF entregable de Reels con el branding de cada cliente (portado de diseno_pdf.py del Generador de Reels).
// branding: colores, fuentes, notas y archivos [{id, nombre, tipo: logo|portada|fondo|grafico|referencia, uso (logos): claro|oscuro|icono}].
// Antes de armar el PDF se decide un PLAN de diagramación: planAuto() (gratis) o el director de arte con Claude (reels.ts).
// html() convierte contenido + plan en la página que Chromium imprime a PDF.
import {existsSync} from 'node:fs';
export const TIPOS=['logo','portada','fondo','grafico','referencia'] as const;
export const PORTADAS=['imagen_completa','bloque_color','tipografica','dividida'];
export const SECCIONES=['numero_gigante','banda_color','tarjeta','imagen_lateral','cita'];
export const CIERRES=['bloque_color','imagen'];
export const COLORES=['texto','acento','fondo','suave'];
export const BRANDING_BASE={colores:{texto:'#1F1D1B',acento:'#ECFE6E',fondo:'#FFFFFF',suave:'#F3EEE6'},fuentes:{titulos:'Instrument Serif',texto:'Montserrat'},archivos:[] as any[],notas:''};
export type Contenido={titulo:string;subtitulo:string;introduccion:string;secciones:{titulo:string;texto:string;pasos:string[]}[];cierre:string;llamado_accion:string};

export function brandingDe(cliente:any){
 const b=structuredClone(BRANDING_BASE);const propio=cliente?.branding||{};
 for(const k of ['colores','fuentes'] as const)for(const [kk,vv] of Object.entries(propio[k]||{}))if(vv)(b[k] as any)[kk]=vv;
 b.notas=propio.notas||'';
 b.archivos=(propio.archivos||[]).filter((a:any)=>a?.nombre).map((a:any)=>{const x={...a};if(!(TIPOS as readonly string[]).includes(x.tipo))x.tipo='grafico';if(x.tipo==='logo')x.uso??='claro';return x;});
 return b;
}
const deTipo=(b:any,tipo:string)=>b.archivos.filter((a:any)=>a.tipo===tipo);
function luminancia(hexa:string){let h=String(hexa||'').replace('#','');if(h.length===3)h=[...h].map(c=>c+c).join('');const v=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);if(v.some(Number.isNaN))return 1;const lin=(c:number)=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;return 0.2126*lin(v[0]!)+0.7152*lin(v[1]!)+0.0722*lin(v[2]!);}
export const esOscuro=(hexa:string)=>luminancia(hexa)<0.35;
// Versión del logo que se lee sobre ese fondo.
function logoPara(b:any,fondoOscuro:boolean,preferido=''){
 const logos=deTipo(b,'logo');if(preferido&&logos.some((a:any)=>a.nombre===preferido))return preferido;
 const buscado=fondoOscuro?'oscuro':'claro';return (logos.find((a:any)=>a.uso===buscado)||logos.find((a:any)=>a.uso!=='icono')||logos[0])?.nombre||'';
}

// Plan sin IA: alterna estilos y reparte portadas, gráficos y fondos.
export function planAuto(contenido:Contenido,b:any){
 const portadas=deTipo(b,'portada').map((a:any)=>a.nombre),graficos=deTipo(b,'grafico').map((a:any)=>a.nombre),fondos=deTipo(b,'fondo').map((a:any)=>a.nombre);
 const imagenes=[...portadas,...graficos];let k=0;
 const secciones=contenido.secciones.map((_,i)=>{let estilo=SECCIONES[i%SECCIONES.length]!,imagen='';if(estilo==='imagen_lateral'){if(imagenes.length){imagen=imagenes[(1+k)%imagenes.length];k++;}else estilo='tarjeta';}return {estilo,color:estilo==='banda_color'?'acento':'suave',imagen};});
 return {portada:{estilo:portadas.length?'imagen_completa':'bloque_color',imagen:portadas[0]||'',color:portadas.length?'texto':'acento',logo:''},fondo_paginas:fondos[0]||'',secciones,
  cierre:{estilo:imagenes.length>1?'imagen':'bloque_color',imagen:imagenes.length>1?imagenes.at(-1):'',color:'texto',logo:''},nota:'Diagramación automática'};
}
export const ESQUEMA_PLAN={type:'object',properties:{
 portada:{type:'object',properties:{estilo:{type:'string',enum:PORTADAS},imagen:{type:'string'},color:{type:'string',enum:COLORES},logo:{type:'string'}},required:['estilo','imagen','color','logo'],additionalProperties:false},
 fondo_paginas:{type:'string'},
 secciones:{type:'array',items:{type:'object',properties:{estilo:{type:'string',enum:SECCIONES},color:{type:'string',enum:COLORES},imagen:{type:'string'}},required:['estilo','color','imagen'],additionalProperties:false}},
 cierre:{type:'object',properties:{estilo:{type:'string',enum:CIERRES},imagen:{type:'string'},color:{type:'string',enum:COLORES},logo:{type:'string'}},required:['estilo','imagen','color','logo'],additionalProperties:false},
 nota:{type:'string'}},required:['portada','fondo_paginas','secciones','cierre','nota'],additionalProperties:false};
export const GUIA_DIRECTOR=`Eres director de arte editorial. Diseñas la diagramación de un PDF descargable (lead magnet) de una marca usando SOLO sus elementos: colores, tipografías, versiones del logo, portadas, fondos y paquete gráfico. Las referencias son inspiración de estilo.

Opciones:
- portada.estilo: "imagen_completa" (foto a sangre, título grande encima), "bloque_color" (página entera de un color de la marca, título gigante), "tipografica" (el título enorme es el protagonista, con un elemento gráfico de acento), "dividida" (mitad imagen, mitad color).
- secciones[].estilo: "numero_gigante" (número enorme en la tipografía de títulos), "banda_color" (franja de color a sangre con el texto encima), "tarjeta" (recuadro de color suave), "imagen_lateral" (texto con una imagen al lado), "cita" (la idea clave como frase destacada grande).
- cierre.estilo: "bloque_color" o "imagen".
- color: una de las claves de la paleta (texto, acento, fondo, suave). Asegura contraste del texto.
- imagen, logo, fondo_paginas: nombre EXACTO de un archivo de la lista, o "" si no corresponde. El logo va en grande: elige la versión que se lea sobre el color o la imagen que hay detrás.
- fondo_paginas: un archivo de tipo "fondo" para las páginas interiores, o "" si ensucia la lectura.

Busca ritmo: alterna estilos, no repitas el mismo estilo en secciones seguidas, usa las imágenes donde aporten y deja aire. Devuelve exactamente una entrada en secciones por cada sección del contenido. En "nota" explica la idea del diseño en una frase.`;
// Quita nombres de archivo que no existen y ajusta el número de secciones.
export function validarPlan(plan:any,contenido:Contenido,b:any){
 const nombres=new Set(b.archivos.map((a:any)=>a.nombre));const limpio=(n:any)=>nombres.has(n)?n:'';
 for(const k of ['portada','cierre']){plan[k].imagen=limpio(plan[k].imagen);plan[k].logo=limpio(plan[k].logo);}
 plan.fondo_paginas=limpio(plan.fondo_paginas);const auto=planAuto(contenido,b).secciones,secs=plan.secciones||[];
 plan.secciones=contenido.secciones.map((_,i)=>i<secs.length?{...secs[i]}:auto[i]);
 for(const s of plan.secciones){s.imagen=limpio(s.imagen);if(s.estilo==='imagen_lateral'&&!s.imagen)s.estilo='tarjeta';}
 if(['imagen_completa','dividida'].includes(plan.portada.estilo)&&!plan.portada.imagen)plan.portada.estilo='bloque_color';
 if(plan.cierre.estilo==='imagen'&&!plan.cierre.imagen)plan.cierre.estilo='bloque_color';
 return plan;
}

// Versión más apretada para que el entregable no pase de 4 páginas.
const CSS_COMPACTO=`
body { font-size: 10pt; line-height: 1.45; }
.intro { font-size: 11pt; margin-bottom: 12px; }
h2 { font-size: 17pt; }
section { margin-bottom: 14px; }
.num-gigante { font-size: 72pt; }
.s-numero { grid-template-columns: 0.9in 1fr; }
.num-xl { font-size: 38pt; }
.s-banda { padding: 0.28in var(--mx); margin-bottom: 16px; }
.s-tarjeta { padding: 0.22in 0.28in; }
.s-imagen { grid-template-columns: 1.8in 1fr; } .s-imagen.izq { grid-template-columns: 1fr 1.8in; }
.s-imagen .foto { min-height: 1.8in; }
.s-cita blockquote { font-size: 21pt; }
.cierre { padding: 0.4in var(--mx); }
.cierre p { font-size: 15pt; }
.c-imagen { min-height: 2.4in; }
.esp-arriba { height: 0.6in; } .esp-abajo { height: 0.8in; }
`;
const x=(s:any)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const pad2=(n:number)=>String(n).padStart(2,'0');

// urls: nombre de archivo → URL firmada (https) de la imagen en Storage.
export function html(e:Contenido,cliente:any,plan:any,urls:Record<string,string>,compacto=false){
 const b=brandingDe(cliente);plan=plan||planAuto(e,b);const col:any=b.colores,fu=b.fuentes;
 const url=(n:string)=>n&&urls[n]?urls[n]:'';
 const parrafos=(t:string)=>(t||'').split('\n').filter(p=>p.trim()).map(p=>`<p>${x(p)}</p>`).join('');
 // Color de texto legible sobre un color de la paleta.
 const tinta=(clave:string)=>{const fondo=col[clave]||col.fondo;if(!esOscuro(fondo))return esOscuro(col.texto)?col.texto:'#141414';return !esOscuro(col.fondo)?col.fondo:'#FFFFFF';};
 const logoImg=(clase:string,fondoOscuro:boolean,preferido='')=>{const n=logoPara(b,fondoOscuro,preferido);return n&&url(n)?`<img class="${clase}" src="${x(url(n))}" alt="">`:`<div class="${clase} marca-txt">${x(cliente.nombre)}</div>`;};
 const familias=[...new Set([fu.titulos,fu.texto])].map(f=>'family='+encodeURIComponent(f).replace(/%20/g,'+')+':ital,wght@0,400;0,500;0,600;0,700;0,800;1,400').join('&');
 const bg=(u:string)=>u?`background-image:url('${x(u)}')`:'';
 const letra=x((e.titulo.trim()||'A')[0]);

 // ----- portada (página completa)
 const p=plan.portada,pc=col[p.color]||col.acento,pimg=url(p.imagen);let portada:string;
 if(p.estilo==='imagen_completa')portada=`<div class="portada pc-imagen" style="${bg(pimg)}"><div class="velo"></div>
  ${logoImg('logo-xl',true,p.logo)}
  <div class="pc-texto" style="color:#fff"><h1>${x(e.titulo)}</h1><p class="sub">${x(e.subtitulo)}</p><div class="linea"></div></div></div>`;
 else if(p.estilo==='dividida')portada=`<div class="portada pc-dividida"><div class="pc-foto" style="${bg(pimg)}"></div>
  <div class="pc-panel" style="background:${pc};color:${tinta(p.color)}">${logoImg('logo-xl',esOscuro(pc),p.logo)}
   <h1>${x(e.titulo)}</h1><p class="sub">${x(e.subtitulo)}</p><div class="linea"></div></div></div>`;
 else if(p.estilo==='tipografica')portada=`<div class="portada pc-tipo" style="background:${col.fondo};color:${col.texto}">
  <div class="letra-gigante">${letra}</div>${logoImg('logo-xl',esOscuro(col.fondo),p.logo)}
  <div class="pc-texto"><h1 class="h1-xl">${x(e.titulo)}</h1><p class="sub">${x(e.subtitulo)}</p><div class="linea"></div></div></div>`;
 else portada=`<div class="portada pc-bloque" style="background:${pc};color:${tinta(p.color)}">
  ${logoImg('logo-xl',esOscuro(pc),p.logo)}<div class="letra-gigante">${letra}</div>
  <div class="pc-texto"><h1 class="h1-xl">${x(e.titulo)}</h1><p class="sub">${x(e.subtitulo)}</p><div class="linea"></div></div></div>`;

 // ----- secciones. El diseño ya pone número y casilla: quitamos los que Claude escriba dentro del texto
 const sinNum=(t:string)=>(t||'').replace(/^\s*(paso\s*)?\d+\s*[.)·:-]\s*/i,'');
 const sinCasilla=(t:string)=>(t||'').replace(/^\s*([□☐☑✅✔✓■▢◻•\-*]|\[\s?[xX]?\s?\])\s*/u,'');
 let cuerpo=`<div class="intro">${parrafos(e.introduccion)}</div>`;
 e.secciones.forEach((s0,i)=>{const n=i+1,d=plan.secciones[i],s={...s0,titulo:sinNum(s0.titulo)};
  const pasos=(s.pasos||[]).map(t=>`<li><span class='box'></span>${x(sinCasilla(t))}</li>`).join('');const lista=pasos?`<ul>${pasos}</ul>`:'';const c=col[d.color]||col.suave;
  if(d.estilo==='banda_color')cuerpo+=`<section class="s-banda" style="background:${c};color:${tinta(d.color)}"><div class="num-xl">${pad2(n)}</div>
   <div><h2>${x(s.titulo)}</h2>${parrafos(s.texto)}${lista}</div></section>`;
  else if(d.estilo==='tarjeta')cuerpo+=`<section class="s-tarjeta" style="background:${c};color:${tinta(d.color)}"><div class="num">${pad2(n)}</div>
   <h2>${x(s.titulo)}</h2>${parrafos(s.texto)}${lista}</section>`;
  else if(d.estilo==='imagen_lateral')cuerpo+=`<section class="s-imagen ${n%2?'der':'izq'}"><div class="foto" style="${bg(url(d.imagen))}"></div>
   <div><div class="num">${pad2(n)}</div><h2>${x(s.titulo)}</h2>${parrafos(s.texto)}${lista}</div></section>`;
  else if(d.estilo==='cita'){const frase=((s.texto||'').split('.')[0]||s.titulo).trim();cuerpo+=`<section class="s-cita"><div class="num">${pad2(n)} · ${x(s.titulo)}</div>
   <blockquote>${x(frase)}.</blockquote>${parrafos((s.texto||'').slice(frase.length+1))}${lista}</section>`;}
  else cuerpo+=`<section class="s-numero"><div class="num-gigante">${n}</div>
   <div><h2>${x(s.titulo)}</h2>${parrafos(s.texto)}${lista}</div></section>`;
 });

 // ----- cierre
 const ci=plan.cierre,cc=col[ci.color]||col.texto;let cierre:string;
 if(ci.estilo==='imagen'&&url(ci.imagen))cierre=`<section class="cierre c-imagen" style="${bg(url(ci.imagen))}"><div class="velo"></div>
  <div class="c-texto" style="color:#fff">${parrafos(e.cierre)}<div class="cta">${x(e.llamado_accion)}</div>${logoImg('logo-l',true,ci.logo)}</div></section>`;
 else cierre=`<section class="cierre c-bloque" style="background:${cc};color:${tinta(ci.color)}">
  <div class="c-texto">${parrafos(e.cierre)}<div class="cta">${x(e.llamado_accion)}</div></div>${logoImg('logo-l',esOscuro(cc),ci.logo)}</section>`;

 const fondo=url(plan.fondo_paginas),pieLogo=url(logoPara(b,esOscuro(col.fondo)));
 return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${familias}&display=swap">
<style>
:root { --texto: ${col.texto}; --acento: ${col.acento}; --fondo: ${col.fondo}; --suave: ${col.suave};
  --f-tit: '${fu.titulos}', Georgia, serif; --f-txt: '${fu.texto}', Helvetica, Arial, sans-serif; --mx: 0.85in; }
@page { size: Letter; margin: 0; }
html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font: 400 11pt/1.55 var(--f-txt); color: var(--texto); margin: 0; background: var(--fondo); }
h1, h2, .num, .num-xl, .num-gigante, blockquote, .letra-gigante { font-family: var(--f-tit); font-weight: 400; }
p { margin: 0 0 8px; }
.linea { width: 90px; height: 5px; background: var(--acento); margin: 18px 0; }
.sub { font: italic 400 16pt/1.3 var(--f-tit); opacity: .9; margin: 0; }
.marca-txt { font: 700 16pt/1 var(--f-txt); letter-spacing: .2em; text-transform: uppercase; }
/* Portada: página completa */
.portada { position: relative; z-index: 3; width: 8.5in; height: 11in; overflow: hidden; break-after: page; box-sizing: border-box;
  padding: 0.8in var(--mx); display: flex; flex-direction: column; background-size: cover; background-position: center; }
.portada h1 { font-size: 46pt; line-height: 1; margin: 0 0 14px; }
.portada .h1-xl { font-size: 64pt; line-height: .95; }
.logo-xl { max-height: 2.1in; max-width: 5.2in; width: auto; object-fit: contain; align-self: flex-start; position: relative; z-index: 2; }
.logo-l { max-height: 1.5in; max-width: 3.8in; width: auto; object-fit: contain; }
.velo { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,.05) 40%, rgba(0,0,0,.65)); }
.pc-texto { margin-top: auto; position: relative; z-index: 2; }
.letra-gigante { position: absolute; right: -0.25in; top: 1.4in; font-size: 560pt; line-height: .8; opacity: .14; z-index: 0; }
.pc-dividida { padding: 0; flex-direction: row; }
.pc-dividida .pc-foto { width: 50%; background-size: cover; background-position: center; }
.pc-dividida .pc-panel { width: 50%; padding: 0.8in 0.6in; box-sizing: border-box; display: flex; flex-direction: column; }
.pc-dividida h1 { margin-top: auto; font-size: 38pt; }
/* Fondo y pie de las páginas interiores */
.fondo { position: fixed; inset: 0; z-index: -1; background: var(--fondo);
  ${fondo?`background-image: url('${x(fondo)}'); background-size: cover; background-position: center;`:''} }
.pie { position: fixed; bottom: 0.32in; left: var(--mx); right: var(--mx); display: flex; justify-content: space-between; align-items: center;
  font: 500 7.5pt var(--f-txt); letter-spacing: .2em; text-transform: uppercase; opacity: .75; }
.pie img { height: 32px; width: auto; }
.hoja { width: 100%; border-collapse: collapse; }
.hoja td { padding: 0 var(--mx); vertical-align: top; }
.esp-arriba { height: 0.75in; } .esp-abajo { height: 0.95in; }
.intro { font-size: 12.5pt; line-height: 1.6; margin-bottom: 18px; }
h2 { font-size: 21pt; line-height: 1.1; margin: 0 0 8px; }
section { break-inside: avoid; margin: 0 0 22px; }
ul { list-style: none; padding: 0; margin: 10px 0 0; }
li { display: grid; grid-template-columns: 24px 1fr; margin: 0 0 7px; }
.box { width: 12px; height: 12px; border: 1.5px solid currentColor; border-radius: 3px; margin-top: 4px; opacity: .85; }
.num { font-size: 13pt; letter-spacing: .08em; color: var(--acento); filter: brightness(.85); margin-bottom: 4px; }
.s-numero { display: grid; grid-template-columns: 1.3in 1fr; gap: 10px; align-items: start; padding-top: 6px; }
.num-gigante { font-size: 120pt; line-height: .8; color: var(--acento); -webkit-text-stroke: 1.5px var(--texto); }
.s-banda { margin: 6px calc(-1 * var(--mx)) 26px; padding: 0.42in var(--mx); display: grid; grid-template-columns: 1in 1fr; gap: 10px; }
.num-xl { font-size: 54pt; line-height: .9; opacity: .9; }
.s-tarjeta { padding: 0.32in 0.36in; border-radius: 14px; border-left: 6px solid var(--acento); }
.s-imagen { display: grid; grid-template-columns: 2.6in 1fr; gap: 0.3in; align-items: stretch; }
.s-imagen.izq { grid-template-columns: 1fr 2.6in; }
.s-imagen.izq .foto { order: 2; }
.s-imagen .foto { min-height: 2.6in; border-radius: 12px; background-size: cover; background-position: center; }
.s-cita blockquote { font-size: 28pt; line-height: 1.12; font-style: italic; margin: 6px 0 14px; padding-left: 0.3in; border-left: 6px solid var(--acento); }
.cierre { position: relative; margin: 10px calc(-1 * var(--mx)) 0; padding: 0.6in var(--mx); display: flex; gap: 0.4in;
  align-items: center; justify-content: space-between; break-inside: avoid; background-size: cover; background-position: center; overflow: hidden; }
.cierre .c-texto { position: relative; z-index: 2; max-width: 4.6in; }
.cierre p { font: italic 400 18pt/1.3 var(--f-tit); }
.cta { font-weight: 700; margin-top: 10px; font-size: 12pt; }
.c-imagen { flex-direction: column; align-items: flex-start; min-height: 3.6in; justify-content: flex-end; }
.c-imagen .logo-l { margin-top: 18px; }
${compacto?CSS_COMPACTO:''}
</style></head><body>
<div class="fondo"></div>
<div class="pie"><span>${x(cliente.nombre)}</span>${pieLogo?`<img src="${x(pieLogo)}" alt="">`:''}</div>
${portada}
<table class="hoja"><thead><tr><td><div class="esp-arriba"></div></td></tr></thead>
<tfoot><tr><td><div class="esp-abajo"></div></td></tr></tfoot><tbody><tr><td>
${cuerpo}
${cierre}
</td></tr></tbody></table>
</body></html>`;
}

// Chrome de la Mac para desarrollo local; en Vercel, el Chromium para serverless (@sparticuz/chromium).
const CHROME_LOCAL='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export async function renderPdf(page:string):Promise<Buffer>{
 const puppeteer=(await import('puppeteer-core')).default;const local=!process.env.VERCEL&&existsSync(CHROME_LOCAL);
 let browser;
 if(local)browser=await puppeteer.launch({executablePath:CHROME_LOCAL,headless:true});
 else{const chromium=(await import('@sparticuz/chromium')).default;chromium.setGraphicsMode=false;browser=await puppeteer.launch({args:await puppeteer.defaultArgs({args:chromium.args,headless:'shell'}),executablePath:await chromium.executablePath(),headless:'shell'});}
 try{
  const tab=await browser.newPage();
  // Fuentes de Google e imágenes firmadas: se esperan antes de imprimir para no sacar el PDF sin tipografías.
  await tab.setContent(page,{waitUntil:'load',timeout:60000});
  // 'load' no espera las imágenes de fondo (CSS): se precargan con un límite de 20 s.
  const fondos=[...new Set([...page.matchAll(/url\('([^']+)'\)/g)].map(m=>m[1]!.replace(/&amp;/g,'&')))];
  await tab.evaluate(async(urls:string[])=>{const imgs=Promise.all(urls.map(u=>new Promise(r=>{const i=new Image();i.onload=i.onerror=r;i.src=u;})));await Promise.race([Promise.all([imgs,document.fonts.ready]),new Promise(r=>setTimeout(r,20000))]);},fondos);
  return Buffer.from(await tab.pdf({printBackground:true,preferCSSPageSize:true,timeout:60000}));
 }finally{await browser.close();}
}
export const contarPaginas=(pdf:Buffer)=>(pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g)||[]).length;
