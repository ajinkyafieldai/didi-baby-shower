import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createSharedFamily, sharedPhotoPath } from '../frontend/shared-family.js';
import { CelebrationRoom } from '../realtime/src/index.js';
const storage = new Map();
const ctx = { storage: {
  get: async key => structuredClone(storage.get(key)),
  put: async (key, value) => storage.set(key, structuredClone(value)),
  transaction: async fn => fn(ctx.storage)
}, blockConcurrencyWhile: fn => fn() };
let room = new CelebrationRoom(ctx);
const request = (path, options = {}) => room.fetch(new Request('https://event.test' + path, options));
const poll = async client => client.accept((await (await request('/api/events')).json()).family);
const pc = createSharedFamily({ request }), android = createSharedFamily({ request });
await poll(pc); await poll(android);
const old = (await (await request('/api/events')).json()).family;
await pc.add('blessings', { id: 'note', sender: 'PC', message: 'Hello family', audience: 'baby' });
await poll(android);
assert.equal(android.list('blessings')[0].message, 'Hello family');
await android.add('pins', { id: 'pin', name: 'Android', city: 'Mumbai', coords: [72.8777, 19.076] });
await poll(pc);
assert.equal(pc.list('pins')[0].city, 'Mumbai');
await android.react('note', '🥰', 'reaction-retry');
await android.react('note', '🥰', 'reaction-retry');
await poll(pc);
assert.equal(pc.list('blessings')[0].reactions['🥰'], 1);
assert.equal(pc.accept(old), false);
assert.equal(pc.list('pins').length, 1);
assert.ok(pc.snapshot().revision > old.revision);
await pc.add('blessings', { id: 'note', message: 'Retry', sender: 'PC' });
assert.equal(pc.list('blessings').length, 1);
room = new CelebrationRoom(ctx); // Recreate the authority and both page clients.
const refreshedPc = createSharedFamily({ request }), refreshedAndroid = createSharedFamily({ request });
await poll(refreshedPc); await poll(refreshedAndroid);
assert.deepEqual(refreshedPc.list('blessings'), refreshedAndroid.list('blessings'));
assert.deepEqual(refreshedPc.list('pins'), refreshedAndroid.list('pins'));
assert.equal(refreshedPc.list('blessings')[0].reactions['🥰'], 1);
await pc.add('blessings', { id: 'photo', asset: '/api/photos?key=photos%2Ffamily.jpg', caption: 'Together' });
await poll(android);
assert.equal(android.list('blessings').find(item => item.id === 'photo').kind, 'photo');
assert.equal(sharedPhotoPath('https://other.test/image'), null);
const failed = createSharedFamily({ request: async () => new Response(JSON.stringify({ error: 'Full' }), { status: 409 }) });
await assert.rejects(failed.add('pins', { id: 'failed', name: 'Guest' }), /Full/);
assert.equal(failed.list('pins').length, 0);
const legacy = pc.list('blessings', [{ id: 'local', message: 'Device only' }, { id: 'note', message: 'Old local' }]);
assert.equal(legacy.find(item => item.id === 'local').localOnly, true);
assert.equal(legacy.filter(item => item.id === 'note').length, 1);
// Exercise the actual note form: failure keeps the draft, and retry reuses its ID.
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const draftFunction = source.slice(source.indexOf('function stableFamilyDraft('), source.indexOf('function wallItems()'));
const noteHandler = source.slice(source.indexOf('blessingForm.addEventListener("submit"'), source.indexOf('async function shareWallPhoto()'));
let submitHandler, calls = [], resets = 0, shouldFail = true;
const submit = { disabled: false }, input = { disabled: false, value: 'A wish' };
const form = {
  elements: [submit, input], querySelector: () => submit,
  addEventListener: (_, handler) => { submitHandler = handler; }, reset: () => { resets++; }
};
const status = { textContent: '' };
const context = vm.createContext({
  blessingForm: form, blessingMessage: input, blessingCount: {}, notesStatus: status,
  featureEnabled: () => true, familyDrafts: new WeakMap(), crypto,
  guestName: 'Guest', guestNameInput: { value: '' },
  FormData: class { get(key) { return key === 'message' ? input.value : 'baby'; } },
  setBusy: (button, value) => { button.disabled = value; },
  sharedFamily: { add: async (_, entry) => { calls.push({ ...entry }); if (shouldFail) throw new Error('Offline'); } },
  showBlessingFloat() {}, playChime() {}, renderBlessings() {}
});
vm.runInContext(draftFunction + noteHandler, context);
await submitHandler({ preventDefault() {} });
assert.equal(resets, 0);
assert.equal(input.value, 'A wish');
assert.equal(status.textContent, 'Offline');
assert.equal(input.disabled, false);
shouldFail = false;
await submitHandler({ preventDefault() {} });
assert.equal(calls[0].id, calls[1].id);
assert.equal(resets, 1);
assert.equal(status.textContent, 'Shared with everyone ✓');
console.log('Two independent frontend clients: notes, pins, reactions, shared photos, persistence, stale polls, retry deduplication and failed writes passed.');
