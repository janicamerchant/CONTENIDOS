// JSONB key ordering and PostgreSQL timestamp formatting are not data changes.
export const primaryKeys:Record<string,string[]>={persona_marca:['persona_id','marca_id'],persona_fotos:['persona_id','archivo_id']};
export function canonical(value:any):string{
 const normalized=value===null||typeof value!=='object'?value:Array.isArray(value)?value.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))]));
 return JSON.stringify(normalized);
}
export function canonicalRow(row:Record<string,any>){return canonical(Object.fromEntries(Object.entries(row).map(([k,v])=>[k,k.endsWith('_at')&&typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():v])));}
