// Generador de Reels (portado del Generador de Reels en Python): transcribe videos con Apify + Deepgram,
// escribe guiones y entregables PDF con Claude. Cada cliente de Reels es una marca del Estudio, así que
// permisos, presupuesto y cola son los mismos que en Carruseles. Los trabajos van a `trabajos` con tipo 'reels'.
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import {adminClient} from './config.js';
import {authorizeBrand,HttpError,type Identity} from './auth.js';
import {checked,readyFile,storeFile} from './library.js';
import {saveJob,ProviderError} from './generation.js';
import {brandingDe,planAuto,validarPlan,html,renderPdf,contarPaginas,ESQUEMA_PLAN,GUIA_DIRECTOR,type Contenido} from './reels-pdf.js';

const MODELO='claude-opus-5-5';
const MEDIA='reels-media';
const MAX_PAGINAS=4;
// Reserva de presupuesto por trabajo (US$); al terminar se registra el coste calculado.
const RESERVA:Record<string,number>={transcribir:1,guiones:3,entregable:2,sugerir:0.5,muestra:1};
const ESTRUCTURA_BASE=`# ESTRUCTURA DE GUION (EJEMPLO — REEMPLÁZALA POR LA TUYA)

1. GANCHO (0-3 s): una frase que detenga el scroll.
2. CONTEXTO (3-10 s): quién habla y por qué importa.
3. DESARROLLO (10-45 s): la idea principal, en frases cortas.
4. GIRO / REMATE: la frase más fuerte del video.
5. LLAMADO A LA ACCIÓN: qué debe hacer quien lo ve.

Reglas:
- Duración total: 30 a 60 segundos.
- Frases cortas, lenguaje hablado.`;

// ---------------------------------------------------------------- Claude

function anthropic(){const ws=process.env.ANTHROPIC_WORKSPACE_ID?.trim();return new Anthropic({apiKey:process.env.ANTHROPIC_API_KEY,maxRetries:1,...(ws?{defaultHeaders:{'anthropic-workspace-id':ws}}:{})});}
// Respuesta JSON con esquema. Si un filtro de seguridad rechaza la petición, la API reintenta con otro modelo (fallbacks).
async function claudeJson(o:{system?:string;content:any;schema:any;maxTokens:number;effort:'low'|'medium'|'high';timeout:number}){
 let msg;
 try{msg=await anthropic().beta.messages.stream({model:MODELO,max_tokens:o.maxTokens,thinking:{type:'adaptive'},output_config:{effort:o.effort,format:{type:'json_schema',schema:o.schema}},...(o.system?{system:o.system}:{}),messages:[{role:'user',content:o.content}],betas:['server-side-fallback-2026-07-01'],fallbacks:'default'},{timeout:o.timeout}).finalMessage();}
 catch(e){if(e instanceof Anthropic.APIError&&e.status&&e.status>=400&&e.status<500&&![408,409,429].includes(e.status))throw new ProviderError(e.status);throw e;}
 const u:any=msg.usage||{};const usd=(u.input_tokens||0)*4e-6+(u.output_tokens||0)*20e-6+(u.cache_creation_input_tokens||0)*5e-6+(u.cache_read_input_tokens||0)*0.4e-6;
 if(msg.stop_reason==='refusal')return {data:null,usd,refusal:true};
 if(msg.stop_reason==='max_tokens')throw new HttpError(422,'La respuesta de Claude se cortó por longitud. Prueba con menos guiones o una estructura más corta.');
 const text=msg.content.filter((b:any)=>b.type==='text').map((b:any)=>b.text).join('');return {data:JSON.parse(text),usd,refusal:false};
}

const ESQUEMA={type:'object',properties:{
 resumen_general:{type:'string'},
 puntos_clave:{type:'array',items:{type:'object',properties:{titulo:{type:'string'},inicio:{type:'string'},fin:{type:'string'},resumen:{type:'string'},cita:{type:'string'},por_que_funciona:{type:'string'}},required:['titulo','inicio','fin','resumen','cita','por_que_funciona'],additionalProperties:false}},
 guiones:{type:'array',items:{type:'object',properties:{estilo:{type:'string'},titulo:{type:'string'},punto_clave:{type:'string'},inicio:{type:'string'},fin:{type:'string'},guion:{type:'string'},caption:{type:'string'}},required:['estilo','titulo','punto_clave','inicio','fin','guion','caption'],additionalProperties:false}}},
 required:['resumen_general','puntos_clave','guiones'],additionalProperties:false};
const SISTEMA=`Eres guionista de contenido corto (Reels, TikTok, Shorts) para una agencia de medios hispana que trabaja para varias marcas.
Recibes la transcripción completa de un video largo (podcast, entrevista, charla) con marcas de tiempo, el perfil de la marca para la que escribes y uno o varios estilos de guion de esa marca.

Tu trabajo:
1. Detectar los momentos con más potencial para contenido corto: ideas fuertes, historias, datos sorprendentes, opiniones polémicas, consejos accionables, frases citables. Usa las marcas de tiempo reales de la transcripción para "inicio" y "fin". Prioriza los momentos que encajan con la marca y su público.
2. Escribir los guiones siguiendo EXACTAMENTE la estructura del estilo indicado: sus secciones, su orden, sus nombres y sus reglas. No mezcles estilos ni inventes otra estructura. En "estilo" pon el nombre del estilo tal cual aparece.
3. Escribir con la voz, el tono y para el público de la marca.
4. Mantener la sustancia fiel a lo que se dijo en el video; no atribuyas al invitado cosas que no dijo. Puedes reformular para que funcione en formato corto.
5. Escribir en el idioma del video salvo que la marca o las instrucciones pidan otro.

En "guion" escribe el guion completo con los encabezados de cada sección del estilo, en texto plano con saltos de línea.
En "cita" copia textualmente la frase del video que sostiene ese punto.`;
const ESTRUCTURA_ENTREGABLE_BASE=`1. TÍTULO: promesa clara del resultado que obtendrá quien lo siga.
2. INTRODUCCIÓN (2-3 frases): el problema y por qué importa.
3. PASOS (5 a 7): cada uno con un título de acción, una explicación breve y 2-4 acciones concretas que la persona puede hacer hoy.
4. ERRORES COMUNES: 3 errores a evitar.
5. CIERRE: una frase motivadora y el llamado a la acción de la marca.`;
const ESQUEMA_ENTREGABLE={type:'object',properties:{titulo:{type:'string'},subtitulo:{type:'string'},introduccion:{type:'string'},
 secciones:{type:'array',items:{type:'object',properties:{titulo:{type:'string'},texto:{type:'string'},pasos:{type:'array',items:{type:'string'}}},required:['titulo','texto','pasos'],additionalProperties:false}},
 cierre:{type:'string'},llamado_accion:{type:'string'}},required:['titulo','subtitulo','introduccion','secciones','cierre','llamado_accion'],additionalProperties:false};
const SISTEMA_ENTREGABLE=`Eres editora de contenidos de una agencia de medios hispana. Conviertes las ideas de un video y de los guiones de reels que salieron de él en un entregable descargable (lead magnet) en PDF: un accionable paso a paso que el público de la marca puede aplicar hoy.

Reglas:
- Sigue EXACTAMENTE la estructura indicada: sus partes, su orden y sus reglas. Cada parte de la estructura es una "sección" (con su título, un texto breve y, si aplica, una lista de pasos o acciones concretas).
- Escribe con la voz y para el público de la marca, en el idioma de los guiones.
- Sé concreto y accionable: verbos en imperativo, ejemplos reales, nada de relleno.
- Mantente fiel a lo que se dijo en el video. No inventes cifras, estudios ni resultados.
- Ortografía completa (tildes, ñ, ¿ y ¡).
- No escribas números en los títulos de las secciones ni casillas o viñetas al inicio de las acciones: el diseño ya los pone.
- Es CORTO: el PDF completo no puede pasar de 4 páginas (portada + máximo 3 de contenido). Máximo 4 secciones, máximo 4 acciones por sección, textos de 2 o 3 frases y unas 600 palabras en total. Si la estructura pide más partes o pasos, condénsalos sin perder lo esencial.`;
const ESQUEMA_BRANDING={type:'object',properties:{texto:{type:'string'},acento:{type:'string'},fondo:{type:'string'},suave:{type:'string'},titulos:{type:'string'},fuente_texto:{type:'string'},notas:{type:'string'}},required:['texto','acento','fondo','suave','titulos','fuente_texto','notas'],additionalProperties:false};
export const ENTREGABLE_MUESTRA:Contenido={titulo:'Así se verá tu entregable',subtitulo:'Vista previa con el branding de la marca',
 introduccion:'Este es un ejemplo para revisar colores, tipografías, logo, portada y fondo.\nEl contenido real lo escribe Claude a partir de los guiones.',
 secciones:[{titulo:'Primer paso de acción',texto:'Una explicación breve de por qué importa.',pasos:['Una acción concreta para hoy.','Otra acción que se puede marcar.']},
  {titulo:'Segundo paso de acción',texto:'Cada sección lleva su número y casillas para marcar.',pasos:['Acción uno.','Acción dos.','Acción tres.']},
  {titulo:'Errores comunes',texto:'Lo que conviene evitar desde el inicio.',pasos:[]}],
 cierre:'Una frase final que inspire a actuar.',llamado_accion:'El llamado a la acción de la marca.'};

// ---------------------------------------------------------------- clientes (marcas) y su configuración de Reels

const hex=z.string().regex(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/);
const fuente=z.string().trim().max(80).regex(/^[A-Za-z0-9 ]*$/,'Nombre de fuente inválido.');
const brandingInput=z.object({colores:z.object({texto:hex,acento:hex,fondo:hex,suave:hex}).partial().optional(),fuentes:z.object({titulos:fuente,texto:fuente}).partial().optional(),notas:z.string().max(4000).optional()});
function clienteDe(marca:any,cfg:any){
 return {id:marca.id,nombre:marca.identidad?.name||marca.id,contexto:cfg?.contexto||'',
  estilos:cfg?.estilos?.length?cfg.estilos:[{id:'base',nombre:'Estructura base',estructura:ESTRUCTURA_BASE}],
  estructura_copy:cfg?.estructura_copy||'',estructura_entregable:cfg?.estructura_entregable||'',branding:cfg?.branding||{},version:cfg?.version||0};
}
async function listarClientes(w:Identity){
 const [m,c]=await Promise.all([w.db.from('marcas').select('id,identidad,archivada'),w.db.from('reels_marcas').select('*')]);
 const cfg=new Map((checked(c) as any[]).map(r=>[r.marca_id,r]));
 return (checked(m) as any[]).filter(b=>!b.archivada&&b.id!=='_comun').map(b=>clienteDe(b,cfg.get(b.id))).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
}
// Cliente visto por el servidor (sin RLS): lo usan los trabajos de la cola.
async function clienteServidor(marca:string){
 const db=adminClient();const [m,c]=await Promise.all([db.from('marcas').select('id,identidad').eq('id',marca).single(),db.from('reels_marcas').select('*').eq('marca_id',marca).maybeSingle()]);
 return clienteDe(checked(m),checked(c));
}
// Cambia la configuración con control de versión; reintenta si otro trabajo la cambió a la vez.
async function cambiarConfig(marca:string,cambio:(row:any)=>any,versionEsperada?:number){
 const db=adminClient();
 for(let i=0;i<5;i++){
  const row=checked(await db.from('reels_marcas').select('*').eq('marca_id',marca).maybeSingle());
  if(versionEsperada!==undefined&&(row?.version||0)!==versionEsperada)throw new HttpError(409,'Este cliente cambió mientras lo editabas. Recarga antes de guardar.');
  const base=row||{marca_id:marca,contexto:'',estilos:[],estructura_copy:'',estructura_entregable:'',branding:{},version:0};const next=cambio(structuredClone(base));
  if(!row){const r=await db.from('reels_marcas').insert({...next,marca_id:marca,version:1});if(!r.error)return;if(r.error.code!=='23505')checked(r);continue;}
  const saved=checked(await db.from('reels_marcas').update({contexto:next.contexto,estilos:next.estilos,estructura_copy:next.estructura_copy,estructura_entregable:next.estructura_entregable,branding:next.branding,version:row.version+1,updated_at:new Date().toISOString()}).eq('marca_id',marca).eq('version',row.version).select('marca_id'));
  if(saved.length)return;if(versionEsperada!==undefined)throw new HttpError(409,'Este cliente cambió mientras lo editabas. Recarga antes de guardar.');
 }
 throw new HttpError(409,'No se pudo guardar: hay muchos cambios a la vez. Inténtalo de nuevo.');
}
// Archivos de branding del PDF: nombre → URL firmada (solo imágenes), y metadatos para el director de arte.
async function archivosBranding(b:any,ttl=3600){
 const ids=b.archivos.map((a:any)=>a.id).filter(Boolean);if(!ids.length)return {urls:{} as Record<string,string>,info:[] as any[]};
 const db=adminClient();const files=checked(await db.from('archivos').select('id,object_path,mime,bytes,listo,eliminado_at').in('id',ids)) as any[];
 const ok=files.filter(f=>f.listo&&!f.eliminado_at&&f.mime.startsWith('image/'));if(!ok.length)return {urls:{},info:[]};
 const signed=checked(await db.storage.from('estudio').createSignedUrls(ok.map(f=>f.object_path),ttl)) as any[];
 const byId=new Map(ok.map((f,i)=>[f.id,{...f,url:signed[i]?.signedUrl as string}]));const urls:Record<string,string>={},info:any[]=[];
 for(const a of b.archivos){const f=byId.get(a.id);if(f?.url){urls[a.nombre]=f.url;info.push({...a,url:f.url,bytes:f.bytes});}}
 return {urls,info};
}

// ---------------------------------------------------------------- proyectos

const ahora=()=>new Date().toISOString().slice(0,16).replace('T',' ');
async function cargarProyecto(pid:string){const r=checked(await adminClient().from('reels_proyectos').select('*').eq('id',pid).maybeSingle());if(!r)throw new HttpError(404,'El proyecto ya no existe.');return r;}
// Varios trabajos (un PDF por guion) guardan en el mismo proyecto a la vez: actualización con versión y reintento.
async function actualizarProyecto(pid:string,cambio:(doc:any)=>void){
 const db=adminClient();
 for(let i=0;i<8;i++){const row=await cargarProyecto(pid);const doc=structuredClone(row.documento);cambio(doc);
  const saved=checked(await db.from('reels_proyectos').update({documento:doc,titulo:doc.info?.titulo||row.titulo,version:row.version+1,updated_at:new Date().toISOString()}).eq('id',pid).eq('version',row.version).select('id'));
  if(saved.length)return doc;await new Promise(r=>setTimeout(r,150+Math.random()*400));}
 throw new Error('No se pudo guardar el proyecto (demasiados cambios simultáneos).');
}
function transcripcionConTiempos(t:any){
 if(!t.parrafos?.length)return t.texto||'';
 return t.parrafos.map((p:any)=>`[${p.inicio}]${p.hablante!=null?` Hablante ${p.hablante+1}:`:''} ${p.texto}`).join('\n');
}

// ---------------------------------------------------------------- cola

const digest=(x:any)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function childKey(group:string,index:number){const h=digest([group,index]).slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20)}`;}
const motorDe=(op:string,payload:any)=>op==='transcribir'?(payload.fuente?.clase==='url'&&plataforma(payload.fuente.url)!=='directo'?'apify+deepgram':'deepgram'):MODELO;
type Hijo={payload:any;lamina?:string};
// Encola un lote atómico (máx. 10 por lote). Todos comparten grupo para que la interfaz siga su avance.
async function encolar(actor:string,marca:string,grupo:string,keyBase:string,hijos:Hijo[]){
 const out:any[]=[];
 for(let s=0;s<hijos.length;s+=10){
  const jobs=hijos.slice(s,s+10).map((h,i)=>({tipo:'reels',motor:motorDe(h.payload.op,h.payload),payload:h.payload,key:childKey(keyBase,s+i),hash:digest(h.payload),reserva:RESERVA[h.payload.op],proyecto:null,lamina:h.lamina??null,version:null}));
  const r=await adminClient().rpc('encolar_lote',{p_actor:actor,p_marca:marca,p_grupo:grupo,p_jobs:jobs});
  if(r.error){if(r.error.code==='P0001')throw new HttpError(409,'No hay presupuesto disponible o hay demasiados trabajos pendientes. Revisa los trabajos antes de generar de nuevo.');checked(r);}
  out.push(...r.data);
 }
 return out;
}
function requireAI(){if(!process.env.ANTHROPIC_API_KEY)throw new HttpError(503,'Anthropic no está configurado.');}
// Desde un trabajo: encola los siguientes pasos en el mismo grupo. Si no hay presupuesto, lo deja como aviso.
async function encolarDesdeTrabajo(j:any,hijos:Hijo[]){
 try{await encolar(j.user_id,j.marca_id,j.grupo_id,j.id,hijos);return '';}
 catch(e){return e instanceof HttpError?e.message:'No se pudieron encolar los siguientes pasos.';}
}

// ---------------------------------------------------------------- transcripción: Apify (enlace → audio) + Deepgram

function plataforma(url:string){
 let h='';try{h=new URL(url).hostname.toLowerCase().replace(/^www\.|^m\./,'');}catch{return 'invalido';}
 if(/(^|\.)youtube\.com$|^youtu\.be$/.test(h))return 'youtube';if(/(^|\.)instagram\.com$/.test(h))return 'instagram';if(/(^|\.)tiktok\.com$/.test(h))return 'tiktok';return 'directo';
}
// Actores de Apify por red (se pueden cambiar con variables de entorno).
function actor(p:string){
 if(p==='youtube')return {id:process.env.APIFY_ACTOR_YOUTUBE||'dami_studio/youtube-video-downloader',input:(url:string)=>({urls:[url],quality:'audio',audioOnly:true,includeMetadata:true,maxMegabytes:500})};
 if(p==='instagram')return {id:process.env.APIFY_ACTOR_INSTAGRAM||'apify/instagram-scraper',input:(url:string)=>({directUrls:[url],resultsType:'posts',resultsLimit:1,addParentData:false})};
 return {id:process.env.APIFY_ACTOR_TIKTOK||'clockworks/tiktok-scraper',input:(url:string)=>({postURLs:[url],shouldDownloadVideos:true,resultsPerPage:1})};
}
async function apify(path:string,init:any={}){
 const r=await fetch('https://api.apify.com/v2/'+path,{...init,headers:{Authorization:'Bearer '+process.env.APIFY_TOKEN,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(45000)});
 if(!r.ok){if(r.status===402)throw new HttpError(402,'Apify no tiene saldo suficiente para descargar este video.');if(r.status>=400&&r.status<500)throw new HttpError(502,`Apify rechazó la solicitud (${r.status}). Revisa APIFY_TOKEN y el actor.`);throw new ProviderError(r.status);}
 return r.json();
}
// Busca el audio/video y los datos del video en el resultado del actor (cada actor usa nombres distintos).
function medioDe(item:any){
 const kv=(v:any):string|undefined=>{if(typeof v==='string'&&/^https:\/\/api\.apify\.com\/v2\/key-value-stores\/[^/]+\/records\//.test(v))return v;if(v&&typeof v==='object')for(const x of Object.values(v)){const f=kv(x);if(f)return f;}return undefined;};
 const candidatos=[item.mediaUrl,item.downloadUrl,item.audioUrl,item.fileUrl,item.media?.url,kv(item),item.videoUrl,item.mediaUrls?.[0],item.videoMeta?.downloadAddr];
 const url=candidatos.find(v=>typeof v==='string'&&v.startsWith('https://'));
 const texto=String(item.title||item.caption||item.text||'').split('\n')[0]!.slice(0,140);
 return {url,info:{titulo:texto,autor:item.channel||item.uploader||item.ownerUsername||item.authorMeta?.name||'',duracion:Number(item.durationSeconds||item.duration||item.videoDuration||item.videoMeta?.duration||0)}};
}
const mmss=(seg:number)=>{let s=Math.floor(seg||0);const h=Math.floor(s/3600);s-=h*3600;const m=Math.floor(s/60);s-=m*60;const p=(n:number)=>String(n).padStart(2,'0');return h?`${h}:${p(m)}:${p(s)}`:`${p(m)}:${p(s)}`;};
function parametrosDeepgram(idioma:string){const q=new URLSearchParams({model:'nova-3',smart_format:'true',punctuate:'true',paragraphs:'true',diarize:'true'});if(idioma==='auto')q.set('detect_language','true');else q.set('language',idioma);return q;}
// Deepgram recibe la URL (archivo subido o enlace directo) o el audio en flujo (lo que entrega Apify): no se guarda nada.
async function deepgram(idioma:string,fuente:{url:string}|{stream:ReadableStream;tipo:string}){
 if(!process.env.DEEPGRAM_API_KEY)throw new HttpError(503,'Deepgram no está configurado (DEEPGRAM_API_KEY).');
 const init:any='url' in fuente?{body:JSON.stringify({url:fuente.url}),headers:{'Content-Type':'application/json'}}:{body:fuente.stream,duplex:'half',headers:{'Content-Type':fuente.tipo||'application/octet-stream'}};
 const r=await fetch('https://api.deepgram.com/v1/listen?'+parametrosDeepgram(idioma),{method:'POST',...init,headers:{...init.headers,Authorization:'Token '+process.env.DEEPGRAM_API_KEY},signal:AbortSignal.timeout(600000)});
 if(!r.ok){const t=(await r.text()).slice(0,300);throw new HttpError(502,`Deepgram respondió ${r.status}: ${t}`);}
 const data:any=await r.json();const alt=data.results?.channels?.[0]?.alternatives?.[0]||{};
 const parrafos=(alt.paragraphs?.paragraphs||[]).map((p:any)=>({inicio:mmss(p.start),fin:mmss(p.end),hablante:p.speaker??null,texto:(p.sentences||[]).map((s:any)=>s.text).join(' ')}));
 // Nova-3 multilingüe con diarización, precio aproximado por minuto (solo para el panel de presupuesto).
 const segundos=Number(data.metadata?.duration||0);return {transcripcion:{texto:alt.transcript||'',parrafos},usd:segundos/60*0.0065,segundos};
}
async function paso(j:any,texto:string){j.resultado={...(j.resultado||{}),paso:texto};await adminClient().from('trabajos').update({resultado:j.resultado,updated_at:new Date().toISOString()}).eq('id',j.id).eq('lease_token',j.lease_token);}
// Los guiones y PDF pueden tardar varios minutos: alarga la reserva del trabajo (la función tiene 800 s).
async function alargarLease(j:any,minutos:number){await adminClient().from('trabajos').update({lease_until:new Date(Date.now()+minutos*60000).toISOString()}).eq('id',j.id).eq('lease_token',j.lease_token);}

async function transcribirJob(j:any){
 const p=j.payload,f=p.fuente;let info:any,res:{transcripcion:any;usd:number;segundos:number},apifyUsd=0;
 if(f.clase==='url'&&plataforma(f.url)!=='directo'){
  if(!process.env.APIFY_TOKEN)throw new HttpError(503,'Apify no está configurado (APIFY_TOKEN).');
  const a=actor(plataforma(f.url));
  if(!j.provider_id){
   const run=await apify(`acts/${a.id.replace('/','~')}/runs?timeout=1200&maxTotalChargeUsd=2`,{method:'POST',body:JSON.stringify(a.input(f.url))});
   const id=z.string().regex(/^[A-Za-z0-9]{1,64}$/).parse(run.data?.id);
   checked(await adminClient().from('trabajos').update({provider_id:id}).eq('id',j.id).eq('lease_token',j.lease_token));
   await saveJob(j,{estado:'waiting',resultado:{paso:'Apify está descargando el audio del video…'},next_run_at:new Date(Date.now()+5000).toISOString()});return;
  }
  const run=(await apify('actor-runs/'+encodeURIComponent(j.provider_id))).data;apifyUsd=Number(run.usageTotalUsd)||0;
  if(['READY','RUNNING'].includes(run.status)){await saveJob(j,{estado:'waiting',resultado:{paso:'Apify está descargando el audio del video…'},next_run_at:new Date(Date.now()+5000).toISOString()});return;}
  if(run.status!=='SUCCEEDED'){await saveJob(j,{estado:'failed',error:`Apify no pudo bajar el video (${run.status}). Revisa que el enlace sea público o sube el archivo.`,coste_usd:apifyUsd});return;}
  const items=await apify(`datasets/${encodeURIComponent(run.defaultDatasetId)}/items?clean=true&limit=5`);
  const m=medioDe(Array.isArray(items)?items[0]||{}:{});
  if(!m.url){await saveJob(j,{estado:'failed',error:'Apify terminó pero no entregó el audio de este video (¿es privado o no tiene audio?). Prueba subiendo el archivo.',coste_usd:apifyUsd});return;}
  info={...m.info,url:f.url};
  await paso(j,'Transcribiendo con Deepgram…');
  // Solo se descarga lo que devuelve el proveedor, nunca la URL que pegó la persona.
  const u=new URL(m.url);const media=await fetch(u,{headers:u.hostname==='api.apify.com'?{Authorization:'Bearer '+process.env.APIFY_TOKEN}:{},signal:AbortSignal.timeout(600000)});
  if(!media.ok||!media.body){await saveJob(j,{estado:'failed',error:`No se pudo leer el audio que entregó Apify (${media.status}).`,coste_usd:apifyUsd});return;}
  try{res=await deepgram(p.idioma,{stream:media.body,tipo:media.headers.get('content-type')?.split(';')[0]||'application/octet-stream'});}
  catch(e){await saveJob(j,{estado:'failed',error:e instanceof HttpError?e.message:'Deepgram no respondió.',coste_usd:apifyUsd});return;}
 }else{
  await paso(j,'Transcribiendo con Deepgram…');
  if(f.clase==='archivo'){
   const db=adminClient();const signed=checked(await db.storage.from(MEDIA).createSignedUrl(f.ruta,3600));
   try{res=await deepgram(p.idioma,{url:signed.signedUrl});}finally{await db.storage.from(MEDIA).remove([f.ruta]);}
   info={titulo:f.nombre,autor:'',duracion:0,url:''};
  }else{res=await deepgram(p.idioma,{url:f.url});info={titulo:decodeURIComponent(new URL(f.url).pathname.split('/').pop()||f.url),autor:'',duracion:0,url:f.url};}
 }
 if(!info.duracion)info.duracion=Math.round(res.segundos);
 const doc={id:p.proyecto,tipo:p.tipo,creado:ahora(),info,transcripcion:res.transcripcion,analisis:null,cliente_id:j.marca_id,estilo_ids:p.opciones?.estilo_ids||[],instrucciones:p.opciones?.instrucciones||''};
 const ins=await adminClient().from('reels_proyectos').insert({id:p.proyecto,marca_id:j.marca_id,tipo:p.tipo,titulo:info.titulo||'',documento:doc,created_by:j.user_id});if(ins.error&&ins.error.code!=='23505')checked(ins);
 let aviso='';
 if(p.tipo==='largo'&&p.modo==='guiones')aviso=await encolarDesdeTrabajo(j,[{payload:{op:'guiones',proyecto:p.proyecto,...p.opciones,agregar:false}}]);
 await saveJob(j,{estado:'succeeded',error:null,resultado:{proyecto_id:p.proyecto,paso:'Transcripción lista',aviso},coste_usd:apifyUsd+res.usd});
}

// ---------------------------------------------------------------- guiones

async function guionesJob(j:any){
 const op=j.payload;await alargarLease(j,14);await paso(j,'Claude está analizando y escribiendo los guiones… (puede tardar unos minutos)');
 const row=await cargarProyecto(op.proyecto),p=row.documento;const cliente=await clienteServidor(j.marca_id);
 const estilos=cliente.estilos.filter((e:any)=>(op.estilo_ids||[]).includes(e.id));if(!estilos.length)estilos.push(cliente.estilos[0]);
 const agregar=op.agregar&&p.analisis;
 const previos=agregar?p.analisis.guiones.filter((g:any)=>(g.cliente_id??cliente.id)===cliente.id).map((g:any)=>g.titulo):null;
 const pedido=[`<marca nombre="${cliente.nombre}">`,cliente.contexto||'(sin descripción)','</marca>',''];
 for(const e of estilos)pedido.push(`<estilo nombre="${e.nombre}">`,e.estructura,'</estilo>','');
 if(cliente.estructura_copy.trim())pedido.push('<estructura_copy>',cliente.estructura_copy.trim(),'</estructura_copy>','El campo "caption" (el texto que va debajo del reel o carrusel) debe seguir EXACTAMENTE esta estructura de copy: sus partes, su orden, su largo, sus emojis o hashtags si los pide, y su llamado a la acción.','');
 pedido.push(`Título del video: ${p.info?.titulo||''}`,`Autor/canal: ${p.info?.autor||''}`,'','<transcripcion>',transcripcionConTiempos(p.transcripcion),'</transcripcion>','');
 const nombres=estilos.map((e:any)=>`"${e.nombre}"`).join(', ');const puntos=op.puntos||null,cantidad=op.cantidad||5;
 if(puntos?.length){
  pedido.push(`Escribe exactamente ${puntos.length*estilos.length} guiones: uno por cada punto clave de abajo en cada estilo (${nombres}).`);
  for(const k of puntos)pedido.push(`- ${k.titulo} (${k.inicio}–${k.fin}): ${k.resumen}`);
  pedido.push('Usa el título del punto tal cual en "punto_clave". En "puntos_clave" devuelve solo estos mismos puntos.');
  if(previos?.length)pedido.push('Si alguno ya tiene guion, escribe una versión con un gancho y un ángulo distintos. Guiones existentes:\n- '+previos.join('\n- '));
 }else{
  pedido.push(estilos.length===1?`Escribe ${cantidad} guiones en el estilo ${nombres}, cada uno sobre un momento distinto.`:`Escribe ${cantidad} guiones en CADA uno de estos estilos: ${nombres} (${cantidad*estilos.length} en total). Dentro de cada estilo, cada guion va sobre un momento distinto; entre estilos se pueden repetir momentos con otro enfoque.`);
  if(previos?.length)pedido.push('Ya existen guiones sobre estos temas; busca momentos y ángulos NUEVOS, no los repitas:\n- '+previos.join('\n- '));
 }
 if((op.instrucciones||'').trim())pedido.push(`Instrucciones adicionales:\n${op.instrucciones.trim()}`);
 const r=await claudeJson({system:SISTEMA,content:pedido.join('\n'),schema:ESQUEMA,maxTokens:64000,effort:'high',timeout:600000});
 if(r.refusal){await saveJob(j,{estado:'failed',error:'Claude rechazó generar contenido para esta transcripción.',coste_usd:r.usd});return;}
 const resultado=r.data;const porNombre=new Map(estilos.map((e:any)=>[e.nombre.trim().toLowerCase(),e]));
 for(const g of resultado.guiones){const e:any=porNombre.get(String(g.estilo).trim().toLowerCase())||(estilos.length===1?estilos[0]:null);g.estilo_id=e?.id||'';if(e)g.estilo=e.nombre;g.cliente_id=cliente.id;g.cliente=cliente.nombre;g.id=randomUUID().slice(0,8);}
 const nuevos=resultado.guiones.map((g:any)=>g.id);
 await actualizarProyecto(op.proyecto,doc=>{
  if(op.agregar&&doc.analisis){doc.analisis.guiones.push(...resultado.guiones);const titulos=new Set(doc.analisis.puntos_clave.map((k:any)=>k.titulo));doc.analisis.puntos_clave.push(...resultado.puntos_clave.filter((k:any)=>!titulos.has(k.titulo)));}
  else doc.analisis=resultado;
  doc.cliente_id=cliente.id;doc.estilo_ids=estilos.map((e:any)=>e.id);doc.instrucciones=op.instrucciones||'';
  if(op.entregable){doc.con_entregables=true;doc.guia_entregable=op.guia_entregable||'';}
 });
 let aviso='';
 if(op.entregable)aviso=await encolarDesdeTrabajo(j,nuevos.map((gid:string)=>({payload:{op:'entregable',proyecto:op.proyecto,guion:gid,guia:op.guia_entregable||''},lamina:gid})));
 await saveJob(j,{estado:'succeeded',error:null,resultado:{proyecto_id:op.proyecto,guiones:nuevos.length,paso:`${nuevos.length} guiones listos`,aviso},coste_usd:r.usd});
}

// ---------------------------------------------------------------- entregable PDF (lead magnet de cada guion)

async function generarEntregable(p:any,cliente:any,guiones:any[],guia:string,instrucciones:string){
 const estructura=(guia||'').trim()||cliente.estructura_entregable.trim()||ESTRUCTURA_ENTREGABLE_BASE;
 const pedido=[`<marca nombre="${cliente.nombre}">`,cliente.contexto||'(sin descripción)','</marca>','','<estructura_entregable>',estructura,'</estructura_entregable>','',
  `Título del video: ${p.info?.titulo||''}`,'','<guiones>',guiones.map(g=>`${g.titulo}\n${g.guion}`).join('\n\n'),'</guiones>','','<transcripcion>',transcripcionConTiempos(p.transcripcion),'</transcripcion>',''];
 if(guiones.length===1)pedido.push('<caption_del_reel>',guiones[0].caption||'','</caption_del_reel>','','Este PDF es el lead magnet de ESTE reel: es lo que recibe quien comenta o responde al llamado a la acción. Si el guion o el caption prometen algo concreto (un calendario, una guía, una plantilla, un checklist…), el PDF debe ser exactamente eso, con ese mismo nombre, y centrado solo en el tema de este reel.');
 else pedido.push('Escribe el entregable PDF (accionable paso a paso) que acompaña a este conjunto de guiones.');
 if((instrucciones||'').trim())pedido.push(`Instrucciones adicionales:\n${instrucciones.trim()}`);
 const r=await claudeJson({system:SISTEMA_ENTREGABLE,content:pedido.join('\n'),schema:ESQUEMA_ENTREGABLE,maxTokens:32000,effort:'high',timeout:300000});
 if(r.refusal)throw new HttpError(422,'Claude rechazó generar el entregable.');return {contenido:r.data as Contenido,usd:r.usd};
}
async function acortarEntregable(contenido:Contenido,cliente:any,paginas:number){
 const r=await claudeJson({system:SISTEMA_ENTREGABLE,schema:ESQUEMA_ENTREGABLE,maxTokens:16000,effort:'medium',timeout:150000,
  content:`Este entregable de la marca ${cliente.nombre} ocupa ${paginas} páginas y el máximo es ${MAX_PAGINAS} (portada incluida). Acórtalo a unas 400 palabras: máximo 3 secciones y 3 acciones por sección. Mantén el mismo título, la misma promesa y el mismo llamado a la acción.\n\n`+JSON.stringify(contenido)});
 return {contenido:r.refusal?contenido:r.data as Contenido,usd:r.usd};
}
// Diagramación: director de arte con Claude (mira los archivos de la marca) o, si falla o no se pide, la automática.
async function planEntregable(contenido:Contenido,cliente:any,info:any[],creativo=true){
 const b=brandingDe(cliente);if(!creativo)return {plan:planAuto(contenido,b),usd:0};
 try{
  const partes:any[]=[];
  for(const a of info.filter(a=>a.bytes<4500000).slice(0,16)){partes.push({type:'text',text:`Archivo "${a.nombre}" (tipo: ${a.tipo}${a.tipo==='logo'?`, uso: ${a.uso}`:''})`},{type:'image',source:{type:'url',url:a.url}});}
  const resumen=contenido.secciones.map((s,i)=>`${i+1}. ${s.titulo} (${s.pasos.length} pasos)`).join('\n');
  partes.push({type:'text',text:`Marca: ${cliente.nombre}\nPaleta: ${JSON.stringify(b.colores)} · Tipografías: títulos ${b.fuentes.titulos}, texto ${b.fuentes.texto}\nNotas de estilo: ${b.notas||'(ninguna)'}\nTítulo del PDF: ${contenido.titulo}\nSecciones (${contenido.secciones.length}):\n${resumen}\nDiseña la diagramación.`});
  const r=await claudeJson({system:GUIA_DIRECTOR,content:partes,schema:ESQUEMA_PLAN,maxTokens:8000,effort:'medium',timeout:120000});
  if(r.refusal)return {plan:planAuto(contenido,b),usd:r.usd};return {plan:validarPlan(r.data,contenido,b),usd:r.usd};
 }catch(e){console.error('reels.director_fallo',{type:e instanceof Error?e.name:'unknown'});return {plan:planAuto(contenido,b),usd:0};}
}
// Arma el PDF y garantiza que no pase de MAX_PAGINAS: primero diagramación compacta, luego texto más corto.
async function pdfCorto(contenido:Contenido,cliente:any,plan:any,urls:Record<string,string>){
 let pdf=await renderPdf(html(contenido,cliente,plan,urls)),paginas=contarPaginas(pdf),usd=0;
 if(paginas<=MAX_PAGINAS)return {pdf,contenido,plan,paginas,usd};
 pdf=await renderPdf(html(contenido,cliente,plan,urls,true));paginas=contarPaginas(pdf);
 if(paginas<=MAX_PAGINAS)return {pdf,contenido,plan:{...plan,compacto:true},paginas,usd};
 const corto=await acortarEntregable(contenido,cliente,paginas);usd+=corto.usd;
 plan=validarPlan(plan,corto.contenido,brandingDe(cliente));pdf=await renderPdf(html(corto.contenido,cliente,plan,urls,true));
 return {pdf,contenido:corto.contenido,plan:{...plan,compacto:true},paginas:contarPaginas(pdf),usd};
}
const nombreArchivo=(t:string)=>(t||'entregable').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 _-]+/g,'').trim().slice(0,60)||'entregable';
async function entregableJob(j:any){
 const op=j.payload;await alargarLease(j,14);await paso(j,'Claude está escribiendo el entregable PDF…');
 const p=(await cargarProyecto(op.proyecto)).documento;const g=p.analisis?.guiones?.find((x:any)=>x.id===op.guion);if(!g)throw new HttpError(404,'Ese guion ya no existe en el proyecto.');
 const cliente=await clienteServidor(j.marca_id);const guia=op.guia||p.guia_entregable||'';
 const e=await generarEntregable(p,cliente,[g],guia,p.instrucciones||'');let usd=e.usd;
 await paso(j,'El director de arte está diagramando el PDF con el branding de la marca…');
 const {urls,info}=await archivosBranding(brandingDe(cliente));const d=await planEntregable(e.contenido,cliente,info);usd+=d.usd;
 await paso(j,'Armando el PDF…');
 let r;try{r=await pdfCorto(e.contenido,cliente,d.plan,urls);}catch(err){if(err instanceof HttpError||err instanceof ProviderError)throw err;await saveJob(j,{estado:'failed',error:'No se pudo armar el PDF ('+(err instanceof Error?err.message.slice(0,160):'error')+'). Prueba «Rehacer PDF».',coste_usd:usd});return;}usd+=r.usd;
 const fileId=await storeFile(j.marca_id,r.pdf,'application/pdf',nombreArchivo(r.contenido.titulo)+'.pdf');
 await actualizarProyecto(op.proyecto,doc=>{for(const x of doc.analisis?.guiones||[])if(x.id===g.id)x.entregable={...r.contenido,diseno:r.plan,paginas:r.paginas,cliente_id:cliente.id,guia,creado:ahora(),pdf:'storage://'+fileId};});
 await saveJob(j,{estado:'succeeded',error:null,resultado:{proyecto_id:op.proyecto,guion:g.id,pdf:'storage://'+fileId,paso:'PDF listo'},coste_usd:usd});
}

// ---------------------------------------------------------------- branding: sugerencia con Claude y vista previa

async function sugerirJob(j:any){
 const cliente=await clienteServidor(j.marca_id);const {info}=await archivosBranding(brandingDe(cliente));
 const imgs=[...new Map(info.filter(a=>a.bytes<4500000).map(a=>[a.id,a])).values()].slice(0,16);
 if(!imgs.length)throw new HttpError(400,'Sube primero el logo, el paquete gráfico o referencias (PNG o JPG).');
 const content:any[]=imgs.map(a=>({type:'image',source:{type:'url',url:a.url}}));
 content.push({type:'text',text:`Estas imágenes son el logo, el paquete gráfico y las referencias visuales de la marca "${cliente.nombre}".
Propón el branding de un PDF descargable de esta marca:
- texto: color HEX del texto principal (alto contraste sobre el fondo).
- acento: color HEX de la marca para detalles (líneas, casillas, destacados).
- fondo: color HEX de fondo de página (claro, legible).
- suave: color HEX para recuadros y el bloque de cierre.
- titulos y fuente_texto: tipografías de Google Fonts que se parezcan a las de la marca (nombre exacto de Google Fonts).
- notas: 2 o 3 frases sobre el estilo visual (para el equipo).
Contexto de la marca: ${cliente.contexto.slice(0,1500)}`});
 const r=await claudeJson({content,schema:ESQUEMA_BRANDING,maxTokens:4000,effort:'low',timeout:120000});
 if(r.refusal){await saveJob(j,{estado:'failed',error:'Claude no pudo sugerir el branding con estas imágenes.',coste_usd:r.usd});return;}
 const d=r.data;await saveJob(j,{estado:'succeeded',error:null,resultado:{colores:{texto:d.texto,acento:d.acento,fondo:d.fondo,suave:d.suave},fuentes:{titulos:d.titulos,texto:d.fuente_texto},notas:d.notas},coste_usd:r.usd});
}
async function muestraJob(j:any){
 await alargarLease(j,12);const cliente:any=await clienteServidor(j.marca_id);const guardado=brandingDe(cliente);
 // Colores, fuentes y notas de la pantalla (aunque no estén guardados); los archivos siempre son los guardados
 cliente.branding={...(j.payload.branding||{}),archivos:guardado.archivos};
 const {urls,info}=await archivosBranding(guardado);const d=await planEntregable(ENTREGABLE_MUESTRA,cliente,info,!!j.payload.creativo);
 let pdf;try{pdf=await renderPdf(html(ENTREGABLE_MUESTRA,cliente,d.plan,urls));}catch(err){await saveJob(j,{estado:'failed',error:'No se pudo armar la vista previa ('+(err instanceof Error?err.message.slice(0,160):'error')+').',coste_usd:d.usd});return;}const fileId=await storeFile(j.marca_id,pdf,'application/pdf','muestra-'+j.marca_id+'.pdf');
 await saveJob(j,{estado:'succeeded',error:null,resultado:{pdf:'storage://'+fileId,nota:d.plan.nota||''},coste_usd:d.usd});
}

export async function reelsJob(j:any,_w:Identity){
 const op=j.payload?.op;
 if(op==='transcribir')return transcribirJob(j);if(op==='guiones')return guionesJob(j);if(op==='entregable')return entregableJob(j);
 if(op==='sugerir')return sugerirJob(j);if(op==='muestra')return muestraJob(j);throw new HttpError(400,'Trabajo de Reels desconocido.');
}

// ---------------------------------------------------------------- rutas /api/reels/*

const key=z.uuid();
const opcionesSchema=z.object({estilo_ids:z.array(z.string().max(64)).max(30).default([]),cantidad:z.coerce.number().int().min(1).max(20).default(5),instrucciones:z.string().max(8000).default(''),entregable:z.boolean().default(false),guia_entregable:z.string().max(8000).default('')});
const idiomaSchema=z.enum(['multi','es','en','auto']).default('multi');
async function escribirProyecto(w:Identity,pid:string){const row=checked(await w.db.from('reels_proyectos').select('id,marca_id,documento').eq('id',z.string().max(64).parse(pid)).maybeSingle());if(!row)throw new HttpError(404,'Proyecto no encontrado.');await authorizeBrand(w,row.marca_id,true);return row;}
async function estadoGrupo(w:Identity,grupo:string){
 const rows=checked(await w.db.from('trabajos').select('id,estado,resultado,error,payload,lamina_id,updated_at').eq('grupo_id',key.parse(grupo)).eq('tipo','reels').order('created_at')) as any[];
 if(!rows.length)throw new HttpError(404,'Trabajo no encontrado.');
 const done=rows.every(x=>['succeeded','failed','uncertain','canceled'].includes(x.estado));
 return {id:grupo,done,items:rows.map(x=>({id:x.id,op:x.payload.op,estado:x.estado,paso:x.resultado?.paso||'',error:x.error,aviso:x.resultado?.aviso||'',proyecto:x.resultado?.proyecto_id||x.payload.proyecto||null,guion:x.payload.guion||null,url:x.payload.fuente?.url||x.payload.fuente?.nombre||'',resultado:x.estado==='succeeded'?x.resultado:null}))};
}

export async function reelsRoute(w:Identity,route:string,method:string,url:URL,b:any):Promise<any>{
 const parts=route.split('/').map(decodeURIComponent);const [,section,id,action]=parts;
 if(section==='config'&&method==='GET')return {anthropic:!!process.env.ANTHROPIC_API_KEY,deepgram:!!process.env.DEEPGRAM_API_KEY,apify:!!process.env.APIFY_TOKEN,maxMB:50};
 if(section==='trabajos'&&method==='GET')return estadoGrupo(w,url.searchParams.get('grupo')||'');

 if(section==='clientes'){
  if(method==='GET'&&!id)return listarClientes(w);
  if(method!=='POST')throw new HttpError(405,'Método no admitido.');
  if(!id){
   const c=z.object({id:z.string().min(1).max(64),version:z.number().int().nonnegative(),contexto:z.string().max(60000).default(''),
    estilos:z.array(z.object({id:z.string().max(64).optional(),nombre:z.string().max(120),estructura:z.string().max(20000)})).max(30),
    estructura_copy:z.string().max(20000).default(''),estructura_entregable:z.string().max(20000).default(''),branding:brandingInput.default({})}).parse(b);
   await authorizeBrand(w,c.id,true);
   const estilos=c.estilos.map(e=>({id:e.id||randomUUID().slice(0,8),nombre:e.nombre.trim()||'Estilo sin nombre',estructura:e.estructura}));
   await cambiarConfig(c.id,row=>({...row,contexto:c.contexto,estilos,estructura_copy:c.estructura_copy,estructura_entregable:c.estructura_entregable,branding:{...c.branding,archivos:row.branding?.archivos||[]}}),c.version);
   return (await listarClientes(w)).find(x=>x.id===c.id);
  }
  await authorizeBrand(w,id,true);
  if(action==='archivos'){
   const d=z.object({op:z.enum(['add','quitar','editar']),fileId:z.uuid().optional(),nombre:z.string().max(200).optional(),tipo:z.enum(['logo','portada','fondo','grafico','referencia']).optional(),uso:z.enum(['claro','oscuro','icono']).optional()}).parse(b);
   let archivo:any=null;
   if(d.op==='add'){const f=await readyFile(w,z.uuid().parse(d.fileId),id);if(!f.mime.startsWith('image/')&&f.mime!=='application/pdf')throw new HttpError(400,'Sube imágenes o PDF.');archivo=f;}
   await cambiarConfig(id,row=>{const br=row.branding||{};const lista=[...(br.archivos||[])];
    if(d.op==='add'){const usados=new Set(lista.map((a:any)=>a.nombre));let n=archivo.nombre,i=2;while(usados.has(n))n=archivo.nombre.replace(/(\.[^.]+)?$/,`-${i++}$1`);
     const tipo=d.tipo||'grafico';lista.push({id:archivo.id,nombre:n,tipo,...(tipo==='logo'?{uso:d.uso||'claro'}:{})});}
    else if(d.op==='quitar')return {...row,branding:{...br,archivos:lista.filter((a:any)=>a.nombre!==d.nombre)}};
    else for(const a of lista)if(a.nombre===d.nombre){if(d.tipo)a.tipo=d.tipo;if(d.uso)a.uso=d.uso;if(a.tipo==='logo')a.uso??='claro';}
    return {...row,branding:{...br,archivos:lista}};});
   return (await listarClientes(w)).find(x=>x.id===id);
  }
  if(action==='sugerir'||action==='muestra'){
   requireAI();const k=key.parse(b.idempotencyKey);
   const payload=action==='sugerir'?{op:'sugerir'}:{op:'muestra',creativo:!!b.creativo,branding:brandingInput.parse(b.branding||{})};
   await encolar(w.id,id,k,k,[{payload}]);return {grupo:k};
  }
  throw new HttpError(404,'Acción desconocida.');
 }

 if(section==='subir'&&method==='POST'){
  const d=z.object({marca:z.string().min(1).max(64),nombre:z.string().min(1).max(180),mime:z.string().regex(/^(audio|video)\/[A-Za-z0-9.+-]+$/,'Sube un archivo de audio o video.'),bytes:z.number().int().positive().max(52428800,'El archivo pasa de 50 MB. Pega el enlace del video o sube solo el audio (m4a/mp3).')}).parse(b);
  await authorizeBrand(w,d.marca,true);const ruta=`${w.id}/${randomUUID()}`;
  const s=checked(await adminClient().storage.from(MEDIA).createSignedUploadUrl(ruta,{upsert:false}));return {ruta,token:s.token,bucket:MEDIA};
 }

 if(section==='procesar'&&method==='POST'){
  const d=z.object({idempotencyKey:key,marca:z.string().min(1).max(64),tipo:z.enum(['largo','reel']),modo:z.enum(['guiones','transcribir']).default('guiones'),idioma:idiomaSchema,
   urls:z.array(z.string().trim().max(2000)).max(10).default([]),media:z.object({ruta:z.string().max(200),nombre:z.string().max(180)}).optional(),opciones:opcionesSchema.default(opcionesSchema.parse({}))}).parse(b);
  await authorizeBrand(w,d.marca,true);
  const conGuiones=d.tipo==='largo'&&d.modo==='guiones';if(conGuiones)requireAI();
  const fuentes:any[]=[];
  if(d.media){if(!d.media.ruta.startsWith(w.id+'/')||!/^[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(d.media.ruta))throw new HttpError(400,'Archivo inválido.');fuentes.push({clase:'archivo',ruta:d.media.ruta,nombre:d.media.nombre});}
  else for(const u of d.urls.filter(Boolean)){const pl=plataforma(u);if(pl==='invalido'||!u.startsWith('https://'))throw new HttpError(400,`Enlace inválido: ${u.slice(0,80)}`);fuentes.push({clase:'url',url:u});}
  if(!fuentes.length)throw new HttpError(400,'Pega al menos un enlace o sube un archivo.');
  if(fuentes.some(f=>f.clase==='url'&&plataforma(f.url)!=='directo')&&!process.env.APIFY_TOKEN)throw new HttpError(503,'Falta configurar Apify (APIFY_TOKEN) para leer enlaces de YouTube, TikTok o Instagram.');
  if(!process.env.DEEPGRAM_API_KEY)throw new HttpError(503,'Falta configurar Deepgram (DEEPGRAM_API_KEY).');
  // El id del proyecto sale de la clave: reintentar el mismo envío no crea proyectos duplicados.
  const hijos=fuentes.map((fuente,i)=>({payload:{op:'transcribir',fuente,idioma:d.idioma,tipo:d.tipo,modo:conGuiones?'guiones':'transcribir',proyecto:'r-'+childKey(d.idempotencyKey,i).slice(0,18),opciones:d.opciones}}));
  await encolar(w.id,d.marca,d.idempotencyKey,d.idempotencyKey,hijos);return {grupo:d.idempotencyKey};
 }

 if(section==='proyectos'){
  if(method==='GET'){
   const pid=url.searchParams.get('id');
   if(pid){const r=checked(await w.db.from('reels_proyectos').select('*').eq('id',z.string().max(64).parse(pid)).maybeSingle());if(!r)throw new HttpError(404,'Proyecto no encontrado.');return {...r.documento,id:r.id,marca:r.marca_id};}
   const rows=checked(await w.db.from('reels_proyectos').select('id,marca_id,tipo,titulo,created_at,documento->analisis->guiones,documento->creado').order('created_at',{ascending:false}).limit(300)) as any[];
   return rows.map(p=>({id:p.id,tipo:p.tipo,titulo:p.titulo||'(sin título)',creado:p.creado||p.created_at.slice(0,16).replace('T',' '),marca:p.marca_id,guiones:Array.isArray(p.guiones)?p.guiones.length:0}));
  }
  if(method!=='POST'||!id)throw new HttpError(405,'Método no admitido.');
  const row=await escribirProyecto(w,id);
  if(action==='borrar'){checked(await adminClient().from('reels_proyectos').delete().eq('id',row.id));return {ok:true};}
  requireAI();const k=key.parse(b.idempotencyKey);
  if(action==='guiones'){
   const d=opcionesSchema.extend({cliente:z.string().min(1).max(64),puntos:z.array(z.number().int().min(0)).max(40).optional()}).parse(b);
   await authorizeBrand(w,d.cliente,true);const todos=row.documento.analisis?.puntos_clave||[];
   const puntos=d.puntos?.length?d.puntos.filter(i=>i<todos.length).map(i=>todos[i]):undefined;
   const {cliente,puntos:_,...opciones}=d;
   await encolar(w.id,d.cliente,k,k,[{payload:{op:'guiones',proyecto:row.id,...opciones,agregar:true,...(puntos?{puntos}:{})}}]);return {grupo:k};
  }
  if(action==='entregables'){
   const d=z.object({guiones:z.array(z.string().max(16)).max(60).nullable().optional(),guia_entregable:z.string().max(8000).default('')}).parse(b);
   const guiones=row.documento.analisis?.guiones||[];const ids=d.guiones?.length?d.guiones.filter(g=>guiones.some((x:any)=>x.id===g)):guiones.filter((g:any)=>!g.entregable).map((g:any)=>g.id);
   if(!ids.length)throw new HttpError(400,'Todos los guiones ya tienen su entregable.');
   // Cada PDF se cobra a la marca del cliente de su guion.
   const porMarca=new Map<string,string[]>();for(const gid of ids){const g=guiones.find((x:any)=>x.id===gid);const m=g?.cliente_id||row.marca_id;porMarca.set(m,[...(porMarca.get(m)||[]),gid]);}
   let n=0;for(const [marca,gids] of porMarca){await authorizeBrand(w,marca,true);await encolar(w.id,marca,k,childKey(k,n++),gids.map(gid=>({payload:{op:'entregable',proyecto:row.id,guion:gid,guia:d.guia_entregable},lamina:gid})));}
   if(d.guia_entregable)await actualizarProyecto(row.id,doc=>{doc.guia_entregable=d.guia_entregable;});
   return {grupo:k};
  }
  throw new HttpError(404,'Acción desconocida.');
 }

 // URL firmada de un PDF (entregable o muestra) para verlo o descargarlo. RLS de archivos limita a las marcas propias.
 if(section==='pdf'&&method==='POST'){
  const d=z.object({id:z.uuid(),descargar:z.boolean().default(false),nombre:z.string().max(120).optional()}).parse(b);
  const f=checked(await w.db.from('archivos').select('object_path,mime,listo,eliminado_at').eq('id',d.id).maybeSingle());
  if(!f?.listo||f.eliminado_at||f.mime!=='application/pdf')throw new HttpError(404,'PDF no encontrado.');
  const s=checked(await w.db.storage.from('estudio').createSignedUrl(f.object_path,600,d.descargar?{download:nombreArchivo(d.nombre||'entregable')+'.pdf'}:undefined));return {url:s.signedUrl};
 }
 throw new HttpError(404,'Ruta no disponible.');
}
// Solo para scripts/reels-smoke.ts: prueba Apify + Deepgram sin base de datos.
export const herramientas={plataforma,actor,apify,medioDe,deepgram,claudeJson};
