import { loadEnvFile } from 'node:process';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
export function loadLocalEnv() { try { loadEnvFile('.env'); } catch (e: any) { if(e.code!=='ENOENT') throw e; } }
const configSchema=z.object({
 SUPABASE_URL:z.url().refine(v=>new URL(v).protocol==='https:' || ['localhost','127.0.0.1'].includes(new URL(v).hostname),'HTTPS requerido'),
 SUPABASE_PUBLISHABLE_KEY:z.string().startsWith('sb_publishable_'),
});
export const boundedFetch: typeof fetch = (input, init = {}) => fetch(input, {...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000)});
export function config(){return configSchema.parse(process.env);}
export function userClient(token:string){const c=config();return createClient(c.SUPABASE_URL,c.SUPABASE_PUBLISHABLE_KEY,{global:{fetch:boundedFetch,headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
export function adminClient(){const url=z.url().parse(process.env.SUPABASE_URL);const key=z.string().min(10).parse(process.env.SUPABASE_SECRET_KEY);return createClient(url,key,{global:{fetch:boundedFetch},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}
export function assertTarget(){
 const url=new URL(z.url().parse(process.env.SUPABASE_URL));
 const expected=z.string().min(3).parse(process.env.SUPABASE_PROJECT_REF);
 if(url.hostname!==`${expected}.supabase.co` && !(expected==='local' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('SUPABASE_PROJECT_REF no coincide con SUPABASE_URL.');
 return expected;
}
