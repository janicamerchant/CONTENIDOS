// Pure contract shared by browser, API and worker. No credentials or browser APIs.
export {FONT_PAIRS,fontCapabilities,realFontWeight,fontRequest} from './typography.js';
export const MAX_SLIDES=10;
export const CONTENT_FIELDS=['layout','theme','kicker','title','body','number','numberLabel','items','leftLabel','leftItems','rightLabel','rightItems','cta','source','photo','photoPrompt','basePhoto','outfit','blocks','template','bw','people'] as const;
export function canonical(value:any):string {
 if(value===undefined)return 'null';
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function slideContent(s:any){return Object.fromEntries(CONTENT_FIELDS.map(k=>[k,s[k]??(['items','leftItems','rightItems','blocks','people'].includes(k)?[]:k==='bw'?false:'')]));}
export const slideRevision=(s:any)=>canonical(slideContent(s));
export function resolveMode(requested:any,brand:any){return ['foto','completa','editable'].includes(requested)?requested:['foto','completa','editable'].includes(brand?.modo)?brand.modo:'foto';}
export const cleanText=(v:any)=>String(v||'').replace(/[*_=]/g,'').trim();
export function janicaNaturalColor(brief:any){
 if(brief.marca!=='janica')return false;
 const text=[brief.idea,brief.tema,brief.notas,brief.instrucciones].filter(Boolean).join('\n');
 const ask=/(?:foto(?:graf[ií]a)?s?|im[aá]genes?|carrusel|l[aá]minas?)\s+(?:en\s+)?(?:blanco\s+y\s+negro|monocrom[oas]+)|(?:black.and.white|monochrome)\s+(?:photo|image|carousel)/iu;
 return !ask.test(text)||/(?:sin|evita|no\s+(?:uses|quiero))\s+(?:fotos?\s+(?:en\s+)?)?(?:blanco\s+y\s+negro|monocrom[ií]a)/iu.test(text);
}
export function normalizePhotoColor(proposal:any,brief:any){
 if(!janicaNaturalColor(brief))return proposal;
 return {...proposal,slides:(proposal.slides||[]).map((s:any)=>{
  const prompt=String(s.photoPrompt||'').replace(/(?:black[- ]and[- ]white|b&w|monochrome|gr[ae]yscale)\s+(?:(?:editorial|portrait|fashion)\s+)?(?:photograph(?:y)?|photo|image|portrait)/gi,(m:string,at:number,all:string)=>/\b(?:no|not|avoid)\s*$/i.test(all.slice(Math.max(0,at-12),at))?m:'natural color photograph');
  return {...s,bw:false,...(prompt?{photoPrompt:prompt+'\nPhotography in natural color with realistic skin and material colors. No monochrome treatment.'}:{})};
 })};
}
const wordCount=(v:any)=>cleanText(v).split(/\s+/).filter(Boolean).length;
export const TEMPLATE_WORDS:Record<string,number>={'portada-subrayado':18,'a-ti-si':45,'cifra-resaltada':25,'arriba-abajo':35,'voz-interior':45,escalera:40,'dato-centrado':40,'cierre-guardar':55,'remate-linea':35};
export function slideTexts(s:any):string[]{
 return (s.layout==='bloques'?(s.blocks||[]).filter((b:any)=>!['linea','firma','fuente'].includes(b.style)).map((b:any)=>b.text):[s.kicker,s.title,s.number,s.numberLabel,s.body,...(s.items||[]),s.leftLabel,...(s.leftItems||[]),s.rightLabel,...(s.rightItems||[]),s.cta]).map(cleanText).filter(Boolean);
}
export function validateSlide(s:any):string[]{
 const errors:string[]=[];
 if(!s||typeof s!=='object')return ['Lámina inválida.'];
 for(const field of ['items','leftItems','rightItems'])if(s[field]!==undefined&&(!Array.isArray(s[field])||s[field].some((t:any)=>typeof t!=='string')))return [`${field}: usa una lista de textos.`];
 if(s.blocks!==undefined&&(!Array.isArray(s.blocks)||s.blocks.some((b:any)=>!b||typeof b.text!=='string')))return ['Bloques inválidos.'];
 for(const field of ['title','body','kicker','source','number','numberLabel','cta','photo','photoPrompt'])if(s[field]!==undefined&&typeof s[field]!=='string')return [`${field}: usa texto.`];
 if(!['portada','escena','frase','cifra','lista','comparar','cta','bloques'].includes(s.layout))errors.push('Diseño desconocido.');
 if(!['dark','light'].includes(s.theme))errors.push('Elige fondo claro u oscuro.');
 const limit=s.layout==='bloques'?TEMPLATE_WORDS[s.template]||45:25;
 if(slideTexts(s).reduce((n,t)=>n+wordCount(t),0)>limit)errors.push(`Máximo ${limit} palabras por lámina, sin contar la fuente.`);
 if(!slideTexts(s).length)errors.push('Falta el texto de la lámina.');
 if(s.layout==='bloques'){
  if(!(s.blocks||[]).length||s.blocks.length>18)errors.push('Usa entre 1 y 18 bloques.');
  if(s.template&&!TEMPLATE_WORDS[s.template])errors.push('Plantilla desconocida.');
  if([s.kicker,s.title,s.body,s.number,s.numberLabel,s.cta,...(s.items||[]),...(s.leftItems||[]),...(s.rightItems||[])].some(v=>cleanText(v)))errors.push('En bloques, todo el texto debe estar en los bloques.');
  for(const b of s.blocks||[])if(!['arriba','centro','abajo','izquierda','derecha'].includes(b.zone)||!['izq','centro','der'].includes(b.align))errors.push('Zona o alineación de bloque inválida.');
 }else{
  if((s.blocks||[]).length)errors.push('Este diseño no admite bloques.');
  if(s.layout==='lista'&&((s.items||[]).filter(Boolean).length!==3||cleanText(s.body)))errors.push('La lista lleva tres puntos y no lleva apoyo.');
  if(s.layout==='comparar'&&((s.leftItems||[]).filter(Boolean).length!==3||(s.rightItems||[]).filter(Boolean).length!==3))errors.push('La comparación lleva tres puntos por columna.');
  if(s.layout==='cifra'&&(!cleanText(s.number)||!cleanText(s.numberLabel)))errors.push('Completa la cifra y su etiqueta.');
  if(wordCount(s.title)>7)errors.push('El titular admite hasta 7 palabras.');
  if(wordCount(s.body)>12)errors.push('El apoyo admite hasta 12 palabras.');
 }
 if((s.layout==='cifra'||(s.blocks||[]).some((b:any)=>b.style==='cifra'))&&!cleanText(s.source)&&!(s.blocks||[]).some((b:any)=>b.style==='fuente'&&cleanText(b.text)))errors.push('Añade la fuente de la cifra.');
 if(slideTexts(s).some(t=>/\[(VERIFICAR|FUENTE)\]|\bXX\b/i.test(t)))errors.push('Hay marcadores sin resolver.');
 return [...new Set(errors)];
}
export function validateCarousel(slides:any[],count?:number):string[]{
 if(!Array.isArray(slides)||!slides.length||slides.length>MAX_SLIDES)return [`El carrusel debe tener entre 1 y ${MAX_SLIDES} láminas.`];
 const errors=count&&slides.length!==count?[`Se pidieron ${count} láminas y llegaron ${slides.length}.`]:[];
 slides.forEach((s,i)=>{errors.push(...validateSlide(s).map(e=>`Lámina ${i+1}: ${e}`));if(i&&s.template&&s.template===slides[i-1].template)errors.push(`Lámina ${i+1}: no repitas plantilla seguida.`);});
 const content=slides.map(s=>canonical(slideTexts(s)));
 if(new Set(content).size!==content.length)errors.push('Dos láminas repiten el mismo contenido.');
 return errors;
}
export function requestedCount(v:any){const n=Number(v||7);if(!Number.isInteger(n)||n<1||n>MAX_SLIDES)throw new Error(`Elige de 1 a ${MAX_SLIDES} láminas.`);return n;}
// Keep commercial claims and statistical qualifiers tied to the user's brief.
// This is a consistency check, not a factual verification of the source.
export function proposalIssues(proposal:any,brief:any):string[]{
 const errors=validateCarousel(proposal.slides,requestedCount(brief.laminas));
 const input=[brief.idea,brief.tema,brief.guion,brief.script,brief.cta,brief.notas].filter(Boolean).join('\n');
 const output=[proposal.caption,...(proposal.slides||[]).flatMap(slideTexts)].join('\n');
 const free=/\b(?:gratis|gratuit[oa]s?)\b|\bsin\s+cost[oe]\b|\bno\s+charge\b|\bfor\s+free\b|\bfree\s+(?:guide|template|download|resource|sheet|gift|worksheet|ebook)\b|^\s*free\s*$/imu;
 const commercialText=(v:string)=>v.replace(/\b(?:no|nunca|nada|not|never)\s+(?:[\p{L}]+\s+){0,3}(?:gratis|gratuit[oa]s?|free)\b/giu,'');
 if(free.test(commercialText(output))&&!free.test(commercialText(input)))errors.push('No añadas gratuidad a la oferta: el brief no dice que sea gratis.');
 const averageNumbers=[...input.matchAll(/(?:promedio|average|media)\b[^\d\n.!?]{0,45}(\d+(?:[.,]\d+)?)/giu)].map(m=>m[1]!);
 for(const [i,s] of (proposal.slides||[]).entries()){
  const text=slideTexts(s).join(' ');
  for(const n of averageNumbers){const escaped=n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   if(new RegExp(`(?<![\\d])${escaped}(?![\\d])`,'u').test(text)&&!/(?:promedio|average|aprox(?:imad[oa](?:mente)?)?|\bmedia\b)/iu.test(text))errors.push(`Lámina ${i+1}: conserva el carácter promedio o aproximado de ${n}; no lo conviertas en una consecuencia universal.`);
   const individual=/despu[eé]s\s+de\s+un\s+solo|(?:por|con)\s+cada\s+(?:chequeo|interrupci[oó]n)|after\s+(?:a\s+)?single\s+(?:check|interruption)|every\s+(?:check|interruption)/iu;
   if(new RegExp(`(?<![\\d])${escaped}(?![\\d])`,'u').test(text)&&individual.test(text)&&!individual.test(input))errors.push(`Lámina ${i+1}: no atribuyas el promedio de ${n} a un solo chequeo o a cada interrupción; conserva el contexto observado.`);
  }
 }
 return [...new Set(errors)];
}
export function makeDraft(brief:any,d:any,brand:any,people:(text:string)=>string[]=()=>[]){
 const modo=resolveMode(brief.modo,d.campaign?.brand||brand);
 return {brief:{...brief,modo},brand:brief.marca,modo,campaign:d.campaign,name:d.name||brief.idea||brief.tema||'Carrusel',concept:d.concept||'',caption:d.caption||'',visualSystem:d.visualSystem||'',avoid:d.avoid||'',
  slides:(d.slides||[]).map((s:any)=>({...s,gen:modo!=='foto'||!!(s.photoPrompt||s.photo),people:s.people??people(`${s.photo||''} ${s.photoPrompt||''}`)})),
  research:d.research||'',missingModels:d.missingModels||[],usage:d.usage,claudeUsd:d.usage?.usd||0,calls:1};
}
const VISUAL_FIELDS=['image','cutout','full','layers','motor','tamano','ix','iy','iz','dx','dy','move','fx','layer','qa','editability','manifest','soul'] as const;
export function visualSnapshot(s:any){return structuredClone(Object.fromEntries(VISUAL_FIELDS.map(k=>[k,s[k]??null])));}
export function applyVisual(s:any,r:any){
 s.previousVisual=visualSnapshot(s);
 Object.assign(s,{image:r.url,cutout:r.cutout||'',full:!!r.full,layers:r.layers||null,motor:r.motor||'',tamano:r.tamano||'',ix:50,iy:r.full?50:30,iz:1,dx:0,dy:0,move:{},fx:{},layer:{},qa:r.qa||'',editability:r.editability||'none',manifest:r.manifest||null,soul:!!r.soul});
}
export function undoVisual(s:any){if(s.previousVisual){const now=visualSnapshot(s);Object.assign(s,s.previousVisual);s.previousVisual=now;}else if(s.prevImage){[s.image,s.prevImage]=[s.prevImage,s.image];[s.cutout,s.prevCutout]=[s.prevCutout||'',s.cutout||''];s.layers=null;}}
export function resultTarget(slides:any[],result:any){
 if(!result.slideId||!result.revision)return undefined; // old index-only jobs require explicit recovery, never guess
 const s=slides.find(s=>s.id===result.slideId);
 return s&&slideRevision(s)===result.revision&&(s.image||'')===(result.originalImage||'')?s:undefined;
}
export function reviewRevision(p:any){return canonical({brand:p.brand,campaign:p.campaign,modo:p.modo,visualSystem:p.visualSystem,avoid:p.avoid,slides:(p.slides||[]).map((s:any)=>({id:s.id,content:slideContent(s),visual:visualSnapshot(s)}))});}
export function coverRevision(p:any){return reviewRevision({...p,slides:(p.slides||[]).slice(0,1)});}
export function coverIssues(p:any){return reviewIssues({...p,slides:(p.slides||[]).slice(0,1)});}
export function reviewIssues(p:any){
 const errors=validateCarousel(p.slides);
 for(const [i,s] of (p.slides||[]).entries()){
  if((s.photo||s.photoPrompt||s.full||s.layout==='portada')&&!s.image)errors.push(`Lámina ${i+1}: falta la imagen.`);
  if(p.modo==='editable'&&(!s.layers?.on||!s.layers?.plate))errors.push(`Lámina ${i+1}: falta completar las capas editables.`);
 }
 return errors;
}
