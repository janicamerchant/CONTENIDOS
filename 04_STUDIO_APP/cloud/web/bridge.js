// Adapter runs in the same scope as the editor; keep behavior out of build strings.
window.cloudCurrentBrand=()=>state.p?.brand||ideaBrand;
window.cloudRebindUrls=changes=>{
 const walk=v=>typeof v==='string'?(changes.get(v)||v):Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)])):v;
 Object.assign(state,walk(state));Object.assign(mk,walk(mk));BRANDS=walk(BRANDS);
 if(state.view==='editor')renderEditor();
};
window.cloudRecoverProposal=async(brief,d)=>{
 if(brief.requestId){const requests=await api('/api/requests');const r=requests.find(x=>x.id===brief.requestId);if(!r)throw new Error('La solicitud ya no está disponible.');return createRequestCarousel(r,d,brief);}
 if(!brief.marca){mk.draft={...d,name:brief.name,brand:{name:brief.name,design:'base',theme:d.theme,colors:{accent:d.accent,darkBg:d.darkBg,darkInk:d.darkInk,lightBg:d.lightBg,lightInk:d.lightInk},fonts:{display:d.displayFont,body:d.bodyFont},defaults:{audiencia:d.audiencia,cta:d.cta,idioma:d.idioma,objetivo:d.objetivo}}};mk.sel={type:'new'};showView('brands');return;}
 state.draft=buildDraft(brief,d);saveDraft();showView('create');
};
window.cloudShowDeliveries=()=>showView('deliveries');
window.cloudOpenFolder=(path='')=>{if(path.startsWith('06_MARCAS/')){mk.sel={type:'brand',id:path.split('/')[1]};showView('brands');}else showView(path.includes('SOLICITUDES')?'requests':'deliveries');};
