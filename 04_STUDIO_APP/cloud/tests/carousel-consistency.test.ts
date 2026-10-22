import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {transform} from 'esbuild';
import {z} from 'zod';
import sharp from 'sharp';
import * as contract from '../shared/carousel.js';
import * as campaign from '../src/campaign.js';
import {HttpError} from '../src/auth.js';
import {editorialRules,blockDirection} from '../src/art-direction.js';
import {family,detect} from '../src/layers.js';
import {brandDetail} from '../src/library.js';
import {groupedDeliveries} from '../src/deliveries.js';
import {leased,execution,executionSignal} from '../src/execution.js';
import {normalizeFrame} from '../src/frames.js';
import {prompts} from '../src/prompts.js';

process.env.SUPABASE_SECRET_KEY='test-only-campaign-signing-key';
const source=await readFile(new URL('../src/generation.ts',import.meta.url),'utf8');
const compiled=(await transform(source.replace(/^import .*;\n/gm,'').replace(/^export /gm,''),{loader:'ts',target:'esnext'})).code;
const base:any={id:'audit',name:'Audit',design:'janica',modo:'completa',version:1,look:'Warm editorial',people:[],logos:{},resources:{referencias:[],conocimiento:[]},outfits:[],datos:[],defaults:{idioma:'English'}};
const slide=(over:any={})=>({id:'slide-A',layout:'frase',theme:'light',title:'Una idea',body:'',photo:'An editorial scene',photoPrompt:'An editorial scene.',blocks:[],...over});
function chain(data:any){const q:any={then:(resolve:any)=>Promise.resolve({data,error:null}).then(resolve)};for(const m of ['select','eq','order','limit','is'])q[m]=()=>q;q.single=q.maybeSingle=async()=>({data,error:null});return q;}
function fixture(){
 let brand=structuredClone(base),project:any,jobs:any[]=[],queued:any[]=[],stored:any[]=[],current:any=null;
 const env:any={...contract,...campaign,editorialRules,blockDirection,prompts,console,Buffer,URL,Date,Set,Map,structuredClone,createHash,randomUUID,z,HttpError,executionSignal,
  process:{env:{HF_CREDENTIALS:'dummy',GEMINI_API_KEY:'dummy'}},normalizeFrame,
  brandDetail:async(_w:any,id:string)=>id==='_comun'?{...base,name:'Common'}:structuredClone(brand),authorizeBrand:async()=>{},
  checked:(r:any)=>{if(r.error)throw r.error;return r.data;},
  adminClient:()=>({rpc:async(_name:any,args:any)=>{queued=args.p_jobs;return {data:[{grupo_id:'group',id:'job'}],error:null};},from:()=>({update:(patch:any)=>{stored.push(patch);return chain([{id:current?.id||'job'}]);}})}),
  storeFile:async()=>randomUUID(),buildLayers:async()=>{throw new Error('layer failure');},LAYERS_USD:.107,
 };
 runInNewContext(compiled+'\nglobalThis.api={imageRequest,enqueue,recoveredProject,knowledge,storeResult,finishEditable,textJob};',env);
 const identity:any={id:'actor',db:{from:(table:string)=>chain(table==='proyectos'?project:jobs)}};
 return {env,identity,setBrand:(b:any)=>brand=b,setProject:(p:any)=>project=p,setJobs:(j:any[])=>jobs=j,setCurrent:(j:any)=>current=j,queued:()=>queued,stored:()=>stored,
  request:(payload:any={},motor='hf_flare')=>env.api.imageRequest({marca_id:'audit',motor,payload:{index:0,prompt:'Editorial scene.',slide:slide(),modo:'completa',campaign:campaign.freezeCampaign(brand),...payload}},identity)};
}
test('C01: la identidad estructurada llega al contexto sin depender de documentos',async()=>{
 const f=fixture();const b={...base,colors:{accent:'#123ABC'},fonts:{display:'Instrument Serif'},defaults:{idioma:'English'}};f.setBrand(b);
 const result=await f.env.api.knowledge(f.identity,'audit','brief',b);
 for(const v of ['#123ABC','Instrument Serif','English'])assert.ok(result.text.includes(v));
});
test('C02: cambiar marca no cambia el prompt ni referencias de una campaña congelada',async()=>{
 const f=fixture(),frozen=campaign.freezeCampaign({...base,sistema_visual:'ORIGINAL SYSTEM'});
 const a=await f.request({campaign:frozen});f.setBrand({...base,sistema_visual:'NEW SYSTEM'});const b=await f.request({campaign:frozen});
 assert.equal(a.prompt,b.prompt);assert.match(b.prompt,/ORIGINAL SYSTEM/);
 const replay=await f.request({request:a});assert.equal(contract.canonical(replay),contract.canonical(a));
});
test('una campaña no permite sustituir recursos por los de otra marca o alterar sus fuentes',()=>{
 const frozen=campaign.freezeCampaign(base);frozen.brand.fonts.display='Tampered';assert.throws(()=>campaign.verifiedCampaign(frozen,'audit'),/no es válida/);
 assert.throws(()=>campaign.verifiedCampaign(campaign.freezeCampaign(base),'other'),/no es válida/);
});
test('C03: logos principales y secundarios resuelven rutas activas; un recurso desactivado no se usa',async()=>{
 const resource=(path:string,file:string,active=true)=>({ruta:path,archivo_id:file,activo:active,tipo:'logos',archivos:{id:file,nombre:path,listo:true,bytes:10}});
 const data:any={marcas:{identidad:{name:'EVA',datos:[],logos:{dark:{src:'logos/eva.png'}},byline:{alt:'Nika Media',logos:{dark:{src:'logos/nika.png'}}}},version:1},marca_recursos:[resource('logos/eva.png','main'),resource('logos/nika.png','secondary')],personas:[],persona_marca:[],persona_fotos:[]};
 const w:any={id:'audit',db:{from:(table:string)=>chain(data[table])}};
 const b=await brandDetail(w,'audit');assert.equal(b.logos.dark.url,'storage://main');assert.equal(b.byline.logos.dark.url,'storage://secondary');
 data.marca_recursos[1].activo=false;const disabled=await brandDetail(w,'audit');assert.equal(disabled.byline.logos.dark.url,undefined);
});
test('las capas conservan identidad independiente para EVA y Nika Media',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({lines:[],logos:[{name:'EVA',box_2d:[800,100,850,300]},{name:'Nika Media',box_2d:[800,500,850,800]}]})}]}}]}),{status:200});
 try{const result=await detect(Buffer.from('fixture'),'image/png',[],{name:'EVA',bylineName:'Nika Media'});assert.deepEqual(result.logos.map(l=>l.brand),['primary','byline']);}
 finally{globalThis.fetch=original;}
});
test('C04: el prompt obligatorio demasiado largo se rechaza sin cortarlo',async()=>{
 const f=fixture();await assert.rejects(f.request({slide:slide({layout:'bloques',blocks:Array.from({length:15},()=>({style:'sans',text:'Texto editorial '.repeat(40),zone:'arriba'}))})}),/no cabe/);
 const normal=await f.request({slide:slide({title:'Último texto obligatorio'})});assert.ok(normal.prompt.length<=5000);assert.match(normal.prompt,/Último texto obligatorio/);assert.doesNotMatch(normal.prompt,/— Spanish/);
});
test('C05: Soul no acepta completa ni una persona sin identidad entrenada',async()=>{
 const f=fixture();await assert.rejects(f.request({},'hf_soul2'),/solo admite modo foto/);
 await assert.rejects(f.request({modo:'foto'},'hf_soul2'),/Soul ID/);
});
test('C06/C13: Crear, Solicitudes y Recuperar conservan modo y metadatos',async()=>{
 const brief={marca:'audit',modo:'editable',idea:'Idea'},data={name:'Test',campaign:campaign.freezeCampaign(base),slides:[slide({people:['approved']})],research:'Official source',missingModels:['Model'],visualSystem:'Serif'};
 const draft=contract.makeDraft(brief,data,base);
 assert.equal(draft.modo,'editable');assert.equal(draft.research,'Official source');assert.deepEqual(draft.slides[0].people,['approved']);
 assert.equal(contract.makeDraft({marca:'audit'},data,base).modo,'completa');
 const bridge=await readFile(new URL('../web/bridge.js',import.meta.url),'utf8'),env:any={window:{},state:{},buildDraft:(b:any,d:any)=>contract.makeDraft(b,d,base),saveDraft:()=>{},showView:()=>{}};
 runInNewContext(bridge,env);await env.window.cloudRecoverProposal(brief,data);
 assert.equal(env.state.draft.modo,'editable');assert.equal(env.state.draft.research,'Official source');assert.deepEqual(env.state.draft.missingModels,['Model']);
});
test('C07: se serializan bloques y plantilla; un payload obsoleto no reserva presupuesto',async()=>{
 const f=fixture();const old=slide({layout:'bloques',title:'',template:'escalera',blocks:[{id:'b1',style:'titulo',text:'ANTIGUO',zone:'arriba',align:'izq'}]});
 f.setProject({id:'project',marca_id:'audit',version:1,documento:{campaign:campaign.freezeCampaign(base),modo:'completa',slides:[old]}});
 const changed={...old,blocks:[{...old.blocks[0],text:'NUEVO'}]};const payload=contract.slideContent(changed);
 assert.equal(payload.template,'escalera');assert.equal(payload.blocks[0].text,'NUEVO');
 await assert.rejects(f.env.api.enqueue(f.identity,'generate',{idempotencyKey:randomUUID(),projectId:'project',motor:'hf_flare',items:[{index:0,slideId:'slide-A',prompt:'Scene',slide:payload}]}),/Guarda los cambios/);
 assert.equal(f.queued().length,0);
});
test('en modo foto, un look de marca largo se recorta para que el prompt quepa en Flare; la escena va completa',async()=>{
 const look='# PHOTOGRAPHY DIRECTION\n\n'+Array.from({length:400},(_,i)=>`- Natural editorial light rule ${i}.`).join('\n\n'),scene='Escena completa '+'x'.repeat(900);
 const f=fixture(),s=slide();f.setProject({id:'project',marca_id:'audit',version:1,documento:{campaign:campaign.freezeCampaign({...base,modo:'foto',look}),modo:'foto',slides:[s]}});
 await f.env.api.enqueue(f.identity,'generate',{idempotencyKey:randomUUID(),projectId:'project',motor:'hf_flare',items:[{index:0,slideId:s.id,prompt:scene,slide:contract.slideContent(s)}]});
 const prompt=f.queued()[0].payload.request.prompt;assert.ok(prompt.length<=5000);assert.ok(prompt.startsWith(scene));assert.match(prompt,/PHOTOGRAPHY DIRECTION/);assert.match(prompt,/No text, letters, logos or watermark/);
});
test('preflight y manifiesto se guardan antes de encolar; la imagen usa la revisión guardada',async()=>{
 const f=fixture(),s=slide();f.setProject({id:'project',marca_id:'audit',version:1,documento:{campaign:campaign.freezeCampaign(base),modo:'completa',slides:[s]}});
 await f.env.api.enqueue(f.identity,'generate',{idempotencyKey:randomUUID(),projectId:'project',motor:'hf_flare',items:[{index:0,slideId:s.id,prompt:'Scene',slide:contract.slideContent(s)}]});
 const j=f.queued()[0];assert.equal(j.payload.slideId,s.id);assert.equal(j.payload.revision,contract.slideRevision(s));assert.equal(j.payload.request.prompt,j.payload.manifest.prompt);assert.equal(j.payload.manifest.mode,'completa');
});
test('C08: recuperar después de reordenar apunta al ID correcto',async()=>{
 const f=fixture(),a=slide(),b=slide({id:'slide-B',title:'Otra idea'});
 f.setJobs([{motor:'hf_flare',payload:{slideId:a.id,revision:contract.slideRevision(a),originalImage:''},resultado:{url:'storage://generated',full:true}}]);
 const p=await f.env.api.recoveredProject(f.identity,{version:2,documento:{slides:[b,a]}});
 assert.equal(p.slides[0].image,undefined);assert.equal(p.slides[1].image,'storage://generated');
});
test('no aplicar un resultado si se editó texto, se eliminó la lámina o se cambió la foto',()=>{
 const a=slide(),r={slideId:a.id,revision:contract.slideRevision(a),originalImage:''};
 assert.equal(contract.resultTarget([slide({title:'Editado'})],r),undefined);
 assert.equal(contract.resultTarget([],r),undefined);
 assert.equal(contract.resultTarget([slide({image:'other'})],r),undefined);
 assert.equal(contract.resultTarget([a],{index:0}),undefined);
});
test('C09: deshacer y rehacer restaura imagen, capas, motor, ajustes y revisión visual',()=>{
 const a=slide({image:'old',layers:{on:true,plate:'old-plate',texts:[{text:'Old'}]},motor:'old-engine',move:{title:[10,20]},full:true});const original=contract.visualSnapshot(a);
 contract.applyVisual(a,{url:'new',layers:{on:true,plate:'new-plate'},full:true,motor:'new-engine'});const updated=contract.visualSnapshot(a);
 contract.undoVisual(a);assert.deepEqual(contract.visualSnapshot(a),original);contract.undoVisual(a);assert.deepEqual(contract.visualSnapshot(a),updated);
});
test('C10: versiones independientes, orden natural histórico y lotes parciales ocultos',()=>{
 const r=(name:string,id:string,extra:any={})=>({marca_id:'audit',carpeta:'same',nombre:name,archivo_id:id,created_at:'2026-10-21',...extra});
 const rows=[r('02.png','new2',{exportacion_id:'v2',publicada:true,posicion:1}),r('01.png','new1',{exportacion_id:'v2',publicada:true,posicion:0}),r('01.png','partial',{exportacion_id:'v3',publicada:false,posicion:0}),r('02.png','old2'),r('01.png','old1'),r('01.png','older1')];
 const result=groupedDeliveries(rows);assert.equal(result.length,2);assert.deepEqual(result[0].images,['storage://new1','storage://new2']);assert.deepEqual(result[1].images,['storage://old1','storage://old2']);
});
test('C11: durante trabajo largo el heartbeat renueva el lease; al terminar no sigue renovando',async()=>{
 let renewals=0;await leased(async()=>{renewals++;return true;},async()=>{await new Promise(r=>setTimeout(r,35));assert.ok(!execution.getStore()?.aborted);},5,200);
 assert.ok(renewals>=1);const completed=renewals;await new Promise(r=>setTimeout(r,12));assert.equal(renewals,completed);
});
test('C11: un worker que perdió su lease recibe cancelación',async()=>{
 await assert.rejects(leased(async()=>false,()=>new Promise((_,reject)=>{execution.getStore()!.addEventListener('abort',()=>reject(new Error('canceled')),{once:true});}),5,200),/canceled/);
});
test('editable persiste imagen y procesa capas en una fase independiente; un fallo queda explícito',async()=>{
 const f=fixture(),j:any={id:'job',marca_id:'audit',lease_token:'lease',payload:{modo:'editable',campaign:campaign.freezeCampaign(base),slide:slide(),tamano:'1k'},resultado:{full:true}};f.setCurrent(j);
 const bytes=await sharp({create:{width:40,height:50,channels:3,background:'#eee'}}).png().toBuffer();
 await f.env.api.storeResult(j,bytes,'image/png',.1,f.identity);const stored=f.stored().at(-1);
 assert.equal(stored.estado,'waiting');assert.equal(stored.resultado.editability,'pending');assert.ok(stored.resultado.url);
 j.resultado=stored.resultado;await f.env.api.finishEditable(j,f.identity);const failedLayers=f.stored().at(-1);
 assert.equal(failedLayers.estado,'succeeded');assert.equal(failedLayers.resultado.editability,'failed');assert.ok(failedLayers.resultado.qa);assert.equal(failedLayers.resultado.url,stored.resultado.url);
});
test('la propuesta corrige una vez sus errores editoriales y registra todo el uso',async()=>{
 const f=fixture(),b=campaign.freezeCampaign(base),responses=[{slides:[slide()]},{slides:[slide(),slide({id:'slide-B',title:'Otra idea'})]}],calls:any[]=[];
 f.env.fetch=async(_url:string,request:any)=>{calls.push(JSON.parse(request.body));return new Response(JSON.stringify({model:'fixture',stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:20},content:[{type:'text',text:JSON.stringify(responses.shift())}]}),{status:200});};
 const j={id:'job',tipo:'propuesta',marca_id:'audit',payload:{brief:{marca:'audit',laminas:'2',modo:'foto'},campaign:b}};f.setCurrent(j);
 await f.env.api.textJob(j,f.identity);const saved=f.stored().at(-1);
 assert.equal(calls.length,2);assert.equal(saved.estado,'succeeded');assert.equal(saved.resultado.slides.length,2);assert.equal(saved.resultado.usage.input_tokens,200);assert.equal(saved.resultado.usage.output_tokens,40);
 assert.match(calls[1].messages.at(-1).content,/Se pidieron 2/);
});
test('C12: convertir a capas conserva las familias autorizadas',()=>{
 for(const type of ['serif','sans','condensed_sans','mono','script']){assert.equal(family(type,'display',{display:'Instrument Serif',body:'Jost'}),'Instrument Serif');assert.equal(family(type,'body',{display:'Instrument Serif',body:'Jost'}),'Jost');}
});
test('el contrato editorial rechaza cantidad, exceso de palabras, plantillas repetidas y campos incoherentes',()=>{
 assert.ok(contract.validateCarousel([slide()],2).length);assert.ok(contract.validateSlide(slide({title:'word '.repeat(26)})).length);
 assert.ok(contract.validateSlide(slide({layout:'lista',items:['a','b'],body:'bad'})).length);
 assert.ok(contract.validateSlide(slide({layout:'bloques',blocks:[]})).length);
 assert.throws(()=>contract.requestedCount(30));
});
test('la firma de revisión se invalida al editar, reordenar, cambiar capas o marca',()=>{
 const a=slide({image:'photo'}),p:any={brand:'audit',slides:[a,slide({id:'slide-B'})]},revision=contract.reviewRevision(p);
 const review={revision:campaign.reviewHash(revision),signature:campaign.signReview(revision)};
 assert.ok(campaign.validReview(review,revision));assert.equal(review.revision.length,64);
 p.slides.reverse();assert.ok(!campaign.validReview(review,contract.reviewRevision(p)));p.slides.reverse();a.layers={texts:[{text:'Editado'}]};assert.ok(!campaign.validReview(review,contract.reviewRevision(p)));
 assert.ok(contract.reviewIssues({modo:'editable',slides:[slide({image:'photo'})]}).some(e=>e.includes('capas')));
});
test('todos los motores terminan en 4:5 sin recortar extremos de una imagen 3:4',async()=>{
 const input=await sharp(Buffer.from('<svg width="120" height="160"><rect width="120" height="160" fill="red"/><rect y="150" width="120" height="10" fill="blue"/></svg>')).png().toBuffer();
 const bytes=await normalizeFrame(input,{colors:{lightBg:'#eeeeee'}},{theme:'light'},'1k'),meta=await sharp(bytes).metadata();assert.equal(meta.width,1080);assert.equal(meta.height,1350);
 const region=await sharp(bytes).extract({left:100,top:1330,width:800,height:10}).toBuffer();const stats=await sharp(region).stats();assert.ok(stats.channels[2]!.mean>200,'bottom content preserved');
});

test('la portada y el resto de las láminas se generan en un mismo lote, sin aprobar la portada antes',async()=>{
 const f=fixture(),first=slide(),second=slide({id:'slide-B',title:'Segunda idea'}),doc:any={brand:'audit',modo:'foto',campaign:campaign.freezeCampaign(base),slides:[first,second]};
 f.setProject({id:'p',marca_id:'audit',version:1,documento:doc});
 const payload:any={idempotencyKey:randomUUID(),projectId:'p',motor:'hf_flare',tamano:'1k',items:[{index:0,slideId:first.id,prompt:'Editorial photo',people:[]},{index:1,slideId:second.id,prompt:'Editorial photo',people:[]}]};
 await f.env.api.enqueue(f.identity,'generate',payload);assert.equal(f.queued().length,2);
});
test('un patrón fija tipografías, colores y dirección visual en campañas futuras',()=>{
 const b=campaign.campaignBrand({...base,fonts:{display:'Wrong'},carouselPattern:{style:{fonts:{display:'Anton',body:'Barlow'},colors:{accent:'#123ABC'},modo:'foto',sistema_visual:'Fixed system'},examples:[slide()]}});
 assert.equal(b.fonts.display,'Anton');assert.equal(b.colors.accent,'#123ABC');assert.equal(b.modo,'foto');assert.match(campaign.identityContext(b),/Fixed system/);
});
