import {createHash} from 'node:crypto';
import {z} from 'zod';
import {adminClient} from './config.js';
import {authorizeBrand,HttpError,type Identity} from './auth.js';
import {checked,readyFile,storeFile} from './library.js';
import {saveJob,ProviderError} from './generation.js';
import {videoConfigSchema} from './video-settings.js';
import {modeloVideo,reservaVideo,MAX_REFERENCE_AUDIO_BYTES,type ConfigVideo} from '../shared/video-config.js';
import {promptVideo,sinGestos,type Clip,type PlanVideo} from '../shared/ugc.js';
import {montarNarracion,montarClips} from './video-montage.js';
import type {Ayudas} from './reels-video.js';

export function revisionVideo(doc:any,gid:string){const v=doc.videos?.[gid],original=doc.video_config?.[gid]||v?.configuracion,config=original?{...original}:original;
 // Un campo nuevo vacío conserva las revisiones de los clips anteriores a esta función.
 if(config&&!config.audiosReferencia?.length)delete config.audiosReferencia;
 return createHash('sha256').update(JSON.stringify([v?.plan,config,v?.imagenes])).digest('hex');}
const ordenado=(x:any):any=>Array.isArray(x)?x.map(ordenado):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,ordenado(x[k])])):x;
const igual=(a:any,b:any)=>JSON.stringify(ordenado(a))===JSON.stringify(ordenado(b));
export function revisionClip(doc:any,gid:string,i:number){
 const v=doc.videos?.[gid],{clips,...comun}=v?.plan||{},img=v?.imagenes?.[i],base=v?.imagenes?.[0];
 const config=videoConfigSchema.parse(doc.video_config?.[gid]||v?.configuracion||{});
 return createHash('sha256').update(JSON.stringify(ordenado([v?.persona,comun,clips?.[i],config,[img?.archivo,!!img?.aprobada,img?.base||null],[base?.archivo,!!base?.aprobada]]))).digest('hex');
}
export function pedidoClipVigente(doc:any,op:any){
 const v=doc.videos?.[op.guion],img=v?.imagenes?.[op.indice],base=v?.imagenes?.[0];
 if(!v?.plan?.clips?.[op.indice]||!img?.aprobada||!base?.aprobada||op.indice>0&&img.base!==base.archivo)return false;
 if(op.revisionClip)return op.revisionClip===revisionClip(doc,op.guion,op.indice);
 // Existing paid requests predate per-clip signatures. Other images and approvals are not their inputs.
 const {clips:anteriores,...antes}=op.plan||{},{clips:actuales,...ahora}=v.plan;
 const config=videoConfigSchema.parse(doc.video_config?.[op.guion]||v.configuracion||{});
 return op.imagen===img.archivo&&igual(antes,ahora)&&igual(anteriores?.[op.indice],actuales[op.indice])&&igual(videoConfigSchema.parse({...op.configuracion,motor:config.motor}),config);
}
export function clipVigente(doc:any,gid:string,i:number){
 const clip=doc.videos?.[gid]?.clips?.[i];
 return !!clip?.archivo&&(clip.revisionClip?clip.revisionClip===revisionClip(doc,gid,i):clip.revision===revisionVideo(doc,gid));
}
export function conservarClip(doc:any,op:any,archivo:string,creado:string,reemplazar=true){
 const v=doc.videos?.[op.guion];if(!v)return false;
 const anterior=v.clips?.[op.indice],vigente=pedidoClipVigente(doc,op)&&(reemplazar||!anterior||anterior.archivo===archivo),registro={archivo,revision:vigente?revisionVideo(doc,op.guion):op.revision,revisionClip:vigente?revisionClip(doc,op.guion,op.indice):op.revisionClip,modelo:op.clip.modelo,creado};
 v.versiones_clips??=[];
 const archivar=(c:any)=>{if(!v.versiones_clips.some((x:any)=>x.archivo===c.archivo))v.versiones_clips.push({...c,indice:op.indice});};
 if(vigente){if(anterior&&anterior.archivo!==archivo)archivar(anterior);v.clips??=[];v.clips[op.indice]=registro;}
 else if(anterior?.archivo!==archivo)archivar(registro);
 return vigente;
}
export function pedidoHiggsfield(config:ConfigVideo,plan:PlanVideo,clip:Clip,image:string,audioUrls:string[]=[]){
 const motor=modeloVideo(clip.modelo)||modeloVideo(config.motor)!;
 const refs=config.audiosReferencia||[];
 if(refs.length&&(!motor.vozReferencia||config.audioNarracion||!config.generarAudio))throw new HttpError(400,'Las referencias de voz requieren Seedance con sonido generado y sin narración completa.');
 if(refs.length!==audioUrls.length)throw new HttpError(409,'Falta preparar un audio de referencia. Vuelve a guardar la configuración.');
 if(clip.segundos<motor.min||clip.segundos>motor.max)throw new HttpError(400,`${motor.nombre} admite clips de ${motor.min} a ${motor.max} segundos.`);
 const off=!!config.audioNarracion||!config.generarAudio||clip.voz_off||clip.modelo==='grok';
 const prompt=[promptVideo(plan,{...clip,voz_off:off}),off?(refs.length?`OFF-CAMERA NARRATION SCRIPT: ${sinGestos(clip.frase)}. The person keeps their mouth closed; only the voice-over speaks.`:`Visual context, not spoken: ${sinGestos(clip.frase)}`):'',config.audioNarracion?'No speech, no music: original narration will be added separately.':'',refs.length?"Use the supplied audio references for the speaker's voice, timbre and delivery. Speak only the script for this clip; do not repeat the reference recording's words or background sounds.":''].filter(Boolean).join('\n');
 return {endpoint:motor.endpoint,body:motor.id==='kling_3'?{prompt,image_url:image,duration:clip.segundos,sound:config.generarAudio&&!config.audioNarracion?'on':'off',multi_shots:false}:
  {prompt,image_urls:[image],...(audioUrls.length?{audio_urls:audioUrls}:{}),duration:clip.segundos,resolution:config.resolucion,aspect_ratio:config.formato,generate_audio:config.generarAudio&&!config.audioNarracion,...(motor.id==='seedance_2_5'?{output_format:'mp4'}:{})}};
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
async function firmado(ref:string,marca:string,audio=false){const f=await archivoMarca(ref,marca);if(audio&&(!f.mime?.startsWith('audio/')||f.bytes>MAX_REFERENCE_AUDIO_BYTES))throw new HttpError(409,'La referencia debe ser un audio de hasta 15 MB.');return checked(await adminClient().storage.from('estudio').createSignedUrl(f.object_path,3600)).signedUrl as string;}
export async function clipVideoJob(j:any,h:Ayudas){
 const op=j.payload;let d:any;
 if(!j.provider_id){
  const row=await h.cargarProyecto(op.proyecto);
  if(!pedidoClipVigente(row.documento,op))throw new HttpError(409,'El plan o la imagen de este clip cambiaron. Vuelve a pedir el clip.');
  const urls=await Promise.all((op.configuracion.audiosReferencia||[]).map((r:any)=>firmado('storage://'+r.id,j.marca_id,true)));
  const {endpoint,body}=pedidoHiggsfield(op.configuracion,op.plan,op.clip,await firmado(op.imagen,j.marca_id),urls);
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
 await h.actualizarProyecto(op.proyecto,doc=>{vigente=conservarClip(doc,op,archivo,h.ahora());});
 await saveJob(j,{estado:'succeeded',coste_usd:null,resultado:{proyecto_id:op.proyecto,guion:op.guion,indice:op.indice,archivo,vigente,paso:vigente?`Clip ${op.indice+1} listo`:`Clip ${op.indice+1} guardado en versiones anteriores: cambió su plan o imagen.`}});
}
export async function montajeVideoJob(j:any,h:Ayudas){
 const op=j.payload,row=await h.cargarProyecto(op.proyecto),v=row.documento.videos?.[op.guion];
 if(revisionVideo(row.documento,op.guion)!==op.revision)throw new HttpError(409,'El video cambió antes de montar. Vuelve a pedir el montaje.');
 const refs=v.plan.clips.map((_:any,i:number)=>v.clips?.[i]?.archivo);
 if(JSON.stringify(refs)!==JSON.stringify(op.clips))throw new HttpError(409,'Los clips cambiaron. Vuelve a montar.');
 const download=async(ref:string)=>{const f=await archivoMarca(ref,j.marca_id);return Buffer.from(await checked(await adminClient().storage.from('estudio').download(f.object_path)).arrayBuffer());};
 await h.paso(j,op.audio?'Montando los clips con tu narración original…':'Uniendo los clips con su voz y sonido…');
 const bytes=op.audio?await montarNarracion(op.clips,op.audio,op.formato,download,op.resolucion):await montarClips(op.clips,op.formato,download,op.resolucion);
 if(bytes.length>52428800)throw new HttpError(413,'El montaje supera 50 MB. Elige una calidad menor y vuelve a montar.');
 const archivo='storage://'+await storeFile(j.marca_id,bytes,'video/mp4',`reel-${op.guion}.mp4`);
 let vigente=false;await h.actualizarProyecto(op.proyecto,doc=>{if(revisionVideo(doc,op.guion)!==op.revision||JSON.stringify(doc.videos[op.guion].plan.clips.map((_:any,i:number)=>doc.videos[op.guion].clips?.[i]?.archivo))!==JSON.stringify(op.clips))return;
  vigente=true;doc.videos[op.guion].montaje={archivo,revision:op.revision,clips:op.clips,creado:h.ahora()};});
 await saveJob(j,{estado:'succeeded',coste_usd:0,resultado:{proyecto_id:op.proyecto,archivo,paso:vigente?'Video completo listo':'El montaje terminó, pero los clips cambiaron.'}});
}
export async function videoActions(w:Identity,row:any,action:string,b:any,h:Ayudas){
 const d=z.object({guion:z.string().max(16),idempotencyKey:z.uuid(),clip:z.number().int().min(0).max(29).optional()}).parse(b);
 const v=row.documento.videos?.[d.guion];if(!v)throw new HttpError(404,'Primero prepara el plan.');await authorizeBrand(w,v.marca,true);
 const config=videoConfigSchema.parse(row.documento.video_config?.[d.guion]||v.configuracion||{}),revision=revisionVideo(row.documento,d.guion);
 if(action==='video-clips'){
  if(!process.env.HF_CREDENTIALS)throw new HttpError(503,'Higgsfield no está configurado.');
  const i=z.number().int().parse(d.clip),clip=v.plan.clips[i],img=v.imagenes?.[i],base=v.imagenes?.[0];
  if(!clip||!img?.aprobada||!base?.aprobada||(i>0&&img.base!==base.archivo))throw new HttpError(409,'Aprueba la imagen vigente de este clip y la del clip 1.');
  const m=modeloVideo(clip.modelo)||modeloVideo(config.motor)!;pedidoHiggsfield(config,v.plan,clip,'https://example.com/approved.png',config.audiosReferencia.map(()=> 'https://example.com/reference.wav'));
  for(const ref of config.audiosReferencia){const f=await readyFile(w,ref.id,v.marca);if(!f.mime.startsWith('audio/')||f.bytes>MAX_REFERENCE_AUDIO_BYTES)throw new HttpError(400,'La referencia debe ser un audio de hasta 15 MB.');}
  const pendiente=checked(await w.db.from('trabajos').select('grupo_id').eq('tipo','reels').eq('payload->>proyecto',row.id).eq('payload->>guion',d.guion).eq('payload->>op','video_clip').eq('payload->>indice',String(i)).in('estado',['queued','running','waiting','uncertain']).order('created_at',{ascending:false}).limit(1));
  if(pendiente.length)return {grupo:pendiente[0].grupo_id};
  await h.encolar(w.id,v.marca,d.idempotencyKey,d.idempotencyKey,[{payload:{op:'video_clip',proyecto:row.id,guion:d.guion,indice:i,clip,plan:v.plan,imagen:img.archivo,configuracion:{...config,motor:m.id},revision,revisionClip:revisionClip(row.documento,d.guion,i)},lamina:`${d.guion}-video-${i}`}]);
 }else{
  if(config.audioNarracion)await readyFile(w,config.audioNarracion,v.marca);
  if(v.plan.clips.some((_:any,i:number)=>!clipVigente(row.documento,d.guion,i)))throw new HttpError(409,'Genera todos los clips con el plan vigente antes de montar.');
  const pendiente=checked(await w.db.from('trabajos').select('grupo_id').eq('tipo','reels').eq('payload->>proyecto',row.id).eq('payload->>guion',d.guion).eq('payload->>op','video_montaje').in('estado',['queued','running','waiting','uncertain']).order('created_at',{ascending:false}).limit(1));
  if(pendiente.length)return {grupo:pendiente[0].grupo_id};
  await h.encolar(w.id,v.marca,d.idempotencyKey,d.idempotencyKey,[{payload:{op:'video_montaje',proyecto:row.id,guion:d.guion,audio:config.audioNarracion?'storage://'+config.audioNarracion:null,clips:v.plan.clips.map((_:any,i:number)=>v.clips[i].archivo),formato:config.formato,resolucion:config.resolucion,revision},lamina:d.guion}]);
 }
 return {grupo:d.idempotencyKey};
}
