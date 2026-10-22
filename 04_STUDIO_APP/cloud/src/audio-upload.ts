export const AUDIO_MIMES=['audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/x-m4a','audio/ogg','audio/webm','audio/flac'] as const;
export function validAudio(bytes:Buffer,mime:string){
 if(mime==='audio/mpeg')return bytes.toString('ascii',0,3)==='ID3'||(bytes[0]===255&&((bytes[1]||0)&224)===224);
 if(mime==='audio/wav'||mime==='audio/x-wav')return bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WAVE';
 if(mime==='audio/mp4'||mime==='audio/x-m4a')return bytes.toString('ascii',4,8)==='ftyp';
 if(mime==='audio/ogg')return bytes.toString('ascii',0,4)==='OggS';
 if(mime==='audio/webm')return bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
 if(mime==='audio/flac')return bytes.toString('ascii',0,4)==='fLaC';
 return false;
}
