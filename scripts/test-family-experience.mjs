import assert from 'node:assert/strict';
import { createFamilyNotifications } from '../frontend/family-notifications.js';
import { createScreenAwake } from '../frontend/screen-awake.js';
import { visibleCallPeople } from '../frontend/call-people.js';
import { buildKeepsake } from '../frontend/keepsake-data.js';
import { createKeepsakeHtml } from '../frontend/keepsake-html.js';
import { createSharedFamily } from '../frontend/shared-family.js';
import worker, { CelebrationRoom } from '../realtime/src/index.js';
import { onRequestGet as download } from '../functions/api/capsule-export.js';
import { onRequestPost as token } from '../functions/api/photobooth-token.js';

class Storage {
  data = new Map(); pending = Promise.resolve();
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  transaction(fn) { const result = this.pending.then(() => fn(this)); this.pending = result.catch(() => {}); return result; }
}
const storage = new Storage();
const makeRoom = () => new CelebrationRoom({ storage, blockConcurrencyWhile: fn => fn() });
let room = makeRoom();
const env = { REALTIME_SHARED_SECRET: 'internal-test-secret', BABYSHOWER_ADMIN_TOKEN: 'family-test-key',
  REALTIME_URL: 'https://worker.test/', DAILY_API_KEY: 'daily-test-key',
  CELEBRATION_ROOM: { idFromName: () => 'room', get: () => room } };
const request = (path, options = {}) => worker.fetch(new Request('https://worker.test' + path, {
  ...options, headers: { ...options.headers, 'x-realtime-secret': env.REALTIME_SHARED_SECRET }
}), env);
const pc = createSharedFamily({ request }), phone = createSharedFamily({ request });
const seal = { id: 'capsule-1', sender: 'Family', title: 'For later', openAt: '18', message: 'A private future message' };
const events = [];
const receive = createFamilyNotifications(text => events.push(text));
receive((await (await request('/')).json()).family);
const added = await pc.add('capsules', seal);
receive(added.family); receive(added.family);
assert.equal(events.length, 1);
assert.match(events[0], /sealed a time capsule/);
assert.equal(JSON.stringify(added).includes(seal.message), false);
await pc.add('capsules', seal); // Retry is a no-op.
room = makeRoom(); // Restart the authority, reload the phone.
const snap = await (await request('/')).json(); phone.accept(snap.family);
assert.equal(phone.list('capsules').length, 1);
assert.equal(phone.list('capsules')[0].message, undefined);
assert.equal(JSON.stringify(snap).includes(seal.message), false);
assert.equal((await request('/capsules/export')).status, 401);
assert.equal((await worker.fetch(new Request('https://worker.test/capsules/export', { headers: { 'x-realtime-secret': env.REALTIME_SHARED_SECRET } }), { ...env, REALTIME_SHARED_SECRET: '' })).status, 503);
await assert.rejects(pc.add('capsules', { ...seal, id: 'bad', openAt: '2' }));
await assert.rejects(pc.add('capsules', { ...seal, id: 'bad', message: '' }));

const originalFetch = globalThis.fetch;
let tokenProperties;
globalThis.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.daily.co/')) {
    assert.equal(options.headers.authorization, 'Bearer daily-test-key');
    tokenProperties = JSON.parse(options.body).properties;
    return Response.json({ token: 'hidden-test-token' });
  }
  return worker.fetch(new Request(url, options), env);
};
try {
  assert.equal((await download({ request: new Request('https://pages.test/api/capsule-export'), env })).status, 401);
  const exported = await download({ request: new Request('https://pages.test/api/capsule-export', { headers: { authorization: 'Bearer family-test-key' } }), env });
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get('cache-control'), 'no-store');
  assert.equal((await exported.json()).capsules[0].message, seal.message);
  await storage.put('videoRoom', { provider: 'daily', roomUrl: 'https://apsl.daily.co/family-room', endDate: new Date(Date.now() + 3600000).toISOString() });
  assert.equal((await token({ request: new Request('https://pages.test/api/photobooth-token', { method: 'POST' }), env })).status, 401);
  const issued = await token({ request: new Request('https://pages.test/api/photobooth-token', { method: 'POST', headers: { authorization: 'Bearer family-test-key' } }), env });
  assert.equal((await issued.json()).token, 'hidden-test-token');
  assert.equal(tokenProperties.room_name, 'family-room');
  assert.equal(tokenProperties.permissions.hasPresence, false);
  assert.equal(tokenProperties.permissions.canSend, false);
  assert.equal(tokenProperties.permissions.canAdmin, false);
  assert.equal(tokenProperties.user_id, 'daily-photobooth');
} finally { globalThis.fetch = originalFetch; }

const notifications = [];
const accept = createFamilyNotifications(text => notifications.push(text));
const initial = { revision: 0, blessings: [{ id: 'old', sender: 'Didi', message: 'Old', reactions: {} }], pins: [], guests: [], recipes: [] };
accept(initial); assert.equal(notifications.length, 0);
const updated = { ...initial, revision: 1, recipes: [{ id: 'r', sender: 'Grandma' }] };
accept(updated); accept(updated); accept(initial);
assert.deepEqual(notifications, ['Grandma shared a recipe.']);
accept({ ...updated, revision: 2, blessings: [{ ...initial.blessings[0], reactions: { '❤️': 1 } }] });
assert.match(notifications[1], /New reaction/);
assert.deepEqual(visibleCallPeople({ local: { local: true, user_name: 'You' }, bot: { user_name: 'Family Photobooth' }, hidden: { permissions: { hasPresence: false } }, otherbot: { user_id: 'daily-photobooth' }, guest: { user_name: 'Grandma' } }).map(p => p.user_name), ['You', 'Grandma']);

const page = new EventTarget(); page.visibilityState = 'visible';
let requests = 0, released = 0;
const locks = [];
const awake = createScreenAwake({ page, device: { wakeLock: { request: async () => {
  requests++; const lock = new EventTarget(); lock.release = async () => { released++; lock.dispatchEvent(new Event('release')); }; locks.push(lock); return lock;
} } } });
await awake.setActive(true); await awake.setActive(true); assert.equal(requests, 1);
page.visibilityState = 'hidden'; await locks[0].release();
page.dispatchEvent(new Event('visibilitychange')); assert.equal(requests, 1);
page.visibilityState = 'visible'; page.dispatchEvent(new Event('visibilitychange')); await new Promise(resolve => setImmediate(resolve));
assert.equal(requests, 2);
await awake.setActive(false); assert.equal(released, 2);
page.dispatchEvent(new Event('pointerdown')); assert.equal(requests, 2);
await createScreenAwake({ page, device: {} }).setActive(true); // Unsupported browsers don't break calls.

const model = buildKeepsake({ title: '<script>alert(1)</script>', honoree: 'Didi', wall: [{ id: 'p', kind: 'photo', asset: '/api/photos?key=photos%2Fp.jpg', caption: '<img src=x onerror=alert(1)>' }],
  family: { capsules: [seal] }, hub: { timeline: [{ title: 'First smile', story: 'Remember this', when: '2026' }], pins: [{ name: 'Mumbai family', city: 'Mumbai', coords: [72.9, 19.1] }], recipes: [{ name: 'Dal', recipe: 'Cook gently' }] } });
const html = await createKeepsakeHtml(model, { loadPhoto: async () => new Blob(['photo'], { type: 'image/jpeg' }), photoDataUrl: async () => 'data:image/jpeg;base64,cGhvdG8=' });
const content = await html.blob.text();
assert.equal(content.includes('<script>'), false);
assert.equal(content.includes(seal.message), false);
assert.ok(content.includes('data:image/jpeg;base64,cGhvdG8='));
assert.ok(content.includes('<svg'));
assert.ok(content.includes('Mumbai family'));
assert.ok(content.includes('First smile'));
assert.ok(content.includes('Remember this'));
assert.ok(content.includes('Cook gently'));
assert.ok(content.includes('Content-Security-Policy'));
assert.equal(/(?:src|href)="https?:/.test(content), false);
const missing = await createKeepsakeHtml(model);
assert.equal(missing.warnings.length, 1);
console.log('PASS: capsule persistence/private download, hidden token permissions, shared notifications, wake lifecycle and offline HTML export');
