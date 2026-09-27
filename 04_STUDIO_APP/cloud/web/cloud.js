import {createClient} from '@supabase/supabase-js';
let client,me;const blobs=new Map(),reverse=new Map();let saveQueue=Promise.resolve();
export async function request(path,body){
 const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Tu sesión terminó. Vuelve a entrar.');
 const r=await fetch(path,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${session.access_token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo completar la operación.');return data;
}
async function resolve(value){
 if(typeof value==='string'&&value.startsWith('storage://')){
  if(!blobs.has(value))blobs.set(value,(async()=>{const {url}=await request('/api/assets/sign',{id:value.slice(10)});const r=await fetch(url);if(!r.ok)throw new Error('No se pudo cargar la imagen.');const blob=URL.createObjectURL(await r.blob());reverse.set(blob,value);return blob;})().catch(e=>{blobs.delete(value);throw e;}));
  return blobs.get(value);
 }
 if(Array.isArray(value))return Promise.all(value.map(resolve));
 if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await resolve(v)])));
 return value;
}
function persistent(value){if(typeof value==='string')return reverse.get(value)??value;if(Array.isArray(value))return value.map(persistent);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,persistent(v)]));return value;}
const versions=new Map();
window.cloudApi=async(path,body)=>{
 if(path==='/api/projects'&&body){
  const snapshot=persistent(structuredClone(body));
  const op=saveQueue.catch(()=>{}).then(async()=>{if(me.role==='lector')throw new Error('Tu acceso es de solo lectura.');const version=versions.get(snapshot.id)??snapshot.version??0;const r=await request(path,{...snapshot,version});versions.set(r.id,r.version);return r;});saveQueue=op;return op;
 }
 if(path==='/api/upload'||path==='/api/export'){
  const brand=window.cloudCurrentBrand();const blob=await(await fetch(body.dataUrl)).blob();
  const name=body.name??`${body.filename}.png`;const item=await request('/api/assets/upload',{brand,name,mime:blob.type,bytes:blob.size});
  const upload=await client.storage.from('estudio').uploadToSignedUrl(item.path,item.token,blob,{contentType:blob.type});if(upload.error)throw new Error('No se pudo subir el archivo.');
  const result=await request('/api/assets/finalize',{id:item.id});
  if(path==='/api/export')await request('/api/deliveries',{id:item.id,folder:body.folder,name});
  return {url:await resolve(result.ref),name,path:body.folder};
 }
 if(path==='/api/open'){window.cloudShowDeliveries();return {ok:true};}
 const data=await request(path,body);
 if(path.startsWith('/api/projects?id=')&&data.id)versions.set(data.id,data.version);
 return resolve(data);
};
window.cloudStorageKey=k=>`studio:${me?.id??'signed-out'}:${k}`;
function script(src){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=reject;document.body.append(s);});}
async function start(){
 const status=document.querySelector('#login-status');
 try{
  const r=await fetch('/api/public-config');if(!r.ok)throw new Error('No se pudo conectar al Estudio.');const cfg=await r.json();
  client=createClient(cfg.url,cfg.publishableKey);
  document.querySelector('#login-form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;status.textContent='Entrando…';try{const f=new FormData(e.target);const {error}=await client.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});if(error)throw new Error('Email o contraseña incorrectos.');location.reload();}catch(e){status.textContent=e.message;}finally{btn.disabled=false;}});
  const {data:{session}}=await client.auth.getSession();if(!session){document.querySelector('#login-form button').disabled=false;status.textContent='';return;}
  try{me=await request('/api/me');}catch(e){await client.auth.signOut();throw e;}
  document.querySelector('#login').hidden=true;document.querySelector('#studio-shell').hidden=false;
  const exit=document.createElement('button');exit.className='btn ghost';exit.textContent='Cerrar sesión';exit.onclick=async()=>{await client.auth.signOut();location.reload();};document.querySelector('.top').append(exit);
  document.querySelector('#btn-settings').hidden=true;
  client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')location.reload();});
  if(!new URLSearchParams(location.search).has('view'))history.replaceState(null,'','?view=editor');
  await script('/marcas.js');await script('/app.js');
 }catch(e){status.textContent=e.message;}
}
start();
