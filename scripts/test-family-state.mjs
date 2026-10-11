import assert from 'node:assert/strict';
import { CelebrationRoom } from '../realtime/src/index.js';
class Storage {
  data = new Map();
  pending = Promise.resolve();
  async get(key) { return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  transaction(fn) {
    const result = this.pending.then(() => fn(this));
    this.pending = result.catch(() => {});
    return result;
  }
}
const storage = new Storage();
const makeRoom = () => new CelebrationRoom({ storage, blockConcurrencyWhile: fn => fn() });
const a = makeRoom();
async function post(room, body) {
  const response = await room.fetch(new Request('https://test/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: response.status, ...await response.json() };
}
async function snapshot(room) { return (await (await room.fetch(new Request('https://test/?since=999'))).json()).family; }
const add = (collection, entry) => ({ type: 'family_add', collection, entry });
assert.equal((await snapshot(a)).revision, 0);
const note = add('blessings', { id: 'note-1', message: 'Hello baby', at: 1, reactions: { '💛': 99 }, token: 'secret' });
assert.equal((await post(a, note)).status, 200);
assert.equal((await post(a, note)).duplicate, true);
await Promise.all([
  post(a, add('recipes', { id: 'r1', name: 'Dal', recipe: 'Cook dal', photoId: 'local-only' })),
  post(a, add('recipes', { id: 'r2', name: 'Rice', recipe: 'Cook rice' })),
  post(a, add('pins', { id: 'p1', name: 'Didi', city: 'Mumbai', coords: [72.9, 19.1] }))
]);
const b = makeRoom(); // New object instance/reload reads the same durable state.
let family = await snapshot(b);
assert.equal(family.revision, 4);
assert.equal(family.recipes.length, 2);
assert.deepEqual(family.pins[0].coords, [72.9, 19.1]);
assert.deepEqual(family.blessings[0].reactions, {});
assert.ok(family.blessings[0].at > 1);
assert.equal(family.blessings[0].token, undefined);
assert.equal(family.recipes[0].photoId, undefined);
const reaction = { type: 'family_react', collection: 'blessings', id: 'note-1', emoji: '💛', mutationId: 'click-1' };
await post(b, reaction); await post(b, reaction);
assert.equal((await snapshot(a)).blessings[0].reactions['💛'], 1);
for (const body of [add('invalid', { id: 'x' }), add('pins', { id: 'bad', name: 'x', coords: [0, 91] }), add('recipes', { id: 'empty' }), { ...reaction, emoji: '__proto__' }, add('blessings', null)]) {
  assert.equal((await post(a, body)).status, 400);
}
assert.equal((await post(a, { ...reaction, id: 'missing', mutationId: 'click-2' })).status, 404);
const other = new CelebrationRoom({ storage: new Storage(), blockConcurrencyWhile: fn => fn() });
assert.equal((await snapshot(other)).blessings.length, 0);
for (let i = 0; i < 199; i++) await post(a, add('pins', { id: `p-${i}`, name: 'Guest' }));
assert.equal((await post(a, add('pins', { id: 'overflow', name: 'Guest' }))).status, 409);
console.log('PASS: durable cross-client snapshots, concurrent writes, idempotent adds/reactions, validation, isolation, limits and field filtering');
