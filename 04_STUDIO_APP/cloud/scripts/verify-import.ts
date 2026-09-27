import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
import {adminClient,assertTarget,loadLocalEnv} from '../src/config.js';
import {buildInventory,type Row} from '../src/inventory.js';
import {primaryKeys,canonicalRow} from '../src/import-records.js';
loadLocalEnv();const target=assertTarget();const db=adminClient();
const root=path.resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const inventory=await buildInventory(root);if(inventory.errors.length)throw new Error('Errores en el inventario local.');
const tables={...inventory.tables,archivos:inventory.assets.map(({local_path,...a})=>({...a,listo:true}))};
for(const [table,expected] of Object.entries(tables)){
 if(!expected.length)continue;
 const fields=Object.keys(expected[0]!);const rows:Row[]=[];
 for(let i=0;;i+=500){let q=db.from(table).select(fields.join(','));for(const k of primaryKeys[table]??['id'])q=q.order(k);const result=await q.range(i,i+499);if(result.error)throw result.error;rows.push(...result.data);if(result.data.length<500)break;}
 const key=(r:Row)=>(primaryKeys[table]??['id']).map(k=>r[k]).join(':');const remote=new Map(rows.map(r=>[key(r),r]));
 for(const row of expected){const got=remote.get(key(row));if(!got||canonicalRow(got)!==canonicalRow(row))throw new Error(`Diferencia en ${table} (${key(row)}); no se declara copia completa.`);}
 console.log(`OK ${table}: ${expected.length}`);
}
// listo=true is set only after migrate.ts downloads the stored object and validates SHA-256.
const final=await buildInventory(root);if(final.fingerprint!==inventory.fingerprint)throw new Error('Origen modificado durante la verificación.');
await mkdir('artifacts',{recursive:true,mode:0o700});
await writeFile('artifacts/inventory.json',JSON.stringify(inventory,null,2)+'\n',{mode:0o600});
await writeFile(`artifacts/receipt-${target}.json`,JSON.stringify({target,completed_at:new Date().toISOString(),fingerprint:inventory.fingerprint,tables:Object.fromEntries(Object.entries(tables).map(([k,v])=>[k,v.length])),files:inventory.assets.length,bytes:inventory.assets.reduce((s,a)=>s+a.bytes,0),verification:'Local source matches remote rows and SHA-256-verified ready files. Not a production cutover.'},null,2)+'\n',{mode:0o600});
console.log('Copia reconciliada con el origen actual. Recibo guardado.');
