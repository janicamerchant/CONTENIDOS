import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {internals,slideTexts,type Box} from '../src/layers.js';

const W=400,H=500;
// Imagen de prueba con formas (para que la alineación tenga dónde agarrarse) y un "texto" blanco en una caja
const scene=(dx=0,dy=0,text=true)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#203040"/>
 <g transform="translate(${dx} ${dy})"><circle cx="120" cy="300" r="70" fill="#c04030"/><rect x="230" y="260" width="120" height="160" fill="#40a060"/><rect x="40" y="420" width="300" height="30" fill="#e0c050"/></g>
 ${text?'<rect x="60" y="60" width="280" height="50" fill="#ffffff"/>':''}</svg>`)).png().toBuffer();
const box:Box=[60/W,60/H,280/W,50/H];
const near=(a:number[],b:number[])=>a.every((v,i)=>Math.abs(v-b[i]!)<=3);
const px=async(b:Buffer,x:number,y:number)=>{const r=await sharp(b).removeAlpha().raw().toBuffer();const i=(y*W+x)*3;return [r[i],r[i+1],r[i+2]];};

test('la limpieza solo cambia las zonas de texto y borra el texto', async()=>{
 const orig=await scene(),edited=await scene(0,0,false);
 const {plate,reg}=await internals.composite(orig,edited,W,H,[box]);
 assert.ok(Math.abs(reg.a-1)<0.01&&Math.abs(reg.tx)<2&&Math.abs(reg.ty)<2,'sin reencuadre no debe mover nada');
 assert.ok(near(await px(plate,200,85) as number[],await px(edited,200,85) as number[]),'dentro de la caja va la imagen sin texto');
 assert.deepEqual(await px(plate,120,300),await px(orig,120,300),'fuera de la caja queda el original exacto');
});

test('la alineación corrige una imagen editada desplazada', async()=>{
 const orig=await scene(),edited=await scene(12,-8,false);
 const {plate,reg}=await internals.composite(orig,edited,W,H,[box]);
 assert.ok(Math.abs(reg.tx-12)<=2&&Math.abs(reg.ty+8)<=2,`desplazamiento encontrado ${reg.tx},${reg.ty}`);
 const [r]=await px(plate,200,85);assert.ok(r!<100,'el texto blanco desaparece');
});

test('las cajas que se repiten o están dentro de un logo se reconocen', ()=>{
 assert.equal(internals.overlap([0.1,0.1,0.2,0.1],[0.1,0.1,0.2,0.1]),1);
 assert.equal(internals.overlap([0.1,0.1,0.2,0.1],[0.5,0.5,0.2,0.1]),0);
});

test('slideTexts devuelve los textos de la lámina sin marcas de acento', ()=>{
 assert.deepEqual(slideTexts({kicker:'ROCKTOBER',title:'The *loudest* deals',body:'',cta:'Ven hoy',items:['a','']}),['ROCKTOBER','The loudest deals','a','Ven hoy']);
});
