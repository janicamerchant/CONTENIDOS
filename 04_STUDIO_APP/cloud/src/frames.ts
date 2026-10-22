import sharp from 'sharp';
// Flare's documented formats do not include 4:5. Preserve all pixels inside a
// common 4:5 canvas with the campaign background; never crop text or stretch faces.
export async function normalizeFrame(bytes:Buffer,brand:any,slide:any,size:string){
 const width=size==='4k'?4320:size==='1k'?1080:2160,height=width*5/4;
 const bg=slide.theme==='light'?brand.colors?.lightBg:brand.colors?.darkBg;
 return sharp(bytes).rotate().resize(width,height,{fit:'contain',background:/^#[0-9a-f]{6}$/i.test(bg||'')?bg:'#1E1E20'}).png().toBuffer();
}
