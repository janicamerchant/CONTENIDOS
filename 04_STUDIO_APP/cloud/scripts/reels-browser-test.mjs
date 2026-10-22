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
const proyecto={id:'p1',marca:'janica',tipo:'largo',info:{titulo:'Atención <Janica>'},transcripcion:{texto:'Una transcripción.',parrafos:[]},analisis:{guiones,puntos_clave:[]},videos:{},video_config:{}};
window.fixture={writes:[],failProject:false};
const request=async(path,body)=>{
 if(body)fixture.writes.push({path,body});
 if(path==='/api/reels/config')return {deepgram:true,apify:true,anthropic:true,video:{higgsfield:true}};
 if(path==='/api/reels/clientes')return [{id:'janica',nombre:'Janica',estilos:[]},{id:'city',nombre:'City Kia',estilos:[]},{id:'empty',nombre:'Sin proyectos',estilos:[]}];
 if(path==='/api/people')return [{id:'janica-persona',name:'Janica',brands:['janica']}];
 if(path==='/api/reels/proyectos')return [{id:'p1',marca:'janica',tipo:'largo',titulo:'Atención <Janica>',guiones:2},{id:'p2',marca:'city',titulo:'City Kia',guiones:1},{id:'p3',marca:'empty',titulo:'Solo transcripción',guiones:0}];
 if(path.startsWith('/api/reels/proyectos?id=')){
  if(fixture.failProject)throw new Error('No se pudo cargar el proyecto.');
  return structuredClone(path.endsWith('p2')?{...proyecto,id:'p2',marca:'city',videos:{},analisis:{guiones:[{...guiones[0],cliente_id:'city'}]}}:proyecto);
 }
 if(path==='/api/reels/proyectos/p1/video'){
  const p=structuredClone(plan);p.clips.forEach(c=>{c.modelo=body.configuracion.motor;c.voz_off=!!body.configuracion.audioNarracion;});
  proyecto.videos[body.guion]={persona:body.persona,plan:p,configuracion:body.configuracion,revision_actual:'fixture',imagenes:[]};return {grupo:'fixture'};
 }
 if(path==='/api/reels/proyectos/p1/video-config'){proyecto.video_config[body.guion]=body.configuracion;return {configuracion:body.configuracion};}
 if(path==='/api/reels/proyectos/p1/video-plan'){proyecto.videos[body.guion].plan=body.plan;return {ok:true};}
 if(path==='/api/reels/proyectos/p1/video-imagenes'){
  for(const i of body.clips)proyecto.videos[body.guion].imagenes[i]={archivo:'storage://image-'+i,aprobada:false,base:i?proyecto.videos[body.guion].imagenes[0].archivo:null};return {grupo:'fixture'};
 }
 if(path==='/api/reels/proyectos/p1/video-clips'){const v=proyecto.videos[body.guion];v.clips??=[];v.clips[body.clip]={archivo:'storage://video-'+body.clip,revision:'fixture'};return {grupo:'fixture'};}
 if(path==='/api/reels/proyectos/p1/video-montaje'){const v=proyecto.videos[body.guion];v.montaje={archivo:'storage://final',revision:'fixture',clips:v.clips.map(c=>c.archivo)};return {grupo:'fixture'};}
 if(path==='/api/reels/proyectos/p1/video-aprobar'){proyecto.videos[body.guion].imagenes[body.clip].aprobada=body.aprobada;return {ok:true};}
 if(path.startsWith('/api/reels/trabajos?'))return {done:true,items:[{op:'plan_video',estado:'succeeded',proyecto:'p1'}]};
 throw new Error('Unexpected fixture request: '+path);
};
setupReels({request,role:new URLSearchParams(location.search).get('role')||'admin',uploadBlob:async(blob,name,scope)=>{fixture.upload={name,scope,mime:blob.type};fixture.uploadCount=(fixture.uploadCount||0)+1;return '00000000-0000-4000-8000-'+String(fixture.uploadCount).padStart(12,'0');},resolve:async refs=>refs.map(()=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="160"><rect width="90" height="160" fill="tan"/></svg>'))});`;
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
 await page.locator('[data-v-cfg="motor"]').selectOption('seedance_2_5');
 await page.locator('[data-v-cfg="segundos"]').fill('20');
 await page.locator('[data-v-cfg="escena"]').fill('Mi oficina');
 await page.locator('[data-v-cfg="vestuario"]').fill('Blazer azul');
 await page.locator('[data-v-audio-referencia]').setInputFiles(['calmada.wav','conversacional.wav'].map(name=>({name,mimeType:'audio/wav',buffer:Buffer.from('RIFF0000WAVE')})));
 await page.getByText('Referencias guardadas.',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-v-referencia-quitar]').count(),2);
 assert.equal(await page.locator('[data-v-audio]').isDisabled(),true);assert.equal(await page.locator('[data-v-cfg="generarAudio"]').isChecked(),true);
 const refs=await page.evaluate(()=>fixture.writes.filter(w=>w.path.endsWith('/video-config')).at(-1).body.configuracion.audiosReferencia);
 assert.deepEqual(refs.map(r=>r.nombre),['calmada.wav','conversacional.wav']);
 assert.equal(await page.locator('[data-v-referencias] audio[data-ref]').count(),2);
 await page.locator('[data-v-audio-referencia]').setInputFiles(['extra1.wav','extra2.wav'].map(name=>({name,mimeType:'audio/wav',buffer:Buffer.from('RIFF0000WAVE')})));
 await page.getByText('Puedes guardar hasta 3 audios de referencia.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>fixture.uploadCount),2);
 await page.locator('[data-v-cfg="motor"]').selectOption('kling_3');assert.equal(await page.locator('[data-v-audio-referencia]').isDisabled(),true);
 await page.locator('[data-v-cfg="motor"]').selectOption('seedance_2_5');
 await page.locator('#rl-video-guion').selectOption('g2');await page.locator('#rl-video-guion').selectOption('g1');
 await page.waitForFunction(()=>document.querySelectorAll('[data-v-referencia-quitar]').length===2);
 assert.equal(await page.locator('[data-v-audio]').isDisabled(),true);
 await page.locator('[data-v-audio-referencia]').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/reels-navigation/referencias-de-voz.png'});
 await page.locator('[data-v-referencia-quitar]').first().click();await page.waitForFunction(()=>document.querySelectorAll('[data-v-referencia-quitar]').length===1);
 await page.locator('[data-v-referencia-quitar]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-v-referencia-quitar]').length===0);
 assert.equal(await page.locator('[data-v-audio]').isEnabled(),true);
 await page.locator('[data-v-audio]').setInputFiles({name:'mi-voz.wav',mimeType:'audio/wav',buffer:Buffer.from('RIFF0000WAVE')});
 await page.getByText('Narración subida y guardada.',{exact:false}).waitFor();
 assert.equal(await page.locator('[data-v-cfg="generarAudio"]').isChecked(),false);
 assert.equal(await page.locator('[data-v-cfg="generarAudio"]').isDisabled(),true);
 assert.equal(await page.locator('audio').isVisible(),true);
 assert.deepEqual(await page.evaluate(()=>fixture.upload),{name:'mi-voz.wav',scope:{brand:'janica'},mime:'audio/wav'});
 await page.screenshot({path:'artifacts/reels-navigation/configuracion.png'});
 await page.locator('[data-v-planear]').click();
 await page.locator('[data-v-plan="escena"]').waitFor({state:'visible'});
 const pedido=await page.evaluate(()=>fixture.writes.find(w=>w.path.endsWith('/video')));
 assert.equal(pedido.body.guion,'g1');assert.equal(pedido.body.persona,'janica-persona');
 assert.equal(pedido.body.configuracion.motor,'seedance_2_5');assert.equal(pedido.body.configuracion.segundos,20);assert.equal(pedido.body.configuracion.vestuario,'Blazer azul');
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
 page.on('dialog',d=>d.accept());
 await page.locator('[data-v-clip="0"]').click();
 await page.getByRole('button',{name:'Descargar clip',exact:true}).waitFor();
 assert.equal(await page.locator('[data-v-montar]').isDisabled(),true);
 await page.locator('[data-v-img="1"]').click();
 await page.locator('[data-v-aprobar="1"]').check();
 await page.waitForFunction(()=>!document.querySelector('[data-v-clip="1"]').disabled);
 await page.locator('[data-v-clip="1"]').click();
 await page.waitForFunction(()=>!document.querySelector('[data-v-montar]').disabled);
 await page.locator('[data-v-montar]').click();
 await page.getByRole('button',{name:'Descargar video completo',exact:true}).waitFor();
 await page.locator('.rl-config-resumen').evaluate(e=>{e.open=true;});
 assert.equal(await page.locator('[data-v-cfg="vestuario"]').inputValue(),'Blazer azul','configuration survives reload');
 assert.equal(await page.locator('[data-v-audio-nombre]').textContent(),'mi-voz.wav');
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
