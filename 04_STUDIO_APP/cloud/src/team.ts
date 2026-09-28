// Equipo: invitar personas, cambiar su rol, marcas y límite mensual, desactivarlas y generar su enlace de acceso.
// Solo administración. No hay SMTP: el enlace privado (password.html) se copia y se envía por WhatsApp o email.
// El enlace sirve una vez y vence según la expiración de OTP de Supabase Auth (1 hora por defecto).
import {z} from 'zod';
import {adminClient} from './config.js';
import {HttpError,type Identity} from './auth.js';
import {adminOnly,checked} from './library.js';

const ROLES=['admin','editor','lector'] as const;
const siteUrl=()=>(process.env.STUDIO_SITE_URL||'https://estudio-content.vercel.app').replace(/\/+$/,'');
const uuid=z.uuid();

async function findUser(email:string){
 const db=adminClient();
 for(let page=1;;page++){const r=await db.auth.admin.listUsers({page,perPage:200});if(r.error)throw new HttpError(500,'No se pudo consultar los usuarios.');const u=r.data.users.find(x=>x.email?.toLowerCase()===email);if(u||r.data.users.length<200)return u||null;}
}
async function accessLink(email:string){
 const r=await adminClient().auth.admin.generateLink({type:'recovery',email});
 const token=r.data?.properties?.hashed_token;if(r.error||!token)throw new HttpError(500,'No se pudo generar el enlace de acceso.');
 return `${siteUrl()}/password.html#token=${encodeURIComponent(token)}`;
}
async function setBrands(userId:string,brands:string[]){
 const db=adminClient();checked(await db.from('miembro_marca').delete().eq('user_id',userId));
 if(brands.length)checked(await db.from('miembro_marca').insert(brands.map(marca_id=>({user_id:userId,marca_id}))));
}
// Nunca dejar el Estudio sin un administrador activo
async function keepOneAdmin(userId:string){
 const admins=checked(await adminClient().from('miembros').select('user_id').eq('rol','admin').eq('activo',true));
 if(!admins.some((a:any)=>a.user_id!==userId))throw new HttpError(409,'Debe quedar al menos un administrador activo.');
}

export async function teamRoute(w:Identity,route:string,method:string,body:any){
 adminOnly(w);const db=adminClient();
 if(route==='team'&&method==='GET'){
  const [m,l,b]=await Promise.all([db.from('miembros').select('*').order('created_at'),db.from('miembro_marca').select('*'),db.from('marcas').select('id,identidad,archivada')]);
  const members=checked(m),links=checked(l),brands=checked(b);
  const people=await Promise.all(members.map(async(x:any)=>{const u=await db.auth.admin.getUserById(x.user_id);const user=u.data?.user;
   return {id:x.user_id,email:user?.email||'',rol:x.rol,activo:x.activo,limite:Number(x.limite_mensual_usd),marcas:links.filter((k:any)=>k.user_id===x.user_id).map((k:any)=>k.marca_id),
    ultimoAcceso:user?.last_sign_in_at||null,tieneContrasena:!!user?.last_sign_in_at,yo:x.user_id===w.id,creado:x.created_at};}));
  return {members:people,brands:brands.filter((x:any)=>!x.archivada&&x.id!=='_comun').map((x:any)=>({id:x.id,name:x.identidad?.name||x.id})),siteUrl:siteUrl()};
 }
 const brandList=z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/)).max(50);
 if(route==='team/invite'&&method==='POST'){
  const b=z.object({email:z.email().max(254),rol:z.enum(ROLES),marcas:brandList.default([]),limite:z.number().min(0).max(10000).default(25)}).parse(body);
  const email=b.email.trim().toLowerCase();
  let user=await findUser(email);
  if(user){const already=checked(await db.from('miembros').select('user_id').eq('user_id',user.id).maybeSingle());if(already)throw new HttpError(409,'Esa persona ya está en el equipo. Usa "Nuevo enlace" en su fila.');}
  else{const c=await db.auth.admin.createUser({email,email_confirm:true});if(c.error||!c.data.user)throw new HttpError(500,'No se pudo crear el usuario.');user=c.data.user;}
  checked(await db.from('miembros').insert({user_id:user.id,rol:b.rol,limite_mensual_usd:b.limite,activo:true}));
  await setBrands(user.id,b.rol==='admin'?[]:b.marcas);
  return {ok:true,email,link:await accessLink(email)};
 }
 if(route==='team/link'&&method==='POST'){
  const b=z.object({id:uuid}).parse(body);const u=await db.auth.admin.getUserById(b.id);const email=u.data?.user?.email;
  if(!email)throw new HttpError(404,'Usuario no encontrado.');
  const m=checked(await db.from('miembros').select('activo').eq('user_id',b.id).maybeSingle());if(!m?.activo)throw new HttpError(409,'Activa primero a esta persona.');
  return {ok:true,email,link:await accessLink(email)};
 }
 if(route==='team/update'&&method==='POST'){
  const b=z.object({id:uuid,rol:z.enum(ROLES).optional(),activo:z.boolean().optional(),limite:z.number().min(0).max(10000).optional(),marcas:brandList.optional()}).parse(body);
  const cur=checked(await db.from('miembros').select('*').eq('user_id',b.id).maybeSingle());if(!cur)throw new HttpError(404,'Miembro no encontrado.');
  if(b.id===w.id&&((b.rol&&b.rol!=='admin')||b.activo===false))throw new HttpError(409,'No puedes quitarte el rol de administración ni desactivar tu propia cuenta.');
  if(cur.rol==='admin'&&cur.activo&&((b.rol&&b.rol!=='admin')||b.activo===false))await keepOneAdmin(b.id);
  const patch:any={};if(b.rol)patch.rol=b.rol;if(b.activo!==undefined)patch.activo=b.activo;if(b.limite!==undefined)patch.limite_mensual_usd=b.limite;
  if(Object.keys(patch).length)checked(await db.from('miembros').update(patch).eq('user_id',b.id));
  if(b.marcas)await setBrands(b.id,(b.rol||cur.rol)==='admin'?[]:b.marcas);
  // Desactivar también bloquea el inicio de sesión en Supabase Auth (el Estudio ya rechaza a miembros inactivos)
  if(b.activo!==undefined){const r=await db.auth.admin.updateUserById(b.id,{ban_duration:b.activo?'none':'876000h'});if(r.error)throw new HttpError(500,'No se pudo actualizar el acceso.');}
  return {ok:true};
 }
 return undefined;
}
