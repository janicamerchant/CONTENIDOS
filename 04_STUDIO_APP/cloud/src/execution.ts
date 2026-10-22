import {AsyncLocalStorage} from 'node:async_hooks';
export const execution=new AsyncLocalStorage<AbortSignal>();
export const executionSignal=(timeout:number)=>AbortSignal.any([AbortSignal.timeout(timeout),...(execution.getStore()?[execution.getStore()!]:[])]);
// Renewal keeps a live call alive beyond the original ten-minute lease. Stop on loss;
// never let an obsolete worker submit a second request or overwrite the new owner.
export async function leased<T>(renew:()=>Promise<boolean>,work:()=>Promise<T>,every=30000,deadline=730000):Promise<T>{
 const controller=new AbortController(),signal=AbortSignal.any([controller.signal,AbortSignal.timeout(deadline)]);
 let renewal:Promise<void>=Promise.resolve();
 const timer=setInterval(()=>{renewal=renewal.then(async()=>{if(!await renew())controller.abort(new Error('Lease vencido'));}).catch(e=>controller.abort(e));},every);
 timer.unref();
 try{return await execution.run(signal,work);}finally{clearInterval(timer);await renewal;}
}
