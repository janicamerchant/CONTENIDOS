// Apply the user's approved Janica default. Backs up records and uses optimistic version checks.
import {mkdir,writeFile} from 'node:fs/promises';
import {loadLocalEnv,adminClient,assertTarget} from '../src/config.js';
import {checked} from '../src/library.js';
import {campaignTypography} from '../src/campaign.js';
import {FONT_PAIRS} from '../shared/typography.js';
loadLocalEnv();assertTarget();const db=adminClient(),pid=process.argv[2];
const pair=FONT_PAIRS[0]!,fonts={display:pair.display,body:pair.body,displayWeight:pair.displayWeight,bodyWeight:pair.bodyWeight};
const dir='artifacts/janica-typography';await mkdir(dir,{recursive:true});
let updated=false;
for(let attempt=0;attempt<4&&!updated;attempt++){
 const b=checked(await db.from('marcas').select('*').eq('id','janica').single());
 await writeFile(`${dir}/brand-before-${attempt}.json`,JSON.stringify(b,null,2));
 const identidad={...b.identidad,fonts};
 if(identidad.carouselPattern)identidad.carouselPattern={...identidad.carouselPattern,style:{...identidad.carouselPattern.style,fonts}};
 const rows=checked(await db.from('marcas').update({identidad,version:b.version+1,updated_at:new Date().toISOString()}).eq('id','janica').eq('version',b.version).select('id'));
 updated=rows.length>0;
}
if(!updated)throw new Error('La marca está cambiando; no se sobrescribió.');
if(pid){
 updated=false;
 for(let attempt=0;attempt<4&&!updated;attempt++){
  const row=checked(await db.from('proyectos').select('*').eq('id',pid).eq('marca_id','janica').single());
  await writeFile(`${dir}/selected-project-before-${attempt}.json`,JSON.stringify(row,null,2));
  const doc={...row.documento,campaign:campaignTypography(row.documento.campaign,'janica',fonts),review:null,coverReview:null};
  const rows=checked(await db.from('proyectos').update({documento:doc,version:row.version+1,updated_at:new Date().toISOString()}).eq('id',pid).eq('version',row.version).select('id'));
  updated=rows.length>0;
 }
 if(!updated)throw new Error('El proyecto está cambiando; no se sobrescribió.');
}
const b=checked(await db.from('marcas').select('identidad').eq('id','janica').single());
if(b.identidad.fonts.display!==fonts.display||b.identidad.fonts.body!==fonts.body)throw new Error('No se pudo verificar la tipografía.');
console.log('Janica: Instrument Serif + Montserrat guardadas y verificadas. Se conservaron los ajustes por elemento.');
