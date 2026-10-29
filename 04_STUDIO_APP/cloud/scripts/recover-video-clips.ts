// Recover already generated MP4s. Dry-run by default; never submits requests to a provider.
import {mkdir,writeFile} from 'node:fs/promises';
import {loadLocalEnv,adminClient,assertTarget} from '../src/config.js';
import {checked} from '../src/library.js';
import {conservarClip,pedidoClipVigente} from '../src/reels-higgsfield.js';
loadLocalEnv();assertTarget();
const pid=process.argv.find(x=>x.startsWith('--project='))?.slice(10),apply=process.argv.includes('--apply');
if(!pid||!/^[-a-zA-Z0-9_]{1,64}$/.test(pid))throw new Error('Usa --project=<id> [--apply].');
const db=adminClient();
const jobs=checked(await db.from('trabajos').select('id,marca_id,payload,resultado,created_at,updated_at').eq('tipo','reels').eq('payload->>proyecto',pid).eq('payload->>op','video_clip').eq('estado','succeeded').order('created_at'));
for(const job of jobs){
 const op=job.payload;
 const name=`video-${op.guion}-clip-${op.indice+1}.mp4`;
 const files=checked(await db.from('archivos').select('id,nombre,created_at,object_path').eq('marca_id',job.marca_id).eq('mime','video/mp4').eq('listo',true).is('eliminado_at',null).eq('nombre',name).gte('created_at',job.created_at).lte('created_at',job.updated_at));
 const candidates=job.resultado?.archivo?files.filter((f:any)=>'storage://'+f.id===job.resultado.archivo):files;
 if(candidates.length!==1){console.log({job:job.id,clip:op.indice+1,skipped:'Archivo no encontrado o ambiguo',candidates:candidates.length});continue;}
 const file=candidates[0],archivo='storage://'+file.id;
 // Check Storage availability without exposing its signed URL.
 checked(await db.storage.from('estudio').info(file.object_path));
 for(let attempt=0;attempt<8;attempt++){
  const row=checked(await db.from('reels_proyectos').select('*').eq('id',pid).single());
  if(!row.documento.videos?.[op.guion]||row.documento.videos[op.guion].marca!==job.marca_id)throw new Error('El video no corresponde a la marca del trabajo.');
  const v=row.documento.videos[op.guion];
  if(v.clips?.[op.indice]?.archivo===archivo||v.versiones_clips?.some((x:any)=>x.archivo===archivo))break;
  console.log({apply,clip:op.indice+1,file:file.id,current:pedidoClipVigente(row.documento,op)});
  if(!apply)break;
  await mkdir('artifacts/video-recovery',{recursive:true});
  await writeFile(`artifacts/video-recovery/${pid}-v${row.version}-${job.id}-${Date.now()}.json`,JSON.stringify(row,null,2),{flag:'wx'});
  const doc=structuredClone(row.documento),vigente=conservarClip(doc,op,archivo,file.created_at,false);
  const saved=checked(await db.from('reels_proyectos').update({documento:doc,version:row.version+1,updated_at:new Date().toISOString()}).eq('id',pid).eq('version',row.version).select('id'));
  if(saved.length){
   checked(await db.from('trabajos').update({resultado:{...job.resultado,archivo,guion:op.guion,indice:op.indice,vigente,paso:vigente?`Clip ${op.indice+1} recuperado`:`Clip ${op.indice+1} recuperado en versiones anteriores`}}).eq('id',job.id).eq('estado','succeeded'));
   break;
  }
  if(attempt===7)throw new Error('Hay cambios simultáneos. Ejecuta la recuperación de nuevo.');
 }
}
