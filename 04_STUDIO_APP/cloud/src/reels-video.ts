// Video UGC desde un guion de Reels (skill video-ugc-hiperrealista de UGC-Studio, portada a la cola del Estudio).
// Etapa 1: Claude divide el guion en clips y propone escena, encuadres y prompts; la persona lo revisa y edita
// antes de gastar en imágenes o clips. El video vive en reels_proyectos.documento.videos[guion_id].
import {z} from 'zod';
import {adminClient} from './config.js';
import {authorizeBrand,HttpError,type Identity} from './auth.js';
import {checked} from './library.js';
import {saveJob} from './generation.js';
import {MAX_CLIPS,MODELOS_CLIP,revisarPlan,soloHablado,type PlanVideo} from '../shared/ugc.js';

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
  prompt_imagen:{type:'string'},camera:{type:'string'},movement:{type:'string'},micro_action:{type:'string'}},
  required:['frase','modelo','segundos','que_se_ve','prompt_imagen','camera','movement','micro_action'],additionalProperties:false}}},
 required:['escena','sujeto','voice','accent','clips'],additionalProperties:false};

const texto=(max:number)=>z.string().max(max);
export const planSchema=z.object({escena:texto(2000),sujeto:z.enum(['she','he']),voice:texto(1000),accent:texto(1000),
 clips:z.array(z.object({frase:texto(1000),modelo:z.enum(MODELOS_CLIP),segundos:z.coerce.number().int().min(3).max(15),que_se_ve:texto(1000),
  prompt_imagen:texto(6000),camera:texto(1000),movement:texto(1000),micro_action:texto(1000)})).min(1).max(MAX_CLIPS)});

// La persona tiene que estar asociada a la marca: así un editor solo usa caras aprobadas para esa marca.
async function personaDeMarca(marca:string,persona:string){
 const db=adminClient();
 const [p,link]=await Promise.all([db.from('personas').select('id,identidad,archivada').eq('id',persona).maybeSingle(),db.from('persona_marca').select('persona_id').eq('persona_id',persona).eq('marca_id',marca).maybeSingle()]);
 const row=checked(p);if(!row||row.archivada||!checked(link))throw new HttpError(400,'Esa persona no está asociada a la marca del guion.');
 return {id:row.id,nombre:row.identidad?.name||row.id,descripcion:row.identidad?.descripcion||'',voz:row.identidad?.voz||{}};
}
function guionDe(doc:any,gid:string){const g=doc.analisis?.guiones?.find((x:any)=>x.id===gid);if(!g)throw new HttpError(404,'El guion ya no existe.');return g;}
const limpiarPlan=(p:any):PlanVideo=>{const plan=planSchema.parse({...p,clips:p.clips.map((c:any)=>({...c,segundos:Math.min(15,Math.max(c.modelo==='grok'?6:3,Math.round(c.segundos)||8))}))});return plan as PlanVideo;};

// Separada del trabajo para poder probarla sin base de datos (scripts/video-plan-smoke.ts).
export async function pedirPlan(claudeJson:Ayudas['claudeJson'],cliente:any,persona:{nombre:string;descripcion:string;voz:any},titulo:string,guion:string,indicaciones=''){
 const pedido=[`<marca nombre="${cliente.nombre}">`,String(cliente.contexto||'(sin descripción)').slice(0,6000),'</marca>','',
  `<persona nombre="${persona.nombre}">`,persona.descripcion||'(sin descripción)',persona.voz?.acento?`Acento: ${persona.voz.acento}`:'','</persona>','',
  `<guion titulo="${titulo}">`,guion,'</guion>'];
 if(indicaciones.trim())pedido.push('',`Indicaciones de producción:\n${indicaciones.trim()}`);
 const r=await claudeJson({system:SISTEMA_VIDEO,content:pedido.join('\n'),schema:ESQUEMA_VIDEO,maxTokens:16000,effort:'medium',timeout:300000});
 return {usd:r.usd,refusal:r.refusal,plan:r.refusal?null:limpiarPlan(r.data)};
}

export async function planVideoJob(j:any,h:Ayudas){
 const op=j.payload;await h.paso(j,'Claude está dividiendo el guion en clips…');
 const row=await h.cargarProyecto(op.proyecto),g=guionDe(row.documento,op.guion);
 const [cliente,persona]=await Promise.all([h.clienteServidor(j.marca_id),personaDeMarca(j.marca_id,op.persona)]);
 const guion=soloHablado(h.sinPretitulos(g.guion));
 const r=await pedirPlan(h.claudeJson,cliente,persona,g.titulo,guion,op.indicaciones||'');
 if(!r.plan){await saveJob(j,{estado:'failed',error:'Claude rechazó planear este video.',coste_usd:r.usd});return;}
 const plan=r.plan;
 await h.actualizarProyecto(op.proyecto,doc=>{doc.videos??={};doc.videos[g.id]={guion:g.id,persona:persona.id,marca:j.marca_id,creado:h.ahora(),estado:'plan',plan,avisos:revisarPlan(guion,plan)};});
 await saveJob(j,{estado:'succeeded',error:null,resultado:{proyecto_id:op.proyecto,paso:`Plan de video listo: ${plan.clips.length} clips`},coste_usd:r.usd});
}

// Rutas /api/reels/proyectos/:id/video (pedir el plan) y /video-plan (guardar lo que editó la persona).
const key=z.uuid();
export async function videoRoute(w:Identity,row:any,action:string,b:any,h:Ayudas){
 if(action==='video'){
  const d=z.object({idempotencyKey:key,guion:z.string().max(16),persona:z.string().regex(/^[a-z0-9-]{1,64}$/),indicaciones:z.string().max(4000).default('')}).parse(b);
  const g=guionDe(row.documento,d.guion),marca=g.cliente_id||row.marca_id;await authorizeBrand(w,marca,true);await personaDeMarca(marca,d.persona);
  await h.encolar(w.id,marca,d.idempotencyKey,d.idempotencyKey,[{payload:{op:'plan_video',proyecto:row.id,guion:g.id,persona:d.persona,indicaciones:d.indicaciones},lamina:g.id}]);
  return {grupo:d.idempotencyKey};
 }
 if(action==='video-plan'){
  const d=z.object({guion:z.string().max(16),plan:planSchema}).parse(b);
  const g=guionDe(row.documento,d.guion),actual=row.documento.videos?.[g.id];if(!actual)throw new HttpError(404,'Este guion todavía no tiene plan de video.');
  await authorizeBrand(w,actual.marca,true);const plan=d.plan as PlanVideo,avisos=revisarPlan(h.sinPretitulos(g.guion),plan);
  await h.actualizarProyecto(row.id,doc=>{doc.videos[g.id]={...doc.videos[g.id],plan,avisos,editado:h.ahora()};});
  return {plan,avisos};
 }
 throw new HttpError(404,'Acción desconocida.');
}
