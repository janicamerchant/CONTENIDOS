import {mkdtemp,writeFile,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

export function runFfmpeg(args:string[]){return new Promise<void>((resolve,reject)=>{
 const child=spawn(ffmpeg.path,['-nostdin','-v','error','-y',...args],{stdio:['ignore','ignore','pipe'],timeout:600000});let err='';
 child.stderr.on('data',b=>{err=(err+b).slice(-3000);});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('No se pudo montar el video: '+err.slice(-500))));
});}
export function montarClips(clips:string[],formato:string,download:(ref:string)=>Promise<Buffer>,resolucion='720p'){
 return montarNarracion(clips,null,formato,download,resolucion);
}
export async function montarNarracion(clips:string[],audio:string|null,formato:string,download:(ref:string)=>Promise<Buffer>,resolucion='720p'){
 const dir=await mkdtemp(join(tmpdir(),'studio-video-'));
 try{
  const side=resolucion==='1080p'?1080:resolucion==='480p'?480:720,long=Math.round(side*16/9/2)*2;
  const [w,h]=formato==='16:9'?[long,side]:formato==='1:1'?[side,side]:[side,long];
  let duration=0;
  if(audio){
   await writeFile(join(dir,'voz'),await download(audio));
   // Decode to count actual samples: container duration estimates and -shortest alone can leave extra video frames.
   await runFfmpeg(['-i',join(dir,'voz'),'-map','0:a:0','-ac','1','-ar','16000','-f','s16le',join(dir,'duracion.pcm')]);
   duration=(await stat(join(dir,'duracion.pcm'))).size/32000;
   if(!duration)throw new Error('La narración no contiene audio.');
  }
  for(let i=0;i<clips.length;i++){
   const input=join(dir,`in-${i}.mp4`),output=join(dir,`clip-${i}.mp4`);await writeFile(input,await download(clips[i]!));
   let clipDuration=0;
   if(!audio){
    const frames=join(dir,`frames-${i}.raw`);
    await runFfmpeg(['-i',input,'-map','0:v:0','-an','-vf','fps=24,scale=1:1','-vsync','0','-f','rawvideo','-pix_fmt','gray',frames]);
    clipDuration=(await stat(frames)).size/24;
    if(!clipDuration)throw new Error('Un clip no contiene fotogramas.');
   }
   const normalized=audio?output:join(dir,`sound-${i}.mp4`);
   await runFfmpeg(['-i',input,...(audio?[]:['-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000']),'-map','0:v:0',
    ...(audio?['-an']:['-map','0:a:0?','-map','1:a:0','-af','apad','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t',clipDuration.toFixed(6)]),
    '-vf',`scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24`,
    '-c:v','libx264','-preset',audio?'ultrafast':'fast','-crf','23','-pix_fmt','yuv420p','-threads','2',normalized]);
   // Original sound is the first audio stream when present; otherwise the fallback is silence.
   if(!audio)await runFfmpeg(['-i',normalized,'-map','0:v:0','-map','0:a:0','-c','copy',output]);
  }
  await writeFile(join(dir,'clips.txt'),clips.map((_,i)=>`file 'clip-${i}.mp4'`).join('\n'));
  const out=join(dir,'reel.mp4');
  if(!audio){
   await runFfmpeg(['-f','concat','-safe','1','-i',join(dir,'clips.txt'),'-map','0:v:0','-map','0:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',out]);
   return await readFile(out);
  }
  // The voice track sets the final duration. Hold the last frame when footage is shorter.
  await runFfmpeg(['-f','concat','-safe','1','-i',join(dir,'clips.txt'),'-i',join(dir,'voz'),'-map','0:v:0','-map','1:a:0',
   '-vf','tpad=stop_mode=clone:stop=-1','-c:v','libx264','-preset','fast','-crf','23','-threads','2','-c:a','aac','-b:a','192k','-t',duration.toFixed(6),'-shortest','-movflags','+faststart',out]);
  return await readFile(out);
 }finally{await rm(dir,{recursive:true,force:true});}
}
