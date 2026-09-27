import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {buildInventory,verifySource} from '../src/inventory.js';
test('inventario preserva referencias, separa marcas y detecta cambios sin leer secretos',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'estudio-'));
 const put=async(name:string,data:string)=>{const p=path.join(root,name);await mkdir(path.dirname(p),{recursive:true});await writeFile(p,data);};
 try{
 await put('06_MARCAS/eva/marca.json','{"name":"EVA","personas":[]}');
 await put('06_MARCAS/janica/marca.json','{"name":"Janica","personas":[]}');
 await put('04_STUDIO_APP/.env','SECRET=never-migrate');await put('04_STUDIO_APP/data/config.json','{"apiKey":"never-migrate"}');
 await put('04_STUDIO_APP/data/uploads/foto.png','fake-png');await put('04_STUDIO_APP/data/uploads/sin-uso.png','private');
 for(const brand of ['eva','janica'])await put(`04_STUDIO_APP/data/proyectos/${brand}.json`,JSON.stringify({id:brand,brand,slides:[{image:'/files/04_STUDIO_APP/data/uploads/foto.png',cutout:'/files/04_STUDIO_APP/data/uploads/foto.png'}]}));
 const inv=await buildInventory(root);assert.equal(inv.errors.length,0);assert.equal(inv.assets.length,3);assert.equal(inv.assets.filter(a=>a.alcance==='cuarentena').length,1);
 const projects=inv.tables.proyectos!;assert.notEqual(projects[0]!.documento.slides[0].image,projects[1]!.documento.slides[0].image);assert.match(projects[0]!.documento.slides[0].image,/^storage:\/\//);
 assert.ok(!JSON.stringify(inv).includes('never-migrate'));
 for(let i=0;i<5;i++)assert.equal((await buildInventory(root)).fingerprint,inv.fingerprint);
 await put('04_STUDIO_APP/data/uploads/foto.png','changed');await assert.rejects(verifySource(inv.assets.find(a=>a.nombre==='foto.png')!),/cambió/);
 await put('04_STUDIO_APP/data/proyectos/bad.json','{"id":"bad","brand":"eva","slides":[{"image":"/files/../secret.png"}]}');assert.ok((await buildInventory(root)).errors.some(e=>e.includes('fuera')));
 await symlink(path.join(root,'04_STUDIO_APP/.env'),path.join(root,'04_STUDIO_APP/data/uploads/link.png'));await assert.rejects(buildInventory(root),/simbólico/);
 }finally{await rm(root,{recursive:true,force:true});}
});
