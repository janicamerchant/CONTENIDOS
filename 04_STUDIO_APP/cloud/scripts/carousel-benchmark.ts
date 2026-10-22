// Read-only quality/cost report plus reproducible briefs. Does not call paid providers.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {loadLocalEnv,adminClient,assertTarget} from '../src/config.js';
import {validateCarousel,reviewIssues} from '../shared/carousel.js';
import {campaignBrand,validReview} from '../src/campaign.js';
import {coverRevision} from '../shared/carousel.js';
loadLocalEnv();assertTarget();const db=adminClient(),check=(r:any)=>{if(r.error)throw r.error;return r.data;};
const briefs=JSON.parse(await readFile('benchmarks/carousel-briefs.json','utf8'));
async function all(table:string){const result:any[]=[];for(let n=0;;n+=500){const batch=check(await db.from(table).select('*').order('id').range(n,n+499));result.push(...batch);if(batch.length<500)return result;}}
const [brands,projects,jobs]=await Promise.all([all('marcas'),all('proyectos'),all('trabajos')]);
const report={createdAt:new Date().toISOString(),note:'Histórico, no evaluación causal. Validez estructural no equivale a calidad visual. Costos desconocidos se cuentan aparte. Los briefs fijos se ejecutan manualmente desde Crear para comparar versiones con el mismo contenido.',brands:brands.filter(b=>!b.archivada&&b.id!=='_comun').map(row=>{
 const brand=campaignBrand({...row.identidad,id:row.id}),ps=projects.filter(p=>p.marca_id===row.id),js=jobs.filter(j=>j.marca_id===row.id),images=js.filter(j=>j.tipo==='imagen'),groups=new Map<string,number>();
 for(const j of images){const key=j.proyecto_id+':'+(j.payload.slideId||j.payload.slide?.id||j.lamina_id);groups.set(key,(groups.get(key)||0)+1);}
 const succeeded=images.filter(j=>j.estado==='succeeded');
 return {id:row.id,name:brand.name,brief:briefs.find((b:any)=>b.id===row.id)||null,mode:brand.modo,fonts:brand.fonts,patternApproved:!!brand.carouselPattern,projects:ps.length,structurallyValidProjects:ps.filter(p=>!validateCarousel(p.documento.slides).length).length,readyForReview:ps.filter(p=>!reviewIssues(p.documento).length).length,approvedCovers:ps.filter(p=>validReview(p.documento.coverReview,coverRevision(p.documento))).length,imageAttempts:images.length,imageSuccesses:succeeded.length,failedImages:images.filter(j=>['failed','uncertain'].includes(j.estado)).length,additionalAttempts:[...groups.values()].reduce((n,v)=>n+Math.max(0,v-1),0),knownCostUsd:js.reduce((n,j)=>n+Number(j.coste_usd||0),0),imagesWithUnknownCost:succeeded.filter(j=>j.coste_usd===null).length,manualVisualReview:'pending'};
})};
await mkdir('artifacts/benchmarks',{recursive:true});await writeFile('artifacts/benchmarks/latest.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
