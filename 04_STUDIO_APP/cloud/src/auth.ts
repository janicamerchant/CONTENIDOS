import {userClient} from './config.js';
import type {SupabaseClient} from '@supabase/supabase-js';
export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
// Clave de Anthropic tal como debe ir en la cabecera: al pegarla en Vercel se cuelan comillas, espacios, saltos de línea
// o el prefijo «x-api-key:». Se limpian; si aun así trae caracteres que no son de una clave, se avisa en vez de fallar a ciegas.
export function anthropicKey(){
 const k=String(process.env.ANTHROPIC_API_KEY||'').replace(/^\s*(?:x-api-key\s*:|ANTHROPIC_API_KEY\s*=)/i,'').replace(/["'“”‘’\s]/g,'');
 if(!k)throw new HttpError(503,'Anthropic no está configurado.');
 if(!/^sk-ant-[A-Za-z0-9_-]+$/.test(k))throw new HttpError(503,'La clave de Anthropic guardada en Vercel no es válida (tiene caracteres de más o está incompleta). Vuelve a pegarla en Vercel → Environment Variables → ANTHROPIC_API_KEY y haz Redeploy.');
 return k;
}
export type Identity={id:string;role:'admin'|'editor'|'lector';db:SupabaseClient};
export async function authenticate(authorization:string|undefined,clientFactory=userClient):Promise<Identity>{
 const token=authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
 if(!token)throw new HttpError(401,'Inicia sesión para continuar.');
 const db=clientFactory(token);
 const {data,error}=await db.auth.getUser(token);
 if(error||!data.user||data.user.is_anonymous)throw new HttpError(401,'Sesión no válida.');
 const member=await db.from('miembros').select('rol,activo').eq('user_id',data.user.id).single();
 if(member.error||!member.data?.activo)throw new HttpError(403,'No tienes acceso al Estudio.');
 return {id:data.user.id,role:member.data.rol,db};
}
export async function authorizeBrand(identity:Identity,brand:string,write=false){
 if(write&&identity.role==='lector')throw new HttpError(403,'Tu rol permite solo lectura.');
 if(write&&brand==='_comun'&&identity.role!=='admin')throw new HttpError(403,'Solo administración puede cambiar documentos comunes.');
 const row=await identity.db.from('marcas').select('id,archivada').eq('id',brand).single();
 if(row.error||!row.data)throw new HttpError(404,'Marca no encontrada.');
 if(write&&row.data.archivada)throw new HttpError(409,'La marca está archivada.');
}
export function databaseError(error:any){
 if(!error)return;
 if(['40001','PT409','23505'].includes(error.code))throw new HttpError(409,'Hay cambios más recientes. Recarga el proyecto antes de guardar.');
 if(error.code==='42501')throw new HttpError(403,'Operación no autorizada.');
 // Do not return raw DB/provider errors, URLs or headers to a client.
 throw new HttpError(500,'No se pudo completar la operación.');
}
