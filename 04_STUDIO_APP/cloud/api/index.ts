import type {IncomingMessage,ServerResponse} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {waitUntil} from '@vercel/functions';
import {aiConfig,enqueue,generationStatus,runWorker,recoveredProject,soulRoute} from '../src/generation.js';
import {libraryRoute,adminOnly,checked,readyFile} from '../src/library.js';
import {authenticate,authorizeBrand,databaseError,HttpError} from '../src/auth.js';
import {adminClient,config} from '../src/config.js';
import {teamRoute} from '../src/team.js';
const id=z.string().min(1).max(128);
async function body(req:IncomingMessage):Promise<any>{
 // Vercel may have parsed req.body. Still enforce a small metadata-only API.
 const parsed=(req as any).body;
 if(parsed!==undefined){const value=typeof parsed==='string'?JSON.parse(parsed):parsed;if(Buffer.byteLength(JSON.stringify(value))>262144)throw new HttpError(413,'Solicitud demasiado grande. Sube los archivos directamente a Storage.');return value;}
 let size=0;const chunks:Buffer[]=[];for await(const c of req){const b=Buffer.from(c);size+=b.length;if(size>262144)throw new HttpError(413,'Solicitud demasiado grande.');chunks.push(b);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');
}
export default async function handler(req:IncomingMessage,res:ServerResponse){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(status:number,value:unknown)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 try{
  const url=new URL(req.url??'/','https://studio.invalid');const route=url.pathname.replace(/^\/api\/?/,'');
  if(req.method!=='GET'&&req.method!=='POST')throw new HttpError(405,'Método no admitido.');
  if(route==='public-config'&&req.method==='GET'){const c=config();return send(200,{url:c.SUPABASE_URL,publishableKey:c.SUPABASE_PUBLISHABLE_KEY,signup:false});}
  if(route==='worker'){if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)throw new HttpError(401,'No autorizado.');await runWorker(8);return send(200,{ok:true});}
  const who=await authenticate(req.headers.authorization);
  if(['propose','draft','generate','brands/_draft'].includes(route)&&req.method==='POST'){const r=await enqueue(who,route,await body(req));waitUntil(runWorker());return send(202,r);}
  if(route==='generate'&&req.method==='GET'){const r=await generationStatus(who,url.searchParams.get('id')||'');if(!r.done)waitUntil(runWorker());return send(200,r);}

  if(route==='me'&&req.method==='GET')return send(200,{id:who.id,role:who.role});
  if(route==='team'||route.startsWith('team/')){const result=await teamRoute(who,route,req.method,req.method==='POST'?await body(req):undefined);if(result!==undefined)return send(200,result);}
  const soul=/^people\/([a-z0-9-]{1,64})\/soul$/.exec(route);if(soul&&req.method==='POST')return send(200,await soulRoute(who,soul[1]!,await body(req)));
  if(route.startsWith('brands')||route.startsWith('people')||(route==='requests'&&req.method==='POST')){const result=await libraryRoute(who,route,req.method,req.method==='POST'?await body(req):undefined);if(result!==undefined)return send(200,result);}
  if(route==='jobs/cutout'&&req.method==='POST'){
   const b=z.object({group:z.uuid(),index:z.number().int().min(0),fileId:z.uuid()}).parse(await body(req));
   const j=checked(await who.db.from('trabajos').select('*').eq('grupo_id',b.group).eq('lamina_id',String(b.index)).eq('estado','succeeded').single());
   await authorizeBrand(who,j.marca_id,true);await readyFile(who,b.fileId,j.marca_id);
   checked(await adminClient().from('trabajos').update({resultado:{...j.resultado,cutout:'storage://'+b.fileId}}).eq('id',j.id).eq('estado','succeeded'));return send(200,{ok:true});
  }
  if(route==='projects'){
   if(req.method==='GET'){
    const project=url.searchParams.get('id');let q=who.db.from('proyectos').select('*').order('updated_at',{ascending:false});
    if(project)q=q.eq('id',id.parse(project));const r=await q;databaseError(r.error);
    if(project){if(!r.data?.[0])throw new HttpError(404,'Proyecto no encontrado.');return send(200,await recoveredProject(who,r.data[0]));}
    return send(200,r.data?.map(p=>({id:p.id,name:p.documento.name,brand:p.marca_id,slides:p.documento.slides?.length??0,updatedAt:p.updated_at,version:p.version})));
   }
   const b=z.object({id,brand:id,version:z.number().int().nonnegative(),slides:z.array(z.record(z.string(),z.unknown())).max(30)}).passthrough().parse(await body(req));
   await authorizeBrand(who,b.brand,true);const {version,...document}=b;
   const r=await who.db.rpc('guardar_proyecto',{p_id:b.id,p_marca:b.brand,p_documento:document,p_version:version});databaseError(r.error);return send(200,{id:r.data.id,version:r.data.version,updatedAt:r.data.updated_at});
  }
  if(route==='brands'&&req.method==='GET'){const r=await who.db.from('marcas').select('*');databaseError(r.error);return send(200,{brands:r.data?.filter(b=>!b.archivada&&b.id!=='_comun').map(b=>({...b.identidad,id:b.id,version:b.version})),archived:r.data?.filter(b=>b.archivada).map(b=>({id:b.id,name:b.identidad.name}))});}
  if(route==='config'&&req.method==='GET')return send(200,aiConfig());
  if(route==='config'&&req.method==='POST')throw new HttpError(403,'Las claves se configuran en Vercel, no en el navegador.');
  if(route==='requests'&&req.method==='GET'){
   const r=await who.db.from('solicitudes').select('documento');databaseError(r.error);return send(200,r.data?.map(x=>x.documento));
  }
  if(route==='assets'&&req.method==='GET'){
   const r=await who.db.from('archivos').select('id,nombre,marca_id').eq('listo',true).is('eliminado_at',null).like('mime','image/%').limit(1000);databaseError(r.error);
   return send(200,r.data?.map(x=>({name:x.nombre,group:x.marca_id??'Personas y originales',folder:x.marca_id??'',url:`storage://${x.id}`})));
  }
  if(route==='deliveries'){
   if(req.method==='POST'){
    const b=z.object({id:z.uuid(),folder:z.string().min(1).max(160),name:z.string().min(1).max(180)}).parse(await body(req));
    const f=await who.db.from('archivos').select('marca_id,listo,mime').eq('id',b.id).single();
    if(f.error||!f.data?.listo||!f.data.marca_id||!f.data.mime.startsWith('image/'))throw new HttpError(404,'Imagen no encontrada.');
    await authorizeBrand(who,f.data.marca_id,true);
    const saved=await adminClient().from('entregas').upsert({marca_id:f.data.marca_id,archivo_id:b.id,carpeta:b.folder,nombre:b.name},{onConflict:'archivo_id',ignoreDuplicates:true});databaseError(saved.error);return send(200,{ok:true});
   }
   const r=await who.db.from('entregas').select('*').order('created_at',{ascending:false});databaseError(r.error);
   const groups=new Map<string,{folder:string;updatedAt:string;images:string[]}>();
   for(const row of r.data??[]){const key=row.marca_id+':'+row.carpeta;if(!groups.has(key))groups.set(key,{folder:row.carpeta,updatedAt:row.created_at,images:[]});groups.get(key)!.images.push(`storage://${row.archivo_id}`);}
   return send(200,[...groups.values()]);
  }
  if(route==='jobs'&&req.method==='GET'){
   const job=z.uuid().parse(url.searchParams.get('id'));const r=await who.db.from('trabajos').select('id,estado,resultado,error,updated_at').eq('id',job).single();databaseError(r.error);return send(200,r.data);
  }
  if(route==='assets/sign-batch'&&req.method==='POST'){
   const b=z.object({ids:z.array(z.uuid()).min(1).max(300)}).parse(await body(req));
   const files=checked(await who.db.from('archivos').select('id,object_path').in('id',b.ids).eq('listo',true).is('eliminado_at',null));
   if(!files.length)return send(200,{urls:{},expiresIn:3600});
   const signed=checked(await who.db.storage.from('estudio').createSignedUrls(files.map((f:any)=>f.object_path),3600));
   return send(200,{urls:Object.fromEntries(files.map((f:any,i:number)=>[f.id,signed[i]?.signedUrl||null])),expiresIn:3600});
  }
  if(route==='assets/sign'&&req.method==='POST'){
   const b=z.object({id:z.uuid()}).parse(await body(req));const file=await who.db.from('archivos').select('object_path,listo,eliminado_at').eq('id',b.id).single();
   if(file.error||!file.data?.listo||file.data.eliminado_at)throw new HttpError(404,'Archivo no encontrado.');
   // User client is intentional: Storage RLS checks the same user's access.
   const r=await who.db.storage.from('estudio').createSignedUrl(file.data.object_path,300);databaseError(r.error);return send(200,{url:r.data!.signedUrl,expiresIn:300});
  }
  if(route==='assets/upload'&&req.method==='POST'){
   const b=z.object({brand:id.optional(),person:id.optional(),name:z.string().min(1).max(180),mime:z.enum(['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/markdown']),bytes:z.number().int().positive().max(52428800)}).parse(await body(req));
   if(b.person){adminOnly(who);const p=checked(await who.db.from('personas').select('id').eq('id',b.person).eq('archivada',false).maybeSingle());if(!p)throw new HttpError(404,'Persona no encontrada.');}else{if(!b.brand)throw new HttpError(400,'Falta la marca.');await authorizeBrand(who,b.brand,true);}const admin=adminClient();const fileId=randomUUID();
   const r=await admin.from('archivos').insert({id:fileId,alcance:b.person?'persona':'marca',marca_id:b.person?null:b.brand,persona_id:b.person||null,nombre:b.name,mime:b.mime,bytes:b.bytes}).select('object_path').single();databaseError(r.error);
   const signed=await admin.storage.from('estudio').createSignedUploadUrl(r.data!.object_path,{upsert:false});databaseError(signed.error);
   return send(200,{id:fileId,path:r.data!.object_path,token:signed.data!.token});
  }
  if(route==='assets/finalize'&&req.method==='POST'){
   const b=z.object({id:z.uuid()}).parse(await body(req));const file=await who.db.from('archivos').select('*').eq('id',b.id).single();
   if(file.error||!file.data||!['marca','persona'].includes(file.data.alcance))throw new HttpError(404,'Archivo no encontrado.');
   if(file.data.alcance==='persona')adminOnly(who);else await authorizeBrand(who,file.data.marca_id,true);const admin=adminClient();const download=await admin.storage.from('estudio').download(file.data.object_path);databaseError(download.error);
   const bytes=Buffer.from(await download.data!.arrayBuffer());if(bytes.length!==file.data.bytes)throw new HttpError(422,'El tamaño del archivo no coincide.');
   const sha256=createHash('sha256').update(bytes).digest('hex');
   // SVG/HTML are never accepted. Verify raster/PDF signatures before exposing a file.
   const signatures:Record<string,(b:Buffer)=>boolean>={
    'image/png':b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/jpeg':b=>b[0]===255&&b[1]===216&&b[2]===255,
    'image/webp':b=>b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP',
    'image/gif':b=>/^GIF8[79]a$/.test(b.toString('ascii',0,6)),
    'application/pdf':b=>b.toString('ascii',0,5)==='%PDF-'
   };
   if(signatures[file.data.mime]&&!signatures[file.data.mime]!(bytes))throw new HttpError(422,'El contenido no coincide con el tipo de archivo.');
   const saved=await admin.from('archivos').update({sha256,listo:true}).eq('id',b.id);databaseError(saved.error);return send(200,{id:b.id,ref:`storage://${b.id}`});
  }
  throw new HttpError(404,'Ruta no disponible.');
 }catch(e){if(e instanceof HttpError)return send(e.status,{error:e.message});if(e instanceof z.ZodError||e instanceof SyntaxError)return send(400,{error:'Solicitud inválida.'});console.error('studio.request_failed',{type:e instanceof Error?e.name:'unknown'});return send(500,{error:'No se pudo completar la operación.'});}
}
