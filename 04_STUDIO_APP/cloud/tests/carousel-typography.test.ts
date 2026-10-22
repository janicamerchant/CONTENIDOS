import test from 'node:test';import assert from 'node:assert/strict';
import {fontCapabilities,fontRequest,realFontWeight,FONT_PAIRS} from '../shared/typography.js';
import {normalizePhotoColor} from '../shared/carousel.js';
test('Instrument Serif solicita sus dos estilos reales y no simula un peso Bold inexistente',()=>{
 assert.deepEqual(fontCapabilities('Instrument Serif'),{weights:[400],italic:true});
 assert.equal(realFontWeight('Instrument Serif',700),400);
 assert.ok(fontRequest('Instrument Serif').includes('ital,wght@0,400;1,400'));
 assert.ok(fontRequest('Bodoni Moda').includes('1,700'));assert.equal(realFontWeight('Bodoni Moda',700),700);
 assert.equal(FONT_PAIRS[0]!.display,'Instrument Serif');assert.equal(FONT_PAIRS[0]!.body,'Montserrat');
});
test('Janica no obtiene una lámina en blanco y negro por cuota; ropa negra y blanca se conserva',()=>{
 const p={slides:[{bw:true,photoPrompt:'Janica in a black and white striped blouse, black and white photograph.'}]};
 const r=normalizePhotoColor(p,{marca:'janica',idea:'Una historia de empezar de cero'});
 assert.equal(r.slides[0].bw,false);assert.ok(r.slides[0].photoPrompt.includes('black and white striped blouse'));assert.ok(!r.slides[0].photoPrompt.includes('black and white photograph'));
 assert.equal(normalizePhotoColor(p,{marca:'citykia'}),p);
 assert.equal(normalizePhotoColor(p,{marca:'janica',idea:'Fotos en blanco y negro'}),p);
 assert.equal(normalizePhotoColor(p,{marca:'janica',idea:'Evita fotos en blanco y negro'}).slides[0].bw,false);
});
