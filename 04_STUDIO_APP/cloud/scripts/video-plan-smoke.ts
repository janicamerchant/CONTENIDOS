// Prueba real del plan de video con Claude (consume céntimos) sin escribir en la base: lee un guion y la persona.
// Uso: npx tsx scripts/video-plan-smoke.ts <proyecto> [guion_id] [persona]
import {loadLocalEnv,adminClient} from '../src/config.js';
import {herramientas,sinPretitulos} from '../src/reels.js';
import {pedirPlan} from '../src/reels-video.js';
import {revisarPlan,promptVideo,soloHablado} from '../shared/ugc.js';
loadLocalEnv();
const [pid,gid,pers='janica']=process.argv.slice(2);const db=adminClient();
const row=(await db.from('reels_proyectos').select('*').eq('id',pid!).single()).data;
const g=gid?row.documento.analisis.guiones.find((x:any)=>x.id===gid):row.documento.analisis.guiones[0];
const marca=(await db.from('marcas').select('identidad').eq('id',g.cliente_id||row.marca_id).single()).data;
const cfg=(await db.from('reels_marcas').select('contexto').eq('marca_id',g.cliente_id||row.marca_id).maybeSingle()).data;
const p=(await db.from("personas").select("identidad").eq("id",pers).single()).data!.identidad;
const guion=soloHablado(sinPretitulos(g.guion));
const r=await pedirPlan(herramientas.claudeJson,{nombre:marca!.identidad?.name,contexto:cfg?.contexto||''},{nombre:p.name,descripcion:p.descripcion||'',voz:p.voz||{}},g.titulo,guion);
console.log('GUION:\n'+guion+'\n');console.log(JSON.stringify(r.plan,null,1));
if(r.plan){console.log('\nAVISOS:',revisarPlan(guion,r.plan));console.log('\nPROMPT CLIP 1:\n'+promptVideo(r.plan,r.plan.clips[0]!));}
console.log('\nCoste Claude: US$',r.usd.toFixed(4));
// Diferencia palabra a palabra entre el guion y las frases (sin gestos ni puntuación).
if(r.plan){const n=(t:string)=>t.replace(/\[[^\]]*\]/g,' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9ñ]+/g,' ').trim().split(' ');
 const a=n(guion),b=n(r.plan.clips.map(c=>c.frase).join(' '));let i=0;while(i<a.length&&a[i]===b[i])i++;
 if(i<Math.max(a.length,b.length))console.log(`\nPRIMERA DIFERENCIA en la palabra ${i}:\n guion: …${a.slice(Math.max(0,i-5),i+8).join(' ')}\n plan:  …${b.slice(Math.max(0,i-5),i+8).join(' ')}`);}
