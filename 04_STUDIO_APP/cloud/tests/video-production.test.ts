import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {videoConfigSchema} from '../src/video-settings.js';
import {pedidoHiggsfield,revisionVideo,clipVideoJob} from '../src/reels-higgsfield.js';
import {pedirPlan,videoRoute} from '../src/reels-video.js';
import {runFfmpeg,montarNarracion} from '../src/video-montage.js';
import {validAudio} from '../src/audio-upload.js';
import ts from 'typescript';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {modeloVideo,reservaVideo} from '../shared/video-config.js';
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
 doc.video_config.g.audioNarracion=audio;assert.notEqual(revisionVideo(doc,'g'),rev);
 doc.video_config.g.audioNarracion=null;doc.videos.g.imagenes[0].aprobada=false;assert.notEqual(revisionVideo(doc,'g'),rev);
});
test('un clip de una revisión anterior se rechaza antes de llamar al proveedor',async()=>{
 const j={payload:{proyecto:'p',guion:'g',revision:'old'}};
 await assert.rejects(()=>clipVideoJob(j,{cargarProyecto:async()=>({documento:{}})} as any),/cambiaron/);
});
test('la cola envía el clip una sola vez, retoma el request_id y guarda el MP4 en su guion',async()=>{
 const cfg=videoConfigSchema.parse({motor:'seedance_2_5',generarAudio:false}),doc:any={videos:{g:{plan,imagenes:[{archivo:'storage://'+audio,aprobada:true}]}},video_config:{g:cfg}};
 const revision=revisionVideo(doc,'g'),calls:{url:string;body?:any;key?:string}[]=[],states:any[]=[],stored:any[]=[];
 const code=ts.transpile((await readFile('src/reels-higgsfield.ts','utf8')).replace(/^import .*$/gm,''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}).replace(/^export /gm,'');
 const db={from:(table:string)=>({select(){return this;},eq(){return this;},update(){return this;},maybeSingle:async()=>({data:{listo:true,marca_id:'brand',object_path:'private/file'},error:null}),then(resolve:any){return Promise.resolve({data:[],error:null}).then(resolve);}}),storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://example.com/private-frame'},error:null})})}};
 const env:any={z:(await import('zod')).z,createHash,Buffer,URL,AbortSignal,HttpError,modeloVideo,reservaVideo,promptVideo,sinGestos,videoConfigSchema,process:{env:{HF_CREDENTIALS:'test-only'}},
  adminClient:()=>db,checked:(r:any)=>r.data,ProviderError:class extends Error{},saveJob:async(_j:any,s:any)=>{states.push(s);},storeFile:async(...args:any[])=>{stored.push(args);return audio;},
  fetch:async(input:string|URL,init:any={})=>{const url=String(input);calls.push({url,body:init.body&&JSON.parse(init.body),key:init.headers?.['Idempotency-Key']});
   return url.endsWith('/reference-to-video')?{ok:true,json:async()=>({request_id:'provider-1',status:'queued'})}:url.includes('/status')?{ok:true,json:async()=>({status:'completed',video:{url:'https://example.com/out.mp4'}})}:{ok:true,headers:new Headers(),body:(async function*(){yield Buffer.from('0000ftypmp42');})()};}
 };
 runInNewContext(code+'\nglobalThis.clipWorker=clipVideoJob;',env);
 const job:any={id:'job-1',marca_id:'brand',lease_token:'lease',payload:{proyecto:'p',guion:'g',indice:0,revision,configuracion:cfg,plan,clip,imagen:'storage://'+audio}};
 const h={cargarProyecto:async()=>({documento:doc}),actualizarProyecto:async(_p:any,fn:any)=>fn(doc),ahora:()=>''};
 await env.clipWorker(job,h);assert.equal(states[0].estado,'waiting');assert.equal(job.provider_id,'provider-1');
 await env.clipWorker(job,h);assert.equal(calls.filter(c=>c.body).length,1);assert.equal(calls[0]!.key,'job-1');assert.ok(calls[1]!.url.includes('provider-1/status'));
 assert.equal(stored.length,1);assert.equal(stored[0][2],'video/mp4');assert.equal(doc.videos.g.clips[0].revision,revision);assert.equal(states[1].estado,'succeeded');
});
test('la narración de otra marca no puede adjuntarse a la configuración',async()=>{
 let wrote=false;
 const w:any={id:'u',role:'editor',db:{from:(table:string)=>({select(){return this;},eq(){return this;},single:async()=>({data:table==='marcas'?{id:'brand',archivada:false}:{listo:true,marca_id:'other',mime:'audio/mpeg'},error:null})})}};
 const row={id:'p',marca_id:'brand',documento:{analisis:{guiones:[{id:'g'}]}}};
 await assert.rejects(()=>videoRoute(w,row,'video-config',{guion:'g',configuracion:{audioNarracion:audio,generarAudio:false}},{actualizarProyecto:async()=>{wrote=true;}} as any),/Archivo no disponible/);
 assert.equal(wrote,false);
});
test('los archivos de voz deben corresponder a su formato y no pueden ser HTML renombrado',()=>{
 const wav=Buffer.from('RIFF0000WAVE');assert.ok(validAudio(wav,'audio/wav'));
 assert.ok(!validAudio(Buffer.from('<html>not an audio</html>'),'audio/mpeg'));assert.ok(!validAudio(wav,'audio/mp4'));
});
test('montaje real: concatena clips y conserva la narración original hasta su final',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'montage-test-'));
 try{
  await runFfmpeg(['-f','lavfi','-i','color=c=red:s=90x160:r=24:d=1','-c:v','libx264','-pix_fmt','yuv420p',join(dir,'a.mp4')]);
  await runFfmpeg(['-f','lavfi','-i','color=c=blue:s=90x160:r=24:d=1','-c:v','libx264','-pix_fmt','yuv420p',join(dir,'b.mp4')]);
  await runFfmpeg(['-f','lavfi','-i','sine=frequency=750:sample_rate=16000:duration=3','-c:a','pcm_s16le',join(dir,'voice.wav')]);
  const result=await montarNarracion(['a.mp4','b.mp4'],'voice.wav','9:16',ref=>readFile(join(dir,ref)));
  assert.equal(result.toString('ascii',4,8),'ftyp');await writeFile(join(dir,'result.mp4'),result);
  for(const [input,out] of [['voice.wav','source.raw'],['result.mp4','result.raw']])await runFfmpeg(['-i',join(dir,input!),'-vn','-ac','1','-ar','16000','-f','f32le',join(dir,out!)]);
  const source=await readFile(join(dir,'source.raw')),decoded=await readFile(join(dir,'result.raw'));
  assert.ok(Math.abs(decoded.length-source.length)<16000*.2*4,'output audio has the original narration duration');
  let dot=0,a2=0,b2=0;
  for(let i=16000;i<Math.min(source.length,decoded.length)-16000;i+=4){const a=source.readFloatLE(i),b=decoded.readFloatLE(i);dot+=a*b;a2+=a*a;b2+=b*b;}
  assert.ok(dot/Math.sqrt(a2*b2)>.98,'decoded voice track matches the original recording');
  await runFfmpeg(['-i',join(dir,'result.mp4'),'-map','0:v:0','-vf','scale=1:1','-an','-f','rawvideo','-pix_fmt','gray',join(dir,'frames.raw')]);
  const frames=await readFile(join(dir,'frames.raw'));assert.ok(Math.abs(frames.length/24-3)<.25,'video ends with the narration');
 }finally{await rm(dir,{recursive:true,force:true});}
});
