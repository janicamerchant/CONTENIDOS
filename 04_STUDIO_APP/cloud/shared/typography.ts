export const FONT_PAIRS=[
 {id:'instrument-montserrat',label:'Instrument Serif + Montserrat',display:'Instrument Serif',body:'Montserrat',displayWeight:400,bodyWeight:500},
 {id:'bodoni-jost',label:'Bodoni Moda + Jost · más contraste',display:'Bodoni Moda',body:'Jost',displayWeight:700,bodyWeight:500},
 {id:'playfair-montserrat',label:'Playfair Display + Montserrat',display:'Playfair Display',body:'Montserrat',displayWeight:700,bodyWeight:500},
 {id:'archivo-inter',label:'Archivo + Inter · sans',display:'Archivo',body:'Inter',displayWeight:700,bodyWeight:500},
] as const;
export function fontCapabilities(family:string){
 if(['Instrument Serif','DM Serif Display'].includes(family))return {weights:[400],italic:true};
 if(['Anton','Bebas Neue'].includes(family))return {weights:[400],italic:false};
 if(family==='Libre Baskerville')return {weights:[400,700],italic:true};
 if(family==='Cormorant Garamond')return {weights:[300,400,500,600,700],italic:true};
 if(family==='Lora')return {weights:[400,500,600,700],italic:true};
 if(['Bodoni Moda','Playfair Display'].includes(family))return {weights:[400,500,600,700,800,900],italic:true};
 return {weights:[300,400,500,600,700,800,900],italic:true};
}
export function realFontWeight(family:string,weight:number|string){const w=Number(weight)||400,c=fontCapabilities(family);return c.weights.reduce((a,b)=>Math.abs(b-w)<Math.abs(a-w)?b:a);}
export function fontRequest(family:string){
 const c=fontCapabilities(family),f=encodeURIComponent(family).replace(/%20/g,'+');
 return `https://fonts.googleapis.com/css2?family=${f}:${c.italic?'ital,wght@'+[0,1].flatMap(i=>c.weights.map(w=>`${i},${w}`)).join(';'):'wght@'+c.weights.join(';')}&display=swap`;
}
