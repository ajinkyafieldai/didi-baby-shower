import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CelebrationRoom } from '../realtime/src/index.js';
import { resetAll } from './reset-cli.mjs';
import { applyEventReset } from '../frontend/event-reset.js';
class Storage {
  data = new Map(); pending = Promise.resolve();
  async get(k) { return structuredClone(this.data.get(k)); }
  async put(k,v) { this.data.set(k,structuredClone(v)); }
  transaction(fn) { const result=this.pending.then(()=>fn(this));this.pending=result.catch(()=>{});return result; }
}
const storage=new Storage();
const room=new CelebrationRoom({storage,blockConcurrencyWhile:fn=>fn()},{REALTIME_SHARED_SECRET:'internal'});
const post=(body)=>room.fetch(new Request('https://worker/',{method:'POST',headers:{'x-family-admin':'internal'},body:JSON.stringify(body)}));
await post({type:'family_add',collection:'blessings',entry:{id:'note',message:'hello'}});
await post({type:'family_add',collection:'capsules',entry:{id:'capsule',message:'private',openAt:'18'}});
await storage.put('latest',{seq:42});await storage.put('videoRoom',{roomUrl:'https://test.daily.co/room'});
await storage.put('latestPhoto',{asset:'photos/old.jpg'});
await storage.put('nameSuggestions',[{name:'Baby'}]);
await storage.put('quizAnswers',[{answer:1}]);
assert.equal((await room.fetch(new Request('https://worker/reset/export'))).status,401);
const backup=await (await room.fetch(new Request('https://worker/reset/export',{headers:{'x-family-admin':'internal'}}))).json();
assert.equal(backup.content.sealedCapsules[0].message,'private');
const publicSnapshot=await (await room.fetch(new Request('https://worker/'))).json();
assert.equal(publicSnapshot.family.capsules[0].message,undefined);
const body={type:'family_reset',collection:'all',expectedRevision:backup.revision,expectedSeq:42,
 expectedGames:{nameSuggestions:backup.content.nameSuggestions,quizAnswers:backup.content.quizAnswers},mutationId:'all1'};
assert.equal((await post({...body,expectedSeq:41})).status,409);
assert.equal((await post({...body,expectedGames:{}})).status,409);
const result=await (await post(body)).json();assert.equal(result.ok,true);
for(const key of ['blessings','recipes','pins','guests','capsules'])assert.deepEqual(result.family[key],[]);
for(const key of ['nameSuggestions','quizAnswers','sealedCapsules','events'])assert.deepEqual(await storage.get(key),[]);
assert.equal(await storage.get('latestPhoto'),null);
assert.equal((await storage.get('latest')).seq,43);
assert.equal((await storage.get('videoRoom')).roomUrl,'https://test.daily.co/room');
assert.equal((await (await post(body)).json()).duplicate,true);
assert.equal((await post({type:'system',event:'photo.captured',asset:'photos/late.jpg'})).status,409);
assert.equal((await post({type:'system',event:'photo.captured',asset:'photos/new.jpg',resetId:'all1'})).status,200);
const local=new Map([['event:baby-shower-family-hub-v1','old'],['identity','guest']]);
const browser={getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)};
assert.equal(applyEventReset(browser,'event',result.family.reset),true);
assert.equal(local.get('identity'),'guest');assert.equal(local.has('event:baby-shower-family-hub-v1'),false);
browser.setItem('event:baby-shower-family-hub-v1','new');
assert.equal(applyEventReset(browser,'event',result.family.reset),false);
assert.equal(local.get('event:baby-shower-family-hub-v1'),'new');
assert.match(local.get('event:backup:all1'),/old/);
const dir=await mkdtemp(join(tmpdir(),'reset-all-'));
const oldUrl=process.env.BABYSHOWER_URL,oldToken=process.env.BABYSHOWER_ADMIN_TOKEN;
process.env.BABYSHOWER_URL='https://site';process.env.BABYSHOWER_ADMIN_TOKEN='operator';
let writes=0;const request=async(url,opts)=>{
 if(opts.method==='POST'){writes++;assert.equal(JSON.parse(await readFile(join(dir,'backup.json'),'utf8')).content.sealedCapsules[0].message,'private');return Response.json({ok:true});}
 return Response.json(backup);
};
try {
 await resetAll({request});assert.equal(writes,0);
 await resetAll({request,confirm:true,backup:join(dir,'backup.json')});assert.equal(writes,1);
 await assert.rejects(resetAll({request,confirm:true,backup:join(dir,'backup.json')}),/EEXIST/);assert.equal(writes,1);
} finally {if(oldUrl===undefined)delete process.env.BABYSHOWER_URL;else process.env.BABYSHOWER_URL=oldUrl;if(oldToken===undefined)delete process.env.BABYSHOWER_ADMIN_TOKEN;else process.env.BABYSHOWER_ADMIN_TOKEN=oldToken;await rm(dir,{recursive:true});}
console.log('PASS all reset: private backup, guards, idempotency, room preservation, stale photo rejection, browser reconnect and CLI backup before reset');
