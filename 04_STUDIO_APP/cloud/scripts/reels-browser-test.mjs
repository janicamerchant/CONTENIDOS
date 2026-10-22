// Navigation and UGC workflow against an in-memory API: no credentials, providers or production writes.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';

const module=(await build({entryPoints:['web/reels.js'],bundle:true,format:'esm',write:false})).outputFiles[0].text;
const css=await Promise.all(['web/legacy/app.css','web/reels.css'].map(p=>readFile(p,'utf8')));
const bootstrap=`import {setupReels} from '/reels.js';
window.cloudStorageKey=k=>'fixture-'+k;
localStorage.setItem('fixture-reels-tab','largo');
const clip={frase:'Una sola tarea.',modelo:'omni',segundos:4,que_se_ve:'Sentada en la oficina.',prompt_imagen:'Office, natural light.',camera:'Static.',movement:'none',micro_action:'Smiles.'};
const plan={escena:'Una oficina luminosa.',sujeto:'she',voice:'Warm.',accent:'Venezuelan Spanish.',clips:[clip,{...clip,frase:'Anota la urgencia.'}]};
const guiones=[{id:'g1',titulo:'El bloque de 90 minutos',cliente_id:'janica',guion:'Una sola tarea. Anota la urgencia.'},{id:'g2',titulo:'Otro guion',cliente_id:'janica',guion:'Lo que anotas lo decides tú.'}];
const proyecto={id:'p1',marca:'janica',tipo:'largo',info:{titulo:'Atención <Janica>'},transcripcion:{texto:'Una transcripción.',parrafos:[]},analisis:{guiones,puntos_clave:[]},videos:{}};
window.fixture={writes:[],failProject:false};
const request=async(path,body)=>{
 if(body)fixture.writes.push({path,body});
 if(path==='/api/reels/config')return {deepgram:true,apify:true,anthropic:true};
 if(path==='/api/reels/clientes')return [{id:'janica',nombre:'Janica',estilos:[]},{id:'city',nombre:'City Kia',estilos:[]},{id:'empty',nombre:'Sin proyectos',estilos:[]}];
 if(path==='/api/people')return [{id:'janica-persona',name:'Janica',brands:['janica']}];
 if(path==='/api/reels/proyectos')return [{id:'p1',marca:'janica',tipo:'largo',titulo:'Atención <Janica>',guiones:2},{id:'p2',marca:'city',titulo:'City Kia',guiones:1},{id:'p3',marca:'empty',titulo:'Solo transcripción',guiones:0}];
 if(path.startsWith('/api/reels/proyectos?id=')){
  if(fixture.failProject)throw new Error('No se pudo cargar el proyecto.');
  return structuredClone(path.endsWith('p2')?{...proyecto,id:'p2',marca:'city',videos:{},analisis:{guiones:[{...guiones[0],cliente_id:'city'}]}}:proyecto);
 }
 if(path==='/api/reels/proyectos/p1/video'){
  proyecto.videos[body.guion]={persona:body.persona,plan:structuredClone(plan),imagenes:[]};return {grupo:'fixture'};
 }
 if(path==='/api/reels/proyectos/p1/video-plan'){proyecto.videos[body.guion].plan=body.plan;return {ok:true};}
 if(path==='/api/reels/proyectos/p1/video-imagenes'){
  for(const i of body.clips)proyecto.videos[body.guion].imagenes[i]={archivo:'storage://image-'+i,aprobada:false};return {grupo:'fixture'};
 }
 if(path==='/api/reels/proyectos/p1/video-aprobar'){proyecto.videos[body.guion].imagenes[body.clip].aprobada=body.aprobada;return {ok:true};}
 if(path.startsWith('/api/reels/trabajos?'))return {done:true,items:[{op:'plan_video',estado:'succeeded',proyecto:'p1'}]};
 throw new Error('Unexpected fixture request: '+path);
};
setupReels({request,role:new URLSearchParams(location.search).get('role')||'admin',resolve:async refs=>refs.map(()=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="160"><rect width="90" height="160" fill="tan"/></svg>'))});`;
const server=createServer((req,res)=>{
 if(req.url==='/reels.js'){res.setHeader('Content-Type','text/javascript');res.end(module);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<style>${css.join('\n')}#view-reels{height:100vh}</style><main id="view-reels"></main><script type="module">${bootstrap}</script>`);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 await page.goto(origin+'/?view=reels');
 await page.locator('#rl-tab-largo').waitFor({state:'visible'});
 await page.getByRole('tab',{name:'Video UGC',exact:true}).click();
 await page.locator('#rl-video-cliente').selectOption('janica');
 assert.equal(await page.locator('[data-video-proyecto]').count(),1);
 await mkdir('artifacts/reels-navigation',{recursive:true});
 await page.screenshot({path:'artifacts/reels-navigation/entrada.png'});
 await page.getByRole('button',{name:'Elegir guion'}).click();
 await page.locator('[data-v-planear]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-video]').evaluate(e=>e.open),true);
 assert.equal(await page.locator('#rl-video-editor h3').textContent(),'Atención <Janica>');
 assert.equal(await page.locator('#rl-video-editor h3 janica').count(),0,'project title is escaped');
 await page.locator('[data-v-planear]').click();
 await page.locator('[data-v-plan="escena"]').waitFor({state:'visible'});
 const pedido=await page.evaluate(()=>fixture.writes[0]);
 assert.equal(pedido.body.guion,'g1');assert.equal(pedido.body.persona,'janica-persona');
 assert.equal(await page.locator('[data-v-img="1"]').isDisabled(),true);
 await page.locator('[data-v-plan="escena"]').fill('La escena revisada.');
 await page.locator('[data-v-guardar]').click();
 await page.waitForFunction(()=>fixture.writes.some(w=>w.path.endsWith('video-plan')));
 await page.waitForFunction(()=>!document.querySelector('[data-v-guardar]').disabled);
 assert.equal(await page.locator('[data-v-plan="escena"]').inputValue(),'La escena revisada.');
 await page.locator('[data-v-img="0"]').click();
 await page.locator('[data-v-aprobar="0"]').check();
 await page.waitForFunction(()=>!document.querySelector('[data-v-imgs]').disabled);
 assert.equal(await page.locator('[data-v-img="1"]').isEnabled(),true);
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile fits viewport');
 await page.screenshot({path:'artifacts/reels-navigation/plan-mobile.png'});
 await page.locator('#rl-video-guion').selectOption('g2');
 await page.locator('[data-v-planear]').waitFor({state:'visible'});
 await page.getByRole('button',{name:'← Cambiar proyecto'}).click();
 await page.locator('#rl-video-cliente').selectOption('empty');
 assert.equal(await page.locator('[data-video-proyecto]').count(),0);
 await page.getByText('Todavía no hay proyectos con guiones',{exact:false}).waitFor();
 await page.locator('#rl-video-cliente').selectOption('city');
 await page.getByRole('button',{name:'Elegir guion'}).click();
 await page.getByText('Asocia una persona a este cliente',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-v-planear]').isDisabled(),true);
 await page.getByRole('button',{name:'← Cambiar proyecto'}).click();
 await page.locator('#rl-video-cliente').selectOption('janica');
 await page.evaluate(()=>{fixture.failProject=true;});
 await page.getByRole('button',{name:'Elegir guion'}).click();
 await page.getByText('No se pudo cargar el proyecto.',{exact:true}).waitFor();
 await page.evaluate(()=>{fixture.failProject=false;});
 await page.getByRole('button',{name:'Volver a los proyectos'}).click();
 await page.getByRole('tab',{name:'Historial',exact:true}).click();
 await page.locator('#rl-lista [data-id="p1"]').click();
 await page.locator('#rl-proyecto [data-v-plan="escena"]').waitFor({state:'visible'});
 assert.equal(await page.locator('[id="rl-jobs-video-g1"]').count(),1,'one workspace per script');
 await page.goto(origin+'/?view=reels&tab=video&role=lector');
 await page.locator('[data-video-proyecto="p1"]').click();
 await page.locator('[data-v-planear]').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-v-planear]').isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log('Chrome: visible Video UGC tab, deep link, client/script selection, plan/save/image/approval, empty/error states, existing project view, mobile and read-only role: OK.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
