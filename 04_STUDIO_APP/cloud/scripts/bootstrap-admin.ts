import {adminClient,assertTarget,loadLocalEnv} from '../src/config.js';
import {z} from 'zod';
loadLocalEnv();assertTarget();
const email=z.email().parse(process.env.STUDIO_ADMIN_EMAIL).toLowerCase();
const limit=z.coerce.number().positive().max(10000).parse(process.env.STUDIO_DEFAULT_MONTHLY_USD??25);
const db=adminClient();
const {data:admins,error}=await db.from('miembros').select('user_id').eq('rol','admin').eq('activo',true);
if(error)throw error;
if(admins?.length)throw new Error('Ya existe un administrador. Gestionar nuevos miembros desde una sesión admin; no se cambia el dueño con este script.');
let user;for(let page=1;;page++){const result=await db.auth.admin.listUsers({page,perPage:100});if(result.error)throw result.error;user=result.data.users.find(u=>u.email?.toLowerCase()===email);if(user||result.data.users.length<100)break;}
if(!user)throw new Error('Crea primero el usuario administrador en Supabase Auth. Este script no envía invitaciones por email.');
const result=await db.from('miembros').insert({user_id:user.id,rol:'admin',limite_mensual_usd:limit});if(result.error)throw result.error;
console.log('Primer administrador registrado. No se han enviado emails ni modificado credenciales.');
