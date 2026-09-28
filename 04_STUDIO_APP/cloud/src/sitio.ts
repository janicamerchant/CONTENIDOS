// Lee el sitio web de una marca y saca su identidad real: colores más usados en el CSS, tipografías, logo,
// título, descripción y textos principales. Claude la usa al armar el perfil de una marca nueva.
// La URL la escribe el usuario: solo http/https a IPs públicas, cada redirección se vuelve a comprobar,
// y cada descarga tiene tiempo y tamaño máximos.
import {lookup} from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES=1_500_000,TIMEOUT=10_000,MAX_CSS=4;

function privateIp(ip:string){
 if(net.isIPv4(ip)){const [a=0,b=0]=ip.split('.').map(Number);return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||a>=224;}
 const v=ip.toLowerCase();if(v.startsWith('::ffff:'))return privateIp(v.slice(7));return v==='::'||v==='::1'||/^f[cd]/.test(v)||/^fe[89ab]/.test(v);
}
async function safeUrl(raw:string,base?:URL){
 const u=new URL(base?raw:/^https?:\/\//i.test(raw)?raw:'https://'+raw,base);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Dirección no permitida.');
 if(u.port&&!['80','443'].includes(u.port))throw new Error('Puerto no permitido.');
 const addrs=await lookup(u.hostname,{all:true});
 if(!addrs.length||addrs.some(a=>privateIp(a.address)))throw new Error('Dirección no permitida.');
 return u;
}
async function get(raw:string,base?:URL):Promise<{url:URL,text:string,type:string}>{
 let u=await safeUrl(raw,base);
 for(let hop=0;hop<5;hop++){
  const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(TIMEOUT),headers:{'User-Agent':'Mozilla/5.0 (Macintosh) EstudioNikaMedia/1.0','Accept':'text/html,text/css,*/*;q=0.5'}});
  const loc=r.headers.get('location');
  if(r.status>=300&&r.status<400&&loc){u=await safeUrl(loc,u);continue;}
  if(!r.ok)throw new Error(`El sitio respondió ${r.status}.`);
  const reader=r.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();break;}chunks.push(value);}
  return {url:u,text:Buffer.concat(chunks).toString('utf8'),type:r.headers.get('content-type')||''};
 }
 throw new Error('Demasiadas redirecciones.');
}

const attr=(tag:string,name:string)=>tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1]||'';
const decode=(t:string)=>t.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ');
function hex(c:string){c=c.toLowerCase();if(c.length===4)c='#'+[...c.slice(1)].map(x=>x+x).join('');return c.slice(0,7);}
function rgbHex(r:number,g:number,b:number){return '#'+[r,g,b].map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');}
const GENERIC=new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','inherit','initial','unset','ui-sans-serif','ui-serif','ui-monospace','-apple-system','blinkmacsystemfont','segoe ui','roboto','helvetica','helvetica neue','arial','noto sans','apple color emoji','segoe ui emoji','segoe ui symbol','noto color emoji','var']);

export async function readSite(raw:string){
 const page=await get(raw);const html=page.text;const base=page.url;
 const meta=(re:RegExp)=>decode(attr(html.match(re)?.[0]||'','content'));
 const title=decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim()||'');
 const description=meta(/<meta[^>]+name=["']description["'][^>]*>/i)||meta(/<meta[^>]+property=["']og:description["'][^>]*>/i);
 const siteName=meta(/<meta[^>]+property=["']og:site_name["'][^>]*>/i);
 const themeColor=meta(/<meta[^>]+name=["']theme-color["'][^>]*>/i);
 const abs=(v:string)=>{try{return v?new URL(v,base).href:'';}catch{return '';}};
 const ogImage=abs(meta(/<meta[^>]+property=["']og:image["'][^>]*>/i));
 const icons=[...html.matchAll(/<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*>/gi)].map(m=>abs(attr(m[0],'href'))).filter(Boolean);
 const logos=[...html.matchAll(/<img[^>]+>/gi)].map(m=>m[0]).filter(t=>/logo/i.test(t)).map(t=>abs(attr(t,'src')||attr(t,'data-src'))).filter(Boolean);
 // CSS: estilos en la página + las primeras hojas enlazadas
 let css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>(m[1]??'')).join('\n')+'\n'+[...html.matchAll(/style=["']([^"']*)["']/gi)].map(m=>(m[1]??'')).join(';');
 const sheets=[...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)].map(m=>attr(m[0],'href')).filter(Boolean);
 const googleFonts=new Set<string>();
 for(const href of sheets){const fam=[...href.matchAll(/family=([^&:]+)/g)].map(m=>decodeURIComponent((m[1]??'').replace(/\+/g,' ')));fam.forEach(f=>googleFonts.add(f));}
 for(const href of sheets.filter(h=>!/fonts\.googleapis/.test(h)).slice(0,MAX_CSS)){try{const r=await get(href,base);if(/css|text\/plain/.test(r.type)||/\.css/.test(href))css+='\n'+r.text;}catch{/* hoja no disponible */}}
 const counts=new Map<string,number>();const add=(c:string)=>counts.set(c,(counts.get(c)||0)+1);
 for(const m of css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi))add(hex(m[0]));
 for(const m of css.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi))add(rgbHex(+(m[1]??''),+(m[2]??''),+(m[3]??'')));
 const neutral=(c:string)=>{const [r=0,g=0,b=0]=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));return Math.max(r,g,b)-Math.min(r,g,b)<14;};
 const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
 const colors=ranked.filter(([c])=>!neutral(c)).slice(0,8).map(([c,n])=>`${c} (${n})`);
 const neutrals=ranked.filter(([c])=>neutral(c)).slice(0,4).map(([c,n])=>`${c} (${n})`);
 const vars=[...new Set([...css.matchAll(/--([\w-]*(?:color|brand|primary|accent|secondary)[\w-]*)\s*:\s*([^;}{]+)/gi)].map(m=>`--${(m[1]??'')}: ${(m[2]??'').trim()}`))].slice(0,12);
 const fontCounts=new Map<string,number>();
 for(const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi))for(const f of (m[1]??'').split(',').slice(0,2)){const n=f.trim().replace(/^["']|["']$/g,'').replace(/!important/,'').trim();if(n&&!GENERIC.has(n.toLowerCase())&&!n.startsWith('var('))fontCounts.set(n,(fontCounts.get(n)||0)+1);}
 const fonts=[...new Set([...googleFonts,...[...fontCounts].sort((a,b)=>b[1]-a[1]).map(([f])=>f)])].slice(0,6);
 const body=html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi,' ');
 const headings=[...body.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m=>decode((m[1]??'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,15);
 const text=decode(body.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().slice(0,2500);
 const summary=[
  `URL leída: ${base.href}`,title&&`Título: ${title}`,siteName&&`Nombre del sitio: ${siteName}`,description&&`Descripción: ${description}`,
  themeColor&&`theme-color: ${themeColor}`,colors.length&&`Colores más usados en el CSS (veces): ${colors.join(', ')}`,neutrals.length&&`Neutros más usados: ${neutrals.join(', ')}`,
  vars.length&&`Variables de color del CSS: ${vars.join(' | ')}`,fonts.length&&`Tipografías del sitio: ${fonts.join(', ')}`,
  logos.length&&`Logo (imágenes con "logo"): ${logos.slice(0,3).join(' , ')}`,ogImage&&`Imagen para redes (og:image): ${ogImage}`,icons.length&&`Iconos: ${icons.slice(0,2).join(' , ')}`,
  headings.length&&`Titulares del sitio: ${headings.join(' · ')}`,text&&`Texto de la portada: ${text}`,
 ].filter(Boolean).join('\n');
 return {summary,site:{url:base.href,title,description,themeColor,colors:colors.map(c=>c.split(' ')[0]),neutrals:neutrals.map(c=>c.split(' ')[0]),fonts,logo:logos[0]||icons[0]||'',ogImage}};
}
