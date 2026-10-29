import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {videoConfigSchema} from '../src/video-settings.js';
import {pedidoHiggsfield,revisionVideo,revisionClip,clipVigente,pedidoClipVigente,conservarClip,clipVideoJob} from '../src/reels-higgsfield.js';
import {pedirPlan,videoRoute} from '../src/reels-video.js';
import {runFfmpeg,montarNarracion,montarClips} from '../src/video-montage.js';
import {validAudio} from '../src/audio-upload.js';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {modeloVideo,reservaVideo,MAX_REFERENCE_AUDIO_BYTES} from '../shared/video-config.js';
import {promptVideo,sinGestos} from '../shared/ugc.js';
import {HttpError} from '../src/auth.js';

const audio='00000000-0000-4000-8000-000000000001';
const clip={frase:'Una tarea a la vez.',modelo:'seedance_2_5' as const,segundos:20,que_se_ve:'Oficina',prompt_imagen:'Office.',camera:'Static.',movement:'none',micro_action:'Smiles.'};
const plan={escena:'Una oficina.',sujeto:'she' as const,voice:'Warm.',accent:'Spanish.',clips:[clip]};

test('configuración de video valida límites por modelo y evita voz generada sobre narración propia',()=>{
 assert.ok(videoConfigSchema.safeParse({motor:'seedance_2_5',segundos:30}).success);
 assert.ok(!videoConfigSchema.safeParse({motor:'seedance_2_0',segundos:30}).success);
 assert.ok(!videoConfigSchema.safeParse({motor:'kling_3',segundos:2}).success);
 assert.ok(!videoConfigSchema.safeParse({audioNarracion:audio,generarAudio:true}).success);
 assert.ok(videoConfigSchema.safeParse({audioNarracion:audio,generarAudio:false}).success);
});
test('referencias de voz: límites, modelos compatibles y exclusión de narración completa',()=>{
 const refs=[{id:audio,nombre:'mi-voz.wav'}];
 assert.ok(videoConfigSchema.safeParse({audiosReferencia:refs}).success);
 for(const extra of [{motor:'kling_3'},{generarAudio:false},{audioNarracion:audio}])assert.ok(!videoConfigSchema.safeParse({audiosReferencia:refs,...extra}).success);
 assert.ok(!videoConfigSchema.safeParse({audiosReferencia:[...refs,...refs]}).success);
 assert.ok(!videoConfigSchema.safeParse({audiosReferencia:Array.from({length:4},(_,i)=>({id:audio.replace(/1$/,String(i+1))}))}).success);
});
test('Seedance 2.5 y 2.0 reciben audio_urls y el guion, sin enviar un ID de ElevenLabs',()=>{
 for(const motor of ['seedance_2_5','seedance_2_0'] as const){
  const cfg=videoConfigSchema.parse({motor,audiosReferencia:[{id:audio}]});
  const r=pedidoHiggsfield(cfg,plan,{...clip,modelo:motor,segundos:8},'https://example.com/frame.png',['https://example.com/private-voice.wav']);
  const body=r.body as Record<string,unknown>;assert.deepEqual(body.audio_urls,['https://example.com/private-voice.wav']);assert.equal(body.generate_audio,true);
  assert.ok(r.body.prompt.includes(clip.frase));assert.ok(r.body.prompt.includes('audio references'));assert.ok(!Object.hasOwn(r.body,'voice_id'));
  assert.throws(()=>pedidoHiggsfield(cfg,plan,{...clip,modelo:motor,segundos:8},'https://example.com/frame.png'),/Falta preparar/);
  assert.throws(()=>pedidoHiggsfield(cfg,plan,{...clip,modelo:'kling_3',segundos:8},'https://example.com/frame.png',['https://example.com/private-voice.wav']),/requieren Seedance/);
  const off=pedidoHiggsfield(cfg,plan,{...clip,modelo:motor,segundos:8,voz_off:true},'https://example.com/frame.png',['https://example.com/private-voice.wav']);
  assert.ok(off.body.prompt.includes('OFF-CAMERA NARRATION SCRIPT: '+clip.frase));assert.ok(off.body.prompt.includes('mouth closed'));
 }
});
test('el plan recibe dirección y motor elegidos, mantiene clips largos de Seedance y respeta narración completa',async()=>{
 const config=videoConfigSchema.parse({motor:'seedance_2_5',segundos:20,escena:'Junto a una ventana',vestuario:'Blazer azul',camara:'selfie',audioNarracion:audio,generarAudio:false});
 let pedido:any;
 const r=await pedirPlan(async p=>{pedido=p;return {usd:0,refusal:false,data:structuredClone(plan)};},{nombre:'Janica'},{nombre:'Janica',descripcion:'',voz:{}},'Tarea',clip.frase,'',config);
 for(const t of ['Blazer azul','Junto a una ventana','selfie','seedance_2_5','narración original'])assert.ok(pedido.content.includes(t));
 assert.equal(r.plan!.clips[0]!.segundos,20);assert.equal(r.plan!.clips[0]!.voz_off,true);assert.equal(r.plan!.clips[0]!.frase,clip.frase);
});
test('Seedance recibe un cuerpo documentado y genera clips mudos para el montaje con narración',()=>{
 const cfg=videoConfigSchema.parse({motor:'seedance_2_5',audioNarracion:audio,generarAudio:false});
 const r=pedidoHiggsfield(cfg,plan,clip,'https://example.com/frame.png');
 const body=r.body as Record<string,unknown>;
 assert.equal(r.endpoint,'bytedance/seedance-2.5/reference-to-video');assert.deepEqual(body.image_urls,['https://example.com/frame.png']);
 assert.equal(body.generate_audio,false);assert.equal(body.duration,20);assert.ok(!r.body.prompt.includes('SCRIPT:'));assert.ok(r.body.prompt.includes('mouth closed'));
 const kling=pedidoHiggsfield(videoConfigSchema.parse({motor:'kling_3'}),plan,{...clip,modelo:'kling_3',segundos:8},'https://example.com/frame.png');
 assert.equal(kling.body.image_url,'https://example.com/frame.png');assert.equal(kling.body.sound,'on');assert.ok(!Object.hasOwn(kling.body,'resolution'));
 assert.throws(()=>pedidoHiggsfield(cfg,plan,{...clip,modelo:'seedance_2_0'},'https://example.com/frame.png'),/admite clips/);
});
test('cambiar plan, audio o aprobación invalida clips; terminar un clip no invalida los demás',()=>{
 const doc:any={videos:{g:{plan,imagenes:[{archivo:'storage://frame',aprobada:true}]}},video_config:{g:videoConfigSchema.parse({})}};
 const rev=revisionVideo(doc,'g');doc.videos.g.clips=[{archivo:'storage://video'}];assert.equal(revisionVideo(doc,'g'),rev);
 const legacyConfig={...doc.video_config.g};delete legacyConfig.audiosReferencia;
 const legacyRevision=createHash('sha256').update(JSON.stringify([plan,legacyConfig,doc.videos.g.imagenes])).digest('hex');assert.equal(rev,legacyRevision,'an empty new field preserves existing paid clips');
 doc.video_config.g.audiosReferencia=[{id:audio,nombre:'voz.wav'}];assert.notEqual(revisionVideo(doc,'g'),rev);doc.video_config.g.audiosReferencia=[];
 doc.video_config.g.audioNarracion=audio;assert.notEqual(revisionVideo(doc,'g'),rev);
 doc.video_config.g.audioNarracion=null;doc.videos.g.imagenes[0].aprobada=false;assert.notEqual(revisionVideo(doc,'g'),rev);
});
test('un clip de una revisión anterior se rechaza antes de llamar al proveedor',async()=>{
 const j={payload:{proyecto:'p',guion:'g',revision:'old'}};
 await assert.rejects(()=>clipVideoJob(j,{cargarProyecto:async()=>({documento:{}})} as any),/cambiaron/);
});
test('aprobar o generar otra imagen no invalida un clip pagado; cambiar sus entradas sí',()=>{
 const cfg=videoConfigSchema.parse({motor:'seedance_2_5'}),doc:any={videos:{g:{plan:{...plan,clips:[clip,{...clip,frase:'Otro clip.'}]},imagenes:[{archivo:'storage://base',aprobada:true}]}},video_config:{g:cfg}};
 const v=doc.videos.g,op={guion:'g',indice:0,plan:structuredClone(v.plan),clip,configuracion:structuredClone(cfg),imagen:'storage://base',revision:revisionVideo(doc,'g'),revisionClip:revisionClip(doc,'g',0)};
 assert.ok(conservarClip(doc,op,'storage://paid','now'));assert.ok(clipVigente(doc,'g',0));
 v.imagenes[1]={archivo:'storage://second',aprobada:true,base:'storage://base'};
 assert.ok(clipVigente(doc,'g',0));assert.ok(pedidoClipVigente(doc,op));
 v.plan.clips[1].frase='Cambio del otro clip.';assert.ok(clipVigente(doc,'g',0));
 v.imagenes[0].aprobada=false;assert.ok(!clipVigente(doc,'g',0));v.imagenes[0].aprobada=true;
 v.plan.clips[0]={...clip,frase:'Guion cambiado.'};assert.ok(!clipVigente(doc,'g',0));v.plan.clips[0]=clip;
 doc.video_config.g={...cfg,audiosReferencia:[{id:audio,nombre:'voz.wav'}]};assert.ok(!clipVigente(doc,'g',0));doc.video_config.g=cfg;
 v.imagenes[0].archivo='storage://replacement';assert.ok(!clipVigente(doc,'g',0));
});
test('un pedido anterior se recupera si solo cambiaron otras imágenes; un resultado obsoleto sigue descargable',()=>{
 const cfg=videoConfigSchema.parse({}),doc:any={videos:{g:{plan:structuredClone(plan),imagenes:[{archivo:'storage://base',aprobada:true}]}},video_config:{g:cfg}};
 const v=doc.videos.g,op={guion:'g',indice:0,plan:structuredClone(plan),clip,configuracion:cfg,imagen:'storage://base',revision:'legacy'};
 v.imagenes[1]={archivo:'storage://second',aprobada:true};
 op.configuracion=Object.fromEntries(Object.entries(cfg).reverse()) as any;
 assert.ok(conservarClip(doc,op,'storage://paid','now'));assert.ok(clipVigente(doc,'g',0));
 v.imagenes[0].archivo='storage://new-frame';
 assert.ok(!conservarClip(doc,op,'storage://old-output','later'));
 assert.equal(v.clips[0].archivo,'storage://paid');assert.equal(v.versiones_clips[0].archivo,'storage://old-output');
 assert.ok(conservarClip(doc,{...op,imagen:'storage://new-frame'},'storage://new-output','later'));
 assert.equal(v.clips[0].archivo,'storage://new-output');assert.equal(v.versiones_clips.length,2);
 assert.ok(!conservarClip(doc,{...op,imagen:'storage://new-frame'},'storage://recovered-older-output','before',false));
 assert.equal(v.clips[0].archivo,'storage://new-output','recovery never replaces a newer visible clip');
});
test('la cola envía el clip una sola vez, retoma el request_id y guarda el MP4 en su guion',async()=>{
 const cfg=videoConfigSchema.parse({motor:'seedance_2_5',audiosReferencia:[{id:audio}]}),doc:any={videos:{g:{plan,imagenes:[{archivo:'storage://'+audio,aprobada:true}]}},video_config:{g:cfg}};
 const revision=revisionVideo(doc,'g'),calls:{url:string;body?:any;key?:string}[]=[],states:any[]=[],stored:any[]=[];
 const code=ts.transpile((await readFile('src/reels-higgsfield.ts','utf8')).replace(/^import .*$/gm,''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}).replace(/^export /gm,'');
 const db={from:(table:string)=>({select(){return this;},eq(){return this;},update(){return this;},maybeSingle:async()=>({data:{listo:true,marca_id:'brand',mime:'audio/wav',bytes:100,object_path:'private/file'},error:null}),then(resolve:any){return Promise.resolve({data:[],error:null}).then(resolve);}}),storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.com/private-frame'},error:null})})}};
 const env:any={z:(await import('zod')).z,createHash,Buffer,URL,AbortSignal,HttpError,modeloVideo,reservaVideo,MAX_REFERENCE_AUDIO_BYTES,promptVideo,sinGestos,videoConfigSchema,process:{env:{HF_CREDENTIALS:'test-only'}},authorizeBrand:async()=>{},readyFile:async()=>({mime:'audio/wav',bytes:100}),
  adminClient:()=>db,checked:(r:any)=>r.data,ProviderError:class extends Error{},saveJob:async(_j:any,s:any)=>{states.push(s);},storeFile:async(...args:any[])=>{stored.push(args);return audio;},
  fetch:async(input:string|URL,init:any={})=>{const url=String(input);calls.push({url,body:init.body&&JSON.parse(init.body),key:init.headers?.['Idempotency-Key']});
   return url.endsWith('/reference-to-video')?{ok:true,json:async()=>({request_id:'provider-1',status:'queued'})}:url.includes('/status')?{ok:true,json:async()=>({status:'completed',video:{url:'https://example.com/out.mp4'}})}:{ok:true,headers:new Headers(),body:(async function*(){yield Buffer.from('0000ftypmp42');})()};}
 };
 runInNewContext(code+'\nglobalThis.clipWorker=clipVideoJob;globalThis.clipActions=videoActions;',env);
 const job:any={id:'job-1',marca_id:'brand',lease_token:'lease',payload:{proyecto:'p',guion:'g',indice:0,revision,configuracion:cfg,plan,clip,imagen:'storage://'+audio}};
 const h={cargarProyecto:async()=>({documento:doc}),actualizarProyecto:async(_p:any,fn:any)=>fn(doc),ahora:()=>''};
 await env.clipWorker(job,h);assert.equal(states[0].estado,'waiting');assert.equal(job.provider_id,'provider-1');
 doc.videos.g.imagenes[1]={archivo:'storage://other-frame',aprobada:true};
 assert.deepEqual(Array.from(calls[0]!.body.audio_urls),['https://example.com/private-frame']);assert.equal(calls[0]!.body.generate_audio,true);
 await env.clipWorker(job,h);assert.equal(calls.filter(c=>c.body).length,1);assert.equal(calls[0]!.key,'job-1');assert.ok(calls[1]!.url.includes('provider-1/status'));
 assert.equal(stored.length,1);assert.equal(stored[0][2],'video/mp4');assert.equal(doc.videos.g.clips[0].revision,revisionVideo(doc,'g'));assert.equal(states[1].estado,'succeeded');
 assert.equal(states[1].resultado.archivo,'storage://'+audio);assert.ok(clipVigente(doc,'g',0));
 let pending:any[]=[{grupo_id:'existing-request'}];const queued:any[]=[];
 const builder:any={select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit:async()=>({data:pending,error:null})};
 const who={id:'user',db:{from:()=>builder}},body={guion:'g',clip:0,idempotencyKey:audio},helpers={encolar:async(...args:any[])=>queued.push(args)};
 const existing=await env.clipActions(who,{id:'p',documento:doc},'video-clips',body,helpers);assert.equal(existing.grupo,'existing-request');assert.equal(queued.length,0,'a pending request is resumed without reserving or generating again');
 pending=[];await env.clipActions(who,{id:'p',documento:doc},'video-clips',body,helpers);
 assert.equal(queued[0][4][0].payload.revisionClip,revisionClip(doc,'g',0));
 await env.clipActions(who,{id:'p',documento:doc},'video-montaje',{guion:'g',idempotencyKey:audio},helpers);
 assert.equal(queued[1][4][0].payload.audio,null,'native clip audio does not require a separate narration');
 assert.deepEqual(Array.from(queued[1][4][0].payload.clips),['storage://'+audio]);
 pending=[{grupo_id:'existing-montage'}];
 assert.equal((await env.clipActions(who,{id:'p',documento:doc},'video-montaje',{guion:'g',idempotencyKey:audio},helpers)).grupo,'existing-montage');
 assert.equal(queued.length,2,'a pending montage is resumed without another reservation');pending=[];
 doc.videos.g.imagenes[0].aprobada=false;
 await assert.rejects(()=>env.clipActions(who,{id:'p',documento:doc},'video-montaje',{guion:'g',idempotencyKey:audio},helpers),/vigente/);
});
test('la narración de otra marca no puede adjuntarse a la configuración',async()=>{
 let wrote=false;
 const w:any={id:'u',role:'editor',db:{from:(table:string)=>({select(){return this;},eq(){return this;},single:async()=>({data:table==='marcas'?{id:'brand',archivada:false}:{listo:true,marca_id:'other',mime:'audio/mpeg'},error:null})})}};
 const row={id:'p',marca_id:'brand',documento:{analisis:{guiones:[{id:'g'}]}}};
 await assert.rejects(()=>videoRoute(w,row,'video-config',{guion:'g',configuracion:{audioNarracion:audio,generarAudio:false}},{actualizarProyecto:async()=>{wrote=true;}} as any),/Archivo no disponible/);
 assert.equal(wrote,false);
 await assert.rejects(()=>videoRoute(w,row,'video-config',{guion:'g',configuracion:{audiosReferencia:[{id:audio}]}},{actualizarProyecto:async()=>{wrote=true;}} as any),/Archivo no disponible/);
 assert.equal(wrote,false);
});
test('los archivos de voz deben corresponder a su formato y no pueden ser HTML renombrado',()=>{
 const wav=Buffer.from('RIFF0000WAVE');assert.ok(validAudio(wav,'audio/wav'));
 assert.ok(!validAudio(Buffer.from('<html>not an audio</html>'),'audio/mpeg'));assert.ok(!validAudio(wav,'audio/mp4'));
 assert.ok(!validAudio(Buffer.from('<html>not an audio</html>'),'audio/ogg'));assert.ok(!validAudio(wav,'audio/ogg'));
});
for(const [extension,codec,mime] of [['wav','pcm_s16le','audio/wav'],['opus','libopus','audio/ogg']] as const)test(`montaje real: concatena clips y conserva la narración ${extension} original hasta su final`,async()=>{
 const dir=await mkdtemp(join(tmpdir(),'montage-test-'));
 try{
  await runFfmpeg(['-f','lavfi','-i','color=c=red:s=90x160:r=24:d=1','-c:v','libx264','-pix_fmt','yuv420p',join(dir,'a.mp4')]);
  await runFfmpeg(['-f','lavfi','-i','color=c=blue:s=90x160:r=24:d=1','-c:v','libx264','-pix_fmt','yuv420p',join(dir,'b.mp4')]);
  const voice='voice.'+extension;
  await runFfmpeg(['-f','lavfi','-i','sine=frequency=750:sample_rate=16000:duration=3','-c:a',codec,join(dir,voice)]);
  assert.ok(validAudio(await readFile(join(dir,voice)),mime));
  const result=await montarNarracion(['a.mp4','b.mp4'],voice,'9:16',ref=>readFile(join(dir,ref)));
  assert.equal(result.toString('ascii',4,8),'ftyp');await writeFile(join(dir,'result.mp4'),result);
  for(const [input,out] of [[voice,'source.raw'],['result.mp4','result.raw']])await runFfmpeg(['-i',join(dir,input!),'-vn','-ac','1','-ar','16000','-f','f32le',join(dir,out!)]);
  const source=await readFile(join(dir,'source.raw')),decoded=await readFile(join(dir,'result.raw'));
  assert.ok(Math.abs(decoded.length-source.length)<16000*.2*4,'output audio has the original narration duration');
  let dot=0,a2=0,b2=0;
  for(let i=16000;i<Math.min(source.length,decoded.length)-16000;i+=4){const a=source.readFloatLE(i),b=decoded.readFloatLE(i);dot+=a*b;a2+=a*a;b2+=b*b;}
  assert.ok(dot/Math.sqrt(a2*b2)>.98,'decoded voice track matches the original recording');
  await runFfmpeg(['-i',join(dir,'result.mp4'),'-map','0:v:0','-vf','scale=1:1','-an','-f','rawvideo','-pix_fmt','gray',join(dir,'frames.raw')]);
  const frames=await readFile(join(dir,'frames.raw'));assert.ok(Math.abs(frames.length/24-3)<.25,'video ends with the narration');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('video completo sin narración: conserva el sonido de los clips, el orden y la duración de los clips mudos',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'clips-sound-test-'));
 try{
  await runFfmpeg(['-f','lavfi','-i','color=c=red:s=90x160:r=24:d=1','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=0.6','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',join(dir,'a.mp4')]);
  await runFfmpeg(['-f','lavfi','-i','color=c=green:s=180x320:r=30:d=1','-c:v','libx264','-pix_fmt','yuv420p',join(dir,'b.mp4')]);
  await runFfmpeg(['-f','lavfi','-i','color=c=blue:s=90x160:r=24:d=1','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',join(dir,'c.mp4')]);
  const result=await montarClips(['a.mp4','b.mp4','c.mp4'],'9:16',ref=>readFile(join(dir,ref)),'480p');
  assert.equal(result.toString('ascii',4,8),'ftyp');await writeFile(join(dir,'result.mp4'),result);
  await runFfmpeg(['-i',join(dir,'result.mp4'),'-map','0:a:0','-ac','1','-ar','16000','-f','f32le',join(dir,'sound.raw')]);
  const samples=await readFile(join(dir,'sound.raw'));
  const rms=(start:number,end:number)=>{let sum=0,n=0;for(let i=Math.round(start*16000);i<Math.round(end*16000);i++){const x=samples.readFloatLE(i*4);sum+=x*x;n++;}return Math.sqrt(sum/n);};
  const tone=(start:number,hz:number)=>{let re=0,im=0;for(let i=0;i<4000;i++){const x=samples.readFloatLE((Math.round(start*16000)+i)*4),angle=2*Math.PI*hz*i/16000;re+=x*Math.cos(angle);im+=x*Math.sin(angle);}return Math.hypot(re,im)/4000;};
  assert.ok(Math.abs(samples.length/4/16000-3)<.2,'the assembled audio lasts as long as all three videos');
  assert.ok(rms(.15,.45)>.02,'the first clip keeps its sound');assert.ok(rms(1.2,1.7)<.001,'the silent clip contributes silence');assert.ok(rms(2.2,2.7)>.02,'the final clip keeps its sound');
  assert.ok(tone(.2,440)>10*tone(.2,880));assert.ok(tone(2.2,880)>10*tone(2.2,440),'voices remain in clip order');
  await runFfmpeg(['-i',join(dir,'result.mp4'),'-map','0:v:0','-vf','scale=1:1','-an','-f','rawvideo','-pix_fmt','rgb24',join(dir,'frames.raw')]);
  const frames=await readFile(join(dir,'frames.raw'));assert.ok(Math.abs(frames.length/3/24-3)<.15,'a short audio track never cuts off the video');
  for(const [time,channel] of [[.3,0],[1.3,1],[2.3,2]]){const offset=Math.round(time!*24)*3,color=[...frames.subarray(offset,offset+3)];assert.ok(color[channel!]!>Math.max(...color.filter((_,i)=>i!==channel))+30,'video order is preserved');}
 }finally{await rm(dir,{recursive:true,force:true});}
});
