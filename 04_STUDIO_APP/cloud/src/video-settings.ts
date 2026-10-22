import {z} from 'zod';
import {VIDEO_DEFAULTS,modeloVideo,MAX_AUDIO_REFERENCES,MAX_REFERENCE_AUDIO_BYTES,type ConfigVideo} from '../shared/video-config.js';
import {readyFile} from './library.js';
import {HttpError,type Identity} from './auth.js';
export const videoConfigSchema=z.object({
 motor:z.enum(['seedance_2_5','seedance_2_0','kling_3']).default(VIDEO_DEFAULTS.motor),
 resolucion:z.enum(['480p','720p','1080p']).default('720p'),formato:z.enum(['9:16','16:9','1:1']).default('9:16'),
 segundos:z.number().int().min(3).max(30).default(8),tipo:z.enum(['habla','mixto','apoyo']).default('habla'),ritmo:z.enum(['pausado','natural','agil']).default('natural'),
 escena:z.string().trim().max(2000).default(''),vestuario:z.string().trim().max(1000).default(''),iluminacion:z.string().trim().max(300).default(''),
 encuadre:z.string().trim().max(300).default(''),camara:z.string().trim().max(300).default(''),tono:z.string().trim().max(500).default(''),acento:z.string().trim().max(300).default(''),
 generarAudio:z.boolean().default(true),audioNarracion:z.uuid().nullable().default(null),audioNombre:z.string().max(180).default(''),
 audiosReferencia:z.array(z.object({id:z.uuid(),nombre:z.string().max(180).default('')})).max(MAX_AUDIO_REFERENCES).default([]),indicaciones:z.string().trim().max(4000).default('')
}).superRefine((c,ctx)=>{
 const m=modeloVideo(c.motor)!;
 if(c.segundos<m.min||c.segundos>m.max)ctx.addIssue({code:'custom',path:['segundos'],message:`${m.nombre}: clips de ${m.min} a ${m.max} segundos.`});
 if(c.audioNarracion&&c.generarAudio)ctx.addIssue({code:'custom',path:['generarAudio'],message:'Con narración propia, desactiva la voz del generador.'});
 if(c.audiosReferencia.length){
  if(!m.vozReferencia)ctx.addIssue({code:'custom',path:['audiosReferencia'],message:'Las referencias de voz requieren Seedance 2.5 o 2.0.'});
  if(c.audioNarracion||!c.generarAudio)ctx.addIssue({code:'custom',path:['audiosReferencia'],message:'Para usar referencias de voz, activa el sonido del modelo y quita la narración completa.'});
  if(new Set(c.audiosReferencia.map(a=>a.id)).size!==c.audiosReferencia.length)ctx.addIssue({code:'custom',path:['audiosReferencia'],message:'No repitas el mismo audio de referencia.'});
 }
});
export async function validarReferenciasAudio(w:Identity,c:ConfigVideo,marca:string){
 for(const ref of c.audiosReferencia){const f=await readyFile(w,ref.id,marca);
  if(!f.mime.startsWith('audio/')||f.bytes>MAX_REFERENCE_AUDIO_BYTES)throw new HttpError(400,'Cada referencia debe ser un audio de hasta 15 MB.');
  ref.nombre=f.nombre;
 }
}
export function instruccionesVideo(c:ConfigVideo){
 return ['Configuración elegida por la persona (prioridad sobre valores por defecto):',
 `Motor: ${c.motor}. Formato: ${c.formato}. Duración orientativa de cada clip: ${c.segundos} s; límites del motor: ${modeloVideo(c.motor)!.min}-${modeloVideo(c.motor)!.max} s.`,
 `Ritmo: ${c.ritmo}. Tipo: ${c.tipo==='habla'?'Todos los clips hablan a cámara':c.tipo==='apoyo'?'Todos los clips son planos de apoyo con voz en off':'Alterna habla a cámara y planos de apoyo con voz en off'}.`,
 ...(['escena','vestuario','iluminacion','encuadre','camara','tono','acento'] as const).filter(k=>c[k]).map(k=>`${k}: ${c[k]}`),
 c.audioNarracion?'La narración original ya está grabada y se añadirá en el montaje: todos los clips son planos de apoyo, sin hablar ni mover los labios. Divide el guion en orden para ilustrar cada idea.':'',
 c.audiosReferencia?.length?'Se enviarán muestras de voz a Seedance para guiar la voz generada. El diálogo sigue siendo el guion de cada clip, nunca la transcripción de esas muestras.':'',
 'Conserva el guion completo y en orden. Si no cabe, usa más clips: nunca lo resumas para reducir la duración.',c.indicaciones].filter(Boolean).join('\n');
}
