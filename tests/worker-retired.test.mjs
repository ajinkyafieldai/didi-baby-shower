import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../realtime/src/index.js';

test('retired Worker never enters its Durable Object for any method or route', async () => {
  const env = { REALTIME_SHARED_SECRET: 'synthetic', CELEBRATION_ROOM: {
    idFromName() { throw Error('DO MUST NOT be reached'); }
  } };
  for (const method of ['GET', 'POST', 'DELETE']) {
    for (const path of ['/','/capsules/export','/reset/export','/events']) {
      const response = await worker.fetch(new Request('https://worker.example' + path, { method }), env);
      assert.equal(response.status, 410, method + ' ' + path);
    }
  }
});
