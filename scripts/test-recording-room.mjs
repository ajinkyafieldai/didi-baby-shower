import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/video-provision.js';
const original = globalThis.fetch;
const existing = { provider: 'daily', roomUrl: 'https://apsl.daily.co/old', endDate: new Date(Date.now()+3600000).toISOString() };
const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const body = options.body && JSON.parse(options.body);
  calls.push({url, body});
  if(url === 'https://api.daily.co/v1/rooms') return Response.json({ url: 'https://apsl.daily.co/new', name: 'new', id: 'new-id' });
  return Response.json(options.method === 'POST' ? {ok:true} : {videoRoom:existing});
};
const context = body => ({ env: { DAILY_API_KEY:'test',REALTIME_URL:'https://realtime.test',REALTIME_SHARED_SECRET:'test' }, request: new Request('https://test', {method:'POST',body:JSON.stringify(body)}) });
try {
  assert.equal((await onRequestPost(context({recording:'cloud',hours:8}))).status,409);
  assert.ok(!calls.some(c=>c.url.includes('api.daily.co')));
  calls.length=0;
  const result=await onRequestPost(context({recording:'cloud',hours:8,force:true}));
  assert.equal(result.status,200);
  assert.equal((await result.json()).recording,'cloud');
  const daily=calls.find(c=>c.url.includes('api.daily.co'));
  assert.equal(daily.body.properties.enable_recording,'cloud');
  assert.equal(daily.body.properties.eject_at_room_exp,true);
  assert.ok(daily.body.properties.exp > Date.now()/1000 + 7*3600);
  assert.equal(calls.at(-1).body.roomUrl,'https://apsl.daily.co/new');
  calls.length=0;
  assert.equal((await (await onRequestPost(context({hours:8}))).json()).reused,true);
  assert.equal(calls.length,1);
  assert.equal((await onRequestPost(context({recording:'invalid',force:true}))).status,400);
  assert.equal((await onRequestPost(context({hours:25,force:true}))).status,400);
} finally { globalThis.fetch=original; }
console.log('PASS recording configuration, explicit rotation, existing room reuse and invalid request rejection');
