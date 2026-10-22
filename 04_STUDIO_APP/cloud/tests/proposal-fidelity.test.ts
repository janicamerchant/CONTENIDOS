import test from 'node:test';import assert from 'node:assert/strict';
import {proposalIssues} from '../shared/carousel.js';
const slide=(text:string)=>({layout:'bloques',theme:'light',blocks:[{text,zone:'arriba',align:'izq',style:'titulo'}]});
const brief={laminas:'1',idea:'En promedio unos 23 minutos hasta volver a la tarea original.',cta:'Escribe BLOQUE y te mando mi hoja.'};
test('no añade gratuidad que no está en el guion y conserva el matiz del promedio',()=>{
 const issues=proposalIssues({slides:[slide('23 minutos después de un solo chequeo')],caption:'Escribe BLOQUE. GRATIS PARA TI.'},brief);
 assert(issues.some(e=>e.includes('gratuidad')));assert(issues.some(e=>e.includes('promedio')));
 assert(proposalIssues({slides:[slide('23 min en promedio después de un solo chequeo')],caption:''},brief).some(e=>e.includes('un solo chequeo')));
 assert.deepEqual(proposalIssues({slides:[slide('23 minutos en promedio para volver a la tarea')],caption:'Escribe BLOQUE y te mando mi hoja.'},brief),[]);
});
test('un recurso gratuito explícito se permite; un número diferente no hereda el promedio',()=>{
 assert.deepEqual(proposalIssues({slides:[slide('Un bloque de 90 minutos')],caption:'Tu hoja gratis.'},{...brief,cta:'Escribe BLOQUE y te mando mi hoja gratis.'}),[]);
 assert.deepEqual(proposalIssues({slides:[slide('Aproximadamente 23 minutos')],caption:''},brief),[]);
});
test('la cifra del año no se confunde con el promedio de 23',()=>{
 assert.deepEqual(proposalIssues({slides:[slide('Estudio de 2023')],caption:''},brief),[]);
});
test('una metáfora sobre el costo de la atención no se confunde con una oferta gratis',()=>{
 assert.deepEqual(proposalIssues({slides:[slide('Tu atención no es gratis')],caption:''},{laminas:'1',idea:'Protege tu atención'}),[]);
 assert.deepEqual(proposalIssues({slides:[slide('Break free from distractions')],caption:''},{laminas:'1',idea:'Protect your attention'}),[]);
 assert(proposalIssues({slides:[slide('Free worksheet')],caption:''},{laminas:'1',idea:'Protect your attention'}).some(e=>e.includes('gratuidad')));
 assert(proposalIssues({slides:[slide('GRATIS PARA TI')],caption:''},{laminas:'1',idea:'No ofrecer gratis'}).some(e=>e.includes('gratuidad')));
});
