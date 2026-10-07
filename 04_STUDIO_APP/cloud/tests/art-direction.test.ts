import test from 'node:test';
import assert from 'node:assert/strict';
import {blockDirection} from '../src/art-direction.js';

test('la generación conserva jerarquía, ubicación y texto de los bloques',()=>{
 const direction=blockDirection({template:'escalera',blocks:[
  {style:'titulo',text:'elige a alguien',zone:'arriba',align:'izq'},
  {style:'sans',text:'que admiras de verdad',zone:'arriba'},
  {style:'titulo-xl',text:'__elige una.__',zone:'abajo',align:'der',ancho:'medio'},
  {style:'linea',text:''},
 ]});
 assert.match(direction,/58%-wide upper-left/);
 assert.match(direction,/Supporting sans \(half heading size\).*que admiras de verdad/);
 assert.match(direction,/Dominant display conclusion.*zone abajo; align der; width 58%: "elige una\."/);
 assert.doesNotMatch(direction,/__|4\./);
 assert.equal(blockDirection({title:'Sin bloques'}),'');
});
