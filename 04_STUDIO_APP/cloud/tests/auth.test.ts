import test from 'node:test';import assert from 'node:assert/strict';
import {authenticate,authorizeBrand,HttpError,databaseError} from '../src/auth.js';
import {config} from '../src/config.js';
const factory = (user: any, member: any, error: any = null) => () => ({
  auth: { getUser: async () => ({ data: { user }, error }) },
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: member, error: null }) }) }) }),
}) as any;
test('no JWT, JWT no validado, usuario anónimo y miembro suspendido se rechazan',async()=>{
 await assert.rejects(authenticate(undefined),e=>e instanceof HttpError&&e.status===401);
 await assert.rejects(authenticate('Bearer fake',factory(null,null,{message:'invalid'})),e=>e instanceof HttpError&&e.status===401);
 await assert.rejects(authenticate('Bearer fake',factory({id:'id',is_anonymous:true},{rol:'admin',activo:true})),e=>e instanceof HttpError&&e.status===401);
 await assert.rejects(authenticate('Bearer fake',factory({id:'id'},{rol:'admin',activo:false})),e=>e instanceof HttpError&&e.status===403);
});
test('rol proviene de miembros y no de user_metadata',async()=>{
 const identity=await authenticate('Bearer fake',factory({id:'id',user_metadata:{rol:'admin'}},{rol:'lector',activo:true}));assert.equal(identity.role,'lector');await assert.rejects(authorizeBrand(identity,'eva',true),e=>e instanceof HttpError&&e.status===403);
});
test('clave secreta mal puesta nunca sale en public-config',()=>{
 const oldURL=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
 try{process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_secret_not-public';assert.throws(config);process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_example';assert.equal(config().SUPABASE_PUBLISHABLE_KEY,'sb_publishable_example');}finally{if(oldURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldURL;if(oldKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;}
});
test('errores de base no exponen detalles internos',()=>{assert.throws(()=>databaseError({code:'oops',message:'SECRET'}),e=>e instanceof HttpError&&!e.message.includes('SECRET'));});
