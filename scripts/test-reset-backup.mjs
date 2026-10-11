import assert from 'node:assert/strict';
import { CelebrationRoom } from '../realtime/src/index.js';
import { onRequest } from '../functions/api/family-reset.js';
import { resetAll } from './reset-cli.mjs';
class Storage {
 data=new Map(); async get(k){return structuredClone(this.data.get(k));}
 async put(k,v){this.data.set(k,structuredClone(v));} transaction(fn){return fn(this);}
}
const room=new CelebrationRoom({storage:new Storage(),blockConcurrencyWhile:fn=>fn()},{REALTIME_SHARED_SECRET:'internal'});
const env={REALTIME_URL:'https://proxy.test/configured-path?room=didi',REALTIME_SHARED_SECRET:'internal',BABYSHOWER_ADMIN_TOKEN:'admin'};
const request=new Request('https://site/api/family-reset',{headers:{authorization:'Bearer admin'}});
const original=globalThis.fetch;
try {
 globalThis.fetch=async(url,options)=>{
  assert.equal(url,env.REALTIME_URL);assert.equal(options.method,'POST');
  assert.equal(JSON.parse(options.body).type,'family_export');
  // Model a proxy preserving only the configured route and normalizing the path.
  return room.fetch(new Request('https://worker/',options));
 };
 const response=await onRequest({request,env});assert.equal(response.status,200);
 const data=await response.json();assert.deepEqual(Object.keys(data),['content','revision','seq']);
 assert.equal((await room.fetch(new Request('https://worker/',{method:'POST',body:JSON.stringify({type:'family_export'})}))).status,401);
 globalThis.fetch=async()=>Response.json({family:{revision:4},seq:12});
 const unsupported=await onRequest({request,env});assert.equal(unsupported.status,502);
 assert.equal((await unsupported.json()).code,'backup_contract_missing');
 globalThis.fetch=async()=>Response.json({error:'Unauthorized'},{status:401});
 assert.equal((await onRequest({request,env})).status,401);
} finally {globalThis.fetch=original;}
const oldUrl=process.env.BABYSHOWER_URL,oldToken=process.env.BABYSHOWER_ADMIN_TOKEN;
process.env.BABYSHOWER_URL='https://site';process.env.BABYSHOWER_ADMIN_TOKEN='admin';
try {await assert.rejects(resetAll({request:async()=>Response.json({family:{revision:4},seq:12})}),/HTTP 200; response fields: family, seq/);}
finally {if(oldUrl===undefined)delete process.env.BABYSHOWER_URL;else process.env.BABYSHOWER_URL=oldUrl;if(oldToken===undefined)delete process.env.BABYSHOWER_ADMIN_TOKEN;else process.env.BABYSHOWER_ADMIN_TOKEN=oldToken;}
console.log('PASS configured-route backup, admin auth, unsupported upstream detection and actionable CLI error');
