import {readFile,writeFile,mkdir,copyFile,cp,rm} from 'node:fs/promises';import {build} from 'esbuild';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const name of ['app.css','slides.css','marcas.js'])await copyFile(`web/legacy/${name}`,`dist/${name}`);
let app=await readFile('web/legacy/app.js','utf8');
const begin=app.indexOf('async function api(path, body) {'),end=app.indexOf('\nlet toastTimer;',begin);if(begin<0||end<0)throw new Error('Contrato del cliente cambió: revisar adaptador.');
app=app.slice(0,begin)+'async function api(path, body) { return window.cloudApi(path, body); }\n'+app.slice(end);
app=app.replace('localStorage.getItem(k)','localStorage.getItem(window.cloudStorageKey(k))').replace('localStorage.setItem(k, v)','localStorage.setItem(window.cloudStorageKey(k), v)');
app=app.replace("['editor', 'requests', 'deliveries', 'brands'].includes(q.get('view'))","['editor', 'requests', 'deliveries', 'brands', 'reels'].includes(q.get('view'))");
app=app.replace('setupDictation();\ninit();',"window.cloudCurrentBrand = () => state.p?.brand || ideaBrand;\nwindow.cloudRebindUrls = changes => {const walk=v=>typeof v==='string'?(changes.get(v)||v):Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):v;Object.assign(state,walk(state));Object.assign(mk,walk(mk));BRANDS=walk(BRANDS);if(state.view==='editor')renderEditor();};\nwindow.cloudRecoverProposal = async (brief, d) => { if(brief.requestId) { const requests=await api('/api/requests'); const r=requests.find(x=>x.id===brief.requestId); if(!r)throw new Error('La solicitud ya no está disponible.'); return createRequestCarousel(r,d,brief); } if(!brief.marca) { mk.draft = {...d, name: brief.name, brand: {name: brief.name, design: 'base', theme: d.theme, colors: {accent:d.accent,darkBg:d.darkBg,darkInk:d.darkInk,lightBg:d.lightBg,lightInk:d.lightInk},fonts:{display:d.displayFont,body:d.bodyFont},defaults:{audiencia:d.audiencia,cta:d.cta,idioma:d.idioma,objetivo:d.objetivo}}}; mk.sel={type:'new'}; showView('brands'); return; } state.draft={brief,brand:brief.marca,name:d.name,concept:d.concept,caption:d.caption,visualSystem:d.visualSystem||'',avoid:d.avoid||'',slides:d.slides.map(s=>({...s,gen:!!(s.photoPrompt||s.photo)})),usage:d.usage,claudeUsd:d.usage?.usd||0};saveDraft();showView('create'); };\nwindow.cloudShowDeliveries = () => showView('deliveries');\nwindow.cloudOpenFolder = (path = '') => { if(path.startsWith('06_MARCAS/')) { mk.sel = {type: 'brand', id: path.split('/')[1]}; showView('brands'); } else showView(path.includes('SOLICITUDES') ? 'requests' : 'deliveries'); };\nsetupDictation();\ninit();");
await writeFile('dist/app.js',app);
let html=await readFile('web/legacy/index.html','utf8');html=html.replace(/<link rel="icon"[^>]+>/,'<link rel="icon" href="/favicon.svg">').replace('</head>','<link rel="stylesheet" href="cloud.css">\n</head>');
const login=await readFile('web/login.html','utf8');html=html.replace('<body>','<body>\n'+login+'\n<div id="studio-shell" hidden>');
html=html.replace('<script src="marcas.js"></script>\n<script src="app.js"></script>','</div>\n<script type="module" src="/cloud.js"></script>');
// Pestaña Reels (web/reels.js): botón en la barra y su vista; el módulo la llena al iniciar sesión.
html=html.replace('<button class="tab" data-view="brands" role="tab">Marcas</button>','<button class="tab" data-view="brands" role="tab">Marcas</button>\n    <button class="tab" data-view="reels" role="tab">Reels</button>').replace('</div>\n<script type="module" src="/cloud.js"></script>','<main class="view" id="view-reels" hidden></main>\n</div>\n<script type="module" src="/cloud.js"></script>').replace('</head>','<link rel="stylesheet" href="reels.css">\n</head>');
if(!html.includes('data-view="reels"')||!html.includes('id="view-reels"'))throw new Error('No se pudo añadir la pestaña Reels: revisar index.html.');
await writeFile('dist/index.html',html);await copyFile('web/cloud.css','dist/cloud.css');await copyFile('web/reels.css','dist/reels.css');
// Con splitting, lo que se importa bajo demanda (p. ej. la librería de Word de Reels) sale en dist/chunks/.
await build({entryPoints:['web/cloud.js'],outdir:'dist',entryNames:'[name]',chunkNames:'chunks/[name]-[hash]',splitting:true,bundle:true,format:'esm',minify:true,target:'es2022'});
console.log('Interfaz compilada sin modificar el Estudio local.');
await copyFile('web/password.html','dist/password.html');
await build({entryPoints:['web/password.js'],outfile:'dist/password.js',bundle:true,format:'esm',minify:true,target:'es2022'});

await mkdir('dist/mediapipe',{recursive:true});
await cp('node_modules/@mediapipe/tasks-vision/wasm','dist/mediapipe/wasm',{recursive:true});
await copyFile('web/models/selfie_segmenter.tflite','dist/mediapipe/selfie_segmenter.tflite');

await copyFile('web/favicon.svg','dist/favicon.svg');
