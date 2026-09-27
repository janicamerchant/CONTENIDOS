import {randomUUID} from 'node:crypto';
import {adminClient,assertTarget,loadLocalEnv} from '../src/config.js';
import {checked} from '../src/library.js';
loadLocalEnv();assertTarget();const db=adminClient();const backgrounds:Record<string,string>={};
for(const [theme,name] of [['dark','1.png'],['light','2.png']]){
 const origen='marca:eva:legacy-background:'+name;
 let file=checked(await db.from('archivos').select('*').eq('origen',origen).maybeSingle());
 if(!file){const original=checked(await db.from('archivos').select('*').eq('origen','cuarentena:02_ARCHIVOS_ORIGINALES/'+name).single());const id=randomUUID();
 checked(await db.from('archivos').insert({id,alcance:'marca',marca_id:'eva',nombre:'fondo-'+theme+'.png',mime:original.mime,bytes:original.bytes,sha256:original.sha256,origen}));
 const copied=await db.storage.from('estudio').copy(original.object_path,id+'/original');if(copied.error){await db.from('archivos').delete().eq('id',id);checked(copied);}
 checked(await db.from('archivos').update({listo:true}).eq('id',id));file={id};}
 backgrounds[theme!]='storage://'+file.id;
}
const brand=checked(await db.from('marcas').select('*').eq('id','eva').single());
if(JSON.stringify(brand.identidad.backgrounds)!==JSON.stringify(backgrounds)){const saved=checked(await db.from('marcas').update({identidad:{...brand.identidad,backgrounds},version:brand.version+1,updated_at:new Date().toISOString()}).eq('id','eva').eq('version',brand.version).select('id'));if(!saved.length)throw Error('La marca cambió. Reintenta.');}
console.log('Fondos de EVA asociados como copias privadas; originales preservados.');
