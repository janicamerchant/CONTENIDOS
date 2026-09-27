import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {adminClient,assertTarget,loadLocalEnv} from '../src/config.js';
loadLocalEnv();const target=assertTarget();const db=adminClient();
const dest=`backups/${target}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(`${dest}/objects`,{recursive:true,mode:0o700});
const tables=['miembros','miembro_marca','marcas','personas','persona_marca','archivos','marca_recursos','marca_datos','persona_fotos','proyectos','solicitudes','entregas','trabajos','auditoria'];
const manifest:any={project:target,created_at:new Date().toISOString(),files:[],note:'Copia lógica complementaria, no snapshot transaccional. No incluye auth.users, secretos ni SQL. Pausar escrituras para una copia consistente.'};
for(const table of tables){let rows:any[]=[];for(let from=0;;from+=500){const order=table==='miembro_marca'?['user_id','marca_id']:table==='persona_marca'?['persona_id','marca_id']:table==='persona_fotos'?['persona_id','archivo_id']:table==='miembros'?['user_id']:['id'];let q=db.from(table).select('*');for(const key of order)q=q.order(key);const result=await q.range(from,from+499);if(result.error)throw result.error;rows.push(...result.data);if(result.data.length<500)break;}
 await writeFile(`${dest}/${table}.json`,JSON.stringify(rows,null,2)+'\n',{mode:0o600});
 if(table==='archivos')for(const a of rows.filter(r=>r.listo)){const r=await db.storage.from('estudio').download(a.object_path);if(r.error)throw r.error;const bytes=Buffer.from(await r.data.arrayBuffer());const sha=createHash('sha256').update(bytes).digest('hex');if(a.sha256&&sha!==a.sha256)throw new Error(`Checksum incorrecto: ${a.id}`);await writeFile(`${dest}/objects/${a.id}`,bytes,{mode:0o600});manifest.files.push({id:a.id,path:a.object_path,sha256:sha,bytes:bytes.length});}
}
await writeFile(`${dest}/manifest.json`,JSON.stringify(manifest,null,2)+'\n',{mode:0o600});console.log(`Copia terminada en ${dest}. Guardarla también fuera de este equipo.`);
