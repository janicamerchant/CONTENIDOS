import {FilesetResolver,ImageSegmenter} from '@mediapipe/tasks-vision';
let segmenter;
export async function cutoutPerson(url){
 if(!segmenter)segmenter=ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks('/mediapipe/wasm'),{baseOptions:{modelAssetPath:'/mediapipe/selfie_segmenter.tflite'},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true});
 const model=await segmenter;const img=new Image();img.crossOrigin='anonymous';img.src=url;await img.decode();
 const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);
 const result=model.segment(canvas);const mask=result.confidenceMasks[0];const values=mask.getAsFloat32Array();const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const i=y*canvas.width+x;const confidence=values[Math.min(mask.height-1,Math.floor(y*mask.height/canvas.height))*mask.width+Math.min(mask.width-1,Math.floor(x*mask.width/canvas.width))];pixels.data[i*4+3]=Math.round(255*Math.max(0,Math.min(1,(confidence-.15)/.7)));}
 result.close();ctx.putImageData(pixels,0,0);return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo crear el recorte.')),'image/png'));
}
