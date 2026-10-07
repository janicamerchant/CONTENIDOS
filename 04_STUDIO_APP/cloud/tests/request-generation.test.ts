import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../web/legacy/app.js',import.meta.url),'utf8');
const requestCode=source.slice(source.indexOf('async function createRequestCarousel('),source.indexOf('// ---------------------------------------------------------------- entregas'));
const generationCode=source.slice(source.indexOf('function draftToProject()'),source.indexOf('function pickIdeaBrand('));
function fixture({save=true,ready=true,full=true,failed=false}={}) {
 const calls:any[]=[],saved:any[]=[],messages:any[]=[];
 const state:any={view:'requests',p:null};
 const slide={layout:'escena',title:'Crece',photo:'Una escena real',photoPrompt:'A natural scene',blocks:[]};
 const elements:any={};
 const env:any={state,console,Set,Date,
  $:(key:string)=>elements[key]||=( {textContent:''}),
  brandMotor:()=>({motor:'nano_banana_pro',tamano:'2k'}),motorReady:()=>ready,fullMode:()=>full,
  isFull:(d:any)=>['completa','editable'].includes(d.modo),peopleIn:()=>['approved-person'],
  normalizeProject:(p:any)=>p,saveDraft:()=>{},saveProject:async()=>{calls.push('save-project');saved.push(structuredClone(state.p));return save;},
  saveRequest:async(r:any)=>{calls.push(['request',r]);return r;},showView:(view:string)=>state.view=view,
  renderCreate:()=>{},renderEditor:()=>{},renderProposal:()=>{},renderCost:()=>{},toast:(...args:any[])=>messages.push(args),
  draftMotor:()=>({motor:'nano_banana_pro',tamano:'2k'}),promptFor:(s:any)=>s.photoPrompt,slidePeople:(s:any)=>s.people,
  slidePayload:(s:any)=>({title:s.title,photo:s.photo,photoPrompt:s.photoPrompt}),dropLayerKeys:(x:any)=>x,
  clearTimeout:()=>{},setTimeout:()=>{},
  api:async(path:string,body:any)=>{
   calls.push([path,body]);
   if(path==='/api/draft')return {name:'Carrusel de prueba',visualSystem:'Brand serif system',avoid:'No clutter',concept:'Idea',slides:[slide]};
   if(path==='/api/generate')return {id:'batch'};
   if(path.startsWith('/api/generate?id='))return {done:true,items:[failed?{index:0,status:'failed'}:{index:0,status:'completed',url:'storage://image',full}]};
   throw new Error('Unexpected route '+path);
  },
 };
 runInNewContext(requestCode+'\n'+generationCode+'\nglobalThis.run=draftFromRequest;globalThis.poll=pollGeneration;',env);
 return {env,state,calls,saved,messages};
}
const request={id:'request-123',brief:{marca:'brand-123',tema:'Una idea',laminas:'1'}};

test('Solicitudes crea proyecto, vincula solicitud y encola imágenes con identidad y sistema visual',async()=>{
 const f=fixture();await f.env.run(request,{textContent:'Generar'});await f.env.poll();
 const draft=f.calls.find((c:any)=>c[0]==='/api/draft')[1];
 assert.equal(draft.brief.requestId,request.id);assert.equal(draft.brief.modo,'completa');
 const generation=f.calls.find((c:any)=>c[0]==='/api/generate')[1];
 assert.equal(generation.projectId,f.state.p.id);assert.equal(generation.motor,'nano_banana_pro');
 assert.deepEqual(generation.items[0].people,['approved-person']);
 assert.equal(f.state.p.requestId,request.id);assert.equal(f.state.p.visualSystem,'Brand serif system');
 assert.equal(f.state.p.avoid,'No clutter');assert.equal(f.state.p.slides[0].image,'storage://image');
 assert.ok(f.calls.findIndex((c:any)=>c[0]==='request')<f.calls.findIndex((c:any)=>c[0]==='/api/generate'));
 assert.equal(f.state.view,'create');assert.equal(f.state.requestBusy,false);
});

test('un proyecto que no pudo guardarse no genera ni consume imágenes',async()=>{
 const f=fixture({save:false});await f.env.run(request);
 assert.ok(!f.calls.some((c:any)=>c[0]==='/api/generate'));
 assert.ok(!f.calls.some((c:any)=>c[0]==='request'));
});

test('sin motor no se envía siquiera el pedido de texto',async()=>{
 const f=fixture({ready:false});await f.env.run(request);
 assert.equal(f.calls.length,0);assert.match(f.messages[0][0],/motor de imágenes/);
});

test('Solicitudes respeta modo foto y expone fallos de imágenes para reintentar',async()=>{
 const f=fixture({full:false,failed:true});await f.env.run(request);await f.env.poll();
 assert.equal(f.state.p.modo,'foto');assert.equal(f.state.draft.gen.done,true);
 assert.equal(f.state.draft.gen.items[0].status,'failed');
 assert.ok(f.messages.some((m:any)=>m[1]===true&&/fallaron/.test(m[0])));
});
