import assert from 'node:assert/strict';
import { CelebrationRoom } from '../realtime/src/index.js';
const values = new Map();
const ctx = { storage: { get: async key => values.get(key), put: async (key, value) => values.set(key, value) },
  blockConcurrencyWhile: fn => fn() };
const room = new CelebrationRoom(ctx);
const post = body => room.fetch(new Request('https://test', { method: 'POST', body: JSON.stringify(body) }));
await post({type:'telemetry',clientId:'daily-photobooth',role:'photobooth',status:'error',
  lastError:{code:'upload_failed',at:123,requestId:'request'},lastCapture:{asset:'photos/a.jpg',participants:2,frameCount:1}});
const snapshot = await (await room.fetch(new Request('https://test'))).json();
assert.equal(snapshot.telemetry.photobooth[0].lastError.code, 'upload_failed');
assert.equal(snapshot.telemetry.photobooth[0].lastCapture.participants, 2);
assert.equal(snapshot.telemetry.photobooth[0].active, true);
await post({type:'telemetry',clientId:'guest',role:'guest',lastError:{code:'fake'}});
assert.equal(values.get('telemetryClients').guest.lastError, undefined);
console.log('Photobooth telemetry persistence and snapshot passed');
