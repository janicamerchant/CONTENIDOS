import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {adminClient} from './config.js';
import {authorizeBrand,databaseError,HttpError,type Identity} from './auth.js';
export const checked=(r:any)=>{databaseError(r.error);return r.data;};
const obj=z.record(z.string(),z.any());
const name=z.string().trim().min(1).max(180);
export const slug=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'nuevo';
export function adminOnly(w:Identity){if(w.role!=='admin')throw new HttpError(403,'Solo administración puede realizar esta acción.');}
export async function readyFile(w:Identity,id:string,brand?:string,person?:string){const f=checked(await w.db.from('archivos').select('*').eq('id',z.uuid().parse(id)).single());if(!f?.listo||f.eliminado_at||(brand&&f.marca_id!==brand)||(person&&f.persona_id!==person))throw new HttpError(404,'Archivo no disponible.');return f;}
export async function storeFile(brand:string,bytes:Buffer,mime:string,nombre:string){
 if(bytes.length>52428800)throw new HttpError(413,'Archivo demasiado grande.');const db=adminClient(),id=randomUUID();
 checked(await db.from('archivos').insert({id,marca_id:brand,alcance:'marca',nombre,mime,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}));
 const uploaded=await db.storage.from('estudio').upload(id+'/original',bytes,{contentType:mime});if(uploaded.error){await db.from('archivos').delete().eq('id',id);databaseError(uploaded.error);}
 checked(await db.from('archivos').update({listo:true}).eq('id',id));return id;
}
const peopleCache=new WeakMap<Identity,Promise<any[]>>();
export function people(w:Identity){if(!peopleCache.has(w))peopleCache.set(w,loadPeople(w));return peopleCache.get(w)!;}
async function loadPeople(w:Identity){
 const [r,l,p]=await Promise.all([w.db.from('personas').select('*').eq('archivada',false),w.db.from('persona_marca').select('*'),w.db.from('persona_fotos').select('*,archivos(*)').order('posicion')]);const rows=checked(r),links=checked(l),photos=checked(p);
 return rows.map((p:any)=>({...p.identidad,id:p.id,name:p.identidad.name||p.id,aliases:p.identidad.aliases||[],lock:p.identidad.identidad||'Keep the exact identity of the approved person in the reference photos.',brands:links.filter((x:any)=>x.persona_id===p.id).map((x:any)=>x.marca_id),photos:photos.filter((x:any)=>x.persona_id===p.id&&x.archivos?.listo&&!x.archivos.eliminado_at).map((x:any)=>({name:x.archivo_id,label:x.archivos.nombre,active:x.activa,url:`storage://${x.archivo_id}`}))}));
}
export async function brandDetail(w:Identity,id:string){
 const [b,resourcesResult,personList]=await Promise.all([w.db.from('marcas').select('*').eq('id',id).maybeSingle(),w.db.from('marca_recursos').select('*,archivos(*)').eq('marca_id',id).order('ruta'),people(w)]);
 const row=checked(b);if(!row)throw new HttpError(404,'Marca no encontrada.');const rr=checked(resourcesResult);
 const ps=personList.filter((p:any)=>p.brands.includes(id));const resources:any={conocimiento:[],referencias:[],logos:[],vestuario:[],otros:[]};const trash:any[]=[];
 for(const r of rr){const f=r.archivos;if(!f?.listo)continue;if(r.eliminado_at||r.tipo==='papelera'){trash.push({name:r.id,original:r.metadata?.original||r.ruta,kind:r.metadata?.kind||r.tipo,deletedAt:r.eliminado_at});continue;}
 (resources[r.tipo]??=[]).push({path:r.ruta,name:f.nombre,size:f.bytes,active:r.activo,tags:r.etiquetas||[],url:`storage://${f.id}`,id:r.id});}
 const logos=structuredClone(row.identidad.logos||{});for(const d of Object.values(logos) as any[]){const r=rr.find((r:any)=>r.ruta===d.src&&!r.eliminado_at);if(r)d.url=`storage://${r.archivo_id}`;else delete d.url;}
 const datos=row.identidad.datos??checked(await w.db.from('marca_datos').select('dato,fuente,url').eq('marca_id',id));
 const byline=row.identidad.byline?{...row.identidad.byline,...row.identidad.byline.logos}:undefined;
 return {...row.identidad,byline,id,version:row.version,name:row.identidad.name||(id==='_comun'?'Documentos comunes':id),rules:row.reglas,logos,datos,personas:ps.map((p:any)=>p.id),people:ps,outfits:resources.vestuario.filter((r:any)=>r.active),resources,trash,meter:null};
}
export async function brandList(w:Identity){const rows=checked(await w.db.from('marcas').select('*'));const brands=await Promise.all(rows.filter((r:any)=>!r.archivada&&r.id!=='_comun').map(async(row:any)=>{const {resources,trash,meter,rules,...b}=await brandDetail(w,row.id);return b;}));
 const archived=rows.filter((r:any)=>r.archivada).map((r:any)=>({id:r.id,name:'marca:'+r.id,label:r.identidad.name,type:'marca'}));if(w.role==='admin'){const ps=checked(await w.db.from('personas').select('*').eq('archivada',true));archived.push(...ps.map((r:any)=>({id:r.id,name:'persona:'+r.id,label:r.identidad.name,type:'persona'})));}return {brands,archived};}
const fields=['name','file','swatch','design','theme','colors','fonts','titleCase','defaults','look','cutout','logos','byline','modo','plantillas','motor_persona','motor_imagen','tamano','datos'];
function cleanIdentity(b:any,old:any={}){const out={...old};for(const key of fields)if(Object.hasOwn(b,key))out[key]=b[key];if(b.name!==undefined)out.name=name.parse(b.name);if(b.datos!==undefined)out.datos=z.array(z.object({dato:name,fuente:name,url:z.string().max(2000).optional()})).max(200).parse(b.datos);out.file=slug(out.file||out.name||'carrusel').toUpperCase();if(out.design==='base')out.swatch=out.colors?.accent||'#ECFE6E';return out;}
export async function libraryRoute(w:Identity,route:string,method:string,b:any):Promise<any|undefined>{
 const db=adminClient();const parts=route.split('/').map(decodeURIComponent),[section,id,action]=parts;
 if(section==='requests'&&method==='POST'){
  const data=obj.parse(b);const brand=z.string().min(1).parse(data.brief?.marca);await authorizeBrand(w,brand,true);const key=data.id?z.string().min(1).max(128).parse(data.id):'r'+randomUUID();
  const old=checked(await w.db.from('solicitudes').select('*').eq('id',key).maybeSingle());if(old&&old.marca_id!==brand)throw new HttpError(409,'No se puede cambiar la marca.');
  const doc={...data,id:key,createdAt:old?.documento.createdAt||new Date().toISOString()};
  if(old){const saved=checked(await db.from('solicitudes').update({documento:doc,version:old.version+1,updated_at:new Date().toISOString()}).eq('id',key).eq('version',old.version).select('id'));if(!saved.length)throw new HttpError(409,'La solicitud cambió. Recarga antes de guardar.');}
  else checked(await db.from('solicitudes').insert({id:key,marca_id:brand,documento:doc,created_by:w.id}));return doc;
 }
 if(section==='brands'&&method==='GET')return id?brandDetail(w,id):brandList(w);
 if(section==='people'&&method==='GET')return people(w);
 if(!['brands','people'].includes(section||'')||method!=='POST'||id==='_draft')return undefined;
 obj.parse(b);
 if(section==='people'){
  adminOnly(w);
  if(!id){const n=name.parse(b.name),pid=b.id?z.string().regex(/^[a-z0-9-]{1,64}$/).parse(b.id):slug(n)+'-'+randomUUID().slice(0,6);const old=checked(await db.from('personas').select('*').eq('id',pid).maybeSingle());const brands=z.array(z.string()).max(100).parse(b.brands||[]);for(const brand of brands)await authorizeBrand(w,brand,true);
   checked(await db.rpc('guardar_persona',{p_actor:w.id,p_id:pid,p_identidad:{...old?.identidad,name:n,aliases:z.array(z.string().max(100)).max(30).parse(b.aliases||[]),descripcion:z.string().max(4000).parse(b.descripcion||''),identidad:z.string().max(8000).parse(b.identidad||'')},p_marcas:brands}));return {id:pid};
  }
  const person=checked(await db.from('personas').select('id').eq('id',id).maybeSingle());if(!person)throw new HttpError(404,'Persona no encontrada.');
  if(action==='archive'){checked(await db.from('personas').update({archivada:true}).eq('id',id));return {ok:true};}
  if(action!=='photo')throw new HttpError(404,'Acción desconocida.');
  if(b.op==='add'){const f=await readyFile(w,b.fileId,undefined,id);if(!f.mime.startsWith('image/'))throw new HttpError(400,'Selecciona una imagen.');const last=checked(await db.from('persona_fotos').select('posicion').eq('persona_id',id).order('posicion',{ascending:false}).limit(1));checked(await db.from('persona_fotos').insert({persona_id:id,archivo_id:f.id,posicion:(last[0]?.posicion??-1)+1}));}
  else {const photo=z.uuid().parse(b.photo);const list=checked(await db.from('persona_fotos').select('*').eq('persona_id',id).order('posicion'));const index=list.findIndex((x:any)=>x.archivo_id===photo);if(index<0)throw new HttpError(404,'Foto no encontrada.');
   if(b.op==='delete')checked(await db.from('persona_fotos').delete().eq('persona_id',id).eq('archivo_id',photo));
   else if(b.op==='update'){if(typeof b.active==='boolean')checked(await db.from('persona_fotos').update({activa:b.active}).eq('persona_id',id).eq('archivo_id',photo));if(b.move){const next=index+z.number().refine(v=>v===1||v===-1).parse(b.move);if(list[next]){[list[index],list[next]]=[list[next],list[index]];checked(await db.from('persona_fotos').upsert(list.map((x:any,i:number)=>({...x,posicion:i}))));}}}else throw new HttpError(400,'Operación inválida.');}
  return {ok:true};
 }
 if(id==='_restore'){adminOnly(w);const [kind,key]=z.string().parse(b.name).split(':');if(!['marca','persona'].includes(kind||''))throw new HttpError(400,'Archivo inválido.');checked(await db.from(kind==='marca'?'marcas':'personas').update({archivada:false}).eq('id',key));return {id:key};}
 if(!id){adminOnly(w);const n=name.parse(b.name),key=slug(n)+'-'+randomUUID().slice(0,6);const identity=cleanIdentity(b,{name:n,design:'base',theme:'dark',colors:{accent:'#ECFE6E',darkBg:'#1E1E20',darkInk:'#F2F0EA',lightBg:'#F4F2EC',lightInk:'#1E1E20'},fonts:{display:'Archivo',body:'Inter'},defaults:{idioma:'Español',objetivo:'Autoridad'},logos:{}});checked(await db.from('marcas').insert({id:key,identidad:identity,reglas:z.string().max(64000).parse(b.rules||'')}));if(b.profile)await libraryRoute(w,'brands/'+key+'/add','POST',{kind:'conocimiento',name:'perfil.md',text:z.string().max(64000).parse(b.profile)});return {id:key};}
 await authorizeBrand(w,id,true);
 if(action==='archive'){adminOnly(w);if(id==='_comun')throw new HttpError(400,'No se archivan documentos comunes.');checked(await db.from('marcas').update({archivada:true}).eq('id',id));return {ok:true};}
 if(!action){const row=checked(await w.db.from('marcas').select('*').eq('id',id).single());if(b.version!==undefined&&b.version!==row.version)throw new HttpError(409,'La marca cambió. Recárgala.');
  if(b.personas!==undefined)adminOnly(w);
  checked(await db.rpc('guardar_marca',{p_actor:w.id,p_marca:id,p_version:row.version,p_identidad:cleanIdentity(b,row.identidad),p_reglas:b.rules===undefined?row.reglas:z.string().max(64000).parse(b.rules),p_personas:b.personas===undefined?null:z.array(z.string()).max(100).parse(b.personas)}));return brandDetail(w,id);
 }
 if(action==='add'){
  const kind=z.enum(['conocimiento','referencias','logos','vestuario']).parse(b.kind);let fileId=b.fileId;
  if(b.text!==undefined){if(kind!=='conocimiento')throw new HttpError(400,'Tipo inválido.');fileId=await storeFile(id,Buffer.from(z.string().max(64000).parse(b.text)),'text/markdown',name.parse(b.name).replace(/\.(md|txt)$/i,'')+'.md');}
  const file=await readyFile(w,fileId,id);if(kind!=='conocimiento'&&!file.mime.startsWith('image/'))throw new HttpError(400,'Selecciona una imagen.');
  const ruta=kind+'/'+file.id+'-'+file.nombre;checked(await db.from('marca_recursos').insert({marca_id:id,archivo_id:file.id,tipo:kind,ruta,etiquetas:z.array(z.string().max(80)).max(30).parse(b.tags||[])}));
  if(kind==='logos'&&['dark','light'].includes(b.role)){const row=checked(await db.from('marcas').select('*').eq('id',id).single());await libraryRoute(w,'brands/'+id,'POST',{version:row.version,logos:{...row.identidad.logos,[b.role]:{src:ruta,...(b.key?{key:b.key}:{})}}});}
  return {...await brandDetail(w,id),added:ruta};
 }
 const q=db.from('marca_recursos').select('*').eq('marca_id',id);const r=checked(await (['restore','purge'].includes(action)?q.eq('id',z.uuid().parse(b.name)):q.eq('ruta',z.string().parse(b.path))).maybeSingle());if(!r)throw new HttpError(404,'Recurso no encontrado.');
 if(action==='update'){const patch:any={};if(typeof b.active==='boolean')patch.activo=b.active;if(b.tags)patch.etiquetas=z.array(z.string().max(80)).max(30).parse(b.tags).map(x=>x.trim()).filter(Boolean);if(b.text!==undefined){if(r.tipo!=='conocimiento')throw new HttpError(400,'Solo se editan documentos.');const f=await readyFile(w,r.archivo_id,id);if(!['text/plain','text/markdown'].includes(f.mime))throw new HttpError(400,'Solo se editan textos.');patch.archivo_id=await storeFile(id,Buffer.from(z.string().max(64000).parse(b.text)),f.mime,f.nombre);}checked(await db.from('marca_recursos').update(patch).eq('id',r.id));}
 else if(action==='delete')checked(await db.from('marca_recursos').update({eliminado_at:new Date().toISOString(),metadata:{...r.metadata,kind:r.tipo,original:r.ruta}}).eq('id',r.id));
 else if(action==='restore')checked(await db.from('marca_recursos').update({eliminado_at:null,tipo:r.metadata.kind||r.tipo}).eq('id',r.id));
 else if(action==='purge'){
  if(!r.eliminado_at&&r.tipo!=='papelera')throw new HttpError(400,'Primero envía el recurso a la papelera.');
  const projects=checked(await db.from('proyectos').select('documento').eq('marca_id',id));
  const other=checked(await db.from('marca_recursos').select('id').eq('archivo_id',r.archivo_id).neq('id',r.id));
  const deliveries=checked(await db.from('entregas').select('id').eq('archivo_id',r.archivo_id));
  if(other.length||deliveries.length||projects.some((p:any)=>JSON.stringify(p.documento).includes('storage://'+r.archivo_id)))throw new HttpError(409,'Este archivo sigue en uso en un proyecto, recurso o entrega.');
  checked(await db.storage.from('estudio').remove([r.archivo_id+'/original']));
  checked(await db.from('marca_recursos').delete().eq('id',r.id));checked(await db.from('archivos').update({eliminado_at:new Date().toISOString(),listo:false}).eq('id',r.archivo_id));
 }
 else throw new HttpError(404,'Acción desconocida.');return brandDetail(w,id);
}
