// Video UGC desde un guion de Reels (skill video-ugc-hiperrealista de UGC-Studio, portada a la cola del Estudio).
// Etapa 1: Claude divide el guion en clips y propone escena, encuadres y prompts; la persona lo revisa y edita
// antes de gastar en imágenes o clips. El video vive en reels_proyectos.documento.videos[guion_id].
// Etapa 2: ApiMart (GPT Image 2) genera el fotograma inicial de cada clip. El clip 1 sale de las fotos aprobadas
// de la persona; los demás se derivan editando la imagen aprobada del clip 1, para que la cara no cambie entre cortes.
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {adminClient} from './config.js';
import {authorizeBrand,HttpError,type Identity} from './auth.js';
import {checked,storeFile,readyFile} from './library.js';
import {saveJob,ProviderError} from './generation.js';
import {MAX_CLIPS,MODELOS_CLIP,revisarPlan,soloHablado,type PlanVideo} from '../shared/ugc.js';
import {videoConfigSchema,instruccionesVideo,validarReferenciasAudio} from './video-settings.js';
import {modeloVideo,type ConfigVideo} from '../shared/video-config.js';
import {videoActions} from './reels-higgsfield.js';

// Lo que reels.ts comparte con este módulo (Claude, proyectos y cola).
export type Ayudas={claudeJson:(o:any)=>Promise<{data:any;usd:number;refusal:boolean}>;cargarProyecto:(pid:string)=>Promise<any>;
 actualizarProyecto:(pid:string,cambio:(doc:any)=>void)=>Promise<any>;clienteServidor:(marca:string)=>Promise<any>;paso:(j:any,texto:string)=>Promise<void>;
 encolar:(actor:string,marca:string,grupo:string,keyBase:string,hijos:{payload:any;lamina?:string}[])=>Promise<any[]>;sinPretitulos:(t:string)=>string;ahora:()=>string};

const SISTEMA_VIDEO=`Eres directora de producción de reels UGC hiperrealistas: videos verticales 9:16 que parecen grabados con un iPhone por una persona real hablando a cámara, no anuncios hechos con IA.
Recibes un guion ya aprobado, la marca y la persona real que aparece. Sus fotos aprobadas se envían aparte al motor de imagen junto con su bloqueo de identidad: tú no las ves. Tu trabajo es dividir el guion en clips y escribir lo necesario para producirlos.

Guion:
- Usa el guion EXACTO, completo y en orden. Cada palabra va en un solo clip: no cambies, quites ni añadas palabras. Dentro de la frase puedes añadir gestos entre corchetes, p. ej. [señala a cámara]; lo que va entre corchetes no se dice.
- Corta en pausas naturales (final de frase o de idea). Un clip de habla dura como máximo unos 8 s: 22 palabras como mucho. El clip 1 es el gancho: corto, que pare el scroll.

Modelo de cada clip:
- "omni" (por defecto): la persona habla a cámara con lip sync. En "segundos" pon la duración estimada (unas 2,7 palabras por segundo, entre 3 y 10).
- "grok": solo para un plano de apoyo donde la persona NO habla en cámara (boca cerrada, haciendo algo) y su voz suena encima. "segundos" entre 6 y 15, lo que dure la frase hablada. Úsalo con moderación y solo si aporta.

Escena:
- Una sola escena coherente para todo el video, salvo que el guion o las indicaciones pidan otra. Descríbela en "escena" (español, 1-2 frases) adecuada a la marca y a la persona.
- Sin textos en pantalla, logos ni pantallas de apps dentro de la imagen: eso se añade en el montaje.

Prompts (en inglés, salvo "que_se_ve" y "escena"):
- prompt_imagen: el fotograma inicial del clip. No describas la cara de la persona: la definen sus fotos. Describe encuadre, pose, acción congelada justo antes de hablar, ropa, lugar y luz. Estética iPhone: vertical, natural 26mm smartphone lens look, luz natural (puede llevar subtle direct iPhone flash), slight grain, realistic skin texture with visible pores. Nunca uses cinematic, 8k, studio lighting, flawless ni perfect skin. Termina siempre con "No text, no watermark, no distortion."
- El clip 1 describe la escena completa. Los demás clips se generan editando el fotograma del clip 1: empieza con "Keep the same person, face, outfit, setting and light." y describe solo lo que cambia (encuadre, ángulo, gesto).
- camera: p. ej. "Static camera, no movement, realistic arm movements and subtle micro-movements." (la más segura) o "Handheld, very slight natural movement, realistic arm movements and subtle micro-movements." (más selfie). El sistema añade "Single continuous take".
- movement: "none" o un movimiento de cámara lento. Evita push-in o zoom si la ropa lleva escote (el filtro de Omni lo rechaza con personas reales); para el cierre puede ir "Very slow subtle push-in."
- micro_action: un gesto concreto antes, durante o después de hablar, en inglés como el resto de los prompts (p. ej. "Raises an eyebrow before speaking and points at the camera on the last word."). Los gestos entre corchetes dentro de la frase sí van en español.
- voice: UNA descripción para todos los clips: género, edad aproximada, timbre, energía y "natural conversational pace".
- accent: UNA descripción para todos los clips, p. ej. "Spanish with a Venezuelan (Caracas) accent, informal and conversational, like a real casual chat in Miami." Si la persona tiene acento configurado, respétalo.
- sujeto: "she" si es mujer, "he" si es hombre.
- que_se_ve: una frase en español con lo que verá quien revisa el plan.`;

const ESQUEMA_VIDEO={type:'object',properties:{
 escena:{type:'string'},sujeto:{type:'string',enum:['she','he']},voice:{type:'string'},accent:{type:'string'},
 clips:{type:'array',items:{type:'object',properties:{frase:{type:'string'},modelo:{type:'string',enum:[...MODELOS_CLIP]},segundos:{type:'integer'},que_se_ve:{type:'string'},
  prompt_imagen:{type:'string'},camera:{type:'string'},movement:{type:'string'},micro_action:{type:'string'},voz_off:{type:'boolean'}},
  required:['frase','modelo','segundos','que_se_ve','prompt_imagen','camera','movement','micro_action','voz_off'],additionalProperties:false}}},
 required:['escena','sujeto','voice','accent','clips'],additionalProperties:false};

const texto=(max:number)=>z.string().max(max);
export const planSchema=z.object({escena:texto(2000),sujeto:z.enum(['she','he']),voice:texto(1000),accent:texto(1000),
 clips:z.array(z.object({frase:texto(1000),modelo:z.enum(MODELOS_CLIP),segundos:z.coerce.number().int().min(3).max(30),que_se_ve:texto(1000),
  prompt_imagen:texto(6000),camera:texto(1000),movement:texto(1000),micro_action:texto(1000),voz_off:z.boolean().optional()}).superRefine((c,ctx)=>{
   const m=modeloVideo(c.modelo);if(c.segundos>(m?.max||15)||c.segundos<(m?.min||3))ctx.addIssue({code:'custom',path:['segundos'],message:'Duración incompatible con el modelo.'});
  })).min(1).max(MAX_CLIPS)});

// La persona tiene que estar asociada a la marca: así un editor solo usa caras aprobadas para esa marca.
async function personaDeMarca(marca:string,persona:string){
 const db=adminClient();
 const [p,link]=await Promise.all([db.from('personas').select('id,identidad,archivada').eq('id',persona).maybeSingle(),db.from('persona_marca').select('persona_id').eq('persona_id',persona).eq('marca_id',marca).maybeSingle()]);
 const row=checked(p);if(!row||row.archivada||!checked(link))throw new HttpError(400,'Esa persona no está asociada a la marca del guion.');
 return {id:row.id,nombre:row.identidad?.name||row.id,descripcion:row.identidad?.descripcion||'',voz:row.identidad?.voz||{},
  bloqueo:row.identidad?.identidad||'Keep the exact identity of the approved person in the reference photos.'};
}
function guionDe(doc:any,gid:string){const g=doc.analisis?.guiones?.find((x:any)=>x.id===gid);if(!g)throw new HttpError(404,'El guion ya no existe.');return g;}
const limpiarPlan=(p:any):PlanVideo=>{const plan=planSchema.parse({...p,clips:p.clips.map((c:any)=>({...c,segundos:Math.min(15,Math.max(c.modelo==='grok'?6:3,Math.round(c.segundos)||8))}))});return plan as PlanVideo;};

// Separada del trabajo para poder probarla sin base de datos (scripts/video-plan-smoke.ts).
export async function pedirPlan(claudeJson:Ayudas['claudeJson'],cliente:any,persona:{nombre:string;descripcion:string;voz:any},titulo:string,guion:string,indicaciones='',config?:ConfigVideo){
 const pedido=[`<marca nombre="${cliente.nombre}">`,String(cliente.contexto||'(sin descripción)').slice(0,6000),'</marca>','',
  `<persona nombre="${persona.nombre}">`,persona.descripcion||'(sin descripción)',persona.voz?.acento?`Acento: ${persona.voz.acento}`:'','</persona>','',
  `<guion titulo="${titulo}">`,guion,'</guion>'];
 if(indicaciones.trim())pedido.push('',`Indicaciones de producción:\n${indicaciones.trim()}`);
 if(config)pedido.push('',instruccionesVideo(config),'Marca voz_off=true en cada plano de apoyo, y false en cada clip que habla a cámara. La configuración del motor sustituye los límites de Omni/Grok.');
 const r=await claudeJson({system:SISTEMA_VIDEO,content:pedido.join('\n'),schema:ESQUEMA_VIDEO,maxTokens:16000,effort:'medium',timeout:300000});
 let plan:PlanVideo|null=null;
 if(!r.refusal){if(config){const m=modeloVideo(config.motor)!;r.data.clips=r.data.clips.map((c:any)=>({...c,modelo:config.motor,segundos:Math.min(m.max,Math.max(m.min,Math.round(c.segundos)||config.segundos)),voz_off:!!config.audioNarracion||config.tipo==='apoyo'||(config.tipo==='mixto'&&!!c.voz_off)}));plan=planSchema.parse(r.data);}
  else plan=limpiarPlan(r.data);}
 return {usd:r.usd,refusal:r.refusal,plan};
}

export async function planVideoJob(j:any,h:Ayudas){
 const op=j.payload;await h.paso(j,'Claude está dividiendo el guion en clips…');
 const row=await h.cargarProyecto(op.proyecto),g=guionDe(row.documento,op.guion);
 const [cliente,persona]=await Promise.all([h.clienteServidor(j.marca_id),personaDeMarca(j.marca_id,op.persona)]);
 const guion=soloHablado(h.sinPretitulos(g.guion));
 const config=videoConfigSchema.parse(op.configuracion||{});
 const r=await pedirPlan(h.claudeJson,cliente,persona,g.titulo,guion,op.indicaciones||'',config);
 if(!r.plan){await saveJob(j,{estado:'failed',error:'Claude rechazó planear este video.',coste_usd:r.usd});return;}
 const plan=r.plan;
 await h.actualizarProyecto(op.proyecto,doc=>{doc.videos??={};doc.videos[g.id]={guion:g.id,persona:persona.id,marca:j.marca_id,creado:h.ahora(),estado:'plan',plan,configuracion:config,avisos:revisarPlan(guion,plan)};});
 await saveJob(j,{estado:'succeeded',error:null,resultado:{proyecto_id:op.proyecto,paso:`Plan de video listo: ${plan.clips.length} clips`},coste_usd:r.usd});
}

// ---------------------------------------------------------------- etapa 2: imágenes de inicio (ApiMart)

const APIMART='https://api.apimart.ai/v1';
const MODELO_IMAGEN='gpt-image-2';
const MAX_FOTOS=6;
export const revisionImagen=(v:any,config:any)=>createHash('sha256').update(JSON.stringify([v.persona,v.plan.escena,v.plan.clips.map((c:any)=>[c.prompt_imagen,c.camera,c.que_se_ve]),config?.formato||'9:16'])).digest('hex');
async function apimart(ruta:string,cuerpo?:any){
 const r=await fetch(APIMART+ruta,{method:cuerpo?'POST':'GET',headers:{Authorization:'Bearer '+process.env.APIMART_API_KEY,'Content-Type':'application/json'},...(cuerpo?{body:JSON.stringify(cuerpo)}:{}),signal:AbortSignal.timeout(45000)});
 if(!r.ok){if(r.status===402)throw new HttpError(402,'ApiMart no tiene saldo. Recarga la cuenta antes de seguir.');if(r.status>=400&&r.status<500)throw new HttpError(502,`ApiMart rechazó la solicitud (${r.status}): ${(await r.text()).slice(0,200)}`);throw new ProviderError(r.status);}
 return r.json();
}
// URLs firmadas para que ApiMart pueda leer las fotos privadas (caducan en una hora).
async function firmar(rutas:string[]){if(!rutas.length)return [];const s=checked(await adminClient().storage.from('estudio').createSignedUrls(rutas,3600)) as any[];return s.map(x=>x.signedUrl as string).filter(Boolean);}
async function fotosPersona(persona:string,max:number){
 const r=checked(await adminClient().from('persona_fotos').select('posicion,archivos(object_path,listo,eliminado_at,mime)').eq('persona_id',persona).eq('activa',true).order('posicion')) as any[];
 return firmar(r.map(x=>x.archivos).filter((f:any)=>f?.listo&&!f.eliminado_at&&f.mime?.startsWith('image/')).slice(0,max).map((f:any)=>f.object_path));
}
async function rutaArchivo(ref:string){const f=checked(await adminClient().from('archivos').select('object_path,listo,eliminado_at').eq('id',ref.replace('storage://','')).maybeSingle());if(!f?.listo||f.eliminado_at)throw new HttpError(409,'La imagen del clip 1 ya no está disponible. Genérala de nuevo.');return f.object_path as string;}

export function promptImagen(i:number,prompt:string,bloqueo:string,formato='9:16'){
 if(i===0)return [prompt.trim(),'',`The reference images show the real person who must appear. ${bloqueo.trim()}`,`${formato} iPhone photo. No text, no watermark, no distortion.`].join('\n');
 return ['Edit reference image 1: it is the first frame of the same video. '+prompt.trim(),'',
  `The other reference images are identity references only: match the face exactly and do not copy their framing, background or clothing. ${bloqueo.trim()}`,
  `The result must look like another frame of the same video, same person and same face. ${formato} iPhone photo. No text, no watermark, no distortion.`].join('\n');
}

export async function imagenClipJob(j:any,h:Ayudas){
 const op=j.payload;
 if(!j.provider_id){
  if(!process.env.APIMART_API_KEY)throw new HttpError(503,'Falta configurar ApiMart (APIMART_API_KEY) en Vercel.');
  const row=await h.cargarProyecto(op.proyecto),v=row.documento.videos?.[op.guion];
  if(!v||v.creado!==op.plan)throw new HttpError(409,'El plan de este video cambió. Vuelve a pedir la imagen.');
  if(op.revision&&revisionImagen(v,row.documento.video_config?.[op.guion]||v.configuracion)!==op.revision)throw new HttpError(409,'Cambió el plan visual. Vuelve a pedir la imagen.');
  const c=v.plan.clips[op.clip];if(!c)throw new HttpError(409,'Ese clip ya no existe en el plan.');
  const persona=await personaDeMarca(v.marca,v.persona);let refs:string[];
  if(op.clip===0)refs=await fotosPersona(persona.id,MAX_FOTOS);
  else{const base=v.imagenes?.[0];if(!base?.aprobada||op.base&&op.base!==base.archivo)throw new HttpError(409,'Aprueba primero la imagen vigente del clip 1.');refs=[...await firmar([await rutaArchivo(base.archivo)]),...await fotosPersona(persona.id,2)];}
  if(!refs.length)throw new HttpError(409,'La persona no tiene fotos activas.');
  const formato=(row.documento.video_config?.[op.guion]||v.configuracion)?.formato||'9:16';
  const r=await apimart('/images/generations',{model:MODELO_IMAGEN,prompt:promptImagen(op.clip,c.prompt_imagen,persona.bloqueo,formato),n:1,size:formato,resolution:'2k',image_urls:refs});
  const d=Array.isArray(r.data)?r.data[0]:r.data;const id=z.string().min(1).max(128).parse(d?.task_id);
  checked(await adminClient().from('trabajos').update({provider_id:id}).eq('id',j.id).eq('lease_token',j.lease_token));
  await saveJob(j,{estado:'waiting',resultado:{paso:'ApiMart está generando la imagen…'},next_run_at:new Date(Date.now()+8000).toISOString()});return;
 }
 const d=(await apimart('/tasks/'+encodeURIComponent(j.provider_id))).data||{};
 if(d.status==='failed'){await saveJob(j,{estado:'failed',error:'ApiMart no pudo generar la imagen: '+JSON.stringify(d.error||'sin detalle').slice(0,200),coste_usd:Number(d.cost)||0});return;}
 if(d.status!=='completed'){await saveJob(j,{estado:'waiting',resultado:{paso:`ApiMart está generando la imagen… ${d.progress||0}%`},next_run_at:new Date(Date.now()+8000).toISOString()});return;}
 let url=d.result?.images?.[0]?.url;url=Array.isArray(url)?url[0]:url;
 const img=await fetch(z.url().parse(url),{signal:AbortSignal.timeout(60000)});if(!img.ok)throw new ProviderError(img.status);
 const mime=(img.headers.get('content-type')||'image/png').split(';')[0]!;if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new HttpError(502,'ApiMart devolvió un archivo que no es una imagen.');
 const archivo='storage://'+await storeFile(j.marca_id,Buffer.from(await img.arrayBuffer()),mime,`video-${op.guion}-clip-${op.clip+1}.${mime.split('/')[1]}`);
 let vigente=true;
 await h.actualizarProyecto(op.proyecto,doc=>{const v=doc.videos?.[op.guion];if(!v||v.creado!==op.plan||op.revision&&revisionImagen(v,doc.video_config?.[op.guion]||v.configuracion)!==op.revision||op.clip>0&&op.base&&op.base!==v.imagenes?.[0]?.archivo){vigente=false;return;}
  if(op.clip===0)for(const img of v.imagenes||[])if(img)img.aprobada=false;
  v.imagenes??=[];v.imagenes[op.clip]={archivo,creado:h.ahora(),aprobada:false,base:op.clip?v.imagenes[0]?.archivo:null};});
 await saveJob(j,{estado:'succeeded',error:null,resultado:{proyecto_id:op.proyecto,guion:op.guion,paso:vigente?`Imagen del clip ${op.clip+1} lista`:'Imagen lista, pero el plan cambió mientras tanto: no se guardó en el video.'},coste_usd:Number(d.cost)||0.02});
}

// Rutas /api/reels/proyectos/:id/video (pedir el plan), /video-plan (guardar lo que editó la persona),
// /video-imagenes (pedir fotogramas) y /video-aprobar (aprobar un fotograma).
const key=z.uuid();
export async function videoRoute(w:Identity,row:any,action:string,b:any,h:Ayudas){
 if(['video-clips','video-montaje'].includes(action))return videoActions(w,row,action,b,h);
 if(action==='video-config'){
  const d=z.object({guion:z.string().max(16),configuracion:videoConfigSchema}).parse(b);
  const g=guionDe(row.documento,d.guion),marca=g.cliente_id||row.marca_id;await authorizeBrand(w,marca,true);
  await validarReferenciasAudio(w,d.configuracion,marca);
  if(d.configuracion.audioNarracion){const f=await readyFile(w,d.configuracion.audioNarracion,marca);if(!f.mime.startsWith('audio/'))throw new HttpError(400,'Selecciona un archivo de audio.');d.configuracion.audioNombre=f.nombre;}
  await h.actualizarProyecto(row.id,doc=>{const v=doc.videos?.[g.id],old=doc.video_config?.[g.id]||v?.configuracion;
   if(v&&(old?.formato||'9:16')!==d.configuracion.formato)for(const img of v.imagenes||[])if(img)img.aprobada=false;
   doc.video_config??={};doc.video_config[g.id]=d.configuracion;});return {configuracion:d.configuracion};
 }
 if(action==='video'){
  const d=z.object({idempotencyKey:key,guion:z.string().max(16),persona:z.string().regex(/^[a-z0-9-]{1,64}$/),indicaciones:z.string().max(4000).default(''),configuracion:videoConfigSchema.optional()}).parse(b);
  const g=guionDe(row.documento,d.guion),marca=g.cliente_id||row.marca_id;await authorizeBrand(w,marca,true);await personaDeMarca(marca,d.persona);
  const config=d.configuracion||videoConfigSchema.parse(row.documento.video_config?.[g.id]||{});
  await validarReferenciasAudio(w,config,marca);
  if(config.audioNarracion){const f=await readyFile(w,config.audioNarracion,marca);if(!f.mime.startsWith('audio/'))throw new HttpError(400,'Selecciona un audio.');}
  await h.actualizarProyecto(row.id,doc=>{doc.video_config??={};doc.video_config[g.id]=config;});
  await h.encolar(w.id,marca,d.idempotencyKey,d.idempotencyKey,[{payload:{op:'plan_video',proyecto:row.id,guion:g.id,persona:d.persona,indicaciones:d.indicaciones,configuracion:config},lamina:g.id}]);
  return {grupo:d.idempotencyKey};
 }
 if(action==='video-plan'){
  const d=z.object({guion:z.string().max(16),plan:planSchema}).parse(b);
  const g=guionDe(row.documento,d.guion),actual=row.documento.videos?.[g.id];if(!actual)throw new HttpError(404,'Este guion todavía no tiene plan de video.');
  await authorizeBrand(w,actual.marca,true);const plan=d.plan as PlanVideo,avisos=revisarPlan(h.sinPretitulos(g.guion),plan);
  await h.actualizarProyecto(row.id,doc=>{const v=doc.videos[g.id];
   if(revisionImagen(v,doc.video_config?.[g.id]||v.configuracion)!==revisionImagen({...v,plan},doc.video_config?.[g.id]||v.configuracion))for(const img of v.imagenes||[])if(img)img.aprobada=false;
   doc.videos[g.id]={...v,plan,avisos,editado:h.ahora()};});
  return {plan,avisos};
 }
 if(action==='video-imagenes'){
  if(!process.env.APIMART_API_KEY)throw new HttpError(503,'Falta configurar ApiMart (APIMART_API_KEY) en Vercel.');
  const d=z.object({idempotencyKey:key,guion:z.string().max(16),clips:z.array(z.number().int().min(0).max(MAX_CLIPS-1)).min(1).max(MAX_CLIPS)}).parse(b);
  const v=row.documento.videos?.[d.guion];if(!v)throw new HttpError(404,'Este guion todavía no tiene plan de video.');await authorizeBrand(w,v.marca,true);
  const clips=[...new Set(d.clips)].filter(i=>i<v.plan.clips.length);if(!clips.length)throw new HttpError(400,'Esos clips no existen.');
  if(clips.some(i=>i>0)&&!v.imagenes?.[0]?.aprobada)throw new HttpError(409,'Aprueba primero la imagen del clip 1: las demás se derivan de ella.');
  await h.encolar(w.id,v.marca,d.idempotencyKey,d.idempotencyKey,clips.map(i=>({payload:{op:'imagen_clip',proyecto:row.id,guion:d.guion,clip:i,plan:v.creado,revision:revisionImagen(v,row.documento.video_config?.[d.guion]||v.configuracion),base:i?v.imagenes[0].archivo:null},lamina:`${d.guion}-${i}`})));
  return {grupo:d.idempotencyKey};
 }
 if(action==='video-aprobar'){
  const d=z.object({guion:z.string().max(16),clip:z.number().int().min(0),aprobada:z.boolean()}).parse(b);
  const v=row.documento.videos?.[d.guion];if(!v?.imagenes?.[d.clip])throw new HttpError(404,'Ese clip todavía no tiene imagen.');await authorizeBrand(w,v.marca,true);
  await h.actualizarProyecto(row.id,doc=>{doc.videos[d.guion].imagenes[d.clip].aprobada=d.aprobada;});return {ok:true};
 }
 throw new HttpError(404,'Acción desconocida.');
}
