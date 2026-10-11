import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { CelebrationRoom } from '../realtime/src/index.js';
import { applyEventReset } from '../frontend/event-reset.js';
import { createFamilyNotifications } from '../frontend/family-notifications.js';

// Execute the actual guest request/poll boundary against the realtime authority.
// Daily capture is represented by its upload-completed event, not a browser screenshot.
const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const boundary = source.slice(source.indexOf('async function pollEvents()'), source.indexOf('document.querySelectorAll("[data-effect]")'));
const storage = new Map();
const room = new CelebrationRoom({
  storage: { get: async key => storage.get(key), put: async (key, value) => storage.set(key, value), transaction: async fn => fn(room.ctx.storage) },
  blockConcurrencyWhile: fn => fn()
});
const request = (path, options = {}) => room.fetch(new Request('https://event.test' + path, options));
function guest() {
  const effects = [], photos = [];
  const label = { textContent: '', classList: { add() {}, remove() {} } };
  const context = vm.createContext({
    applyEventReset, localStorage: {}, EVENT_ID: "test",
    fetch: request, Date, console: { error() {} },
    window: { setTimeout: (fn, delay) => { if (delay < 1000) fn(); return 1; }, clearTimeout() {} },
    lastEventSeq: 0, eventsInitialized: false, syncBusy: false,
    lastPollCompletedAt: Date.now(), resyncOnNextPoll: false,
    RESUME_GAP_MS: 5000, MAX_EFFECT_AGE_MS: 4000,
    lastPhotoSeq: 0, lastPhotoAt: 0, photoResultTimer: null, effectTimer: null,
    familyNotifications: createFamilyNotifications(() => {}),
    sharedRecipes: { accept() {} }, sharedFamily: { accept() {} }, acceptKeepsakeSnapshot() {}, gameState: {}, activeGame: null,
    stage: { classList: { contains: () => true } },
    callStatus: { classList: { remove() {} } }, statusText: {}, eventLabel: label,
    guestName: 'Guest', participantId: crypto.randomUUID(),
    playEffect: (...args) => effects.push(args), playGroupCelebration() {},
    showCapturedPhoto: asset => photos.push(asset), latestRenderLatencyMs: null
  });
  vm.runInContext(boundary, context);
  return { context, effects, photos, label };
}
const sender = guest(), peer = guest();
await sender.context.pollEvents();
await peer.context.pollEvents();
await sender.context.sendEffect('photo');
const capture = storage.get('latest').event;
assert.equal(capture.type, 'command');
assert.equal(capture.command, 'photo.capture');
assert.equal(sender.effects[0][0], 'photo');
await peer.context.pollEvents();
assert.equal(peer.effects[0][0], 'photo');
assert.equal(peer.effects[0][2], capture.at);
assert.equal(peer.photos.length, 0); // Request success is not a saved photo.
await request('/api/events', {
  method: 'POST', body: JSON.stringify({ type: 'system', event: 'photo.captured', asset: 'photos/server-family.jpg', senderId: 'daily-photobooth' })
});
peer.context.resyncOnNextPoll = true; // Completion survives a reconnect resync.
await peer.context.pollEvents();
await sender.context.pollEvents();
assert.deepEqual(peer.photos, ['photos/server-family.jpg']);
assert.deepEqual(sender.photos, peer.photos);
assert.equal(peer.label.textContent, 'Family photo saved ✓');
await peer.context.pollEvents();
assert.equal(peer.photos.length, 1);
const late = guest();
await late.context.pollEvents();
assert.equal(late.photos.length, 0); // Joining doesn't replay an old photo moment.
sender.effects.length = 0;
sender.context.fetch = async () => new Response('Unavailable', { status: 503 });
await sender.context.sendEffect('photo');
assert.equal(sender.effects.length, 0); // No offline capture/countdown fallback.
assert.equal(sender.label.textContent, 'Photo request failed. Please try again.');
console.log('Server photo request, shared result, reconnect, deduplication, and failure flow passed.');
