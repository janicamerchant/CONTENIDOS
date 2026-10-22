import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID,createHash} from 'node:crypto';
import {transform} from 'esbuild';
import {z} from 'zod';
import * as contract from '../shared/carousel.js';
import * as campaign from '../src/campaign.js';
import {HttpError,databaseError} from '../src/auth.js';
import {groupedDeliveries} from '../src/deliveries.js';
import {FONT_PAIRS} from '../shared/typography.js';
process.env.SUPABASE_SECRET_KEY='test-only-campaign-signing-key';
const source=await readFile(new URL('../api/index.ts',import.meta.url),'utf8');
const code=(await transform(source.replace(/^import .*;\n/gm,'').replace('export default async function handler','async function handler'),{loader:'ts',target:'esnext'})).code;
function fixture(){
 const brand={id:'audit',name:'Audit',modo:'foto',people:[],logos:{}};
 const document:any={id:'project',brand:'audit',modo:'foto',campaign:campaign.freezeCampaign(brand),slides:[{id:'slide-A',layout:'frase',theme:'light',title:'Una idea',image:'storage://photo'}]};
 let project:any={id:'project',marca_id:'audit',version:1,documento:document};const uploads:any[]=[],published:any[]=[];
 const query=(data:any)=>{const q:any={then:(resolve:any)=>Promise.resolve({data,error:null}).then(resolve)};for(const m of ['select','eq','order','limit','in'])q[m]=()=>q;q.single=q.maybeSingle=async()=>({data,error:null});return q;};
 const db:any={from:(table:string)=>query(table==='proyectos'?project:[]),rpc:async(name:string,args:any)=>{
  assert.equal(name,'guardar_proyecto');if(args.p_version!==project.version)return {error:{code:'40001'},data:null};
  project={...project,documento:structuredClone(args.p_documento),version:project.version+1};return {data:{id:project.id,version:project.version},error:null};
 }};
 const env:any={...contract,...campaign,FONT_PAIRS,z,URL,Buffer,randomUUID,createHash,HttpError,databaseError,groupedDeliveries,console,
  authenticate:async()=>({id:'editor',role:'editor',db}),authorizeBrand:async()=>{},checked:(r:any)=>{databaseError(r.error);return r.data;},brandDetail:async()=>brand,
  readyFile:async()=>({mime:'image/png'}),
  adminClient:()=>({from:()=>({upsert:async(v:any)=>{uploads.push(v);return {data:null,error:null};}}),rpc:async(_name:string,args:any)=>{published.push(args);return {data:null,error:null};}}),
 };
 runInNewContext(code+'\nglobalThis.handle=handler;',env);
 async function call(path:string,body?:any){let result:any;const res:any={setHeader:()=>{},end:(v:string)=>result=JSON.parse(v)};await env.handle({url:'/api/'+path,method:body===undefined?'GET':'POST',headers:{},body},res);return {status:res.statusCode,body:result};}
 return {call,project:()=>project,uploads,published};
}
const exportBody=()=>({id:randomUUID(),folder:'same',name:'01.png',exportId:randomUUID(),projectId:'project',version:1,slideId:'slide-A',position:0,total:1});
test('API: no se puede publicar un carrusel sin revisión aunque el cliente invente aprobación',async()=>{
 const f=fixture();const r=await f.call('deliveries',{...exportBody(),review:{approved:true}});assert.equal(r.status,409);assert.equal(f.uploads.length,0);
});
test('API: aprobar una revisión firma el contenido; modificarlo invalida la aprobación',async()=>{
 const f=fixture();const approved=await f.call('projects/review',{projectId:'project',version:1});assert.equal(approved.status,200);assert.equal(approved.body.review.revision.length,64);
 assert.ok(campaign.validReview(f.project().documento.review,contract.reviewRevision(f.project().documento)));
 const edited={...f.project().documento,version:f.project().version,slides:[{...f.project().documento.slides[0],title:'Texto cambiado'}],review:approved.body.review};
 const saved=await f.call('projects',edited);assert.equal(saved.status,200);assert.equal(saved.body.review,null);
 const denied=await f.call('deliveries',{...exportBody(),version:f.project().version});assert.equal(denied.status,409);assert.equal(f.uploads.length,0);
});
test('API: guarda color y fondo translúcido por elemento e invalida la revisión',async()=>{
 const f=fixture();await f.call('projects/review',{projectId:'project',version:1});
 const doc=structuredClone(f.project().documento);doc.version=f.project().version;
 doc.slides[0].fx={title:{textColor:'#FFFFFF',backdropColor:'#141414',backdropOpacity:80,scale:.8}};
 const r=await f.call('projects',doc);assert.equal(r.status,200);assert.equal(r.body.review,null);
 assert.deepEqual(f.project().documento.slides[0].fx,doc.slides[0].fx);
 assert.equal(f.project().documento.slides[0].image,'storage://photo');
});
test('API: una entrega aprobada conserva posición, lámina, exportación y versión hasta la publicación',async()=>{
 const f=fixture();await f.call('projects/review',{projectId:'project',version:1});const body={...exportBody(),version:f.project().version};
 assert.equal((await f.call('deliveries',body)).status,200);assert.equal(f.uploads[0].lamina_id,'slide-A');assert.equal(f.uploads[0].exportacion_id,body.exportId);assert.equal(f.uploads[0].posicion,0);
 assert.equal((await f.call('deliveries/commit',{exportId:body.exportId,projectId:'project',version:body.version})).status,200);assert.equal(f.published[0].p_version,body.version);
 const stale=await f.call('deliveries',{...body,id:randomUUID(),version:1});assert.equal(stale.status,409);
});
test('API: guardar conserva el snapshot existente aunque el cliente envíe otro',async()=>{
 const f=fixture();const doc=structuredClone(f.project().documento);doc.campaign.brand.name='Forged';
 // Existing projects ignore a client-supplied replacement; preserve the stored campaign.
 const r=await f.call('projects',{...doc,version:1});assert.equal(r.status,200);assert.equal(r.body.campaign.brand.name,'Audit');
});
test('API: elegir combinación cambia solo tipografías, firma la campaña y exige nueva revisión',async()=>{
 const f=fixture();await f.call('projects/review',{projectId:'project',version:1});
 const old=f.project().documento.campaign;
 const r=await f.call('projects/typography',{projectId:'project',version:f.project().version,pair:'instrument-montserrat'});
 assert.equal(r.status,200);assert.equal(r.body.campaign.brand.fonts.display,'Instrument Serif');assert.equal(r.body.campaign.brand.fonts.body,'Montserrat');
 assert.equal(f.project().documento.review,null);assert.notEqual(r.body.campaign.signature,old.signature);
 assert.equal(campaign.verifiedCampaign(r.body.campaign,'audit').id,'audit');
 assert.equal((await f.call('projects/typography',{projectId:'project',version:1,pair:'bodoni-jost'})).status,409);
 assert.equal((await f.call('projects/typography',{projectId:'project',version:f.project().version,pair:'unknown'})).status,400);
});

test('API: la portada se firma; editar otra lámina conserva su aprobación y editar la portada la invalida',async()=>{
 const f=fixture();const project=f.project();project.documento.slides.push({...project.documento.slides[0],id:'slide-B',title:'Otra idea'});
 const approved=await f.call('projects/cover-review',{projectId:'project',version:1});assert.equal(approved.status,200);
 assert.ok(campaign.validReview(approved.body.coverReview,contract.coverRevision(f.project().documento)));
 let doc=structuredClone(f.project().documento);doc.slides[1].title='Otro contenido';
 let saved=await f.call('projects',{...doc,version:f.project().version});assert.equal(saved.status,200);assert.ok(saved.body.coverReview);
 doc=structuredClone(f.project().documento);doc.slides[0].image='storage://different';
 saved=await f.call('projects',{...doc,version:f.project().version});assert.equal(saved.body.coverReview,null);
});
test('API: no se puede aprobar una portada vacía ni usar un patrón sin revisión',async()=>{
 const f=fixture();f.project().documento.slides[0].photo='Escena';f.project().documento.slides[0].image='';
 assert.equal((await f.call('projects/cover-review',{projectId:'project',version:1})).status,422);
 assert.equal((await f.call('projects/pattern',{projectId:'project',version:1})).status,409);
});
