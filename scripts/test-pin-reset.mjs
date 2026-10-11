import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CelebrationRoom } from '../realtime/src/index.js';
import { onRequest as adminReset } from '../functions/api/family-reset.js';
import { onRequest as publicEvents } from '../functions/api/events.js';
import { resetPins } from './reset-cli.mjs';

class Storage {
  data = new Map(); pending = Promise.resolve();
  async get(k) { return structuredClone(this.data.get(k)); }
  async put(k,v) { this.data.set(k, structuredClone(v)); }
  transaction(fn) { const result=this.pending.then(()=>fn(this)); this.pending=result.catch(()=>{}); return result; }
}
const storage = new Storage();
const room = new CelebrationRoom({ storage, blockConcurrencyWhile: fn=>fn() }, { REALTIME_SHARED_SECRET:'internal' });
const post = (body, headers={}) => room.fetch(new Request('https://worker/', {method:'POST',headers,body:JSON.stringify(body)}));
for(const collection of ['pins','guests','recipes','blessings']) {
  await post({type:'family_add',collection,entry:{id:collection,name:'Aju',city:'Mumbai',message:'Hello baby',recipe:'Dal'}});
}
await storage.put('latestPhoto',{asset:'photos/family.jpg'});
const before=await storage.get('sharedFamily');
const body={type:'family_reset',collection:'pins',expectedRevision:before.revision,mutationId:'reset1'};
assert.equal((await post(body)).status,401);
assert.equal((await post(body,{'x-family-admin':'wrong'})).status,401);
assert.equal((await post({...body,collection:'recipes'},{'x-family-admin':'internal'})).status,400);
assert.equal((await post({...body,expectedRevision:0},{'x-family-admin':'internal'})).status,409);
let response=await post(body,{'x-family-admin':'internal'});
let result=await response.json();
assert.equal(result.removed,1);
assert.deepEqual(result.family.pins,[]);
assert.equal(result.family.revision,before.revision+1);
for(const collection of ['guests','recipes','blessings']) assert.deepEqual(result.family[collection],before[collection]);
assert.equal((await storage.get('latestPhoto')).asset,'photos/family.jpg');
assert.equal((await (await post(body,{'x-family-admin':'internal'})).json()).duplicate,true);
assert.equal((await storage.get('sharedFamily')).revision,before.revision+1);

const env={BABYSHOWER_ADMIN_TOKEN:'operator',REALTIME_URL:'https://worker/',REALTIME_SHARED_SECRET:'internal'};
const request=(headers={},payload=body)=>new Request('https://site/api/family-reset',{method:'POST',headers,body:JSON.stringify(payload)});
assert.equal((await adminReset({request:request(),env})).status,401);
assert.equal((await adminReset({request:request(),env:{}})).status,503);
assert.equal((await adminReset({request:request({Authorization:'Bearer operator'},{...body,collection:'guests'}),env})).status,400);
const originalFetch=globalThis.fetch;
try {
  globalThis.fetch=async (url,options)=>{
    assert.equal(options.headers['x-family-admin'],'internal');
    return post(JSON.parse(options.body),options.headers);
  };
  assert.equal((await adminReset({request:request({Authorization:'Bearer operator'}),env})).status,200);
  // Public API strips any caller-supplied privileged headers.
  globalThis.fetch=async (url,options)=>post(JSON.parse(options.body),options.headers);
  assert.equal((await publicEvents({request:request({'x-family-admin':'internal'}),env})).status,401);
} finally { globalThis.fetch=originalFetch; }

const dir=await mkdtemp(join(tmpdir(),'pin-reset-'));
const savedEnv={url:process.env.BABYSHOWER_URL,token:process.env.BABYSHOWER_ADMIN_TOKEN};
process.env.BABYSHOWER_URL='https://site';process.env.BABYSHOWER_ADMIN_TOKEN='operator';
const calls=[];
const fake=async (url,options)=>{
  calls.push({url,options});
  if(options.method==='POST') {
    assert.equal(options.headers.Authorization,'Bearer operator');
    assert.equal(JSON.parse(await readFile(join(dir,'backup.json'),'utf8')).pins.length,1);
    return Response.json({ok:true,removed:1,family:{revision:5}});
  }
  return Response.json({family:before});
};
try {
  await resetPins({request:fake}); assert.equal(calls.length,1);
  await resetPins({confirm:true,backup:join(dir,'backup.json'),request:fake});
  assert.equal(calls.length,3);
  assert.equal((await stat(join(dir,'backup.json'))).mode & 0o777,0o600);
  const count=calls.length;
  await assert.rejects(resetPins({confirm:true,backup:join(dir,'backup.json'),request:fake}),/EEXIST/);
  assert.equal(calls.length,count+1); // GET only; no reset when backup fails.
} finally {
  for(const [key,value] of [['BABYSHOWER_URL',savedEnv.url],['BABYSHOWER_ADMIN_TOKEN',savedEnv.token]]) {
    if(value===undefined) delete process.env[key]; else process.env[key]=value;
  }
  await rm(dir,{recursive:true});
}
console.log('PASS: privileged reset, public bypass rejection, revision guard, idempotency, isolation, preview and backup-before-delete');
