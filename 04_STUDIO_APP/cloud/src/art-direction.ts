// A shared hierarchy contract, independent of the model's prose and brand palette.
export const editorialRules = `
Dirección de arte: elige un protagonista visual por lámina. No conviertas cada frase en un titular del mismo tamaño.
En photoPrompt especifica márgenes (8%), ancho de columna, posición del sujeto y proporción entre titular y apoyo (al menos 2:1). Mantén los apoyos junto a su titular; separa grupos, no cada renglón por igual. Usa como máximo dos familias de la marca.
En escalera, trata cada titular y su apoyo como un paso; el último paso es el remate dominante (1,35 veces los anteriores). Reserva la mitad inferior para la escena y una columna limpia de 58% arriba a la izquierda. No imprimas estas medidas.
No pongas texto sobre manos, caras ni objetos protagonistas. No agregues texto decorativo dentro de cuadernos, pantallas o paredes. Usa un solo gesto de acento visible. Conserva el sistema tipográfico de la marca: no impongas sans condensada a una marca serif.
`;

const styles: Record<string,string> = {
 titulo: 'Display heading', 'titulo-xl': 'Dominant display conclusion (1.35x other headings)',
 serif: 'Medium serif', sans: 'Supporting sans (half heading size)',
 'sans-grande': 'Large supporting sans', etiqueta: 'Small spaced label',
 espaciado: 'Spaced supporting line', cifra: 'Dominant number', fuente: 'Small source',
 guardar: 'Small save call to action',
};
export function blockDirection(slide:any):string {
 const blocks=(slide.blocks||[]).filter((b:any)=>!['linea','firma'].includes(b.style)&&String(b.text||'').trim());
 if(!blocks.length)return '';
 const lastHeading=slide.template==='escalera'?blocks.findLast((b:any)=>['titulo','titulo-xl'].includes(b.style)):null;
 const clean=(v:any)=>String(v||'').replace(/[*_=]/g,'').trim();
 return `[BLOCK LAYOUT — positions and hierarchy; do not print instructions]\nSafe margins 8%. Keep each support immediately below its heading; leave a larger gap before the next heading. Preserve brand fonts and case. Never equalize all text sizes. No scene lettering.\n${slide.template==='escalera'?'Steps in one 58%-wide upper-left column, photo subject lower-right; final step is dominant.\n':''}${blocks.map((b:any,i:number)=>`${i+1}. ${styles[b===lastHeading?'titulo-xl':b.style]||'Supporting text'}; zone ${b.zone||'arriba'}; align ${b.align||'izq'}; width ${b.ancho==='medio'?'58%':'available column'}: ${JSON.stringify(clean(b.text))}`).join('\n')}`;
}
