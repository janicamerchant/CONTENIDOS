import {createClient} from '@supabase/supabase-js';
const token=new URLSearchParams(location.hash.slice(1)).get('token');
history.replaceState(null,'',location.pathname);
const form=document.querySelector('form'),button=form.querySelector('button'),status=document.querySelector('#login-status');
async function start(){
 try{
  if(!token)throw new Error('Abre el enlace privado para crear tu contraseña.');
  const r=await fetch('/api/public-config');if(!r.ok)throw new Error('No se pudo conectar. Vuelve a abrir tu enlace.');
  const cfg=await r.json();
  const client=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:false,detectSessionInUrl:false}});
  const {error}=await client.auth.verifyOtp({token_hash:token,type:'recovery'});
  if(error)throw new Error('El enlace venció o ya fue usado. Solicita uno nuevo.');
  button.disabled=false;status.textContent='Elige tu contraseña para entrar al Estudio.';
  form.addEventListener('submit',async e=>{
   e.preventDefault();const data=new FormData(form);const password=String(data.get('password'));
   if(password!==data.get('confirm')){status.textContent='Las contraseñas no coinciden.';return;}
   button.disabled=true;status.textContent='Guardando…';
   try{const {error}=await client.auth.updateUser({password});if(error)throw error;await client.auth.signOut();form.reset();form.hidden=true;status.textContent='Contraseña guardada. Ya puedes entrar con tu email.';const link=document.createElement('a');link.href='/';link.textContent='Entrar al Estudio';status.append(document.createElement('br'),link);}
   catch(e){status.textContent=e.message;button.disabled=false;}
  });
 }catch(e){status.textContent=e.message;}
}
start();
