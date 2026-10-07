import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1120,height:1400}});
 const css=await readFile('web/legacy/slides.css','utf8');
 const app=await readFile('web/legacy/app.js','utf8');
 const fit=app.slice(app.indexOf('function fitSlide(el) {'),app.indexOf('// ---------------------------------------------------------------- estado'));
 await page.setContent(`<style>${css}\n.slide{--f-display:Georgia;--f-body:Arial;--ts:1;--s-ink:#1f1d1b;--lime:#ecfe6e;background:#eee5d6;margin:20px}</style><div class="slide b-janica t-light l-bloques"><div class="s-blocks z-arriba front" data-template="escalera"><div class="blk blk-titulo">elige a alguien</div><div class="blk blk-sans">que admiras de verdad</div><div class="blk blk-titulo">escribe tres cosas</div><div class="blk blk-sans">que hace y tú no estás haciendo</div><div class="blk blk-titulo-xl">elige una.</div><div class="blk blk-sans">empieza mañana</div></div></div>`);
 await page.addScriptTag({content:`const $$=(s,e)=>[...e.querySelectorAll(s)];const fitLayers=()=>{};${fit};fitSlide(document.querySelector('.slide'));`});
 const sample=await page.evaluate(()=>{
  const slide=document.querySelector('.slide'),zone=slide.querySelector('.s-blocks');
  const boxes=[...zone.children].map(n=>({top:n.offsetTop,bottom:n.offsetTop+n.offsetHeight,size:parseFloat(getComputedStyle(n).fontSize)}));
  return {boxes,height:zone.scrollHeight,width:zone.scrollWidth,limit:parseFloat(zone.style.maxHeight),available:zone.clientWidth};
 });
 assert.ok(sample.width<=sample.available+2,'text fits column');
 assert.ok(sample.height<=sample.limit+2,'text fits zone');
 assert.ok(sample.boxes[4].size>sample.boxes[0].size*1.3,'final step dominates');
 assert.ok(sample.boxes[2].top-sample.boxes[1].bottom>sample.boxes[1].top-sample.boxes[0].bottom,'steps separated more than heading and support');
 await mkdir('artifacts/layout-audit',{recursive:true});
 await page.screenshot({path:'artifacts/layout-audit/escalera.png'});
 // Stress: long content with two competing zones and a person-overlay clone.
 await page.evaluate(()=>{
  const el=document.querySelector('.slide'),top=el.querySelector('.s-blocks');
  top.removeAttribute('data-template');
  top.innerHTML='<div class="blk blk-titulo">Un titular que tiene varias líneas y necesita espacio para leerse sin invadir el cierre</div><div class="blk blk-sans">'+('Texto de apoyo extenso. '.repeat(18))+'</div>';
  const bottom=document.createElement('div');bottom.className='s-blocks z-abajo front';bottom.innerHTML='<div class="blk blk-titulo-xl">UN REMATE CLARO</div>';el.append(bottom);
  const copy=top.cloneNode(true);copy.classList.add('over');el.append(copy);fitSlide(el);
 });
 const stress=await page.evaluate(()=>{
  const zones=[...document.querySelectorAll('.s-blocks:not(.over)')];
  return {fits:zones.every(n=>n.scrollHeight<=parseFloat(n.style.maxHeight)+2),top:zones[0].offsetTop+zones[0].scrollHeight,bottom:zones[1].offsetTop,fit:zones[0].style.getPropertyValue('--fit'),copy:document.querySelector('.over').style.getPropertyValue('--fit')};
 });
 assert.ok(stress.fits,'long text fits');assert.ok(stress.top+46<=stress.bottom,'zones do not collide');assert.equal(Number(stress.fit),Number(stress.copy),'overlay matches original');
 console.log('Browser layout audit passed: hierarchy, grouping, overflow, zone collisions and overlay.');
} finally {await browser.close();}
