import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {adminClient,assertTarget,config,loadLocalEnv,boundedFetch} from '../src/config.js';
loadLocalEnv();assertTarget();const admin=adminClient();const c=config();
const prefix=`test-${randomUUID().slice(0,8)}`;
const brandA=`${prefix}-a`,brandB=`${prefix}-b`;
const users:{id:string,client:SupabaseClient,role:string}[]=[];const objects:string[]=[];const assets:string[]=[];
function ok(error:any){if(error)throw new Error(`${error.code??''}: ${error.message}`);}
async function check(name:string,fn:()=>Promise<void>){await fn();console.log(`OK ${name}`);}
try{
 for(const role of ['admin','editor','lector','editor']){
  const email=`${prefix}-${users.length}@example.invalid`,password=randomUUID()+randomUUID();
  const r=await admin.auth.admin.createUser({email,password,email_confirm:true});ok(r.error);
  const client=createClient(c.SUPABASE_URL,c.SUPABASE_PUBLISHABLE_KEY,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false}});
  users.push({id:r.data.user!.id,client,role});
  ok((await admin.from('miembros').insert({user_id:r.data.user!.id,rol:role,limite_mensual_usd:1})).error);
  ok((await client.auth.signInWithPassword({email,password})).error);
 }
 const [owner,editor,reader,other]=users as [typeof users[number],typeof users[number],typeof users[number],typeof users[number]];
 ok((await admin.from('marcas').insert([{id:brandA,identidad:{name:'Integration A'}},{id:brandB,identidad:{name:'Integration B'}}])).error);
 ok((await admin.from('miembro_marca').insert([{user_id:editor.id,marca_id:brandA},{user_id:reader.id,marca_id:brandA},{user_id:other.id,marca_id:brandB}])).error);
 await check('JWT real: editor ve solo marca asignada',async()=>{const r=await editor.client.from('marcas').select('id').in('id',[brandA,brandB]);ok(r.error);assert.deepEqual(r.data,[{id:brandA}]);});
 await check('rol editable en user_metadata no concede admin',async()=>{ok((await editor.client.auth.updateUser({data:{rol:'admin'}})).error);const r=await editor.client.from('marcas').select('id').eq('id',brandB);ok(r.error);assert.equal(r.data!.length,0);});
 await check('REST rechaza autoascenso y asignación de otra marca',async()=>{assert.ok((await editor.client.from('miembros').update({rol:'admin'}).eq('user_id',editor.id)).error);assert.ok((await editor.client.from('miembro_marca').insert({user_id:editor.id,marca_id:brandB})).error);});
 const doc={id:prefix,brand:brandA,slides:[]};
 await check('lector no crea proyectos; editor sí',async()=>{const args={p_id:prefix,p_marca:brandA,p_documento:doc,p_version:0};assert.ok((await reader.client.rpc('guardar_proyecto',args)).error);ok((await editor.client.rpc('guardar_proyecto',args)).error);});
 await check('guardados concurrentes: uno gana y otro recibe conflicto',async()=>{const args={p_id:prefix,p_marca:brandA,p_documento:{...doc,name:'version 2'},p_version:1};const r=await Promise.all([editor.client.rpc('guardar_proyecto',args),editor.client.rpc('guardar_proyecto',args)]);assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error?.code==='PT409').length,1);});
 await check('reservas concurrentes no superan límite de gasto',async()=>{const args={p_actor:editor.id,p_marca:brandA,p_tipo:'imagen',p_motor:'integration-no-provider',p_payload:{test:true},p_hash:'integration',p_reserva:.6,p_grupo:randomUUID()};const r=await Promise.all([admin.rpc('encolar_trabajo',{...args,p_key:randomUUID()}),admin.rpc('encolar_trabajo',{...args,p_key:randomUUID()})]);assert.equal(r.filter(x=>!x.error).length,1);assert.equal(r.filter(x=>x.error).length,1);});
 const fileId=randomUUID();assets.push(fileId);const object=`${fileId}/original`;objects.push(object);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 ok((await admin.from('archivos').insert({id:fileId,alcance:'marca',marca_id:brandA,nombre:'integration.png',mime:'image/png',bytes:png.length,listo:true})).error);
 ok((await admin.storage.from('estudio').upload(object,png,{contentType:'image/png',upsert:false})).error);
 await check('Storage permite firma solo dentro de la marca',async()=>{ok((await editor.client.storage.from('estudio').createSignedUrl(object,60)).error);assert.ok((await other.client.storage.from('estudio').createSignedUrl(object,60)).error);});
 await check('sin sesión no hay acceso a proyectos ni objetos',async()=>{const anon=createClient(c.SUPABASE_URL,c.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});const r=await anon.from('proyectos').select('id');assert.ok(r.error||r.data?.length===0);assert.ok((await anon.storage.from('estudio').download(object)).error);});
 await check('suspender miembro bloquea datos y nuevas firmas con JWT vigente',async()=>{ok((await admin.from('miembros').update({activo:false}).eq('user_id',editor.id)).error);const r=await editor.client.from('proyectos').select('id').eq('id',prefix);ok(r.error);assert.equal(r.data!.length,0);assert.ok((await editor.client.storage.from('estudio').createSignedUrl(object,60)).error);});
 console.log('Integración remota verificada sin llamadas a IA ni emails.');
}finally{
 const ids=users.map(u=>u.id);const errors:string[]=[];
 const clean=async(label:string,p:PromiseLike<any>)=>{const r=await p;if(r.error)errors.push(`${label}: ${r.error.message}`);};
 if(objects.length)await clean('storage',admin.storage.from('estudio').remove(objects));
 if(ids.length){await clean('trabajos',admin.from('trabajos').delete().in('user_id',ids));await clean('auditoria',admin.from('auditoria').delete().in('actor_id',ids));}
 await clean('proyectos',admin.from('proyectos').delete().eq('id',prefix));
 if(assets.length)await clean('archivos',admin.from('archivos').delete().in('id',assets));
 if(ids.length)await clean('miembros',admin.from('miembros').delete().in('user_id',ids));
 await clean('marcas',admin.from('marcas').delete().in('id',[brandA,brandB]));
 for(const u of users){await u.client.auth.signOut();await clean('usuario',admin.auth.admin.deleteUser(u.id));}
 if(errors.length)throw new Error(`Revisar limpieza de pruebas: ${errors.join('; ')}`);
 console.log('Datos y usuarios temporales eliminados.');
}
