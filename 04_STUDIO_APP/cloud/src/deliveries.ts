// New exports are independent revisions. Historical folders keep the newest file
// for each original filename, then sort naturally instead of renumbering by date.
export function groupedDeliveries(rows:any[]){
 const groups=new Map<string,any>();
 for(const r of rows){
  if(r.exportacion_id&&!r.publicada)continue;
  const key=r.marca_id+':'+(r.exportacion_id||r.carpeta);
  if(!groups.has(key))groups.set(key,{id:key,folder:r.carpeta,updatedAt:r.created_at,files:[]});
  const group=groups.get(key);if(!r.exportacion_id&&group.files.some((x:any)=>x.name===r.nombre))continue;
  group.files.push({name:r.nombre,url:'storage://'+r.archivo_id,position:r.posicion??null});
 }
 return [...groups.values()].map(g=>{g.files.sort((a:any,b:any)=>a.position!=null&&b.position!=null?a.position-b.position:a.name.localeCompare(b.name,'es',{numeric:true}));return {...g,images:g.files.map((f:any)=>f.url)};});
}
