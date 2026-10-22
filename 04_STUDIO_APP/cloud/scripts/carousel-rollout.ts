// Metadata checkpoint and explicit defaults update. Never touches project documents or provider credentials.
import {mkdir,writeFile} from 'node:fs/promises';
import {adminClient,assertTarget,loadLocalEnv} from '../src/config.js';
import {campaignBrand} from '../src/campaign.js';
loadLocalEnv();if(assertTarget()!=='okgjpsntveloemjrsmjd')throw Error('Proyecto inesperado');
const db=adminClient(),check=(r:any)=>{if(r.error)throw r.error;return r.data;};
const action=process.argv[2]||'status';
if(action==='backup'){
 const dir=`backups/carousel-rollout-${new Date().toISOString().replace(/[:.]/g,'-')}`;await mkdir(dir,{recursive:true,mode:0o700});
 for(const table of ['marcas','proyectos','entregas','trabajos','archivos','marca_recursos']){
  const rows:any[]=[];for(let n=0;;n+=500){const batch=check(await db.from(table).select('*').order('id').range(n,n+499));rows.push(...batch);if(batch.length<500)break;}
  await writeFile(`${dir}/${table}.json`,JSON.stringify(rows),{mode:0o600});console.log(table,rows.length);
 }
 await writeFile(`${dir}/README.txt`,'Checkpoint lógico de metadatos previo al rollout. No incluye objetos Storage, secretos ni auth.users. Las operaciones posteriores solo añaden columnas y actualizan defaults de marcas.\n',{mode:0o600});console.log('Checkpoint:',dir);
}else if(action==='defaults'){
 const brands=check(await db.from('marcas').select('*').eq('archivada',false).neq('id','_comun'));
 for(const row of brands){
  // Preserve explicit approved patterns. Existing projects keep their frozen campaign and mode.
  if(row.identidad.carouselPattern){console.log(row.id,'patrón conservado');continue;}
  const b=campaignBrand(row.identidad),identity={...row.identidad,fonts:b.fonts,colors:b.colors,titleCase:b.titleCase,modo:'foto'};
  if(JSON.stringify(identity)===JSON.stringify(row.identidad))continue;
  const updated=check(await db.from('marcas').update({identidad:identity,version:row.version+1}).eq('id',row.id).eq('version',row.version).select('id'));
  if(updated.length!==1)throw Error('Conflicto al configurar '+row.id);console.log(row.id,'defaults guardados');
 }
}else if(action==='status'){
 const brands=check(await db.from('marcas').select('id,version,identidad').eq('archivada',false).neq('id','_comun'));
 const active=check(await db.from('trabajos').select('id,estado').in('estado',['queued','running','waiting']));
 console.log(JSON.stringify({activeJobs:active.length,brands:brands.map((r:any)=>({id:r.id,version:r.version,mode:r.identidad.modo,fonts:r.identidad.fonts,pattern:!!r.identidad.carouselPattern}))},null,2));
}else throw Error('Acción desconocida');
