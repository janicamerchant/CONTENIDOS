import {createHash} from 'node:crypto';
import {z} from 'zod';
import {adminClient} from './config.js';
import {authorizeBrand,HttpError,type Identity} from './auth.js';
import {checked,readyFile,storeFile} from './library.js';
import {saveJob,ProviderError} from './generation.js';
import {videoConfigSchema} from './video-settings.js';
import {modeloVideo,reservaVideo,type ConfigVideo} from '../shared/video-config.js';
import {promptVideo,sinGestos,type Clip,type PlanVideo} from '../shared/ugc.js';
import {montarNarracion} from './video-montage.js';
import type {Ayudas} from './reels-video.js';

export function revisionVideo(doc:any,gid:string){const v=doc.videos?.[gid];return createHash('sha256').update(JSON.stringify([v?.plan,doc.video_config?.[gid]||v?.configuracion,v?.imagenes])).digest('hex');}
export function pedidoHiggsfield(config:ConfigVideo,plan:PlanVideo,clip:Clip,image:string){
 const motor=modeloVideo(clip.modelo)||modeloVideo(config.motor)!;
 if(clip.segundos<motor.min||clip.segundos>motor.max)throw new HttpError(400,`${motor.nombre} admite clips de ${motor.min} a ${motor.max} segundos.`);
 const off=!!config.audioNarracion||!config.generarAudio||clip.voz_off||clip.modelo==='grok';
 const prompt=[promptVideo(plan,{...clip,voz_off:off}),off?`Visual context, not spoken: ${sinGestos(clip.frase)}`:'',config.audioNarracion?'No speech, no music: original narration will be added separately.':''].filter(Boolean).join('\n');
 return {endpoint:motor.endpoint,body:motor.id==='kling_3'?{prompt,image_url:image,duration:clip.segundos,sound:config.generarAudio&&!config.audioNarracion?'on':'off',multi_shots:false}:
  {prompt,image_urls:[image],duration:clip.segundos,resolution:config.resolucion,aspect_ratio:config.formato,generate_audio:config.generarAudio&&!config.audioNarracion,...(motor.id==='seedance_2_5'?{output_format:'mp4'}:{})}};
}
async function hf(path:string,body?:unknown,key?:string){
 if(!process.env.HF_CREDENTIALS)throw new HttpError(503,'Higgsfield no está configurado.');
 const r=await fetch('https://api.higgsfield.ai/'+path,{method:body?'POST':'GET',headers:{Authorization:'Key '+process.env.HF_CREDENTIALS,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000),redirect:'error'});
 if(!r.ok)throw new ProviderError(r.status);return r.json();
}
async function archivoMarca(ref:string,marca:string){
 const id=z.uuid().parse(ref.replace('storage://',''));const f=checked(await adminClient().from('archivos').select('*').eq('id',id).maybeSingle());
 if(!f?.listo||f.eliminado_at||f.marca_id!==marca)throw new HttpError(409,'Un archivo del video ya no está disponible para esta marca.');return f;
}
async function firmado(ref:string,marca:string){const f=await archivoMarca(ref,marca);return checked(await adminClient().storage.from('estudio').createSignedUrl(f.object_path,3600)).signedUrl as string;}
export async function clipVideoJob(j:any,h:Ayudas){
 const op=j.payload;let d:any;
 if(!j.provider_id){
  const row=await h.cargarProyecto(op.proyecto);
  if(revisionVideo(row.documento,op.guion)!==op.revision)throw new HttpError(409,'El plan o sus imágenes cambiaron. Vuelve a pedir el clip.');
  const {endpoint,body}=pedidoHiggsfield(op.configuracion,op.plan,op.clip,await firmado(op.imagen,j.marca_id));
  d=await hf(endpoint,body,j.id);
  const provider=z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).parse(d.request_id);
  checked(await adminClient().from('trabajos').update({provider_id:provider}).eq('id',j.id).eq('lease_token',j.lease_token));j.provider_id=provider;
 }else d=await hf('requests/'+encodeURIComponent(j.provider_id)+'/status');
 if(['failed','nsfw','canceled','cancelled'].includes(d.status)){await saveJob(j,{estado:'failed',error:`Higgsfield no completó el clip (${d.status}).`,coste_usd:null});return;}
 if(d.status!=='completed'){await saveJob(j,{estado:'waiting',resultado:{paso:'Higgsfield está generando el clip…'},next_run_at:new Date(Date.now()+8000).toISOString()});return;}
 const url=new URL(z.url().parse(d.video?.url||d.output?.video?.url));if(url.protocol!=='https:')throw new HttpError(502,'URL de video inválida.');
 const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(90000)});if(!r.ok)throw new ProviderError(r.status);
 if(Number(r.headers.get('content-length')||0)>52428800)throw new HttpError(413,'El clip supera 50 MB. Reduce resolución o duración.');
 const chunks:Buffer[]=[];let total=0;
 for await(const chunk of r.body!){const bytes=Buffer.from(chunk);total+=bytes.length;if(total>52428800)throw new HttpError(413,'El clip supera 50 MB.');chunks.push(bytes);}
 const bytes=Buffer.concat(chunks);if(bytes.toString('ascii',4,8)!=='ftyp')throw new HttpError(502,'El proveedor no devolvió un MP4 válido.');
 const archivo='storage://'+await storeFile(j.marca_id,bytes,'video/mp4',`video-${op.guion}-clip-${op.indice+1}.mp4`);let vigente=false;
 await h.actualizarProyecto(op.proyecto,doc=>{if(revisionVideo(doc,op.guion)!==op.revision)return;vigente=true;const v=doc.videos[op.guion];v.clips??=[];v.clips[op.indice]={archivo,revision:op.revision,modelo:op.clip.modelo,creado:h.ahora()};});
 await saveJob(j,{estado:'succeeded',coste_usd:null,resultado:{proyecto_id:op.proyecto,paso:vigente?`Clip ${op.indice+1} listo`:'El clip terminó, pero cambió el plan: vuelve a generarlo.'}});
}
export async function montajeVideoJob(j:any,h:Ayudas){
 const op=j.payload,row=await h.cargarProyecto(op.proyecto),v=row.documento.videos?.[op.guion];
 if(revisionVideo(row.documento,op.guion)!==op.revision)throw new HttpError(409,'El video cambió antes de montar. Vuelve a pedir el montaje.');
 const refs=v.clips.map((x:any)=>x.archivo);
 if(JSON.stringify(refs)!==JSON.stringify(op.clips))throw new HttpError(409,'Los clips cambiaron. Vuelve a montar.');
 const download=async(ref:string)=>{const f=await archivoMarca(ref,j.marca_id);return Buffer.from(await checked(await adminClient().storage.from('estudio').download(f.object_path)).arrayBuffer());};
 await h.paso(j,'Montando los clips con tu narración original…');
 const bytes=await montarNarracion(op.clips,op.audio,op.formato,download,op.resolucion);
 if(bytes.length>52428800)throw new HttpError(413,'El montaje supera 50 MB. Elige una calidad menor y vuelve a montar.');
 const archivo='storage://'+await storeFile(j.marca_id,bytes,'video/mp4',`reel-${op.guion}.mp4`);
 let vigente=false;await h.actualizarProyecto(op.proyecto,doc=>{if(revisionVideo(doc,op.guion)!==op.revision||JSON.stringify(doc.videos[op.guion].clips.map((x:any)=>x.archivo))!==JSON.stringify(op.clips))return;
  vigente=true;doc.videos[op.guion].montaje={archivo,revision:op.revision,clips:op.clips,creado:h.ahora()};});
 await saveJob(j,{estado:'succeeded',coste_usd:0,resultado:{proyecto_id:op.proyecto,paso:vigente?'Video con narración listo':'El montaje terminó, pero los clips cambiaron.'}});
}
export async function videoActions(w:Identity,row:any,action:string,b:any,h:Ayudas){
 const d=z.object({guion:z.string().max(16),idempotencyKey:z.uuid(),clip:z.number().int().min(0).max(29).optional()}).parse(b);
 const v=row.documento.videos?.[d.guion];if(!v)throw new HttpError(404,'Primero prepara el plan.');await authorizeBrand(w,v.marca,true);
 const config=videoConfigSchema.parse(row.documento.video_config?.[d.guion]||v.configuracion||{}),revision=revisionVideo(row.documento,d.guion);
 if(action==='video-clips'){
  if(!process.env.HF_CREDENTIALS)throw new HttpError(503,'Higgsfield no está configurado.');
  const i=z.number().int().parse(d.clip),clip=v.plan.clips[i],img=v.imagenes?.[i],base=v.imagenes?.[0];
  if(!clip||!img?.aprobada||!base?.aprobada||(i>0&&img.base!==base.archivo))throw new HttpError(409,'Aprueba la imagen vigente de este clip y la del clip 1.');
  const m=modeloVideo(clip.modelo)||modeloVideo(config.motor)!;pedidoHiggsfield(config,v.plan,clip,'https://example.com/approved.png');
  await h.encolar(w.id,v.marca,d.idempotencyKey,d.idempotencyKey,[{payload:{op:'video_clip',proyecto:row.id,guion:d.guion,indice:i,clip,plan:v.plan,imagen:img.archivo,configuracion:{...config,motor:m.id},revision},lamina:`${d.guion}-video-${i}`}]);
 }else{
  if(!config.audioNarracion)throw new HttpError(400,'Sube y guarda la narración completa antes de montar.');
  await readyFile(w,config.audioNarracion,v.marca);
  if(v.plan.clips.some((_:any,i:number)=>!v.clips?.[i]?.archivo||v.clips[i].revision!==revision))throw new HttpError(409,'Genera todos los clips con el plan vigente antes de montar.');
  await h.encolar(w.id,v.marca,d.idempotencyKey,d.idempotencyKey,[{payload:{op:'video_montaje',proyecto:row.id,guion:d.guion,audio:'storage://'+config.audioNarracion,clips:v.clips.map((x:any)=>x.archivo),formato:config.formato,resolucion:config.resolucion,revision},lamina:d.guion}]);
 }
 return {grupo:d.idempotencyKey};
}
