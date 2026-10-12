import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../functions/api/video-provision.js';

function request(authorization) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new Request('https://event.example/api/video-provision', {
    method: 'POST', headers, body: JSON.stringify({ hours: 8 })
  });
}

test('room provisioning fails closed without configured operator token', async () => {
  const response = await onRequestPost({
    request: request(),
    env: { DAILY_API_KEY: 'synthetic-test-key' }
  });
  assert.equal(response.status, 503);
});

test('room provisioning rejects missing, wrong, and incorrectly formatted authorization', async () => {
  for (const authorization of [undefined, 'Bearer wrong', 'test-operator-secret']) {
    const response = await onRequestPost({
      request: request(authorization),
      env: { DAILY_API_KEY: 'synthetic-test-key', BABYSHOWER_ADMIN_TOKEN: 'test-operator-secret' }
    });
    assert.equal(response.status, 401);
  }
});

test('authorized operator passes auth and receives existing configuration error', async () => {
  const response = await onRequestPost({
    request: request('Bearer test-operator-secret'),
    env: { BABYSHOWER_ADMIN_TOKEN: 'test-operator-secret' }
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /DAILY_API_KEY/);
});
