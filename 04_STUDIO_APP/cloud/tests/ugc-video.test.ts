import test from 'node:test';
import assert from 'node:assert/strict';
import {promptVideo,revisarPlan,palabras,soloHablado,type PlanVideo,type Clip} from '../shared/ugc.js';
import {planSchema} from '../src/reels-video.js';

const clip=(frase:string,extra:Partial<Clip>={}):Clip=>({frase,modelo:'omni',segundos:6,que_se_ve:'',prompt_imagen:'',camera:'Static camera.',movement:'none',micro_action:'smiles',...extra});
const plan=(clips:Clip[]):PlanVideo=>({escena:'',sujeto:'she',voice:'Female, 30s, warm.',accent:'Spanish with a Venezuelan accent.',clips});

test('los gestos entre corchetes no cuentan como palabras',()=>{assert.equal(palabras('Mira esto [señala a cámara] ahora'),3);});

test('el plan que cubre el guion exacto no tiene avisos, aunque cambien tildes, puntuación y gestos',()=>{
 const guion='¿Quieres vender más?\n\nDeja de esconderte detrás de tu logo.';
 assert.deepEqual(revisarPlan(guion,plan([clip('¿Quieres vender más? [sonríe]'),clip('Deja de esconderte detras de tu logo')])),[]);
});

test('avisa si falta guion, si un clip de Omni es demasiado largo o si Grok no dura 6-15 s',()=>{
 const largo=Array(30).fill('palabra').join(' ');
 const avisos=revisarPlan('Hola. '+largo+' Adiós.',plan([clip('Hola.'),clip(largo),clip('Chao.',{modelo:'grok',segundos:4})]));
 assert.ok(avisos.some(a=>a.includes('Clip 2')&&a.includes('30 palabras')));
 assert.ok(avisos.some(a=>a.includes('Clip 3')&&a.includes('Grok')));
 assert.ok(avisos.some(a=>a.includes('no coinciden con el guion')));
});

test('el prompt de Omni lleva los 6 bloques con la voz y el acento comunes, y la frase exacta',()=>{
 const p=plan([clip('Hola, soy Janica.')]);const txt=promptVideo(p,p.clips[0]!);
 for(const b of ['CAMERA:','MOVEMENT:','MICRO-ACTION:','SCRIPT: she says: "Hola, soy Janica."','VOICE: Female, 30s, warm.','ACCENT: Spanish with a Venezuelan accent.'])assert.ok(txt.includes(b),b);
 assert.ok(txt.includes('Single continuous take'));
 assert.ok(promptVideo({...p,sujeto:'he'},p.clips[0]!).includes('SCRIPT: he says'));
});

test('el prompt de Grok pide boca cerrada y no lleva guion, voz ni acento',()=>{
 const c=clip('Esto se dice en off.',{modelo:'grok',segundos:8});const txt=promptVideo(plan([c]),c);
 assert.ok(txt.includes('No talking, mouth closed'));
 for(const b of ['SCRIPT','VOICE','ACCENT','Esto se dice'])assert.ok(!txt.includes(b),b);
});

test('el plan editado se valida: modelo conocido, segundos 3-15 y máximo de clips',()=>{
 assert.ok(planSchema.safeParse(plan([clip('Hola.')])).success);
 assert.ok(!planSchema.safeParse(plan([clip('Hola.',{modelo:'veo' as any})])).success);
 assert.ok(!planSchema.safeParse(plan([clip('Hola.',{segundos:40})])).success);
 assert.ok(!planSchema.safeParse(plan(Array(31).fill(clip('Hola.')))).success);
});

test('los encabezados de sección solos en su línea no cuentan como guion',()=>{
 const guion='GANCHO (0-3 s)\nLlevas meses viendo cursos.\n\n2. CIERRE\nComenta PASO.';
 assert.equal(soloHablado(guion),'Llevas meses viendo cursos.\n\nComenta PASO.');
 assert.deepEqual(revisarPlan(guion,plan([clip('Llevas meses viendo cursos.'),clip('Comenta PASO.')])),[]);
});

test('imagen del clip 1 desde las fotos; las demás editan el clip 1 y usan las fotos solo para la cara',async()=>{
 const {promptImagen}=await import('../src/reels-video.js');
 const uno=promptImagen(0,'Medium shot in a bright office.','IDENTITY LOCK: Janica.');
 assert.ok(uno.startsWith('Medium shot in a bright office.'));assert.ok(uno.includes('IDENTITY LOCK: Janica.'));assert.ok(!uno.includes('Edit reference image 1'));
 const dos=promptImagen(1,'Keep the same person. Close-up.','IDENTITY LOCK: Janica.');
 assert.ok(dos.startsWith('Edit reference image 1'));assert.ok(dos.includes('identity references only'));assert.ok(dos.includes('No text, no watermark'));
});
