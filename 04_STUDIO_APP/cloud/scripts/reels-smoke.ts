// Prueba real de transcripción sin base de datos: enlace → Apify → audio → Deepgram. Consume créditos (centavos).
// Uso: npx tsx scripts/reels-smoke.ts <enlace> [idioma]
import {loadLocalEnv} from '../src/config.js';
loadLocalEnv();
const {herramientas:h}=await import('../src/reels.js');
const url=process.argv[2];if(!url)throw new Error('Indica un enlace.');
const p=h.plataforma(url),a=h.actor(p);console.log('plataforma',p,'actor',a.id);
const run=(await h.apify(`acts/${a.id.replace('/','~')}/runs?timeout=600&maxTotalChargeUsd=1`,{method:'POST',body:JSON.stringify(a.input(url))})).data;
let r=run;while(['READY','RUNNING'].includes(r.status)){await new Promise(x=>setTimeout(x,4000));r=(await h.apify('actor-runs/'+r.id)).data;process.stdout.write('.');}
console.log('\nestado',r.status,'usd',r.usageTotalUsd);
const items=await h.apify(`datasets/${r.defaultDatasetId}/items?clean=true&limit=5`);console.log('campos',Object.keys(items[0]||{}).join(','));
const m=h.medioDe(items[0]||{});console.log('medio',m.url?.slice(0,90),m.info);if(!m.url)process.exit(1);
const u=new URL(m.url);const media=await fetch(u,{headers:u.hostname==='api.apify.com'?{Authorization:'Bearer '+process.env.APIFY_TOKEN}:{}});console.log('descarga',media.status,media.headers.get('content-type'),media.headers.get('content-length'));
const t=await h.deepgram(process.argv[3]||'multi',{stream:media.body!,tipo:media.headers.get('content-type')?.split(';')[0]||'application/octet-stream'});
console.log('segundos',t.segundos,'usd',t.usd.toFixed(4));console.log(t.transcripcion.parrafos.slice(0,3));console.log(t.transcripcion.texto.slice(0,300));
