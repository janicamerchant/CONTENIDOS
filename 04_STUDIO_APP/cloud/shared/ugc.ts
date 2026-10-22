// Contrato puro del video UGC (skill video-ugc-hiperrealista): lo usan el navegador, la API y la cola.
// El prompt de cada clip se arma aquí y no lo escribe Claude entero: VOICE y ACCENT tienen que ser idénticos
// en todos los clips (si cambian, la voz cambia de un clip a otro) y SCRIPT tiene que ser la frase exacta del guion.
export const MAX_CLIPS=30;          // los guiones del Estudio pasan de 1 a 3,5 minutos
export const MAX_PALABRAS=25;          // unos 8 s de habla
export const MODELOS_CLIP=['omni','grok'] as const;
export type ModeloClip=typeof MODELOS_CLIP[number];
export type Clip={frase:string;modelo:ModeloClip;segundos:number;que_se_ve:string;prompt_imagen:string;camera:string;movement:string;micro_action:string};
export type PlanVideo={escena:string;sujeto:'she'|'he';voice:string;accent:string;clips:Clip[]};

// Los [gestos] van dentro de la frase para Omni pero no se dicen: no cuentan como palabras ni como guion.
export const sinGestos=(t:string)=>String(t||'').replace(/\[[^\]]*\]/g,' ').replace(/\s+/g,' ').trim();
// Encabezados de sección que quedan solos en su línea y sin dos puntos ("GANCHO (0-3 s)", "2. CIERRE"): no se dicen.
const ENCABEZADO=/^\s*(?:\d+[.)]\s*)?[A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ0-9 /&+-]{2,40}(?:\s*\([^)\n]{0,30}\))?\s*$/;
export const soloHablado=(guion:string)=>String(guion||'').split('\n').filter(l=>!ENCABEZADO.test(l)).join('\n').replace(/\n{3,}/g,'\n\n').trim();
export const palabras=(t:string)=>sinGestos(t).split(' ').filter(Boolean).length;
const comparable=(t:string)=>sinGestos(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9ñ]+/g,' ').trim();

export function promptVideo(plan:PlanVideo,c:Clip){
 const cierre='Single continuous take, no cuts or scene changes.';
 if(c.modelo==='grok')return [`Using this image, keep the person and the setting exactly the same. ${c.camera.trim()} ${c.movement.trim()}`.trim(),
  c.micro_action.trim(),'No talking, mouth closed. '+cierre+' No text, no watermark.'].filter(Boolean).join(' ');
 return [`CAMERA: ${c.camera.trim()} ${cierre}`,`MOVEMENT: ${c.movement.trim()||'none'}.`.replace(/\.\.$/,'.'),`MICRO-ACTION: [${c.micro_action.trim()}]`,
  `SCRIPT: ${plan.sujeto==='he'?'he':'she'} says: "${c.frase.trim()}"`,`VOICE: ${plan.voice.trim()}`,`ACCENT: ${plan.accent.trim()}`].join('\n');
}

// Avisos para quien revisa el plan antes de gastar: el guion completo y en orden, y clips que caben en ~8 s.
export function revisarPlan(guion:string,plan:PlanVideo){
 const avisos:string[]=[];
 if(!plan.clips.length)return ['El plan no tiene clips.'];
 if(plan.clips.length>MAX_CLIPS)avisos.push(`Tiene ${plan.clips.length} clips; el máximo es ${MAX_CLIPS}.`);
 plan.clips.forEach((c,i)=>{
  const n=palabras(c.frase);
  if(c.modelo==='omni'&&n>MAX_PALABRAS)avisos.push(`Clip ${i+1}: ${n} palabras no caben en un clip de Omni (máx. ${MAX_PALABRAS}). Divídelo.`);
  if(!n)avisos.push(`Clip ${i+1}: no tiene frase.`);
  if(c.modelo==='grok'&&(c.segundos<6||c.segundos>15))avisos.push(`Clip ${i+1}: Grok dura entre 6 y 15 segundos.`);
 });
 if(comparable(plan.clips.map(c=>c.frase).join(' '))!==comparable(soloHablado(guion)))avisos.push('Las frases de los clips no coinciden con el guion completo: revisa que no falte, sobre o cambie nada.');
 return avisos;
}
