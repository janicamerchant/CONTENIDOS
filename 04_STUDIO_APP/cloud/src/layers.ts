// Lámina completa editable: separa una lámina terminada en capas.
// 1) Gemini Flash ubica cada línea de texto y cada logo (caja, color, acento, tipo de letra, si la tapa una persona).
// 2) Nano Banana 2 borra texto y logos; de su imagen solo se usan las zonas de esas cajas, así caras, autos y luces
//    quedan idénticos al original.
// El Editor dibuja el fondo limpio + el texto como texto real (editable y movible) + el logo oficial de la marca.
import sharp from 'sharp';

const API='https://generativelanguage.googleapis.com/v1beta/models/';
const DETECT_MODEL='gemini-3.5-flash',CLEAN_MODEL='gemini-3.1-flash-image';
export const LAYERS_USD=0.101+0.006;   // limpieza a 2K + detección y revisión (si hay que repetir la limpieza, +0,10)

export type Box=[number,number,number,number];   // x, y, ancho, alto en fracción de la imagen (0–1)
export type TextLayer={id:string,text:string,box:Box,color:string,accent:string,font:string,weight:number,italic:boolean,upper:boolean,align:'left'|'center'|'right',spacing:'tight'|'normal'|'wide',behind:boolean,effect:string};
export type LogoLayer={id:string,box:Box,bg:'dark'|'light'};
export type Layers={plate:Buffer,width:number,height:number,texts:TextLayer[],logos:LogoLayer[]};

const SCHEMA={type:'OBJECT',properties:{
 lines:{type:'ARRAY',items:{type:'OBJECT',properties:{
  text:{type:'STRING',description:'Intended text of this line, spelled correctly using the expected text list'},
  printed:{type:'STRING',description:'Text exactly as printed in the image, even if misspelled'},
  box_2d:{type:'ARRAY',items:{type:'INTEGER'}},
  color:{type:'STRING'},accent_text:{type:'STRING'},accent_color:{type:'STRING'},
  role:{type:'STRING',enum:['display','body']},
  typeface:{type:'STRING',enum:['condensed_sans','sans','extended_sans','serif','script','mono']},
  weight:{type:'INTEGER'},italic:{type:'BOOLEAN'},uppercase:{type:'BOOLEAN'},
  align:{type:'STRING',enum:['left','center','right']},
  letter_spacing:{type:'STRING',enum:['tight','normal','wide']},
  behind_person:{type:'BOOLEAN'},
  effect:{type:'STRING',enum:['none','shadow','glow','outline','gradient','3d']}},
  required:['text','printed','box_2d','color','role','typeface','weight','italic','uppercase','align','letter_spacing','behind_person','effect']}},
 logos:{type:'ARRAY',items:{type:'OBJECT',properties:{box_2d:{type:'ARRAY',items:{type:'INTEGER'}},name:{type:'STRING'}},required:['box_2d','name']}}},
 required:['lines','logos']};

const DETECT_PROMPT=(expected:string[],brand:string)=>`This is a finished social-media slide. Find every piece of overlaid graphic typography (text placed on the design), ONE ENTRY PER VISUAL LINE, in reading order.
Do NOT include text that is physically part of the scene: badges or plates on vehicles or products, signs on buildings, LED screens, clothing prints, logos inside photos.
For each line:
- text: the words printed on THIS line only, with spelling corrected against the texts the designer meant to print: ${JSON.stringify(expected)}. A line is often only part of one of those texts: never add words that are printed on another line. Same capitalization as printed. If it does not match any of them, copy it as printed.
- printed: exactly what is printed, even if misspelled.
- box_2d: [ymin, xmin, ymax, xmax] normalized 0-1000, tight around the glyphs of that line only.
- color: main fill hex. If one word or phrase of the line has a different color, give accent_text (exactly as in text) and accent_color.
- role: display for headline or poster type, body for small supporting text.
- typeface: condensed_sans (tall narrow letters), sans, extended_sans (wide letters), serif, script or mono.
- weight 100-900, italic, uppercase (printed in capitals), align within its text block, letter_spacing.
- behind_person: true only if a person or object covers part of the letters.
- effect: the strongest visual effect on the letters.
logos: standalone brand logos placed as graphics on the design${brand?` (for example the ${brand} logo)`:''}, never badges on vehicles; box_2d and name.`;

const CLEAN_PROMPT=(texts:string[],logos:boolean)=>`Edit this image: remove all the overlaid typography${logos?' and the overlaid brand logo graphics':''}: ${JSON.stringify(texts)}.
Fill every removed area with what would naturally be behind it, continuing the lights, haze, textures, surfaces, shadows, people and objects seamlessly. Keep solid color bars, panels, buttons and lines that sit behind the text, only without letters.
Keep everything else exactly the same: same people and faces, same vehicles and their badges, same composition, framing, colors and lighting. Do not add anything new. No text, no letters, no logos in the result.`;

async function gemini(model:string,body:any,timeout=180000){
 const r=await fetch(API+model+':generateContent',{method:'POST',headers:{'x-goog-api-key':process.env.GEMINI_API_KEY!,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});
 if(r.status===402)throw new Error('la cuenta de Google (Gemini) se quedó sin saldo prepagado; recárgala en AI Studio (ai.studio/projects).');
 if(!r.ok)throw new Error(`Google respondió ${r.status} al separar capas.`);return r.json() as Promise<any>;}

const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const toBox=(b:any):Box|null=>{if(!Array.isArray(b)||b.length!==4||b.some((v:any)=>typeof v!=='number'))return null;const [y0,x0,y1,x1]=b.map((v:number)=>clamp(v/1000)) as [number,number,number,number];return x1-x0>0.005&&y1-y0>0.004?[x0,y0,x1-x0,y1-y0]:null;};
const hex=(c:any,f='#FFFFFF')=>/^#?[0-9a-f]{6}$/i.test(String(c||'').trim())?'#'+String(c).trim().replace('#','').toUpperCase():f;
// Familia de Google Fonts que más se parece a la detectada (el display de la marca manda si es del mismo tipo)
function family(typeface:string,role:string,fonts:any){
 if(typeface==='condensed_sans')return 'Anton';
 if(typeface==='extended_sans')return 'Archivo Black';
 if(typeface==='serif')return role==='display'?'Playfair Display':'Lora';
 if(typeface==='script')return 'Dancing Script';
 if(typeface==='mono')return 'Space Mono';
 return role==='display'?(fonts?.display||'Archivo'):(fonts?.body||'Inter');
}

// Parte del área más chica que queda dentro de la otra (1 = una contiene a la otra)
function overlap(a:Box,b:Box){const w=Math.min(a[0]+a[2],b[0]+b[2])-Math.max(a[0],b[0]),h=Math.min(a[1]+a[3],b[1]+b[3])-Math.max(a[1],b[1]);return w>0&&h>0?w*h/Math.min(a[2]*a[3],b[2]*b[3]):0;}
const words=(t:string)=>t.replace(/[*]/g,'').split(/\s+/).filter(Boolean).length;
export async function detect(img:Buffer,mime:string,expected:string[],brand:{name?:string,fonts?:any}){
 let out:any;
 for(let i=0;i<2&&!out;i++){try{const d=await gemini(DETECT_MODEL,{contents:[{role:'user',parts:[{inline_data:{mime_type:mime,data:img.toString('base64')}},{text:DETECT_PROMPT(expected,brand.name||'')}]}],generationConfig:{responseMimeType:'application/json',responseSchema:SCHEMA}},90000);
  out=JSON.parse((d.candidates?.[0]?.content?.parts||[]).map((p:any)=>p.text||'').join(''));}catch(e){if(i)throw e;}}
 const texts:TextLayer[]=[];
 for(const [i,l] of (out.lines||[]).entries()){const box=toBox(l.box_2d);let t=String(l.text||l.printed||'').replace(/[*]/g,'').trim();const pr=String(l.printed||'').replace(/[*]/g,'').trim();if(pr&&words(t)>words(pr))t=pr;if(!box||!t)continue;
  const acc=String(l.accent_text||'').replace(/[*]/g,'').trim(),k=acc?t.toLowerCase().indexOf(acc.toLowerCase()):-1;
  texts.push({id:'t'+i,text:k>=0&&acc.length<t.length?t.slice(0,k)+'*'+t.slice(k,k+acc.length)+'*'+t.slice(k+acc.length):k>=0?'*'+t+'*':t,box,
   color:hex(l.color),accent:hex(l.accent_color,hex(l.color)),font:family(l.typeface,l.role,brand.fonts),weight:Math.max(100,Math.min(900,Math.round((+l.weight||700)/100)*100)),
   italic:!!l.italic,upper:!!l.uppercase,align:['left','center','right'].includes(l.align)?l.align:'left',spacing:['tight','normal','wide'].includes(l.letter_spacing)?l.letter_spacing:'normal',
   behind:!!l.behind_person,effect:String(l.effect||'none')});}
 const logos=(out.logos||[]).map((l:any,i:number)=>({id:'g'+i,box:toBox(l.box_2d)})).filter((l:any)=>l.box) as {id:string,box:Box}[];
 // Fuera: el texto que es parte de un logo y las líneas repetidas (misma caja); de las repetidas queda la que trae acento
 const kept:TextLayer[]=[];
 for(const t of texts){if(logos.some(l=>overlap(t.box,l.box)>0.6))continue;const twin=kept.findIndex(k=>overlap(k.box,t.box)>0.7);
  if(twin<0)kept.push(t);else if(t.text.includes('*')&&!kept[twin]!.text.includes('*'))kept[twin]=t;}
 return {texts:kept,logos};
}

// Proporción de salida de Nano Banana más cercana a la de la imagen
const RATIOS:[string,number][]=[['1:1',1],['2:3',2/3],['3:2',1.5],['3:4',0.75],['4:3',4/3],['4:5',0.8],['5:4',1.25],['9:16',9/16],['16:9',16/9]];
const nearest=(r:number)=>RATIOS.reduce((a,b)=>Math.abs(Math.log(b[1]/r))<Math.abs(Math.log(a[1]/r))?b:a)[0];

// Zonas a borrar: cada caja agrandada para cubrir antialias, sombras y brillos de las letras
function maskSvg(W:number,H:number,boxes:Box[]){
 const rects=boxes.map(([x,y,w,h])=>{const px=Math.max(0.012*W,0.22*h*H),py=Math.max(0.01*H,0.28*h*H);
  return `<rect x="${Math.max(0,x*W-px)}" y="${Math.max(0,y*H-py)}" width="${Math.min(W,w*W+2*px)}" height="${Math.min(H,h*H+2*py)}" fill="#fff"/>`;}).join('');
 return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${rects}</svg>`);}

// Nano Banana devuelve la imagen sin texto pero suele reencuadrarla (escala y posición levemente distintas).
// Se busca la escala a y el desplazamiento (tx, ty) que mejor calzan con el original fuera de las zonas de texto:
// original(x, y) ≈ editada(a·(x−cx)+cx+tx, a·(y−cy)+cy+ty). Primero en baja resolución y luego se afina.
const grayAt=(b:Buffer,w:number,h:number)=>sharp(b).resize(w,h,{fit:'fill'}).removeAlpha().greyscale().raw().toBuffer();
function boxMask(w:number,h:number,boxes:Box[],pad:number){const m=new Uint8Array(w*h);
 for(const [x,y,bw,bh] of boxes){const x0=Math.max(0,Math.floor((x-pad)*w)),x1=Math.min(w,Math.ceil((x+bw+pad)*w)),y0=Math.max(0,Math.floor((y-pad)*h)),y1=Math.min(h,Math.ceil((y+bh+pad)*h));for(let j=y0;j<y1;j++)m.fill(1,j*w+x0,j*w+x1);}return m;}
function bestFit(O:Buffer,E:Buffer,w:number,h:number,m:Uint8Array,scales:number[],txs:number[],tys:number[],step:number){
 const cx=w/2,cy=h/2;let best={a:1,tx:0,ty:0,err:Infinity};
 for(const a of scales)for(const tx of txs)for(const ty of tys){let sum=0,n=0;
  for(let y=0;y<h;y+=step){const ey=Math.round(a*(y-cy)+cy+ty);if(ey<0||ey>=h)continue;
   for(let x=0;x<w;x+=step){const i=y*w+x;if(m[i])continue;const ex=Math.round(a*(x-cx)+cx+tx);if(ex<0||ex>=w)continue;sum+=Math.abs(O[i]!-E[ey*w+ex]!);n++;}}
  if(n>(w*h)/(step*step)*0.5&&sum/n<best.err)best={a,tx,ty,err:sum/n};}
 return best;}
const range=(c:number,r:number,st:number)=>{const o:number[]=[];for(let v=c-r;v<=c+r+1e-9;v+=st)o.push(Math.round(v*1000)/1000);return o;};
async function register(orig:Buffer,edited:Buffer,W:number,H:number,boxes:Box[]){
 const w1=96,h1=Math.round(96*H/W),w2=384,h2=Math.round(384*H/W);
 const [O1,E1,O2,E2]=await Promise.all([grayAt(orig,w1,h1),grayAt(edited,w1,h1),grayAt(orig,w2,h2),grayAt(edited,w2,h2)]);
 const c=bestFit(O1,E1,w1,h1,boxMask(w1,h1,boxes,0.03),range(1,0.15,0.01),range(0,10,1),range(0,10,1),2);
 const k=w2/w1,f=bestFit(O2,E2,w2,h2,boxMask(w2,h2,boxes,0.03),range(c.a,0.012,0.002),range(c.tx*k,6,1),range(c.ty*k,6,1),3);
 return {a:f.a,tx:f.tx*W/w2,ty:f.ty*H/h2,err:f.err};}
// Aplica la transformación encontrada: la editada queda encima del original, píxel con píxel
async function align(edited:Buffer,W:number,H:number,{a,tx,ty}:{a:number,tx:number,ty:number}){
 const sw=Math.round(W/a),sh=Math.round(H/a),P=Math.round(0.3*Math.max(W,H));
 const ox=(W/2*(1-a)+tx)/a,oy=(H/2*(1-a)+ty)/a;
 const left=Math.min(sw+2*P-W,Math.max(0,Math.round(ox)+P)),top=Math.min(sh+2*P-H,Math.max(0,Math.round(oy)+P));
 const big=await sharp(edited).resize(W,H,{fit:'fill'}).resize(sw,sh,{fit:'fill'}).removeAlpha().extend({top:P,bottom:P,left:P,right:P,extendWith:'mirror'}).raw().toBuffer();
 return sharp(big,{raw:{width:sw+2*P,height:sh+2*P,channels:3}}).extract({left,top,width:W,height:H}).raw().toBuffer();}
// Iguala color y exposición de la editada al original (media y contraste por canal, fuera de las zonas)
async function matchColor(rgb:Buffer,orig:Buffer,W:number,H:number,boxes:Box[]){
 const O=await sharp(orig).removeAlpha().raw().toBuffer(),m=boxMask(W,H,boxes,0.04),gain:number[]=[],bias:number[]=[];
 for(let c=0;c<3;c++){let so=0,sr=0,qo=0,qr=0,n=0;for(let i=0;i<W*H;i+=7){if(m[i])continue;const o=O[i*3+c]!,r=rgb[i*3+c]!;so+=o;sr+=r;qo+=o*o;qr+=r*r;n++;}
  const mo=so/n,mr=sr/n,vo=Math.sqrt(Math.max(1,qo/n-mo*mo)),vr=Math.sqrt(Math.max(1,qr/n-mr*mr)),g=Math.max(0.7,Math.min(1.4,vo/vr));gain.push(g);bias.push(mo-g*mr);}
 return sharp(rgb,{raw:{width:W,height:H,channels:3}}).linear(gain,bias).raw().toBuffer();}

async function eraseOnce(img:Buffer,mime:string,texts:string[],withLogos:boolean,W:number,H:number){
 let why='';
 for(let i=0;i<2;i++){
  const d=await gemini(CLEAN_MODEL,{contents:[{role:'user',parts:[{inline_data:{mime_type:mime,data:img.toString('base64')}},{text:CLEAN_PROMPT(texts,withLogos)}]}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:nearest(W/H),imageSize:'2K'}}});
  const part=(d.candidates?.[0]?.content?.parts||[]).map((x:any)=>x.inlineData||x.inline_data).find(Boolean);
  if(part)return Buffer.from(part.data,'base64');why=d.candidates?.[0]?.finishReason||d.promptFeedback?.blockReason||'sin motivo';}
 throw new Error(`Google no devolvió el fondo limpio (${why}).`);}

async function composite(img:Buffer,edited:Buffer,W:number,H:number,boxes:Box[]){
 const reg=await register(img,edited,W,H,boxes);
 const rgb=await matchColor(await align(edited,W,H,reg),img,W,H,boxes);
 // Solo se toma la imagen editada dentro de las zonas; el borde se difumina para que no se note la unión
 const alpha=await sharp(maskSvg(W,H,boxes)).blur(Math.max(2,Math.round(W*0.006))).extractChannel(0).raw().toBuffer();
 // En dos pasos: si se encadena removeAlpha con joinChannel, sharp descarta el canal de la máscara
 const patch=await sharp(rgb,{raw:{width:W,height:H,channels:3}}).joinChannel(alpha,{raw:{width:W,height:H,channels:1}}).png().toBuffer();
 return {plate:await sharp(img).removeAlpha().composite([{input:patch}]).png().toBuffer(),reg};}

export async function clean(img:Buffer,mime:string,texts:string[],boxes:Box[],withLogos:boolean){
 const meta=await sharp(img).metadata(),W=meta.width!,H=meta.height!;
 let first=await composite(img,await eraseOnce(img,mime,texts,withLogos,W,H),W,H,boxes);
 // Si la editada no calza con el original (redibujó el fondo), se pide otra y queda la que mejor calza
 if(first.reg.err>8){const second=await composite(img,await eraseOnce(img,mime,texts,withLogos,W,H),W,H,boxes).catch(()=>null);if(second&&second.reg.err<first.reg.err)first=second;}
 let plate=first.plate;
 // Revisión: si en las zonas borradas todavía se lee texto, se borra de nuevo sobre el resultado (una vez)
 const left=(await detect(plate,'image/png',[],{name:''}).catch(()=>({texts:[] as TextLayer[]}))).texts.filter(t=>boxes.some(b=>overlap(t.box,b)>0.3));
 if(left.length){const again=await composite(plate,await eraseOnce(plate,'image/png',left.map(t=>t.text.replace(/\*/g,'')),false,W,H),W,H,left.map(t=>t.box));plate=again.plate;}
 return {plate:await sharp(plate).jpeg({quality:92,mozjpeg:true}).toBuffer(),width:W,height:H,retried:left.length>0};
}

// Fondo bajo cada logo (para elegir la versión del logo oficial que contrasta)
async function bgOf(plate:Buffer,W:number,H:number,[x,y,w,h]:Box):Promise<'dark'|'light'>{
 const r={left:Math.floor(x*W),top:Math.floor(y*H),width:Math.max(1,Math.floor(w*W)),height:Math.max(1,Math.floor(h*H))};
 const st=await sharp(plate).extract({...r,width:Math.min(r.width,W-r.left),height:Math.min(r.height,H-r.top)}).stats();
 const [R=0,G=0,B=0]=st.channels.map(c=>c.mean);return 0.2126*R+0.7152*G+0.0722*B<140?'dark':'light';}

export async function buildLayers(img:Buffer,mime:string,expected:string[],brand:{name?:string,fonts?:any,hasLogo:boolean}):Promise<Layers>{
 const {texts,logos}=await detect(img,mime,expected,brand);
 if(!texts.length&&!logos.length)throw new Error('No se encontró texto en la lámina para separar.');
 // Los logos solo se borran si la marca tiene logo oficial para ponerlo encima
 const useLogos=brand.hasLogo?logos:[];
 const {plate,width,height}=await clean(img,mime,texts.map(t=>t.text.replace(/\*/g,'')),[...texts.map(t=>t.box),...useLogos.map(l=>l.box)],useLogos.length>0);
 const withBg:LogoLayer[]=[];for(const l of useLogos)withBg.push({...l,bg:await bgOf(plate,width,height,l.box)});
 return {plate,width,height,texts,logos:withBg};
}

// Textos que la lámina debía mostrar (la lista exacta que recibió el motor)
export function slideTexts(s:any):string[]{
 const one=(v:any)=>String(v||'').replace(/[*_=]/g,'').trim();
 return [s.kicker,s.title,s.number,s.numberLabel,s.body,...(s.items||[]),s.leftLabel,...(s.leftItems||[]),s.rightLabel,...(s.rightItems||[]),s.cta,s.source].map(one).filter(Boolean);
}
// Solo para las pruebas (tests/layers.test.ts)
export const internals={register,composite,overlap};
