import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {canonical} from '../shared/carousel.js';
import {HttpError} from './auth.js';
const DEFAULTS:Record<string,any>={
 eva:{fonts:{display:'Anton',body:'Barlow'},titleCase:'upper',colors:{accent:'#ECFE6E',darkBg:'#2B2B2D',darkInk:'#EFEBE0',lightBg:'#ECE8DD',lightInk:'#262628'}},
 janica:{fonts:{display:'Bodoni Moda',body:'Jost'},titleCase:'none',colors:{accent:'#ECFE6E',darkBg:'#2E2B28',darkInk:'#F3EEE6',lightBg:'#F3EEE6',lightInk:'#2E2B28'}},
 citykia:{fonts:{display:'Archivo',body:'Archivo'},titleCase:'upper',colors:{accent:'#D7141A',darkBg:'#0B0B0C',darkInk:'#FFFFFF',lightBg:'#FFFFFF',lightInk:'#0B0B0C'}}};
export function campaignBrand(brand:any){
 const {trash,meter,...b}=structuredClone(brand),fallback=DEFAULTS[b.design]||{fonts:{display:'Archivo',body:'Inter'},colors:{accent:'#ECFE6E',darkBg:'#1E1E20',darkInk:'#F2F0EA',lightBg:'#F4F2EC',lightInk:'#1E1E20'}};
 return {...b,...b.carouselPattern?.style,fonts:{...fallback.fonts,...b.fonts,...b.carouselPattern?.style?.fonts},colors:{...fallback.colors,...b.colors,...b.carouselPattern?.style?.colors},titleCase:b.carouselPattern?.style?.titleCase||b.titleCase||fallback.titleCase||'none'};
}
const sign=(brand:any)=>{const key=process.env.SUPABASE_SECRET_KEY;if(!key||key.length<10)throw new HttpError(503,'Falta la clave de servidor para conservar la configuración de la campaña.');return createHmac('sha256',key).update(canonical(brand)).digest('hex');};
export function freezeCampaign(brand:any){const b=campaignBrand(brand);return {brand:b,signature:sign(b)};}
export function verifiedCampaign(c:any,brandId:string){
 if(!c?.brand||c.brand.id!==brandId||typeof c.signature!=='string'||!/^[0-9a-f]{64}$/.test(c.signature)||!timingSafeEqual(Buffer.from(c.signature,'hex'),Buffer.from(sign(c.brand),'hex')))throw new HttpError(409,'La configuración guardada de la campaña no es válida. Actualiza la marca del proyecto.');
 return c.brand;
}
export const identityContext=(b:any)=>`Identidad efectiva (estos valores de configuración mandan sobre documentos antiguos). carouselPattern contiene ejemplos aprobados: reutiliza su jerarquía y estructura visual; el tema, las escenas y los textos salen solo del brief actual, sin copiar afirmaciones de los ejemplos:\n${JSON.stringify({name:b.name,colors:b.colors,fonts:b.fonts,titleCase:b.titleCase,look:b.look,defaults:b.defaults,modo:b.modo,carouselPattern:b.carouselPattern?{style:b.carouselPattern.style,examples:b.carouselPattern.examples}:undefined})}`;
export const reviewHash=(revision:string)=>createHash('sha256').update(revision).digest('hex');
export const signReview=(revision:string)=>sign({review:reviewHash(revision)});
export const validReview=(r:any,revision:string)=>!!r&&r.revision===reviewHash(revision)&&r.signature===signReview(revision);
