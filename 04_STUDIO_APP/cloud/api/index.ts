import type {IncomingMessage,ServerResponse} from 'node:http';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {waitUntil} from '@vercel/functions';
import {aiConfig,enqueue,generationStatus,runWorker,recoveredProject,soulRoute} from '../src/generation.js';
import {libraryRoute,adminOnly,checked,readyFile,brandDetail} from '../src/library.js';
import {authenticate,authorizeBrand,databaseError,HttpError} from '../src/auth.js';
import {adminClient,config} from '../src/config.js';
import {teamRoute} from '../src/team.js';
import {reelsRoute} from '../src/reels.js';
import {freezeCampaign,verifiedCampaign,signReview,validReview,reviewHash} from '../src/campaign.js';
import {resolveMode,reviewRevision,reviewIssues,coverRevision,coverIssues,slideContent} from '../shared/carousel.js';
import {groupedDeliveries} from '../src/deliveries.js';
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
  if(['propose','draft','generate','layers','brands/_draft'].includes(route)&&req.method==='POST'){const r=await enqueue(who,route,await body(req));waitUntil(runWorker());return send(202,r);}
  if(route==='generate'&&req.method==='GET'){const r=await generationStatus(who,url.searchParams.get('id')||'');if(!r.done)waitUntil(runWorker());return send(200,r);}

  if(route.startsWith('reels/')){const r=await reelsRoute(who,route,req.method,url,req.method==='POST'?await body(req):undefined);if(r?.grupo||(route==='reels/trabajos'&&!r.done))waitUntil(runWorker());return send(200,r);}
  if(route==='me'&&req.method==='GET')return send(200,{id:who.id,role:who.role});
  if(route==='team'||route.startsWith('team/')){const result=await teamRoute(who,route,req.method,req.method==='POST'?await body(req):undefined);if(result!==undefined)return send(200,result);}
  const soul=/^people\/([a-z0-9-]{1,64})\/soul$/.exec(route);if(soul&&req.method==='POST')return send(200,await soulRoute(who,soul[1]!,await body(req)));
  if(route.startsWith('brands')||route.startsWith('people')||(route==='requests'&&req.method==='POST')){const result=await libraryRoute(who,route,req.method,req.method==='POST'?await body(req):undefined);if(result!==undefined)return send(200,result);}
  if(route==='jobs/cutout'&&req.method==='POST'){
   const b=z.object({group:z.uuid(),index:z.number().int().min(0),fileId:z.uuid(),layers:z.boolean().optional()}).parse(await body(req));
   const j=checked(await who.db.from('trabajos').select('*').eq('grupo_id',b.group).eq('lamina_id',String(b.index)).eq('estado','succeeded').single());
   await authorizeBrand(who,j.marca_id,true);await readyFile(who,b.fileId,j.marca_id);
   // Con capas, el recorte es de la persona sobre el fondo limpio
   checked(await adminClient().from('trabajos').update({resultado:b.layers&&j.resultado.layers?{...j.resultado,layers:{...j.resultado.layers,cutout:'storage://'+b.fileId}}:{...j.resultado,cutout:'storage://'+b.fileId}}).eq('id',j.id).eq('estado','succeeded'));return send(200,{ok:true});
  }
  if(route==='projects/results'&&req.method==='GET'){
   const projectId=id.parse(url.searchParams.get('id'));const project=checked(await who.db.from('proyectos').select('marca_id').eq('id',projectId).single());await authorizeBrand(who,project.marca_id);
   const rows=checked(await who.db.from('trabajos').select('id,payload,resultado,created_at').eq('proyecto_id',projectId).eq('tipo','imagen').eq('estado','succeeded').order('created_at',{ascending:false}).limit(30));
   return send(200,rows.filter((j:any)=>j.resultado?.url).map((j:any)=>({id:j.id,slideId:j.payload.slideId||j.payload.slide?.id,slide:j.payload.slide,createdAt:j.created_at,...j.resultado})));
  }
  if(route==='projects/cover-review'&&req.method==='POST'){
   const b=z.object({projectId:id,version:z.number().int().positive()}).parse(await body(req));
   const row=checked(await who.db.from('proyectos').select('*').eq('id',b.projectId).single());await authorizeBrand(who,row.marca_id,true);
   if(row.version!==b.version)throw new HttpError(409,'El proyecto cambió; vuelve a revisar la portada.');
   const active=checked(await who.db.from('trabajos').select('payload').eq('proyecto_id',row.id).eq('tipo','imagen').in('estado',['queued','running','waiting']));
   if(active.some((j:any)=>j.payload.slideId===row.documento.slides[0]?.id))throw new HttpError(409,'Espera a que termine la portada antes de aprobarla.');
   const issues=coverIssues(row.documento);if(issues.length)throw new HttpError(422,issues.join(' '));
   const revision=coverRevision(row.documento),coverReview={revision:reviewHash(revision),signature:signReview(revision),approvedAt:new Date().toISOString(),approvedBy:who.id};
   const saved=checked(await who.db.rpc('guardar_proyecto',{p_id:row.id,p_marca:row.marca_id,p_documento:{...row.documento,coverReview},p_version:row.version}));
   return send(200,{id:row.id,version:saved.version,coverReview});
  }
  if(route==='projects/pattern'&&req.method==='POST'){
   const b=z.object({projectId:id,version:z.number().int().positive()}).parse(await body(req));
   const row=checked(await who.db.from('proyectos').select('*').eq('id',b.projectId).single());await authorizeBrand(who,row.marca_id,true);
   if(row.version!==b.version||!validReview(row.documento.review,reviewRevision(row.documento)))throw new HttpError(409,'Revisa y aprueba el carrusel antes de usarlo como patrón.');
   const brand=checked(await who.db.from('marcas').select('*').eq('id',row.marca_id).single()),frozen=verifiedCampaign(row.documento.campaign,row.marca_id);
   const style=Object.fromEntries(['design','fonts','colors','titleCase','look','logos','byline','theme'].filter(k=>frozen[k]!==undefined).map(k=>[k,frozen[k]]));
   Object.assign(style,{modo:row.documento.modo,sistema_visual:row.documento.visualSystem||frozen.sistema_visual||'',evitar:row.documento.avoid||frozen.evitar||''});
   const pattern={version:1,projectId:row.id,projectVersion:row.version,name:row.documento.name,approvedAt:new Date().toISOString(),approvedBy:who.id,style,examples:row.documento.slides.map((s:any)=>({id:s.id,...slideContent(s)}))};
   checked(await adminClient().rpc('guardar_marca',{p_actor:who.id,p_marca:brand.id,p_version:brand.version,p_identidad:{...brand.identidad,carouselPattern:pattern,modo:row.documento.modo},p_reglas:brand.reglas,p_personas:null}));
   return send(200,{ok:true,pattern});
  }
  if(route==='projects/review'&&req.method==='POST'){
   const b=z.object({projectId:id,version:z.number().int().positive()}).parse(await body(req));
   const row=checked(await who.db.from('proyectos').select('*').eq('id',b.projectId).single());await authorizeBrand(who,row.marca_id,true);
   if(row.version!==b.version)throw new HttpError(409,'El proyecto cambió; vuelve a revisar.');
   const issues=reviewIssues(row.documento);if(issues.length)throw new HttpError(422,issues.join(' '));
   const revision=reviewRevision(row.documento),review={revision:reviewHash(revision),signature:signReview(revision),approvedAt:new Date().toISOString(),approvedBy:who.id};
   const document={...row.documento,review};const saved=checked(await who.db.rpc('guardar_proyecto',{p_id:row.id,p_marca:row.marca_id,p_documento:document,p_version:row.version}));
   return send(200,{id:row.id,version:saved.version,review});
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
   const old=checked(await who.db.from('proyectos').select('*').eq('id',b.id).maybeSingle());
   const campaign=b.refreshCampaign===true?freezeCampaign(await brandDetail(who,b.brand)):old?.documento.campaign||b.campaign||freezeCampaign(await brandDetail(who,b.brand));
   const frozen=verifiedCampaign(campaign,b.brand);document.campaign=campaign;document.modo=resolveMode(b.modo,frozen);if(b.refreshCampaign===true){document.visualSystem='';document.avoid='';}delete document.refreshCampaign;
   const ids=new Set();for(const slide of document.slides as any[]){if(!slide.id||ids.has(slide.id))throw new HttpError(400,'Cada lámina necesita un ID único.');ids.add(slide.id);}
   const previous=old?.documento.review;document.review=validReview(previous,reviewRevision(document))?previous:null;
   const previousCover=old?.documento.coverReview;document.coverReview=validReview(previousCover,coverRevision(document))?previousCover:null;
   const r=await who.db.rpc('guardar_proyecto',{p_id:b.id,p_marca:b.brand,p_documento:document,p_version:version});databaseError(r.error);return send(200,{id:r.data.id,version:r.data.version,updatedAt:r.data.updated_at,campaign,review:document.review,coverReview:document.coverReview,visualSystem:document.visualSystem,avoid:document.avoid});
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
  if(route==='deliveries/commit'&&req.method==='POST'){
   const b=z.object({exportId:z.uuid(),projectId:id,version:z.number().int().positive()}).parse(await body(req));
   const project=checked(await who.db.from('proyectos').select('*').eq('id',b.projectId).single());await authorizeBrand(who,project.marca_id,true);
   if(!validReview(project.documento.review,reviewRevision(project.documento)))throw new HttpError(409,'Revisa y aprueba el carrusel antes de entregar.');
   checked(await adminClient().rpc('publicar_exportacion',{p_actor:who.id,p_exportacion:b.exportId,p_proyecto:b.projectId,p_version:b.version}));return send(200,{ok:true});
  }
  if(route==='deliveries'){
   if(req.method==='POST'){
    const b=z.object({id:z.uuid(),folder:z.string().min(1).max(160),name:z.string().min(1).max(180),exportId:z.uuid(),projectId:id,version:z.number().int().positive(),slideId:id,position:z.number().int().min(0).max(9),total:z.number().int().min(1).max(10)}).parse(await body(req));
    const project=checked(await who.db.from('proyectos').select('*').eq('id',b.projectId).single());await authorizeBrand(who,project.marca_id,true);
    if(project.version!==b.version||!validReview(project.documento.review,reviewRevision(project.documento)))throw new HttpError(409,'El proyecto cambió o falta aprobar su revisión.');
    if(!project.documento.slides.some((s:any)=>s.id===b.slideId)||b.position>=b.total)throw new HttpError(400,'Posición de lámina inválida.');
    const f=await readyFile(who,b.id,project.marca_id);if(!f.mime.startsWith('image/'))throw new HttpError(400,'Selecciona una imagen.');
    const existing=checked(await who.db.from('entregas').select('*').eq('exportacion_id',b.exportId));
    if(existing.some((e:any)=>e.publicada||e.proyecto_id!==b.projectId||e.proyecto_version!==b.version||e.total!==b.total))throw new HttpError(409,'Esta exportación ya terminó o pertenece a otra revisión.');
    checked(await adminClient().from('entregas').upsert({marca_id:project.marca_id,archivo_id:b.id,carpeta:b.folder,nombre:b.name,exportacion_id:b.exportId,proyecto_id:b.projectId,proyecto_version:b.version,lamina_id:b.slideId,posicion:b.position,total:b.total},{onConflict:'marca_id,exportacion_id,posicion'}));return send(200,{ok:true});
   }
   const r=checked(await who.db.from('entregas').select('*').order('created_at',{ascending:false}));return send(200,groupedDeliveries(r));
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
