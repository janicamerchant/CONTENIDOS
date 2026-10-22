// Live Storage/API roundtrip using an isolated temporary brand and user. No model/provider generation.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {loadLocalEnv,adminClient,config,assertTarget} from '../src/config.js';
loadLocalEnv();assertTarget();const {default:handler}=await import('../api/index.js');
const db=adminClient(),cfg=config(),tag='test-video-'+randomUUID().slice(0,8),pid=tag;let userId='',fileId='';
const server=createServer((req,res)=>{void handler(req,res);});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+(server.address() as any).port;
const client=createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const check=(r:any)=>{if(r.error)throw new Error(r.error.message);return r.data;};
try{
 const password=randomUUID()+randomUUID(),email=tag+'@example.invalid';
 userId=check(await db.auth.admin.createUser({email,password,email_confirm:true})).user.id;
 check(await db.from('miembros').insert({user_id:userId,rol:'editor',activo:true,limite_mensual_usd:1}));
 check(await db.from('marcas').insert({id:tag,identidad:{name:tag}}));check(await db.from('miembro_marca').insert({user_id:userId,marca_id:tag}));
 check(await db.from('reels_proyectos').insert({id:pid,marca_id:tag,tipo:'largo',titulo:'Voice upload integration',created_by:userId,documento:{info:{titulo:tag},analisis:{guiones:[{id:'g',guion:'Una sola tarea.'}],puntos_clave:[]}}}));
 const login=check(await client.auth.signInWithPassword({email,password}));const token=login.session.access_token;
 const api=async(path:string,body?:unknown)=>{const r=await fetch(origin+'/api/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json() as any;assert.ok(r.ok,JSON.stringify({path,status:r.status,data}));return data;};
 const wav=Buffer.alloc(44+32000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);
 const signed=await api('assets/upload',{brand:tag,name:'narracion.wav',mime:'audio/wav',bytes:wav.length});fileId=signed.id;
 check(await client.storage.from('estudio').uploadToSignedUrl(signed.path,signed.token,wav,{contentType:'audio/wav'}));await api('assets/finalize',{id:fileId});
 await api('reels/proyectos/'+pid+'/video-config',{guion:'g',configuracion:{motor:'seedance_2_5',segundos:20,escena:'Una oficina',audioNarracion:fileId,generarAudio:false}});
 const saved=await api('reels/proyectos?id='+pid);assert.equal(saved.video_config.g.audioNarracion,fileId);assert.equal(saved.video_config.g.audioNombre,'narracion.wav');assert.equal(saved.video_config.g.motor,'seedance_2_5');
 await api('reels/proyectos/'+pid+'/video-config',{guion:'g',configuracion:{motor:'seedance_2_5',audiosReferencia:[{id:fileId,nombre:'nombre no confiable'}]}});
 const referenced=await api('reels/proyectos?id='+pid);assert.deepEqual(referenced.video_config.g.audiosReferencia,[{id:fileId,nombre:'narracion.wav'}]);assert.equal(referenced.video_config.g.audioNarracion,null);assert.equal(referenced.video_config.g.generarAudio,true);
 await api('reels/proyectos/'+pid+'/video-config',{guion:'g',configuracion:{motor:'seedance_2_5',audiosReferencia:[]}});
 assert.deepEqual((await api('reels/proyectos?id='+pid)).video_config.g.audiosReferencia,[]);
 const ref=await api('assets/sign',{id:fileId});const bytes=await fetch(ref.url);assert.ok(bytes.ok);assert.deepEqual(Buffer.from(await bytes.arrayBuffer()),wav);
 console.log('Live Supabase/API: signed audio upload, MIME validation, narration and voice references, canonical filenames, removal, persistence and private playback URL: OK.');
}finally{
 await client.auth.signOut().catch(()=>{});
 if(userId)await db.from('miembros').update({activo:false}).eq('user_id',userId);
 await db.from('reels_proyectos').delete().eq('id',pid);
 if(fileId){await db.storage.from('estudio').remove([fileId+'/original']);await db.from('archivos').delete().eq('id',fileId);}
 await db.from('miembro_marca').delete().eq('marca_id',tag);await db.from('marcas').delete().eq('id',tag);
 if(userId){check(await db.from('miembros').delete().eq('user_id',userId));check(await db.auth.admin.deleteUser(userId));}
 assert.equal(check(await db.from('marcas').select('id').eq('id',tag).maybeSingle()),null,'temporary brand removed');
 if(fileId)assert.equal(check(await db.from('archivos').select('id').eq('id',fileId).maybeSingle()),null,'temporary audio removed');
 await new Promise<void>(r=>server.close(()=>r()));
}
