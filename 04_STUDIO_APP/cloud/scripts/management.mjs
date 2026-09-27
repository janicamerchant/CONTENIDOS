import {loadEnvFile} from 'node:process';
try{loadEnvFile('.env');}catch(e){if(e.code!=='ENOENT')throw e;}
export const ref=process.env.SUPABASE_PROJECT_REF;
if(ref!=='okgjpsntveloemjrsmjd')throw new Error('Proyecto destino inesperado');
export async function management(path,{method='GET',body}={}){
 const r=await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{method,headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok)throw new Error(`Management ${path}: HTTP ${r.status} ${JSON.stringify(data)}`);return data;
}
