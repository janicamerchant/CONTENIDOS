import {Upload} from 'tus-js-client';
import {cutoutPerson} from './cutout.js';
import {openTeam} from './team.js';
import {setupReels} from './reels.js';
import {createClient} from '@supabase/supabase-js';
let client,me,storageEndpoint;const reverse=new Map();let saveQueue=Promise.resolve();
export async function request(path,body){
 const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Tu sesión terminó. Vuelve a entrar.');
 const r=await fetch(path,{method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(45000),headers:{Authorization:`Bearer ${session.access_token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo completar la operación.');return data;
}
const signedCache=new Map();
async function resolve(value){
 const ids=new Set();const scan=v=>{if(typeof v==='string'&&v.startsWith('storage://'))ids.add(v.slice(10));else if(Array.isArray(v))v.forEach(scan);else if(v&&typeof v==='object')Object.values(v).forEach(scan);};scan(value);
 const pending=[...ids].filter(id=>!signedCache.has(id)||signedCache.get(id).until<Date.now());
 for(let i=0;i<pending.length;i+=300){const batch=pending.slice(i,i+300);const {urls}=await request('/api/assets/sign-batch',{ids:batch});for(const id of batch){const url=urls[id];if(url){signedCache.set(id,{url,until:Date.now()+3000000});reverse.set(url,'storage://'+id);}}}
 const walk=v=>{if(typeof v==='string'&&v.startsWith('storage://'))return signedCache.get(v.slice(10))?.url||'';if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)]));return v;};return walk(value);
}
async function referenceImage(blob){
 if(!blob.type.startsWith('image/'))return blob;
 const img=await createImageBitmap(blob);const scale=Math.min(1,1600/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);img.close();return new Promise(r=>c.toBlob(r,'image/jpeg',.9));
}
// Sube a una ruta firmada de un solo uso: TUS (por partes) para archivos grandes, una sola petición para los pequeños.
async function uploadSigned(blob,{bucket='estudio',path,token,mime}){
 if(blob.size>512000){
  const {data:{session}}=await client.auth.getSession();
  await new Promise((resolve,reject)=>{const upload=new Upload(blob,{endpoint:storageEndpoint,retryDelays:[0,1000,3000],chunkSize:6*1024*1024,uploadDataDuringCreation:false,removeFingerprintOnSuccess:true,headers:{authorization:'Bearer '+session.access_token,'x-signature':token},metadata:{bucketName:bucket,objectName:path,contentType:mime,cacheControl:'3600'},onBeforeRequest:req=>{const xhr=req.getUnderlyingObject();if(xhr instanceof XMLHttpRequest)xhr.timeout=45000;},onError:()=>reject(new Error('La subida se interrumpió. Revisa tu conexión e inténtalo de nuevo.')),onSuccess:resolve});upload.start();});
 }else{const upload=await client.storage.from(bucket).uploadToSignedUrl(path,token,blob,{contentType:mime});if(upload.error)throw new Error('No se pudo subir el archivo: '+upload.error.message);}
}
async function uploadBlob(blob,name,scope){
 const mime=blob.type||(/\.md$/i.test(name)?'text/markdown':/\.txt$/i.test(name)?'text/plain':'application/octet-stream');
 const item=await request('/api/assets/upload',{...scope,name,mime,bytes:blob.size});
 await uploadSigned(blob,{path:item.path,token:item.token,mime});
 await request('/api/assets/finalize',{id:item.id});return item.id;
}
window.cloudRefreshImages=async()=>{
 if(![...signedCache.values()].some(v=>v.until<Date.now()))return;
 try{const prior=new Map([...signedCache].map(([id,v])=>[id,v.url]));await resolve([...prior.keys()].map(id=>'storage://'+id));const changes=new Map([...prior].map(([id,url])=>[url,signedCache.get(id)?.url||url]));
  for(const element of document.querySelectorAll('img[src],a[href]')){const key=element.tagName==='IMG'?'src':'href';const before=element.getAttribute(key);if(changes.has(before))element.setAttribute(key,changes.get(before));}
  window.cloudRebindUrls?.(changes);
 }catch{/* Preserve the current view on a temporary network failure. */}
};
setInterval(()=>{if(!document.hidden)window.cloudRefreshImages();},60000);
function persistent(value){if(typeof value==='string')return reverse.get(value)??value;if(Array.isArray(value))return value.map(persistent);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,persistent(v)]));return value;}
const versions=new Map(),cutouts=new Map(),brandVersions=new Map();
window.cloudApi=async(path,body)=>{
 if(body)body=persistent(body);
 if(['/api/propose','/api/draft','/api/brands/_draft','/api/generate','/api/layers'].includes(path)&&body){
  const fingerprint=JSON.stringify([path,body]);const pendingKey=window.cloudStorageKey('pending-ai');let pending;try{pending=JSON.parse(sessionStorage.getItem(pendingKey));}catch{}
  const key=pending?.fingerprint===fingerprint?pending.key:crypto.randomUUID();sessionStorage.setItem(pendingKey,JSON.stringify({fingerprint,key}));
  let active;try{active=JSON.parse(sessionStorage.getItem(window.cloudStorageKey('active-ai')));}catch{}
  const submitted=active?.fingerprint===fingerprint?{id:active.id}:await request(path,{...body,idempotencyKey:key});sessionStorage.removeItem(pendingKey);
  if(path==='/api/generate'||path==='/api/layers')return submitted;
  const activeKey=window.cloudStorageKey('active-ai');sessionStorage.setItem(activeKey,JSON.stringify({path,id:submitted.id,body,fingerprint}));
  for(;;){await new Promise(r=>setTimeout(r,3000));const job=await request('/api/generate?id='+submitted.id);if(job.done){sessionStorage.removeItem(activeKey);if(job.error)throw new Error(job.error);return resolve(job.result);}}
 }

 if(path==='/api/cutout'){const ref=body.url;const url=ref.startsWith('storage://')?await resolve(ref):ref;const blob=await cutoutPerson(url);const id=await uploadBlob(blob,'recorte.png',{brand:window.cloudCurrentBrand()});return {cutout:await resolve('storage://'+id)};}
 const brandPath=path.match(/^\/api\/brands\/([^/]+)$/);if(body&&brandPath&&brandVersions.has(brandPath[1]))body={...body,version:brandVersions.get(brandPath[1])};
 const resource=path.match(/^\/api\/brands\/([^/]+)\/add$/),photo=path.match(/^\/api\/people\/([^/]+)\/photo$/);
 if(body?.dataUrl&&(resource||photo)){let blob=await(await fetch(body.dataUrl)).blob();let name=body.name;if(resource&&['referencias','vestuario'].includes(body.kind)){blob=await referenceImage(blob);name=name.replace(/\.[^.]+$/, '')+'.jpg';}const fileId=await uploadBlob(blob,name,resource?{brand:decodeURIComponent(resource[1])}:{person:decodeURIComponent(photo[1])});const {dataUrl,...rest}=body;const data=await request(path,{...rest,fileId});if(data.id&&data.version)brandVersions.set(data.id,data.version);return resolve(data);}

 if(path==='/api/projects'&&body){
  const snapshot=persistent(structuredClone(body));
  const op=saveQueue.catch(()=>{}).then(async()=>{if(me.role==='lector')throw new Error('Tu acceso es de solo lectura.');const version=versions.get(snapshot.id)??snapshot.version??0;const r=await request(path,{...snapshot,version});versions.set(r.id,r.version);return r;});saveQueue=op;return op;
 }
 if(path==='/api/upload'||path==='/api/export'){
  const brand=window.cloudCurrentBrand();const blob=await(await fetch(body.dataUrl)).blob();
  const name=body.name??`${body.filename}.png`;const fileId=await uploadBlob(blob,name,{brand});
  if(path==='/api/export')await request('/api/deliveries',{id:fileId,folder:body.folder,name});
  return {url:await resolve('storage://'+fileId),name,path:body.folder?`${body.folder}/${name}`:name};
 }
 if(path==='/api/open'){window.cloudOpenFolder(body?.path);return {ok:true};}
 const data=await request(path,body);if(path.startsWith('/api/brands/')&&data.id&&data.version)brandVersions.set(data.id,data.version);
 if(path.startsWith('/api/generate?id=')&&data.items){for(const item of data.items){if(item.status==='completed'&&item.needsCutout&&!item.cutout&&item.url){
  if(!cutouts.has(item.url))cutouts.set(item.url,(async()=>{const blob=await cutoutPerson(await resolve(item.url));const id=await uploadBlob(blob,'recorte.png',{brand:window.cloudCurrentBrand()});await request('/api/jobs/cutout',{group:data.id,index:item.index,fileId:id});return 'storage://'+id;})().catch(e=>{cutouts.delete(item.url);throw e;}));
  try{item.cutout=await cutouts.get(item.url);}catch{item.qa='La foto está lista. Puedes repetir el recorte desde el Editor.';}
 }
 // Lámina en capas: la persona se recorta del fondo limpio (sin letras encima) para poder poner texto detrás
 if(item.status==='completed'&&item.layers?.plate&&!item.layers.cutout){const ref=item.layers.plate;
  if(!cutouts.has(ref))cutouts.set(ref,(async()=>{const blob=await cutoutPerson(await resolve(ref));const id=await uploadBlob(blob,'recorte.png',{brand:window.cloudCurrentBrand()});await request('/api/jobs/cutout',{group:data.id,index:item.index,fileId:id,layers:true});return 'storage://'+id;})().catch(e=>{cutouts.delete(ref);throw e;}));
  try{item.layers.cutout=await cutouts.get(ref);}catch{}
 }}}

 if(path.startsWith('/api/projects?id=')&&data.id)versions.set(data.id,data.version);
 return resolve(data);
};
window.cloudStorageKey=k=>`studio:${me?.id??'signed-out'}:${k}`;
function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.append(s);});}
async function start(){
 const status=document.querySelector('#login-status');
 try{
  const r=await fetch('/api/public-config');if(!r.ok)throw new Error('No se pudo conectar al Estudio.');const cfg=await r.json();
  client=createClient(cfg.url,cfg.publishableKey);storageEndpoint=cfg.url.replace('.supabase.co','.storage.supabase.co')+'/storage/v1/upload/resumable/sign';
  document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;status.textContent='Entrando…';try{const f=new FormData(e.target);const {error}=await client.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});if(error)throw new Error('Email o contraseña incorrectos.');location.reload();}catch(e){status.textContent=e.message;}finally{btn.disabled=false;}});
  const {data:{session}}=await client.auth.getSession();if(!session){document.querySelector('#login-form button').disabled=false;status.textContent='';return;}
  try{me=await request('/api/me');}catch(e){await client.auth.signOut();throw e;}
  document.querySelector('#login').hidden=true;document.querySelector('#studio-shell').hidden=false;
  const exit=document.createElement('button');exit.className='btn ghost';exit.textContent='Cerrar sesión';exit.onclick=async()=>{await client.auth.signOut();location.reload();};if(me.role==='admin'){const team=document.createElement('button');team.className='btn ghost';team.textContent='Equipo';team.onclick=()=>openTeam(request);document.querySelector('.top').append(team);}document.querySelector('.top').append(exit);
  document.querySelector('#btn-settings').hidden=true;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.cloudRefreshImages?.();});
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')location.reload();});
  if(!new URLSearchParams(location.search).has('view'))history.replaceState(null,'','?view=editor');
  await script('/marcas.js');await script('/app.js');
  setupReels({request,uploadBlob,uploadSigned,resolve,role:me.role});
  let active;try{active=JSON.parse(sessionStorage.getItem(window.cloudStorageKey('active-ai')));}catch{}
  if(active){const resume=document.createElement('button');resume.className='btn';resume.textContent='Recuperar propuesta pendiente';resume.onclick=async()=>{resume.disabled=true;try{const result=await window.cloudApi(active.path,active.body);window.cloudRecoverProposal(active.body.brief||active.body,result);resume.remove();}catch(e){resume.textContent=e.message;resume.disabled=false;}};document.querySelector('.top').append(resume);}

 }catch(e){status.textContent=e.message;if(client)document.querySelector('#login-form button').disabled=false;}
}
start();
