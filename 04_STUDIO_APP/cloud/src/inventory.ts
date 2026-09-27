import {createHash} from 'node:crypto';
import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
export type Row=Record<string,any>;
export type Asset=Row & {id:string;origen:string;local_path:string;sha256:string;bytes:number;mime:string};
export type Inventory={schema:1;source:string;created_at:string;tables:Record<string,Row[]>;assets:Asset[];errors:string[];warnings:string[];fingerprint:string};
export const stableId=(value:string)=>{const h=createHash('sha256').update(value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const mimeMap:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf','.md':'text/markdown','.txt':'text/plain'};
const img=(s:string)=>['.png','.jpg','.jpeg','.webp','.gif'].includes(path.extname(s).toLowerCase());
async function files(dir:string):Promise<string[]>{
 let names;try{names=await readdir(dir,{withFileTypes:true});}catch(e:any){if(e.code==='ENOENT')return [];throw e;}
 const out:string[]=[];
 for(const entry of names.sort((a,b)=>a.name.localeCompare(b.name))){if(entry.name.startsWith('.'))continue;const p=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error(`Enlace simbólico no admitido: ${p}`);if(entry.isDirectory())out.push(...await files(p));else if(entry.isFile())out.push(p);}
 return out;
}
async function json(p:string,fallback?:any){try{return JSON.parse(await readFile(p,'utf8'));}catch(e:any){if(e.code==='ENOENT' && fallback!==undefined)return fallback;throw e;}}
async function text(p:string){try{return await readFile(p,'utf8');}catch(e:any){if(e.code==='ENOENT')return '';throw e;}}
export async function buildInventory(source:string):Promise<Inventory>{
 const root=await realpath(source);
 const out:Inventory={schema:1,source:root,created_at:new Date().toISOString(),tables:{marcas:[],personas:[],persona_marca:[],marca_recursos:[],marca_datos:[],persona_fotos:[],proyectos:[],solicitudes:[],entregas:[]},assets:[],errors:[],warnings:[],fingerprint:''};
 const byKey=new Map<string,Asset>();const claimed=new Set<string>();
 const pendingAssets=new Map<string,Promise<string>>();
 function asset(file:string,scope:{marca?:string;persona?:string}={}):Promise<string>{
  const key=JSON.stringify([path.resolve(file),scope.marca??null,scope.persona??null]);
  let pending=pendingAssets.get(key);
  if(!pending){pending=loadAsset(file,scope);pendingAssets.set(key,pending);}
  return pending;
 }
 async function loadAsset(file:string,scope:{marca?:string;persona?:string}):Promise<string>{
  const resolved=path.resolve(file);const rel=path.relative(root,resolved);
  if(rel.startsWith('../')||path.isAbsolute(rel))throw new Error('Referencia fuera del directorio de origen');
  const real=await realpath(resolved);if(real!==resolved)throw new Error(`Enlace simbólico no admitido: ${rel}`);
  if(path.basename(real).startsWith('.') || /(^|\/)(config\.json|\.env[^/]*)(\/|$)/.test(rel))throw new Error('Archivo reservado');
  const origin=`${scope.marca?`marca:${scope.marca}`:scope.persona?`persona:${scope.persona}`:'cuarentena'}:${rel}`;
  if(byKey.has(origin))return `storage://${byKey.get(origin)!.id}`;
  const bytes=await readFile(real);const sha256=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length>52428800)out.errors.push(`Supera límite de 50 MB: ${rel}`);
  const row:Asset={id:stableId(origin+':'+sha256),origen:origin,local_path:real,nombre:path.basename(real),alcance:scope.marca?'marca':scope.persona?'persona':'cuarentena',marca_id:scope.marca??null,persona_id:scope.persona??null,mime:mimeMap[path.extname(real).toLowerCase()]??'application/octet-stream',bytes:bytes.length,sha256,listo:false};
  byKey.set(origin,row);out.assets.push(row);claimed.add(real);return `storage://${row.id}`;
 }
 async function rewrite(value:any,brand:string):Promise<any>{
  if(typeof value==='string' && value.startsWith('/files/')){
   try {const rel=value.slice(7).split('/').map(decodeURIComponent).join('/');
    const person=rel.match(/^06_MARCAS\/_personas\/([^/]+)\//)?.[1];
    if(person && !out.tables.persona_marca!.some(r=>r.persona_id===person&&r.marca_id===brand))throw new Error('Persona no asignada a esta marca');
    return await asset(path.resolve(root,rel),person?{persona:person}:{marca:brand});
   }catch(e:any){out.errors.push(`Referencia ${value}: ${e.message}`);return value;}
  }
  if(Array.isArray(value))return Promise.all(value.map(v=>rewrite(v,brand)));
  if(value && typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await rewrite(v,brand)])));
  return value;
 }
 const brandRoot=path.join(root,'06_MARCAS');const brandFiles=(await files(brandRoot)).filter(f=>path.basename(f)==='marca.json'&&!f.includes('/_personas/'));
 const brandDefs: {id:string;dir:string;data:Row;archived:boolean}[]=[];
 for(const file of brandFiles){const dir=path.dirname(file);const archived=file.includes('/_papelera/');const data=await json(file);const id=archived?(data.id??path.basename(dir).split('__').at(-1)):path.basename(dir);if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))throw new Error(`ID de marca archivada ambiguo: ${file}`);brandDefs.push({id,dir,data,archived});}
 brandDefs.push({id:'_comun',dir:path.join(brandRoot,'_comun'),data:{name:'Común a todas las marcas'},archived:false});
 const peopleFiles=(await files(path.join(brandRoot,'_personas'))).filter(f=>path.basename(f)==='persona.json');
 for(const file of peopleFiles){const id=path.basename(path.dirname(file));const data=await json(file);out.tables.personas!.push({id,identidad:data,archivada:false});}
 for(const b of brandDefs)for(const person of b.data.personas??[]){if(!out.tables.personas!.some(r=>r.id===person))out.errors.push(`Persona ${person} no encontrada para ${b.id}`);else out.tables.persona_marca!.push({persona_id:person,marca_id:b.id});}
 for(const file of peopleFiles){const id=path.basename(path.dirname(file));const data=await json(file);const photos=(await files(path.dirname(file))).filter(img).sort((a,b)=>{const order=data.orden??[];const rank=(v:string)=>order.includes(path.basename(v))?order.indexOf(path.basename(v)):order.length;return rank(a)-rank(b)||a.localeCompare(b);});for(const [i,p] of photos.entries()){const ref=await asset(p,{persona:id});out.tables.persona_fotos!.push({persona_id:id,archivo_id:ref.slice(10),posicion:i,activa:!(data.inactivas??[]).includes(path.basename(p))});}}
 for(const b of brandDefs){
  const metadata=await json(path.join(b.dir,'recursos.json'),{});const identidad=structuredClone(b.data);
  async function logos(obj:Row|undefined){for(const logo of Object.values(obj??{})){if(logo?.src){const ref=await asset(path.resolve(b.dir,logo.src),{marca:b.id});logo.url=ref;}}}
  await logos(identidad.logos);await logos(identidad.byline?.logos);
  out.tables.marcas!.push({id:b.id,identidad:await rewrite(identidad,b.id),reglas:await text(path.join(b.dir,'reglas.md')),archivada:b.archived});
  for(const [i,f] of (b.data.datos??[]).entries())out.tables.marca_datos!.push({id:stableId(`dato:${b.id}:${i}`),marca_id:b.id,dato:String(f.dato??''),fuente:String(f.fuente??''),url:f.url??null,metadata:f});
  for(const file of await files(b.dir)){
   const rel=path.relative(b.dir,file);if(['marca.json','recursos.json','reglas.md'].includes(rel))continue;
   const kind=rel.split('/')[0]!;const tipo=['conocimiento','referencias','logos','vestuario','papelera'].includes(kind)?kind:'otros';
   const ref=await asset(file,{marca:b.id});const m=metadata[rel]??{};
   out.tables.marca_recursos!.push({id:stableId(`recurso:${b.id}:${rel}`),marca_id:b.id,archivo_id:ref.slice(10),tipo,ruta:rel,activo:m.active!==false,etiquetas:m.tags??[],eliminado_at:tipo==='papelera'?'1970-01-01T00:00:00Z':null,metadata:m});
  }
 }
 for(const file of (await files(path.join(root,'04_STUDIO_APP/data/proyectos'))).filter(f=>f.endsWith('.json'))){const d=await json(file);if(!brandDefs.some(b=>b.id===d.brand)){out.errors.push(`Marca de proyecto desconocida: ${file}`);continue;}out.tables.proyectos!.push({id:d.id,marca_id:d.brand,documento:await rewrite(d,d.brand),version:1});}
 for(const file of (await files(path.join(root,'05_SOLICITUDES'))).filter(f=>f.endsWith('.json'))){const d=await json(file);const brand=d.brief?.marca;if(!brandDefs.some(b=>b.id===brand)){out.errors.push(`Marca de solicitud desconocida: ${file}`);continue;}out.tables.solicitudes!.push({id:d.id,marca_id:brand,documento:await rewrite(d,brand),version:1});}
 for(const file of await files(path.join(root,'03_ENTREGAS'))){
  const rel=path.relative(path.join(root,'03_ENTREGAS'),file);const folder=rel.split('/')[0]!;
  const candidates=brandDefs.filter(b=>folder.toLowerCase().startsWith(`${String(b.data.file??b.id).toLowerCase()}_`));
  const brand=candidates.length===1?candidates[0]!.id:undefined;const ref=await asset(file,brand?{marca:brand}:{});
  if(brand)out.tables.entregas!.push({id:stableId(`entrega:${rel}`),marca_id:brand,archivo_id:ref.slice(10),carpeta:folder,nombre:path.basename(file)});
  else out.warnings.push(`Entrega sin marca inequívoca, solo admin: ${rel}`);
 }
 // Preserve unreferenced uploads and original sources under admin-only quarantine.
 for(const dir of ['04_STUDIO_APP/data/uploads','01_SKILL_OPERATIVO/assets','02_ARCHIVOS_ORIGINALES','06_MARCAS/_papelera'])for(const file of await files(path.join(root,dir)))if(!claimed.has(file))await asset(file);
 if(out.assets.some(a=>a.alcance==='cuarentena'))out.warnings.push(`${out.assets.filter(a=>a.alcance==='cuarentena').length} archivos originales/sin asignación quedan en cuarentena (solo admin).`);
 out.assets.sort((a,b)=>a.origen.localeCompare(b.origen));
 out.fingerprint=createHash('sha256').update(JSON.stringify({tables:out.tables,assets:out.assets.map(({local_path,...a})=>a)})).digest('hex');
 return out;
}
export async function verifySource(a:Asset){const bytes=await readFile(a.local_path);if(createHash('sha256').update(bytes).digest('hex')!==a.sha256)throw new Error(`El origen cambió desde el inventario: ${a.origen}`);return bytes;}
