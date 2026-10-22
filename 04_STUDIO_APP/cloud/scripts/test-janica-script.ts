// Real Janica regression: paid providers, private draft retained for visual review.
// Stages allow inspecting the cover and full carousel before signing their reviews.
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {chromium,type Browser,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {loadLocalEnv,adminClient,config,assertTarget} from '../src/config.js';
import {makeDraft,validateCarousel,slideTexts,applyVisual} from '../shared/carousel.js';
loadLocalEnv();assert.equal(assertTarget(),'okgjpsntveloemjrsmjd');
const phase=process.argv[2]||'inspect',base=process.env.TEST_SITE||'https://contentstudio.nikamediaus.com',dir='artifacts/janica-bloque90',statePath='/tmp/studio-janica-test-state.json';
await mkdir(dir,{recursive:true,mode:0o700});
const bypassHeaders:Record<string,string>=process.env.VERCEL_AUTOMATION_BYPASS_SECRET?{'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}:{};
const db=adminClient(),cfg=config(),ok=(r:any)=>{if(r.error)throw r.error;return r.data;};
let state:any;try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
const saveState=()=>writeFile(statePath,JSON.stringify(state),{mode:0o600});
const jsonFile=(name:string,data:any)=>writeFile(`${dir}/${name}.json`,JSON.stringify(data,null,2));
async function api(path:string,body?:any,expected=200){const r=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{...bypassHeaders,Authorization:'Bearer '+state.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();assert.equal(r.status,expected,path+': '+JSON.stringify(data));return data;}
async function waitJob(id:string){const start=Date.now();for(;;){const result=await api('generate?id='+id);if(result.done){if(result.error)throw Error(result.error);return result;}if(Date.now()-start>900000)throw Error('Job timeout; resume by inspecting the saved job, do not resubmit.');console.log('Waiting:',id,result.items.map((x:any)=>x.status).join(','));await new Promise(r=>setTimeout(r,10000));}}
async function photo(ref:string,name:string){const f=ok(await db.from('archivos').select('object_path').eq('id',ref.slice(10)).single());const bytes=Buffer.from(await ok(await db.storage.from('estudio').download(f.object_path)).arrayBuffer());await writeFile(`${dir}/${name}.png`,bytes);const meta=await sharp(bytes).metadata();return {width:meta.width,height:meta.height,format:meta.format};}
let browser:Browser|undefined,page:Page|undefined;
async function editor(){browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);page.on('pageerror',e=>console.log('BROWSER ERROR:',e.message));if(Object.keys(bypassHeaders).length)await page.route(base+'/**',route=>route.continue({headers:{...route.request().headers(),...bypassHeaders}}));await page.goto(base+'/?view=editor&p='+state.projectId);await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#login-form button')!.disabled);await page.getByLabel('Email',{exact:true}).fill(state.email);await page.getByLabel('Contraseña',{exact:true}).fill(state.password);await page.getByRole('button',{name:'Entrar al Estudio'}).click();await page.waitForSelector('#stage-inner .slide');return page;}
async function exportLocal(p:Page,indices:number[]){for(const i of indices){const data=await p.evaluate(async(index)=>{const w=window as any;return w.eval('renderForExport('+index+')');},i);await writeFile(`${dir}/slide-${String(i+1).padStart(2,'0')}.png`,Buffer.from(data.split(',')[1],'base64'));console.log('Rendered slide',i+1);}}
try{
 if(phase==='propose'){
  assert(!state,'A test already exists. Resume it instead of creating another.');
  const tag=randomUUID().slice(0,8),email=`qa-janica-${tag}@example.invalid`,password=randomUUID()+randomUUID();
  const user=ok(await db.auth.admin.createUser({email,password,email_confirm:true})).user;
  ok(await db.from('miembros').insert({user_id:user.id,rol:'editor',limite_mensual_usd:24}));ok(await db.from('miembro_marca').insert({user_id:user.id,marca_id:'janica'}));
  const client=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),session=ok(await client.auth.signInWithPassword({email,password})).session;
  state={userId:user.id,email,password,token:session.access_token,projectId:`janica-bloque90-${tag}`,startedAt:new Date().toISOString()};await saveState();
  const source=await readFile('tests/fixtures/janica-bloque90.txt','utf8');
  const brief={marca:'janica',idea:source,laminas:'8',modo:'foto',cta:'Escribe BLOQUE y te mando mi hoja para tu primer bloque de 90 minutos.',notas:'Adaptar el guion completo a un carrusel de Instagram de 8 láminas. Mantener su argumento, el bloque de 90 minutos y el CTA BLOQUE. Usar la identidad vigente de Janica. No inventar testimonios ni nuevas ofertas.',idioma:'Español',objetivo:'Autoridad',audiencia:'Mujeres emprendedoras y profesionales ambiciosas'};
  await jsonFile('brief',brief);const key=randomUUID(),q=await api('propose',{...brief,idempotencyKey:key},202);state.proposalJob=q.id;await saveState();
  assert.equal((await api('propose',{...brief,idempotencyKey:key},202)).id,q.id);
  const result=await waitJob(q.id),proposal=result.result;await jsonFile('proposal-original',proposal);assert.deepEqual(validateCarousel(proposal.slides,8),[]);
  const draft=makeDraft(brief,proposal,proposal.campaign.brand,text=>proposal.campaign.brand.people.filter((p:any)=>[p.id,p.name,...p.aliases].some((n:string)=>text.toLowerCase().includes(n.toLowerCase()))).map((p:any)=>p.id));
  const project={id:state.projectId,brand:'janica',name:'PRUEBA · BLOQUE 90 — Teléfono y atención',modo:'foto',motor:proposal.campaign.brand.motor_imagen||'hf_flare',tamano:'2k',campaign:proposal.campaign,caption:draft.caption,concept:draft.concept,visualSystem:draft.visualSystem,avoid:draft.avoid,slides:draft.slides.map(({gen,...s}:any)=>({...s,id:randomUUID(),image:''}))};
  await api('projects',{...project,version:0});await jsonFile('project-original',await api('projects?id='+state.projectId));
  await jsonFile('proposal-checks',{projectId:state.projectId,slideCount:8,validationErrors:[],fonts:project.campaign.brand.fonts,mode:project.modo,claudeUsd:proposal.usage?.usd,peopleSlides:project.slides.flatMap((s:any,i:number)=>s.people?.length?[i+1]:[]),slides:project.slides.map((s:any,i:number)=>({slide:i+1,template:s.template,layout:s.layout,texts:slideTexts(s),source:s.source,photoPrompt:s.photoPrompt,people:s.people})),caption:project.caption});
  console.log('PROPOSAL READY:',state.projectId,'USD',proposal.usage?.usd);
 }else if(phase==='repropose'){
  const brief=JSON.parse(await readFile(`${dir}/brief.json`,'utf8'));
  const q=await api('propose',{...brief,idempotencyKey:randomUUID()},202);state.correctedProposalJob=q.id;await saveState();
  const result=await waitJob(q.id),proposal=result.result;await jsonFile('proposal-corrected',proposal);assert.deepEqual(validateCarousel(proposal.slides,8),[]);
  const old=await api('projects?id='+state.projectId);assert(old.slides.every((s:any)=>!s.image),'Do not replace a project with generated images.');
  const draft=makeDraft(brief,proposal,proposal.campaign.brand,text=>proposal.campaign.brand.people.filter((p:any)=>[p.id,p.name,...p.aliases].some((n:string)=>text.toLowerCase().includes(n.toLowerCase()))).map((p:any)=>p.id));
  await api('projects',{...old,caption:draft.caption,concept:draft.concept,visualSystem:draft.visualSystem,avoid:draft.avoid,slides:draft.slides.map(({gen,...s}:any)=>({...s,id:randomUUID(),image:''}))});
  await jsonFile('project-corrected',await api('projects?id='+state.projectId));console.log('CORRECTED PROPOSAL READY USD',proposal.usage?.usd);
 }else if(phase==='cover'){
  let project=await api('projects?id='+state.projectId);let idsAdded=false;for(const slide of project.slides)for(const b of slide.blocks||[])if(!b.id){b.id=randomUUID();idsAdded=true;}if(idsAdded){await api('projects',project);project=await api('projects?id='+state.projectId);}const s=project.slides[0];assert(!s.image,'Cover already exists. Inspect instead of paying again.');
  const q=await api('generate',{projectId:state.projectId,motor:project.motor,tamano:project.tamano,idempotencyKey:randomUUID(),items:[{index:0,slideId:s.id,prompt:s.photoPrompt||s.photo,people:s.people||[],slide:s}]},202);state.coverJob=q.id;await saveState();const result=await waitJob(q.id);await jsonFile('cover-result',result);
  const latest=await api('projects?id='+state.projectId);const x=result.items[0];assert.equal(x.status,'completed');if(latest.slides[0].image!==x.url)applyVisual(latest.slides[0],x);await api('projects',latest);
  const meta=await photo(x.url,'cover-provider');assert.equal(meta.width,2160);assert.equal(meta.height,2700);
  const p=await editor();await exportLocal(p,[0]);await p.screenshot({path:dir+'/cover-editor.png'});console.log('COVER READY:',JSON.stringify(meta));
 }else if(phase==='preview-local'){
  const p=await editor();await p.addStyleTag({content:await readFile('web/legacy/slides.css','utf8')});
  const app=await readFile('web/legacy/app.js','utf8'),fit=app.slice(app.indexOf('function fitSlide(el) {'),app.indexOf('// ---------------------------------------------------------------- estado'));
  await p.addScriptTag({content:fit});await p.evaluate(()=>{(window as any).eval('renderEditor()');});await exportLocal(p,[0,2,6]);
  await p.evaluate(()=>(window as any).eval('renderForExport(0)'));
  const measured=await p.evaluate(()=>{const el=document.querySelector('#export-stage .slide')!,head=el.querySelector('.blk-titulo-xl')!,word=head.querySelector('.ul')!,range=document.createRange();range.selectNodeContents(word);return {font:getComputedStyle(head).fontFamily,size:getComputedStyle(head).fontSize,wordLines:[...range.getClientRects()].filter(r=>r.width>0).length,width:head.clientWidth,scrollWidth:head.scrollWidth};});
  await jsonFile('cover-typography',measured);assert.equal(measured.wordLines,1);assert(measured.scrollWidth<=measured.width+2);console.log('TYPOGRAPHY:',JSON.stringify(measured));await p.screenshot({path:dir+'/cover-editor-fixed.png'});
 }else if(phase==='rest'){
  let project=await api('projects?id='+state.projectId);assert(project.slides[0].image,'Inspect the generated cover first.');
  const rest=project.slides.flatMap((s:any,i:number)=>i&&!s.image&&(s.photoPrompt||s.photo)?[{index:i,slideId:s.id,prompt:s.photoPrompt||s.photo,people:s.people||[],slide:s}]:[]);
  if(rest.length){await api('generate',{projectId:state.projectId,motor:project.motor,tamano:project.tamano,idempotencyKey:randomUUID(),items:rest},409);const approved=await api('projects/cover-review',{projectId:state.projectId,version:project.version});assert(approved.coverReview.signature);const q=await api('generate',{projectId:state.projectId,motor:project.motor,tamano:project.tamano,idempotencyKey:randomUUID(),items:rest},202);state.restJob=q.id;await saveState();const result=await waitJob(q.id);await jsonFile('rest-result',result);assert(result.items.every((x:any)=>x.status==='completed'));
   project=await api('projects?id='+state.projectId);await api('projects',project);
  }
  const p=await editor();await exportLocal(p,project.slides.map((_:any,i:number)=>i));await p.screenshot({path:dir+'/editor.png'});await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:dir+'/mobile.png'});console.log('ALL SLIDES RENDERED');
 }else if(phase==='export'||phase==='verify-export'){
  if(phase==='export'){const p=await editor();await p.locator('#approve-review').click();await p.waitForFunction(()=>!!(window as any).eval('state.p.review'));
  await p.locator('#exp-scale').selectOption('1');await p.locator('#btn-export-all').click();await p.waitForFunction(()=>/exportado|falló/.test(document.querySelector('#exp-title')?.textContent||''),{},{timeout:180000});assert.equal(await p.locator('#exp-title').innerText(),'Carrusel exportado');}
  const project=await api('projects?id='+state.projectId);
  const rows=ok(await db.from('entregas').select('*').eq('proyecto_id',state.projectId).eq('publicada',true).order('created_at',{ascending:false}));assert(rows.length>=8);const exportId=rows[0].exportacion_id,exported=rows.filter((r:any)=>r.exportacion_id===exportId).sort((a:any,b:any)=>a.posicion-b.posicion);assert.equal(exported.length,8);assert.deepEqual(exported.map((r:any)=>r.posicion),[0,1,2,3,4,5,6,7]);assert.deepEqual(exported.map((r:any)=>r.lamina_id),project.slides.map((s:any)=>s.id));
  for(const [i,r] of exported.entries()){const meta=await photo('storage://'+r.archivo_id,'export-'+String(i+1).padStart(2,'0'));assert.equal(meta.width,1080);assert.equal(meta.height,1350);assert.equal(meta.format,'png');}
  const delivery=(await api('deliveries')).find((d:any)=>d.id==='janica:'+exportId);assert(delivery);assert.equal(delivery.images.length,8);await jsonFile('project-final',project);await jsonFile('delivery',delivery);await jsonFile('export-checks',{projectId:state.projectId,exportId,count:8,positions:exported.map((r:any)=>r.posicion),slideIds:exported.map((r:any)=>r.lamina_id),dimensions:'1080x1350',published:true});console.log('EXPORT READY:',delivery.folder);
 }else if(phase==='inspect'){
  const project=await api('projects?id='+state.projectId);console.log(JSON.stringify({projectId:state.projectId,name:project.name,version:project.version,coverApproved:!!project.coverReview,reviewed:!!project.review,slides:project.slides.map((s:any,i:number)=>({i:i+1,template:s.template,texts:slideTexts(s),image:!!s.image,people:s.people}))},null,2));
 }else if(phase==='cleanup'){
  const jobs=ok(await db.from('trabajos').select('*').eq('user_id',state.userId));assert(!jobs.some((j:any)=>['queued','running','waiting','uncertain'].includes(j.estado)),'Unfinished job retained; do not remove its actor.');await jsonFile('jobs-receipt',jobs);
  // Preserve creator foreign keys and the paid-job ledger; revoke access before soft deletion.
  ok(await db.from('miembros').update({activo:false,rol:'lector'}).eq('user_id',state.userId));
  ok(await db.from('miembro_marca').delete().eq('user_id',state.userId));
  ok(await db.auth.admin.signOut(state.token,'global'));ok(await db.auth.admin.deleteUser(state.userId,true));
  const denied=await fetch(base+'/api/me',{headers:{...bypassHeaders,Authorization:'Bearer '+state.token}});assert([401,403].includes(denied.status));
  await jsonFile('cleanup',{accountSoftDeleted:true,membershipActive:false,sessionRevoked:true,apiDenied:denied.status,retainedProject:state.projectId,retainedJobs:jobs.length,credentialsRemoved:true});
  await unlink(statePath);console.log('Temporary account access revoked and soft-deleted; project and job history retained:',state.projectId);
 }else throw Error('Unknown phase');
}finally{await browser?.close();}
