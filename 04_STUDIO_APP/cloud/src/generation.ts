import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {adminClient} from './config.js';
import {authorizeBrand,HttpError,type Identity} from './auth.js';
import {adminOnly,checked,brandDetail,storeFile} from './library.js';
import {prompts} from './prompts.js';
import {readSite} from './sitio.js';
import {reelsJob} from './reels.js';
import {buildLayers,slideTexts,LAYERS_USD} from './layers.js';
// Nano Banana Pro (Gemini 3 Pro Image) por la API de Google. Precio aproximado por imagen, solo para el panel de costos.
// Google responde en la misma llamada y la versión preview puede tardar más de 6 minutos: la función tiene 800 s (vercel.json).
const GEMINI_TIMEOUT=720000;   // 12 min: el worker empieza trabajos solo en sus primeros 40 s, así cabe en los 800 s
const GEMINI_MODEL='gemini-3-pro-image-preview',GEMINI_USD:Record<string,number>={'1k':0.134,'2k':0.134,'4k':0.24};
// Nano Banana 2 (Gemini 3.1 Flash Image): mismo API de Google, precio por imagen publicado por Google
const NB2_USD:Record<string,number>={'1k':0.067,'2k':0.101,'4k':0.151};
export const GEMINI_MODELS:Record<string,string>={nano_banana_pro:GEMINI_MODEL,nano_banana_2:'gemini-3.1-flash-image'};
function engines(){const list:any[]=[];if(process.env.GEMINI_API_KEY)list.push({id:'nano_banana_pro',nombre:'Nano Banana Pro',proveedor:'Google',env:'GEMINI_API_KEY',disponible:true,tamanos:GEMINI_USD},{id:'nano_banana_2',nombre:'Nano Banana 2',proveedor:'Google',env:'GEMINI_API_KEY',disponible:true,tamanos:NB2_USD});if(process.env.HF_CREDENTIALS)list.push({id:'hf_flare',nombre:'GPT Image 2.5 Flare',proveedor:'Higgsfield',env:'HF_CREDENTIALS',disponible:true,tamanos:{'1k':null,'2k':null,'4k':null}});if(process.env.HF_CREDENTIALS)list.push({id:'hf_soul2',nombre:'Soul 2 · Soul ID',proveedor:'Higgsfield',env:'HF_CREDENTIALS',disponible:true,tamanos:{'1k':null,'2k':null}});return list;}
export function aiConfig(){const motores=engines();return {hasKey:!!process.env.ANTHROPIC_API_KEY,fromEnv:true,motores,motorDefecto:motores[0]?.id||'hf_flare',tamanoDefecto:'2k',reservationPerImage:2,reservationPerProposal:2};}
const digest=(x:any)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function childKey(group:string,index:number){const h=digest([group,index]).slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`;}
export async function enqueue(w:Identity,route:string,b:any){
 const key=z.uuid().parse(b.idempotencyKey),jobs:any[]=[];let brand:string;
 if(route==='generate'){
  const available=engines().map(m=>m.id);if(!available.length)throw new HttpError(503,'El proveedor de imágenes no está configurado.');const motor=b.motor||available[0];if(!available.includes(motor))throw new HttpError(400,'Ese motor de imagen no está conectado en este Estudio.');
  const p=checked(await w.db.from('proyectos').select('*').eq('id',z.string().max(128).parse(b.projectId)).maybeSingle());if(!p)throw new HttpError(404,'Guarda primero el proyecto.');brand=p.marca_id;await authorizeBrand(w,brand,true);
  const items=z.array(z.object({index:z.number().int().min(0).max(29),prompt:z.string().max(12000),people:z.array(z.any()).optional(),slide:z.record(z.string(),z.any()).optional(),count:z.string().max(20).optional()}).passthrough()).min(1).max(10).parse(b.items);if(new Set(items.map(i=>i.index)).size!==items.length)throw new HttpError(400,'Láminas duplicadas.');
  for(const item of items){const slide=p.documento.slides[item.index];if(!slide)throw new HttpError(400,'Lámina inválida.');const payload={...item,originalImage:slide.image||'',tamano:z.enum(['1k','2k','4k']).parse(b.tamano||'2k'),slide:{...slide,...item.slide},visualSystem:String(p.documento.visualSystem||'').slice(0,8000),modo:['completa','editable','foto'].includes(p.documento.modo)?p.documento.modo:'',avoid:String(p.documento.avoid||'').slice(0,4000)};jobs.push({tipo:'imagen',motor,payload,key:childKey(key,item.index),hash:digest(payload),reserva:2,proyecto:p.id,lamina:String(item.index),version:p.version});}
 }else if(route==='layers'){
  if(!process.env.GEMINI_API_KEY)throw new HttpError(503,'Separar capas usa la API de Google, que no está configurada.');
  const p=checked(await w.db.from('proyectos').select('*').eq('id',z.string().max(128).parse(b.projectId)).maybeSingle());if(!p)throw new HttpError(404,'Guarda primero el proyecto.');brand=p.marca_id;await authorizeBrand(w,brand,true);
  const index=z.number().int().min(0).max(29).parse(b.index),slide=p.documento.slides[index];
  if(!slide?.full||!/^storage:\/\/[0-9a-f-]{36}$/.test(slide.image||''))throw new HttpError(400,'Solo una lámina completa ya generada se puede separar en capas.');
  const payload={index,image:slide.image,originalImage:slide.image,slide,tamano:'2k'};jobs.push({tipo:'imagen',motor:'capas',payload,key:childKey(key,index),hash:digest(payload),reserva:0.5,proyecto:p.id,lamina:String(index),version:p.version});
 }else{
  if(!process.env.ANTHROPIC_API_KEY)throw new HttpError(503,'Anthropic no está configurado.');if(route==='brands/_draft'){adminOnly(w);brand='_comun';}else brand=z.string().min(1).parse((b.brief||b).marca);
  await authorizeBrand(w,brand,true);const {idempotencyKey,...payload}=b;if(JSON.stringify(payload).length>20000)throw new HttpError(400,'El brief es demasiado largo.');
  jobs.push({tipo:route==='brands/_draft'?'perfil':'propuesta',motor:'claude-sonnet-4-6',payload,key,hash:digest(payload),reserva:2});
 }
 const r=await adminClient().rpc('encolar_lote',{p_actor:w.id,p_marca:brand,p_grupo:key,p_jobs:jobs});if(r.error){if(r.error.code==='P0001')throw new HttpError(409,'No hay presupuesto disponible o hay demasiados trabajos pendientes. Revisa los trabajos antes de generar de nuevo.');checked(r);}return {id:r.data![0].grupo_id,jobId:r.data![0].id,queued:true};
}
export async function generationStatus(w:Identity,group:string){const rows=checked(await w.db.from('trabajos').select('id,estado,resultado,error,lamina_id,motor,payload').eq('grupo_id',z.uuid().parse(group)).order('created_at'));if(!rows.length)throw new HttpError(404,'Trabajo no encontrado.');const done=rows.every((x:any)=>['succeeded','failed','uncertain','canceled'].includes(x.estado));return {id:group,done,items:rows.map((j:any)=>({index:Number(j.lamina_id??0),status:j.estado==='succeeded'?'completed':['failed','uncertain','canceled'].includes(j.estado)?'failed':j.estado,...j.resultado,error:j.error,motor:j.motor,tamano:j.payload.tamano})),result:done&&rows.length===1?rows[0].resultado:null,error:done?rows.find((x:any)=>x.error)?.error:null};}
export async function saveJob(j:any,patch:any){const r=await adminClient().from('trabajos').update({...patch,updated_at:new Date().toISOString(),lease_token:null,lease_until:null}).eq('id',j.id).eq('lease_token',j.lease_token).select('id');checked(r);if(!r.data?.length)throw new Error('Lease vencido');}
export class ProviderError extends Error{constructor(public status:number){super(`Proveedor respondió ${status}`);}}
async function jsonFetch(url:string,init:any,timeout=45000){const r=await fetch(url,{...init,signal:AbortSignal.timeout(timeout),redirect:'error'});if(!r.ok)throw new ProviderError(r.status);return r.json();}
const hf=(path:string,b?:any)=>jsonFetch('https://api.higgsfield.ai/'+path,{method:b?'POST':'GET',headers:{Authorization:'Key '+process.env.HF_CREDENTIALS,'Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});
async function workerIdentity(j:any):Promise<Identity>{const db=adminClient();const m=checked(await db.from('miembros').select('*').eq('user_id',j.user_id).single());if(!m?.activo||!['admin','editor'].includes(m.rol))throw new HttpError(403,'Acceso revocado.');if(m.rol!=='admin'){const link=checked(await db.from('miembro_marca').select('*').eq('user_id',j.user_id).eq('marca_id',j.marca_id).maybeSingle());if(!link||j.marca_id==='_comun')throw new HttpError(403,'Acceso revocado.');}const brand=checked(await db.from('marcas').select('archivada').eq('id',j.marca_id).single());if(brand.archivada)throw new HttpError(403,'Marca archivada.');return {id:j.user_id,role:m.rol,db};}
async function fileUrl(ref:string,ttl=3600){if(!/^storage:\/\/[0-9a-f-]{36}$/.test(ref))throw new Error('Referencia inválida');const id=ref.slice(10);const f=checked(await adminClient().from('archivos').select('object_path,listo,eliminado_at').eq('id',id).single());if(!f.listo||f.eliminado_at)throw new Error('Archivo no disponible');return checked(await adminClient().storage.from('estudio').createSignedUrl(f.object_path,ttl)).signedUrl;}
// Referencias marcadas como vehículo/producto: su nombre es el modelo oficial (etiquetas sin "lugar"/"vehiculo", o el nombre del archivo)
const norm=(t:string)=>t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function vehicles(d:any){return d.resources.referencias.filter((r:any)=>r.active&&r.tags.includes("vehiculo")).map((r:any)=>({url:r.url as string,name:r.tags.filter((t:string)=>!["lugar","vehiculo"].includes(t)).join(", ").trim()||String(r.name).replace(/\.[a-z0-9]+$/i,"")}));}
// Vehículos que nombra la lámina: la palabra del modelo (Seltos, K5, EV9) y, si la referencia trae año, ese año cerca del modelo.
// Una sola referencia por modelo: "2027 Seltos" no se mezcla con la foto del Seltos 2026, y un año distinto descarta la foto.
const YEAR=/^(19|20)\d\d$/;
function vehiclesIn(list:any[],text:string){const toks=norm(text).split(/[^a-z0-9]+/).filter(Boolean),best=new Map<string,any>();
 for(const v of list){const k=norm(v.name).split(/[^a-z0-9]+/).filter(Boolean),year=k.find(x=>YEAR.test(x)),key=k.find(x=>!YEAR.test(x)&&x!=='kia'&&x.length>1);if(!key)continue;
  const at=toks.flatMap((t,i)=>t===key?[i]:[]);if(!at.length)continue;
  const near=at.flatMap(i=>toks.slice(Math.max(0,i-4),i+5)).filter(t=>YEAR.test(t));const fit=year?(near.includes(year)?3:near.length?-1:1):2;if(fit<0)continue;
  const score=fit*10+k.filter(x=>toks.includes(x)).length,prev=best.get(key);if(!prev||score>prev.score||(score===prev.score&&(year||'')>(prev.year||'')))best.set(key,{v,score,year});}
 return [...best.values()].sort((a,b)=>b.score-a.score).map(x=>x.v);}
// La lámina muestra el lugar real solo si la escena lo nombra; en un escenario o estudio la fachada confunde al motor
const PLACE=/(dealership|dealer\b|showroom|facade|fachada|concesionari|storefront|building|edificio|car lot|sales lot|parking lot|estacionamiento|sucursal|agencia|\bstore\b|tienda|local\b)/;
// Largo máximo del prompt por motor (Flare lo valida y responde 400 "is too long")
const PROMPT_MAX:Record<string,number>={hf_flare:5000,hf_soul2:5000};
// Corta en el último final de frase (o coma) antes de n caracteres
const recortar=(t:string,n:number)=>{if(t.length<=n)return t;const c=t.slice(0,n),k=Math.max(c.lastIndexOf('. '),c.lastIndexOf('.\n'));return k>n*0.6?c.slice(0,k+1):c.slice(0,Math.max(c.lastIndexOf(', '),n*0.8)|0)+'.';};
// Rutas de archivo que Claude a veces escribe (assets/x.png): el motor las imprimiría como texto
const sinRutas=(t:string)=>t.replace(/['"]?(?:[\w-]+\/)*[\w-]+\.(?:png|jpe?g|webp|svg)['"]?/gi,m=>/logo/i.test(m)?'the supplied official logo':'the supplied reference photos');
// Etiquetas de las referencias de estilo con significado fijo: le dicen a Claude para qué sirve cada imagen
const PURPOSE:Record<string,string>={diagramacion:'cómo se acomodan texto e imagen en la lámina',estilo:'luz, paleta y tratamiento de la foto',tono:'la voz y el tipo de frase (nunca el texto en sí)',portada:'láminas de portada',cierre:'láminas de cierre o llamado a la acción',cifra:'láminas con una cifra protagonista',lista:'láminas con lista o pasos',frase:'láminas con una frase o cita'};
// Hasta n referencias de estilo para este pedido: primero las que tienen etiquetas que coinciden con el brief, luego las que
// tienen etiqueta de uso; los empates se reparten distinto en cada pedido (no siempre las primeras del alfabeto)
function pickRefs(refs:any[],brief:string,n:number){
 const words=new Set(norm(brief).split(/[^a-z0-9]+/).filter(x=>x.length>2));
 return refs.map(r=>{const tags=r.tags.map(norm);const hit=tags.filter((t:string)=>t.split(/[^a-z0-9]+/).some(x=>words.has(x))).length;
  return {r,score:hit*3+(tags.some((t:string)=>t in PURPOSE)?1:0),tie:digest([brief,r.id])};}).sort((a,b)=>b.score-a.score||a.tie.localeCompare(b.tie)).slice(0,n).map(x=>x.r);}
async function knowledge(w:Identity,brand:string,brief=''){const all=[await brandDetail(w,brand)];if(brand!=='_comun')all.push(await brandDetail(w,'_comun'));let text='',remaining=80000;const media:any[]=[];let pdfCount=0;
 const ok=(r:any)=>r.active&&r.size<=4500000,style=all.flatMap(d=>d.resources.referencias.filter((r:any)=>ok(r)&&!r.tags.includes('lugar')&&!r.tags.includes('vehiculo')));
 const picked=pickRefs(style,brief,6);
 for(const [i,r] of picked.entries()){const tags=r.tags.filter((t:string)=>t.trim()),uses=[...new Set(tags.map(norm).filter((t:string)=>t in PURPOSE).map((t:string)=>PURPOSE[t]))];
  media.push({type:'text',text:`Referencia de estilo ${i+1}${tags.length?` · etiquetas: ${tags.join(', ')}`:''}${uses.length?` · sirve para: ${uses.join('; ')}`:''}`},{type:'image',source:{type:'url',url:await fileUrl(r.url)}});}
 // Fotos de los vehículos o productos que nombra el pedido (Claude ve cómo son; el motor recibe la misma foto)
 const cars=all.flatMap(d=>vehiclesIn(vehicles(d),brief)).slice(0,2);
 for(const c of cars)media.push({type:'text',text:`Foto del vehículo o producto «${c.name}»`},{type:'image',source:{type:'url',url:await fileUrl(c.url)}});
 if(picked.length)text+=`\nLas «Referencias de estilo» adjuntas muestran cómo se ven los carruseles de la marca: diagramación, tipografía, luz, paleta y tratamiento. Sus etiquetas dicen para qué sirve cada una («sirve para»); una referencia sin etiquetas vale como estilo general. Nunca copies sus textos, titulares, frases, escenas ni composiciones: escribe y dirige contenido nuevo para este brief, con escenas distintas a las de las referencias.`;
 for(const d of all){const v=vehicles(d);text+=`\nMarca: ${d.name}\nReglas: ${d.rules}${v.length?`\nVehículos/productos con foto de referencia (el motor de imagen recibe su foto; usa estos nombres y años exactos): ${v.map((x:any)=>`"${x.name}"`).join(", ")}`:""}\nDatos verificados: ${JSON.stringify(d.datos)}\nPersonas aprobadas: ${JSON.stringify(d.people.map((p:any)=>({id:p.id,name:p.name,descripcion:p.descripcion})))}`;
  for(const f of d.resources.conocimiento.filter((f:any)=>f.active)){if(remaining<=0)break;const file=checked(await w.db.from('archivos').select('*').eq('id',f.url.slice(10)).single());if(file.mime==='application/pdf'&&pdfCount<2&&file.bytes<1500000){const b=checked(await adminClient().storage.from('estudio').download(file.object_path));pdfCount++;media.push({type:'document',source:{type:'base64',media_type:'application/pdf',data:Buffer.from(await b.arrayBuffer()).toString('base64')}});}else if(file.mime.startsWith('text/')&&file.bytes<500000){const b=checked(await adminClient().storage.from('estudio').download(file.object_path));const content=(await b.text()).slice(0,remaining);remaining-=content.length;text+=`\nDocumento ${f.name}:\n${content}`;}}
 }
 return {text:text.slice(0,100000),media};
}
async function textJob(j:any,w:Identity){const profile=j.tipo==='perfil',brief=j.payload.brief||j.payload,k=await knowledge(w,j.marca_id,JSON.stringify(brief));const schema=profile?prompts.brand_schema:prompts.draft_schema;
 // Lámina completa: Claude escribe cada lámina como bloque [SLIDE n OF N] para el motor; el VISUAL SYSTEM y el AVOID fijos de la marca mandan.
 let full='';if(!profile){const id=checked(await adminClient().from('marcas').select('identidad').eq('id',j.marca_id).single()).identidad||{};if(['completa','editable'].includes(['completa','editable','foto'].includes(brief.modo)?brief.modo:id.modo))full='\n\n'+prompts.full_rules+(id.sistema_visual?`\n\n  La marca tiene un VISUAL SYSTEM fijo (deja visualSystem vacío y escribe las láminas para que encajen con él):\n${id.sistema_visual}`:'')+(id.evitar?`\n\n  La marca tiene un AVOID fijo (deja avoid vacío):\n${id.evitar}`:'');else full='\n\n  Deja visualSystem y avoid vacíos (esta marca no usa lámina completa).';}
 // Perfil de marca nueva con sitio web: se lee el sitio (colores, tipografías, logo, textos) antes de llamar a Claude
 let site:any=null,siteText='';if(profile&&typeof brief.website==='string'&&brief.website.trim()){try{const r=await readSite(brief.website.trim());site=r.site;siteText=`\n\nIdentidad leída directamente del sitio web (datos reales: úsalos para colores, tipografías, tono y oferta; el color de acento sale de los colores más usados que no son neutros):\n${r.summary}`;}catch(e){siteText=`\n\nNo se pudo leer el sitio web (${e instanceof Error?e.message:'error'}): usa la búsqueda web si hace falta.`;}}
 const messages=[{role:'user',content:[...k.media,{type:'text',text:`Fecha: ${new Date().toISOString().slice(0,10)}\nBrief: ${JSON.stringify(brief)}${siteText}\nInvestiga solo si necesitas verificar hechos o el sitio web indicado. Nunca inventes cifras ni afirmes que has consultado fuentes que no consultaste. Devuelve el contenido con el esquema solicitado.`}]}];
 const data=await jsonFetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':process.env.ANTHROPIC_API_KEY!,'anthropic-version':'2023-06-01','Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:16000,system:(profile?prompts.brand_rules:prompts.draft_rules+full)+'\n'+k.text,tools:[{type:'web_search_20250305',name:'web_search',max_uses:2}],messages,output_config:{format:{type:'json_schema',schema}}})},240000);
 if(data.stop_reason==='max_tokens'||data.stop_reason==='refusal')throw new Error('La propuesta no pudo completarse.');const raw=data.content.filter((x:any)=>x.type==='text').map((x:any)=>x.text).join('');const result=JSON.parse(raw);if(!profile)z.array(z.object({title:z.string(),layout:z.string()}).passthrough()).min(1).max(30).parse(result.slides);
 const usage=data.usage||{};const usd=(usage.input_tokens||0)*3e-6+(usage.output_tokens||0)*15e-6+(usage.server_tool_use?.web_search_requests||0)*0.01;
 result.usage={usd,model:data.model,...usage};if(site)result.site=site;result.research=data.content.filter((x:any)=>x.type==='web_search_tool_result').flatMap((x:any)=>Array.isArray(x.content)?x.content.map((r:any)=>`${r.title||''} ${r.url||''}`):[]).join('\n');await saveJob(j,{estado:'succeeded',error:null,resultado:result,coste_usd:usd});
}
// Bytes de un archivo de Storage (Google recibe las referencias dentro de la petición, no por URL)
export async function fileBytes(ref:string){if(!/^storage:\/\/[0-9a-f-]{36}$/.test(ref))throw new Error('Referencia inválida');const f=checked(await adminClient().from('archivos').select('object_path,mime,listo,eliminado_at').eq('id',ref.slice(10)).single());if(!f.listo||f.eliminado_at)throw new Error('Archivo no disponible');const b=checked(await adminClient().storage.from('estudio').download(f.object_path));return {mime:f.mime as string,bytes:Buffer.from(await b.arrayBuffer())};}
async function storeResult(j:any,bytes:Buffer,mime:string,coste:number|null,w?:Identity){if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new Error('Formato inesperado.');const id=await storeFile(j.marca_id,bytes,mime,'generada-'+j.id+(mime==='image/png'?'.png':mime==='image/webp'?'.webp':'.jpg'));
 // Completa editable: la lámina terminada se separa en capas en el mismo trabajo; si falla, queda la lámina completa
 let layers=null,qa='';if(w&&j.payload.modo==='editable'&&j.resultado?.full){try{layers=await makeLayers(j,w,bytes,mime);if(coste!=null)coste+=LAYERS_USD;}catch(e){qa='La lámina está lista, pero no se pudo separar en capas: '+(e instanceof Error?e.message:'error')+' Usa "Hacer editable" en el Editor.';}}
 await saveJob(j,{estado:'succeeded',error:null,resultado:{url:'storage://'+id,cutout:'',full:!!j.resultado?.full,needsCutout:!!j.resultado?.needsCutout,motor:j.motor,tamano:j.payload.tamano,...(layers?{layers}:{}),...(qa?{qa}:{})},coste_usd:coste});}
// Separa la lámina en fondo limpio + capas de texto + logos (ver layers.ts) y guarda el fondo
async function makeLayers(j:any,w:Identity,bytes:Buffer,mime:string){
 const brand=await brandDetail(w,j.marca_id);
 const L=await buildLayers(bytes,mime,slideTexts(j.payload.slide||{}),{name:brand.name,fonts:brand.fonts,hasLogo:!!(brand.logos?.dark?.url||brand.logos?.light?.url)});
 const plate=await storeFile(j.marca_id,L.plate,'image/jpeg','capas-'+j.id+'.jpg');
 return {on:true,plate:'storage://'+plate,cutout:'',w:L.width,h:L.height,texts:L.texts,logos:L.logos};
}
// Trabajo "capas": separa una lámina completa ya generada (botón Hacer editable del Editor)
async function layersJob(j:any,w:Identity){
 let layers;try{const f=await fileBytes(j.payload.image);layers=await makeLayers(j,w,f.bytes,f.mime);}
 catch(e){await saveJob(j,{estado:'failed',error:'No se pudo separar en capas: '+(e instanceof Error?e.message:'error'),coste_usd:LAYERS_USD});return;}
 await saveJob(j,{estado:'succeeded',error:null,resultado:{url:j.payload.image,cutout:'',full:true,layers,motor:'capas',tamano:j.payload.tamano},coste_usd:LAYERS_USD});}
// Prompt y referencias (storage://) de la lámina, iguales para todos los motores
export async function imageRequest(j:any,w:Identity){const brand=await brandDetail(w,j.marca_id),p=j.payload,s=p.slide||{};const modo=(p.modo==='editable'?'completa':p.modo)||brand.modo;const wanted=new Set((p.people||[]).map((x:any)=>typeof x==='string'?x:x.id));const mentioned=(p.prompt+' '+(s.photo||'')).toLowerCase();const people=brand.people.filter((x:any)=>wanted.has(x.id)||[x.name,...x.aliases].some((n:string)=>mentioned.includes(n.toLowerCase())));const refs:string[]=[];
 // Soul 2 no recibe fotos: la identidad viene del Soul ID entrenado de la persona
 if(j.motor==='hf_soul2'){const person=people.find((x:any)=>x.soul?.status==='completed');const others=people.filter((x:any)=>x!==person).map((x:any)=>x.lock);
  const prompt=p.prompt+'\n'+(brand.look||'')+'\n'+others.join('\n')+'\nNo text, letters, logos or watermark. Leave space for the title. Natural editorial photography.';
  return {prompt:prompt.slice(0,20000),refs,full:false,needsCutout:!!brand.cutout,soulId:person?.soul.id as string|undefined,soulStrength:Number(person?.soul.strength??1)};}
 // Lámina completa: hasta 3 personas y 6 fotos de cara repartidas entre ellas; modo foto: 2 personas con 2 fotos
 const cast=people.slice(0,modo==='completa'?3:2),perPerson=modo==='completa'?Math.min(3,Math.floor(6/Math.max(1,cast.length))):2,faces:{name:string,count:number}[]=[];
 for(const person of cast){const photos=person.photos.filter((f:any)=>f.active);const preferred=s.basePhoto||person.fotos_base?.[s.layout]||person.fotos_base?.otras;photos.sort((a:any,b:any)=>Number(b.name===preferred||b.label===preferred)-Number(a.name===preferred||a.label===preferred));const chosen=photos.slice(0,perPerson);for(const f of chosen)refs.push(f.url);if(chosen.length)faces.push({name:person.name,count:chosen.length});}
 // Referencias marcadas como lugar real (fachada, local): el motor las recibe para no inventar el edificio
 const scene=norm(p.prompt+' '+(s.photo||'')+' '+(s.photoPrompt||''));const places=PLACE.test(scene)?brand.resources.referencias.filter((r:any)=>r.active&&r.tags.includes('lugar')).slice(0,2).map((r:any)=>r.url):[];const placeStart=refs.length;
 for(const url of places)if(refs.length<8)refs.push(url);const placeCount=refs.length-placeStart;
 // Vehículos/productos que nombra la lámina: el motor recibe su foto para no dibujar otro modelo u otra generación
 const cars=vehiclesIn(vehicles(brand),p.prompt+" "+(s.photo||"")+" "+(s.photoPrompt||"")).slice(0,2);const carStart=refs.length;
 for(const v of cars)if(refs.length<10&&!refs.includes(v.url))refs.push(v.url);const carCount=refs.length-carStart;const carNames=cars.slice(0,carCount).map((v:any)=>v.name);
 // En lámina completa el vestuario lo define el VISUAL SYSTEM; la foto de vestuario solo va en el modo foto
 const outfits=brand.outfits||[];let outfit=false;if(people.length&&s.outfit!=='original'&&outfits.length&&modo!=='completa'){const o=outfits.find((x:any)=>x.name===s.outfit||x.path===s.outfit)||outfits[p.index%outfits.length];refs.push(o.url);outfit=true;}
 const full=modo==='completa';let prompt=p.prompt+'\n'+(brand.look||'')+'\n'+people.map((x:any)=>x.lock).join('\n');
 if(people.length&&j.motor in GEMINI_MODELS)prompt+='\nThe first image is a real photograph of this woman: keep her face, facial features, skin, age and hair exactly as in the photo. Do not retouch, smooth, beautify or redraw her face. Change the location, background and lighting to match the scene, with light on her that matches the room. The following image of her is for identity only.'+(outfit?' Dress her in the exact outfit of the LAST image (same garments, cut, fabric and colors); ignore the model, face and body in that last image, it is a clothing reference only. Choose a natural, elegant pose that shows the outfit.':'')+' Real camera photograph, natural skin texture with visible pores, subtle film grain, no CGI or plastic skin.';
 else if(people.length)prompt+='\nUse the first reference images for the exact approved identity. Preserve face and natural skin texture. '+(outfit?'The last reference specifies clothing only.':'');
 if(placeCount)prompt+=`\nReference image${placeCount>1?'s':''} ${Array.from({length:placeCount},(_,i)=>placeStart+i+1).join(' and ')} show${placeCount>1?'':'s'} the brand's real location. Whenever the scene shows the building, facade, showroom or lot, reproduce this exact place: same architecture, facade shape, colors, windows, entrance, signage placement and surroundings. Do not invent a different or generic building. Use these images for the location only, never for people.`;
 if(carCount)prompt+=`\nReference image${carCount>1?"s":""} ${Array.from({length:carCount},(_,i)=>carStart+i+1).join(" and ")} show${carCount>1?"":"s"} the exact vehicle${carCount>1?"s":""} (${carNames.join("; ")}). Reproduce this exact model and generation: same body shape, grille, headlights, taillights, wheels, proportions and paint color. Do not substitute a previous model year, another model or a generic car. Change only the setting, angle and lighting.`;
 if(full){
  // Guía de la marca: VISUAL SYSTEM idéntico en todas las láminas + bloque de la lámina + texto exacto + AVOID.
  for(const l of [brand.logos?.dark||brand.logos?.light,brand.byline?.logos?.dark||brand.byline?.logos?.light])if(l?.url&&refs.length<12&&!refs.includes(l.url))refs.push(l.url);
  const logoStart=refs.length-[brand.logos?.dark||brand.logos?.light,brand.byline?.logos?.dark||brand.byline?.logos?.light].filter((l:any)=>l?.url).length;
  // Las referencias de estilo de la marca no van al motor: GPT Image y Nano Banana las copiaban casi literal (texto y escena).
  // El estilo llega por el VISUAL SYSTEM que escribe Claude después de verlas.
  const styleStart=refs.length;
  // Leyenda sin números: el motor tiende a imprimir los índices como texto en la lámina
  const quien=faces.map(x=>x.name).join(faces.length>2?', ':' and ').replace(/, ([^,]*)$/,' and $1'),varias=faces.length>1;
  const legend=[placeStart&&(varias?`First, real photographs of each person, in this order: ${faces.map(x=>`${['','one photo','two photos','three photos'][x.count]} of ${x.name}`).join(', then ')}. Facial identity only (never redraw, swap or replace a face).`:`First, real photographs of ${quien}: facial identity only (never redraw or replace the face).`),
   placeCount&&`Then the brand's real location; reproduce it when the scene shows the place.`,
   carCount&&`Then the exact vehicle reference (${carNames.join("; ")}); reproduce this model and generation exactly, never an older or different model.`,
   styleStart>logoStart&&`Then the official logos (${[brand.name,brand.byline?.alt].filter(Boolean).join(', ')}): copy those logo images faithfully; never invent, redraw or distort a logo.`].filter(Boolean).join('\n');
  const identidad=!placeStart?'':varias?`[IDENTITY LOCK — most important]\nThe first reference images are real photographs of ${quien}, grouped by person in the order above. Each person on this slide IS that real person: keep each one's face, facial features, skin tone, age, hair color, length and texture exactly as in their own photographs. Never swap faces between people, never merge them, never add a different person in their place. Each face must be large and clear enough to be recognized. Do not retouch, beautify or redraw faces. Natural skin texture with visible pores.\n\n`:`[IDENTITY LOCK — most important]\nThe first reference images are real photographs of ${quien}. The person on this slide IS ${quien}: keep the face, facial features, skin tone, age and their own hair color, length and texture exactly as in those photographs. Do not retouch, beautify, redraw or replace the face; never generate a different person. Natural skin texture with visible pores.\n\n`;
  const clean=(t:any)=>String(t||'').replace(/[*_=]/g,'').trim();
  const texts=[['Small label',s.kicker],['Headline',s.title],['Big number',s.number],['Number label',s.numberLabel],['Supporting line',s.body],...(s.items||[]).map((t:string)=>['List item',t]),['Left label',s.leftLabel],...(s.leftItems||[]).map((t:string)=>['Left item',t]),['Right label',s.rightLabel],...(s.rightItems||[]).map((t:string)=>['Right item',t]),['Call to action',s.cta],['Source (small)',s.source],...(s.blocks||[]).filter((b:any)=>!['linea','firma'].includes(b.style)).map((b:any)=>[b.style==='titulo-xl'||b.style==='titulo'?'Headline':b.style==='cifra'?'Big number':'Text block',b.text])].filter(([,t])=>clean(t)).map(([l,t])=>`${l}: "${clean(t)}"`).join('\n');
  const accent=(String(s.title||'').match(/\*([^*]+)\*/)||[])[1];
  const sistema=sinRutas(String(brand.sistema_visual||p.visualSystem||'').trim())||`Instagram editorial carousel, 4:5 vertical. Premium magazine-cover aesthetic for ${brand.name}. Palette: ${JSON.stringify(brand.colors||{})}. Typography: giant condensed uppercase headlines in a ${brand.fonts?.display||'bold condensed grotesque'} style, the key word or number in the accent color, supporting text in clean ${brand.fonts?.body||'sans-serif'}. ${brand.look||''} All slides must feel like one cohesive campaign.`;
  const evitar=String(brand.evitar||p.avoid||'').trim()||'Misspelled or malformed letters, extra or invented text, invented or distorted logos, a face different from the reference, plastic or airbrushed skin, deformed hands or bodies, stock-photo look, clutter, oversaturation, watermarks.';
  const nunca='Every word visible in the image must come from the exact text list, each line exactly once: never repeat a word or line, never print slide numbers or counters (such as "2 of 7"), reference numbers, captions, or technical words from these instructions (HUD, UI, slide, kicker, label, logo).';
  const armar=(vs:string,sl:string,ev:string)=>`[VISUAL SYSTEM — identical on every slide]\n${vs}\n\n${legend?`[REFERENCE IMAGES, in order]\n${legend}\n\n`:''}${identidad}${sl}\n\n[EXACT TEXT ON THIS SLIDE — Spanish, render letter by letter with every accent; this list wins if anything above differs]\n${texts||'(no text)'}${accent?`\nAccent-color word: "${accent}"`:''}\n\n[AVOID]\n${ev} ${nunca}`;
  // Flare (Higgsfield) rechaza prompts de más de 5.000 caracteres: se recorta primero el AVOID, luego el VISUAL SYSTEM y al final el bloque de la lámina, siempre en un final de frase
  let vs=sistema,sl=sinRutas(p.prompt),ev=evitar;const max=PROMPT_MAX[j.motor]??20000;
  for(const [get,set,min] of [[()=>ev,(t:string)=>ev=t,300],[()=>vs,(t:string)=>vs=t,700],[()=>sl,(t:string)=>sl=t,600]] as const){const over=armar(vs,sl,ev).length-max;if(over<=0)break;set(recortar(get(),Math.max(min,get().length-over)));}
  prompt=armar(vs,sl,ev);}
 else prompt+='\nNo text, letters, logos or watermark. Leave space for the title. Natural editorial photography.';
 return {prompt:prompt.slice(0,PROMPT_MAX[j.motor]??20000),refs,full,needsCutout:!!brand.cutout&&!full,soulId:undefined as string|undefined,soulStrength:1};
}
// Google responde en la misma llamada: no hay id de proveedor ni consulta de estado.
async function geminiJob(j:any,w:Identity){const req=await imageRequest(j,w);j.resultado={full:req.full,needsCutout:req.needsCutout};const parts:any[]=[];let total=0;
 for(const ref of req.refs){const f=await fileBytes(ref);if(!['image/png','image/jpeg','image/webp'].includes(f.mime)||total+f.bytes.length>14000000)continue;total+=f.bytes.length;parts.push({inline_data:{mime_type:f.mime,data:f.bytes.toString('base64')}});}
 parts.push({text:req.prompt});
 const data=await jsonFetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[j.motor]||GEMINI_MODEL}:generateContent`,{method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_API_KEY!,'Content-Type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:'4:5',imageSize:String(j.payload.tamano).toUpperCase()}}})},GEMINI_TIMEOUT);
 const cand=data.candidates?.[0];const img=(cand?.content?.parts||[]).map((x:any)=>x.inlineData||x.inline_data).find(Boolean);
 if(!img){await saveJob(j,{estado:'failed',error:`Google no devolvió imagen (${cand?.finishReason||data.promptFeedback?.blockReason||'sin motivo'}). Cambia la escena o el prompt.`,coste_usd:0});return;}
 await storeResult(j,Buffer.from(img.data,'base64'),img.mimeType||img.mime_type||'image/png',(j.motor==='nano_banana_pro'?GEMINI_USD:NB2_USD)[j.payload.tamano]??null,w);
}
async function imageJob(j:any,w:Identity){const db=adminClient();let data;
 if(j.motor==='capas')return layersJob(j,w);
 if(j.motor in GEMINI_MODELS)return geminiJob(j,w);
 if(!j.provider_id){const req=await imageRequest(j,w);const refs:string[]=[];for(const ref of req.refs)refs.push(await fileUrl(ref));const p=j.payload;
  data=j.motor==='hf_soul2'?await hf('higgsfield-ai/soul/v2/standard',{prompt:req.prompt,resolution:p.tamano==='1k'?'720p':'1080p',aspect_ratio:'3:4',batch_size:1,enhance_prompt:false,...(req.soulId?{custom_reference_id:req.soulId,custom_reference_strength:req.soulStrength}:{})})
   :await hf('marketing-studio/image/flare',{prompt:req.prompt,resolution:p.tamano,aspect_ratio:'3:4',quality:'high',enhance_prompt:false,...(refs.length?{image_urls:refs}:{})});
  const requestId=z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).parse(data.request_id);checked(await db.from('trabajos').update({provider_id:requestId,resultado:{full:req.full,needsCutout:req.needsCutout}}).eq('id',j.id).eq('lease_token',j.lease_token));j.provider_id=requestId;j.resultado={full:req.full,needsCutout:req.needsCutout};
 }else data=await hf('requests/'+encodeURIComponent(j.provider_id)+'/status');
 if(['failed','nsfw','canceled','cancelled'].includes(data.status)){await saveJob(j,{estado:'failed',error:'El proveedor no completó la imagen ('+data.status+').',coste_usd:0});return;}
 if(data.status!=='completed'){await saveJob(j,{estado:'waiting',next_run_at:new Date(Date.now()+4000).toISOString()});return;}
 const src=data.images?.[0]?.url||data.output?.images?.[0]?.url;const u=new URL(z.url().parse(src));if(u.protocol!=='https:')throw new Error('URL de proveedor inválida');
 // Only fetch provider-returned output, never a user-supplied URL.
 const r=await fetch(u,{signal:AbortSignal.timeout(45000),redirect:'error'});if(!r.ok)throw new Error('No se pudo descargar la imagen generada.');const bytes=Buffer.from(await r.arrayBuffer());const mime=r.headers.get('content-type')?.split(';')[0]||'image/png';
 await storeResult(j,bytes,mime,null,w);
}
// Soul ID (Higgsfield): entrena la identidad de una persona con sus fotos activas y consulta el estado del entrenamiento.
export async function soulRoute(w:Identity,id:string,b:any){
 adminOnly(w);if(!process.env.HF_CREDENTIALS)throw new HttpError(503,'Higgsfield no está configurado.');const db=adminClient();
 const row=checked(await db.from('personas').select('*').eq('id',id).maybeSingle());if(!row)throw new HttpError(404,'Persona no encontrada.');const soul=row.identidad.soul||{};
 const save=async(next:any)=>{checked(await db.from('personas').update({identidad:{...row.identidad,soul:next},updated_at:new Date().toISOString()}).eq('id',id));return next;};
 const op=z.enum(['train','status','strength']).parse(b.op);
 if(op==='strength')return save({...soul,strength:z.number().min(0).max(1).parse(b.strength)});
 if(op==='status'){if(!soul.id)throw new HttpError(400,'Esta persona no tiene Soul ID.');let r;try{r=await hf('v1/custom-references/'+encodeURIComponent(soul.id));}catch{throw new HttpError(502,'Higgsfield no respondió. Prueba en un momento.');}return save({...soul,status:String(r.status||soul.status),revisado:new Date().toISOString()});}
 if(soul.id&&!['completed','failed'].includes(soul.status))throw new HttpError(409,'Ya hay un entrenamiento en curso. Consulta su estado.');
 const photos=checked(await db.from('persona_fotos').select('archivo_id,archivos(listo,eliminado_at,mime)').eq('persona_id',id).eq('activa',true).order('posicion')).filter((x:any)=>x.archivos?.listo&&!x.archivos.eliminado_at&&x.archivos.mime?.startsWith('image/'));
 if(!photos.length)throw new HttpError(400,'Sube y activa al menos una foto de la cara.');
 // Las URLs firmadas duran 24 h por si Higgsfield descarga las fotos después de aceptar el entrenamiento
 const input_images=await Promise.all(photos.slice(0,100).map(async(x:any)=>({type:'image_url',image_url:await fileUrl('storage://'+x.archivo_id,86400)})));
 let r;try{r=await hf('v1/custom-references',{name:String(row.identidad.name||id).slice(0,100),model_version:'v2',input_images});}catch(e){throw new HttpError(502,e instanceof ProviderError?`Higgsfield rechazó el entrenamiento (${e.status}). Revisa saldo y fotos.`:'Higgsfield no respondió.');}
 const soulId=z.string().min(1).max(128).parse(r.id);
 return save({id:soulId,status:String(r.status||'queued'),fotos:input_images.length,strength:soul.strength??1,creado:new Date().toISOString(),...(soul.id?{anterior:soul.id}:{})});
}
export async function runWorker(maxJobs=3){const started=Date.now();for(let i=0;i<maxJobs;i++){if(Date.now()-started>40000)return;const rows=checked(await adminClient().rpc('reclamar_trabajo'));const j=rows?.[0];if(!j)return;let submitted=!!j.provider_id;
 try{if(j.provider_id&&Date.now()-Date.parse(j.created_at)>86400000){await saveJob(j,{estado:'uncertain',error:'El proveedor lleva más de 24 horas sin resultado confirmado. Revisa el trabajo antes de repetir.',coste_usd:null});continue;}const w=await workerIdentity(j);submitted=true;if(j.tipo==='imagen')await imageJob(j,w);else if(j.tipo==='reels')await reelsJob(j,w);else await textJob(j,w);}
 catch(e){
  // Google (Nano Banana) responde en la misma llamada: un 429/500/503 no entrega imagen ni se cobra; se reintenta hasta 3 veces en vez de quedar incierto
  if(j.tipo==='imagen'&&j.motor in GEMINI_MODELS&&e instanceof ProviderError&&[429,500,502,503,504].includes(e.status)){const again=j.intentos<3;await saveJob(j,{estado:again?'queued':'failed',error:again?`Google ocupado (${e.status}); se reintenta solo.`:`Google estuvo ocupado (${e.status}) en 3 intentos. Prueba de nuevo en unos minutos o con otro motor.`,coste_usd:again?null:0,next_run_at:new Date(Date.now()+30000*j.intentos).toISOString()});continue;}
  const latest=checked(await adminClient().from('trabajos').select('provider_id').eq('id',j.id).single());const providerId=latest?.provider_id;const rejected=e instanceof ProviderError&&e.status>=400&&e.status<500&&e.status!==408;
 const safe=(e instanceof HttpError||rejected)&&!providerId;const waiting=!!providerId&&!(e instanceof HttpError);const error=e instanceof HttpError?e.message:rejected?((e as ProviderError).status===402?'El proveedor no tiene saldo (402). Si es Nano Banana, recarga la cuenta de Google en AI Studio (ai.studio/projects).':`El proveedor rechazó la solicitud (${(e as ProviderError).status}). Revisa saldo y acceso del proveedor.`):waiting?'Esperando resultado del proveedor.':'Ejecución incierta. No se reenviará para evitar un cobro duplicado; revisa el proveedor.';
 await saveJob(j,{estado:waiting?'waiting':safe||!submitted?'failed':'uncertain',error,coste_usd:safe||!submitted?0:null,next_run_at:new Date(Date.now()+15000).toISOString()});}
 }}
// Recover completed images on reopen without overwriting a slide the user has replaced.
export async function recoveredProject(w:Identity,row:any){const jobs=checked(await w.db.from('trabajos').select('lamina_id,motor,payload,resultado').eq('proyecto_id',row.id).eq('estado','succeeded').eq('tipo','imagen').order('created_at',{ascending:false}));const doc=structuredClone(row.documento),seen=new Set();for(const j of jobs){const i=Number(j.lamina_id);if(seen.has(i))continue;seen.add(i);const s=doc.slides?.[i];if(!s||(s.image||'')!==(j.payload.originalImage||'')||!j.resultado?.url)continue;
 // Capas: solo si la lámina aún no las tiene (no pisa lo que se editó después)
 if(j.motor==='capas'){if(!s.layers)s.layers=j.resultado.layers;}else Object.assign(s,{...j.resultado,image:j.resultado.url});}return {...doc,version:row.version};}
