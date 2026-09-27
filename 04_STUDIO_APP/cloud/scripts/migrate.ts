import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {adminClient,assertTarget,loadLocalEnv} from '../src/config.js';
import {buildInventory,verifySource,type Row} from '../src/inventory.js';
import {primaryKeys,canonicalRow} from '../src/import-records.js';
loadLocalEnv();
const root=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const args=process.argv.slice(2);
const apply=args.includes('--apply');
if(args.some(a=>!['--apply'].includes(a)))throw new Error('Uso: npm run inventory | npm run migrate:apply');
const inv=await buildInventory(root);
await mkdir('artifacts',{recursive:true,mode:0o700});
await writeFile('artifacts/inventory.json',JSON.stringify(inv,null,2)+'\n',{mode:0o600});
const summary={fingerprint:inv.fingerprint,tables:Object.fromEntries(Object.entries(inv.tables).map(([k,v])=>[k,v.length])),files:inv.assets.length,bytes:inv.assets.reduce((s,a)=>s+a.bytes,0),quarantine:inv.assets.filter(a=>a.alcance==='cuarentena').length,errors:inv.errors,warnings:inv.warnings};
await writeFile('artifacts/summary.json',JSON.stringify(summary,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(summary,null,2));
if(inv.errors.length)throw new Error('Inventario con errores. No se ha escrito en Supabase.');
if(!apply){console.log('Simulación terminada. No se ha escrito en Supabase.');process.exit(0);}
const target=assertTarget();
console.log(`Destino verificado: ${target}. Importación repetible, sin sobrescribir datos existentes distintos.`);
const db=adminClient();
function check(error:any){if(error)throw new Error(`Supabase: ${error.code??''} ${error.message}`);}
async function insertExact(table:string,row:Row){
 let q=db.from(table).select(Object.keys(row).join(','));for(const key of primaryKeys[table]??['id'])q=q.eq(key,row[key]);
 const existing=await q.maybeSingle();check(existing.error);
 if(existing.data){if(canonicalRow(existing.data)!==canonicalRow(row))throw new Error(`Conflicto en ${table}: ${row.id??JSON.stringify(primaryKeys[table]!.map(k=>row[k]))}. No se sobrescribe; conciliar antes del corte.`);return;}
 check((await db.from(table).insert(row)).error);
}
// Parent records first; files remain unreadable until their bytes are verified remotely.
for(const table of ['marcas','personas','persona_marca'])for(const row of inv.tables[table]!)await insertExact(table,row);
let completed=0;
async function storageRetry<T>(fn:()=>Promise<T>, accepted:(r:T)=>boolean):Promise<T>{
 let last:T;
 for(let i=0;i<3;i++){last=await fn();if(accepted(last))return last;if(i<2)await new Promise(r=>setTimeout(r,1000*(i+1)));}
 return last!;
}
async function transfer(a:typeof inv.assets[number]){
 const bytes=await verifySource(a);const {local_path,...row}=a;delete row.listo;
 await insertExact('archivos',row);
 const object=`${a.id}/original`;
 const ready=await db.from('archivos').select('listo').eq('id',a.id).single();check(ready.error);
 if(!ready.data?.listo){
  const upload=await storageRetry(()=>db.storage.from('estudio').upload(object,bytes,{contentType:a.mime,upsert:false}),r=>!r.error||/already exists|duplicate/i.test(r.error.message));
  // After a crash, an object may already exist while listo=false. Verify it below.
  if(upload.error && !/already exists|duplicate/i.test(upload.error.message))check(upload.error);
 }
 const download=await storageRetry(()=>db.storage.from('estudio').download(object),r=>!r.error);check(download.error);
 const sha=createHash('sha256').update(Buffer.from(await download.data!.arrayBuffer())).digest('hex');
 if(sha!==a.sha256)throw new Error(`Checksum remoto incorrecto: ${a.origen}`);
 check((await db.from('archivos').update({listo:true}).eq('id',a.id)).error);
 if(++completed%25===0)console.log(`Archivos verificados: ${completed}/${inv.assets.length}`);
}
// Independent immutable object paths can transfer concurrently; all workers settle before exit.
let next=0;
const transfers=await Promise.allSettled(Array.from({length:3},async()=>{while(next<inv.assets.length){const a=inv.assets[next++]!;await transfer(a);}}));
const failed=transfers.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;
for(const table of ['marca_recursos','marca_datos','persona_fotos','proyectos','solicitudes','entregas'])for(const row of inv.tables[table]!)await insertExact(table,row);
// Detect source changes made while uploads were running.
const final=await buildInventory(root);
if(final.fingerprint!==inv.fingerprint)throw new Error('El Estudio local cambió durante la copia. No hacer el corte: generar un inventario nuevo y conciliar.');
await writeFile(`artifacts/receipt-${target}.json`,JSON.stringify({target,completed_at:new Date().toISOString(),fingerprint:inv.fingerprint,summary},null,2)+'\n',{mode:0o600});
console.log('Copia verificada. Esto no cambia el Estudio local ni habilita producción.');
