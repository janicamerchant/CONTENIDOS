// Supported production endpoints, checked against the Higgsfield model API references (2026-10-21).
export const VIDEO_MODELS=[
 {id:'seedance_2_5',nombre:'Seedance 2.5',proveedor:'Higgsfield',endpoint:'bytedance/seedance-2.5/reference-to-video',min:4,max:30,vozReferencia:true,resoluciones:['480p','720p','1080p'],descripcion:'Hasta 30 s por clip, imagen y audio de referencia.'},
 {id:'seedance_2_0',nombre:'Seedance 2.0',proveedor:'Higgsfield',endpoint:'bytedance/seedance-2.0/reference-to-video',min:4,max:15,vozReferencia:true,resoluciones:['480p','720p','1080p'],descripcion:'Hasta 15 s por clip, imagen y audio de referencia.'},
 {id:'kling_3',nombre:'Kling 3.0 Standard',proveedor:'Higgsfield',endpoint:'kling-video/v3.0/std/image-to-video',min:3,max:15,vozReferencia:false,resoluciones:[],descripcion:'Hasta 15 s por clip y sonido nativo. Calidad gestionada por el modelo.'}
] as const;
export type MotorVideo=typeof VIDEO_MODELS[number]['id'];
export const modeloVideo=(id:string)=>VIDEO_MODELS.find(m=>m.id===id);
export const MAX_AUDIO_REFERENCES=3;
export const MAX_REFERENCE_AUDIO_BYTES=15*1024*1024;
export type ConfigVideo={motor:MotorVideo;resolucion:'480p'|'720p'|'1080p';formato:'9:16'|'16:9'|'1:1';segundos:number;
 tipo:'habla'|'mixto'|'apoyo';ritmo:'pausado'|'natural'|'agil';escena:string;vestuario:string;iluminacion:string;encuadre:string;camara:string;tono:string;acento:string;
 generarAudio:boolean;audioNarracion:string|null;audioNombre:string;audiosReferencia:{id:string;nombre:string}[];indicaciones:string};
export const VIDEO_DEFAULTS:ConfigVideo={motor:'seedance_2_0',resolucion:'720p',formato:'9:16',segundos:8,tipo:'habla',ritmo:'natural',
 escena:'',vestuario:'',iluminacion:'',encuadre:'',camara:'',tono:'',acento:'',generarAudio:true,audioNarracion:null,audioNombre:'',audiosReferencia:[],indicaciones:''};
// Conservative budget reservation, not a price quote. Rates deliberately exclude discounts.
// Catalog pricing: https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/playground
export function reservaVideo(c:ConfigVideo,segundos:number){
 const rate=c.motor==='kling_3'?0.2:c.motor==='seedance_2_5'?{'480p':0.4,'720p':0.9,'1080p':2}[c.resolucion]:{'480p':0.4,'720p':0.9,'1080p':2}[c.resolucion];
 return Math.ceil(segundos*rate*100)/100;
}
