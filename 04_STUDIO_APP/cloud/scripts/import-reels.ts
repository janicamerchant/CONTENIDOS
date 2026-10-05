// Importa el Generador de Reels local (Python) a la nube: clientes → configuración de Reels de cada marca,
// archivos de branding, proyectos y sus PDF. Por defecto solo muestra el plan; con --aplicar escribe.
// Uso: npx tsx scripts/import-reels.ts [--origen=~/Desktop/Generador de Reels] [--map=<idCliente>=<marca> ...] [--crear-marcas] [--general=<marca>] [--aplicar]
import {readFile,readdir,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {loadLocalEnv,adminClient,assertTarget} from '../src/config.js';
import {storeFile,slug} from '../src/library.js';
loadLocalEnv();assertTarget();
const args=process.argv.slice(2),flag=(n:string)=>args.includes('--'+n),opt=(n:string)=>args.find(a=>a.startsWith(`--${n}=`))?.slice(n.length+3);
const origen=(opt('origen')||path.join(os.homedir(),'Desktop/Generador de Reels')).replace(/^~/,os.homedir());
const aplicar=flag('aplicar'),crearMarcas=flag('crear-marcas'),general=opt('general');
const db=adminClient();const ok=(r:any)=>{if(r.error)throw new Error(r.error.message);return r.data;};
const norm=(s:string)=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const MIME:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf'};

const clientes=JSON.parse(await readFile(path.join(origen,'clientes.json'),'utf8'));
const marcas=ok(await db.from('marcas').select('id,identidad,archivada')) as any[];
const manual=new Map(args.filter(a=>a.startsWith('--map=')).map(a=>a.slice(6).split('=') as [string,string]));
// Cliente → marca: mapa manual, luego nombre igual, luego nombre contenido (p. ej. "EVA AI" → EVA).
function marcaDe(c:any){
 if(manual.has(c.id))return manual.get(c.id)!;if(c.id==='general')return general||null;
 const n=norm(c.nombre),activas=marcas.filter(m=>!m.archivada&&m.id!=='_comun');
 return (activas.find(m=>norm(m.identidad?.name||'')===n)||activas.find(m=>{const k=norm(m.identidad?.name||'');return k.length>=3&&(n.startsWith(k)||k.startsWith(n));}))?.id||null;
}
const plan=clientes.map((c:any)=>({c,marca:marcaDe(c)}));
console.log(aplicar?'APLICANDO importación':'PLAN (sin cambios; añade --aplicar para escribir)');
for(const {c,marca} of plan)console.log(`- Cliente «${c.nombre}» (${c.id}) → ${marca?`marca ${marca}`:crearMarcas&&c.id!=='general'?'marca NUEVA':'se omite'} · ${c.estilos.length} estilos · ${(c.branding?.archivos||[]).length} archivos`);

const destino=new Map<string,string>();
for(const {c,marca} of plan){
 let id=marca;
 if(!id&&crearMarcas&&c.id!=='general'){id=slug(c.nombre)+'-'+randomUUID().slice(0,6);
  if(aplicar)ok(await db.from('marcas').insert({id,identidad:{name:c.nombre,file:slug(c.nombre).toUpperCase(),design:'base',theme:'dark',swatch:'#ECFE6E',colors:{accent:'#ECFE6E',darkBg:'#1E1E20',darkInk:'#F2F0EA',lightBg:'#F4F2EC',lightInk:'#1E1E20'},fonts:{display:'Archivo',body:'Inter'},defaults:{idioma:'Español',objetivo:'Autoridad'},logos:{}},reglas:''}));
  console.log(`  marca nueva ${id}`);}
 if(!id)continue;destino.set(c.id,id);
 const existe=ok(await db.from('reels_marcas').select('marca_id').eq('marca_id',id).maybeSingle());
 if(existe&&!flag('forzar')){console.log(`  ${id}: ya tiene configuración de Reels, no se toca (usa --forzar para reemplazarla).`);continue;}
 const archivos:any[]=[];
 for(const a of c.branding?.archivos||[]){
  const ruta=path.join(origen,'marcas',c.id,a.nombre),mime=MIME[path.extname(a.nombre).toLowerCase()];
  if(!existsSync(ruta)||!mime){console.log(`  omitido ${a.nombre} (no existe o formato no admitido)`);continue;}
  const fileId=aplicar?await storeFile(id,await readFile(ruta),mime,a.nombre):'(pendiente)';
  archivos.push({id:fileId,nombre:a.nombre,tipo:a.tipo,...(a.tipo==='logo'?{uso:a.uso||'claro'}:{})});
 }
 const {archivos:_,logo:__,portada:___,fondo_imagen:____,...resto}=c.branding||{};
 const fila={marca_id:id,contexto:c.contexto||'',estilos:c.estilos||[],estructura_copy:c.estructura_copy||'',estructura_entregable:c.estructura_entregable||'',branding:{...resto,archivos},version:1,updated_at:new Date().toISOString()};
 if(aplicar)ok(await db.from('reels_marcas').upsert(fila));
 console.log(`  ${id}: configuración ${aplicar?'importada':'lista'} (${archivos.length} archivos)`);
}

const carpeta=path.join(origen,'proyectos');
for(const nombre of (await readdir(carpeta)).filter(n=>n.endsWith('.json')).sort()){
 const p=JSON.parse(await readFile(path.join(carpeta,nombre),'utf8'));const marca=p.cliente_id?destino.get(p.cliente_id):general;
 if(!marca){console.log(`- Proyecto ${p.id} «${p.info?.titulo}»: sin cliente asignado, se omite (usa --general=<marca>).`);continue;}
 if(ok(await db.from('reels_proyectos').select('id').eq('id',p.id).maybeSingle())){console.log(`- Proyecto ${p.id}: ya importado.`);continue;}
 const doc=structuredClone(p);doc.cliente_id=marca;let pdfs=0;
 for(const g of doc.analisis?.guiones||[]){
  if(g.cliente_id)g.cliente_id=destino.get(g.cliente_id)||marca;
  const ruta=path.join(carpeta,'pdf',`${p.id}-${g.id}.pdf`);
  if(g.entregable&&existsSync(ruta)&&(await stat(ruta)).size<52428800){if(aplicar)g.entregable.pdf='storage://'+await storeFile(marca,await readFile(ruta),'application/pdf',(g.entregable.titulo||'entregable').slice(0,60)+'.pdf');pdfs++;}
 }
 delete doc.entregable;delete doc.marca;
 if(aplicar)ok(await db.from('reels_proyectos').insert({id:p.id,marca_id:marca,tipo:p.tipo,titulo:p.info?.titulo||'',documento:doc,created_at:new Date(p.creado.replace(' ','T')+':00Z').toISOString()}));
 console.log(`- Proyecto ${p.id} «${p.info?.titulo}» → ${marca} · ${doc.analisis?.guiones?.length||0} guiones · ${pdfs} PDF`);
}
console.log(aplicar?'Importación terminada.':'Nada se escribió. Revisa el plan y vuelve a correr con --aplicar.');
