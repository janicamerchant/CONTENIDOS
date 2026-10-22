// Browser regression with an in-memory API. No .env, provider calls or production data.
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const contract=(await build({entryPoints:['shared/carousel.ts'],bundle:true,format:'iife',globalName:'CarouselFixture',write:false})).outputFiles[0].text;
const bootstrap=`(function(){
window.carouselContract=CarouselFixture;window.cloudPersistent=v=>v;
const photo=(()=>{const c=document.createElement('canvas');c.width=108;c.height=135;c.getContext('2d').fillRect(0,0,108,135);return c.toDataURL();})();
const brand={id:'fixture',name:'Fixture',file:'FIXTURE',design:'base',modo:'foto',theme:'light',fonts:{display:'Arial',body:'Arial'},colors:{accent:'#123ABC',lightBg:'#F3EEE6',lightInk:'#222222',darkBg:'#222222',darkInk:'#FFFFFF'},people:[],logos:{},defaults:{idioma:'Español'}};
let project={id:'p-fixture',brand:'fixture',name:'Prueba de consistencia',version:1,modo:'foto',campaign:{brand,signature:'fixture'},slides:[{id:'slide-A',layout:'frase',theme:'light',title:'Primera idea',photo:'A room',photoPrompt:'A room',image:photo},{id:'slide-B',layout:'frase',theme:'light',title:'Segunda idea',photo:'Another room',photoPrompt:'Another room',image:photo}]};
window.fixture={exports:[],commits:[],generated:null,complete:false,patterns:0};
window.htmlToImage={getFontEmbedCSS:async()=>'',toPng:async()=>photo};
window.cloudApi=async(path,body)=>{
 if(path==='/api/brands')return {brands:[structuredClone(brand)]};
 if(path==='/api/config')return {hasKey:true,layersAvailable:true,motorDefecto:'hf_flare',motores:[{id:'hf_flare',nombre:'Flare',proveedor:'Fixture',disponible:true,tamanos:{'2k':null},modes:['foto','completa','editable']}]};
 if(path==='/api/projects'&&!body)return [{id:project.id}];
 if(path.startsWith('/api/projects?id='))return structuredClone(project);
 if(path==='/api/projects'&&body){const review=project.review&&CarouselFixture.reviewRevision(project)===CarouselFixture.reviewRevision(body)?project.review:null;const coverReview=project.coverReview&&CarouselFixture.coverRevision(project)===CarouselFixture.coverRevision(body)?project.coverReview:null;project={...structuredClone(body),review,coverReview,version:project.version+1};return {id:project.id,version:project.version,campaign:project.campaign,review,coverReview};}
 if(path==='/api/projects/review'){project.review={approvedAt:new Date().toISOString(),signature:'fixture'};project.version++;return {id:project.id,version:project.version,review:project.review};}
 if(path==='/api/projects/cover-review'){project.coverReview={signature:'fixture'};project.version++;return {id:project.id,version:project.version,coverReview:project.coverReview};}
 if(path==='/api/projects/pattern'){fixture.patterns++;return {ok:true};}
 if(path==='/api/requests')return [];
 if(path==='/api/assets')return [];
 if(path==='/api/export'){fixture.exports.push(structuredClone(body));return {url:photo,path:body.folder+'/'+body.filename+'.png'};}
 if(path==='/api/deliveries/commit'){fixture.commits.push(body);return {ok:true};}
 if(path==='/api/generate'){fixture.generated=structuredClone(body);fixture.complete=false;return {id:'batch'};}
 if(path.startsWith('/api/generate?id=')){return {done:fixture.complete,items:fixture.complete?fixture.generated.items.map(item=>{const s=project.slides.find(s=>s.id===item.slideId);return {index:item.index,slideId:item.slideId,revision:CarouselFixture.slideRevision(s),originalImage:s.image,status:'completed',url:photo+'#new',full:false,motor:'hf_flare'};}):[]};}
 if(path.startsWith('/api/projects/results'))return [];
 throw new Error('Unexpected fixture API: '+path);
};})();`;
let html=await readFile('web/legacy/index.html','utf8');
html=html.replace(/<script[^>]+src=["'][^"']+["'][^>]*><\/script>/g,'').replace(/<link[^>]+href=["']https:[^>]+>/g,'');
html=html.replace('</head>','<link rel="stylesheet" href="/cloud.css"></head>');
html=html.replace('</body>','<script>'+contract+'</script><script>'+bootstrap+'</script><script src="/marcas.js"></script><script src="/app.js"></script></body>');
const server=createServer(async(req,res)=>{try{if(req.url?.startsWith('/?')||req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const name=req.url.slice(1).split('?')[0];if(!['app.js','app.css','slides.css','marcas.js','cloud.css'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile('dist/'+name));}catch(e){res.writeHead(500).end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/?view=editor&p=p-fixture');await page.waitForFunction(()=>typeof state!=='undefined'&&state.p?.id==='p-fixture');
 await page.locator('#approve-review').click();await page.waitForFunction(()=>!!state.p.review);
 await page.locator('#btn-export-all').click();await page.getByText('Carrusel exportado',{exact:true}).waitFor();
 let result=await page.evaluate(()=>({exports:fixture.exports.map(({dataUrl,...m})=>m),commits:fixture.commits}));
 assert.deepEqual(result.exports.map(x=>x.slideId),['slide-A','slide-B']);assert.deepEqual(result.exports.map(x=>x.position),[0,1]);assert.equal(result.commits.length,1);
 await page.locator('#dlg-export').evaluate(e=>e.close());await page.locator('#btn-export-all').click();await page.waitForFunction(()=>fixture.commits.length===2);
 result=await page.evaluate(()=>({exports:fixture.exports.map(({dataUrl,...m})=>m),commits:fixture.commits}));assert.notEqual(result.commits[0].exportId,result.commits[1].exportId);
 await page.locator('#dlg-export').evaluate(e=>e.close());
 // Start regeneration, move its target before completion, then recover the correct ID.
 await page.evaluate(()=>regenerateInEditor(0));
 await page.evaluate(()=>{state.p.slides.reverse();renderEditor();fixture.complete=true;});await page.evaluate(()=>pollEditorGen());
 const regenerated=await page.evaluate(()=>state.p.slides.map(s=>({id:s.id,image:s.image,previous:!!s.previousVisual})));
 assert.equal(regenerated[0].id,'slide-B');assert.equal(regenerated[0].previous,false);assert.ok(regenerated[1].image.endsWith('#new'));assert.equal(regenerated[1].previous,true);
 await page.evaluate(()=>{select(1);});await page.locator('#undo-photo').click();assert.ok(!(await page.evaluate(()=>cur().image)).endsWith('#new'));
 assert.equal(await page.evaluate(()=>state.p.review),null);
 await page.locator('#btn-export-all').click();assert.equal(await page.locator('#dlg-export').evaluate(e=>e.open),false);
 // A persistent typography override remains on the frozen campaign's font and palette.
 const typography=await page.evaluate(()=>{const el=document.querySelector('#stage-inner .slide');return {font:getComputedStyle(el.querySelector('.s-title')).fontFamily,accent:getComputedStyle(el).getPropertyValue('--lime')};});
 assert.match(typography.font,/Arial/);assert.equal(typography.accent.trim(),'#123ABC');
 await mkdir('artifacts/consistency-fix',{recursive:true});await page.screenshot({path:'artifacts/consistency-fix/editor.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 await page.screenshot({path:'artifacts/consistency-fix/mobile.png'});
 // The actual Create UI sends only the cover, then the Editor unlocks the remaining slide.
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(async()=>{
  const campaign=state.p.campaign;state.draft={brand:'fixture',modo:'foto',name:'Portada primero',campaign,slides:[{id:'cover',layout:'frase',theme:'light',title:'Portada de prueba',photo:'A room',photoPrompt:'A room',gen:true},{id:'rest',layout:'frase',theme:'light',title:'Idea pendiente',photo:'A desk',photoPrompt:'A desk',gen:true},{id:'rest-2',layout:'frase',theme:'light',title:'Otra idea pendiente',photo:'A window',photoPrompt:'A window',gen:true}]};
  showView('create');await approve();
 });
 assert.deepEqual(await page.evaluate(()=>fixture.generated.items.map(s=>s.slideId)),['cover']);
 await page.evaluate(async()=>{fixture.complete=true;await pollGeneration();await openProject(state.draft.projectId);});
 await page.locator('#approve-cover').click();await page.waitForFunction(()=>!!state.p.coverReview);
 await page.locator('#generate-remaining').click();await page.waitForFunction(()=>fixture.generated.items[0]?.slideId==='rest');assert.deepEqual(await page.evaluate(()=>fixture.generated.items.map(s=>s.slideId)),['rest','rest-2']);
 await page.evaluate(async()=>{fixture.complete=true;await pollEditorGen();await saveProject();});
 assert.ok(await page.evaluate(()=>state.p.slides.every(s=>!!s.image)));assert.ok(await page.evaluate(()=>!!state.p.coverReview));
 await page.locator('#approve-review').click();await page.waitForFunction(()=>!!state.p.review);
 await page.locator('#save-brand-pattern').click();await page.waitForFunction(()=>fixture.patterns===1);
 await page.evaluate(async()=>{state.p.slides[0].title='Portada cambiada';await saveProject();renderInspector();});
 assert.equal(await page.evaluate(()=>state.p.coverReview),null);assert.equal(await page.locator('#generate-remaining').count(),0);
 assert.deepEqual(errors,[]);await writeFile('artifacts/consistency-fix/browser.json',JSON.stringify({passed:true,exports:result.exports,commits:result.commits,typography,errors},null,2));
 console.log('Chrome: revisión, doble exportación, orden, identidad al reordenar, deshacer, fuentes, móvil, portada aprobable y patrón de marca: OK.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
