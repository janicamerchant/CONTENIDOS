// Uses the Management migration endpoint, preserving history and matching local version.
import {readFile,rename,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {management} from './management.mjs';
const file=process.argv[2];
if(!file||!/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(file))throw new Error('Indica una migración dentro de supabase/migrations/');
const name=path.basename(file).replace(/^\d{14}_/,'').replace(/\.sql$/,'');
const before=await management('/database/migrations');
if(before.some(m=>m.name===name))throw new Error('Migración ya registrada. No se vuelve a aplicar.');
await management('/database/migrations',{method:'POST',body:{name,query:await readFile(file,'utf8')}});
const history=await management('/database/migrations');const applied=history.find(m=>m.name===name);
if(!applied)throw new Error('No se pudo verificar el historial tras aplicar.');
const target=`supabase/migrations/${applied.version}_${name}.sql`;
if(file!==target)await rename(file,target);
await mkdir('artifacts',{recursive:true,mode:0o700});
await writeFile('artifacts/remote-migrations.json',JSON.stringify(history,null,2),{mode:0o600});
console.log('Migración aplicada y verificada:',target);
