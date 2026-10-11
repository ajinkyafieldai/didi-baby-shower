import assert from 'node:assert/strict';
import { createSharedRecipes } from '../frontend/shared-recipes.js';

const entry = { id: 'recipe-1', name: 'Family recipe', recipe: 'Mix and cook', sender: 'Guest' };
const stored = { ...entry, at: 1000, asset: '/api/photos?key=photos%2Fdish.jpg' };
let changed = 0;
let fail = true;
const requests = [];
const client = createSharedRecipes({ changed: () => changed++, request: async (url, options) => {
  assert.equal(url, '/api/events');
  requests.push(JSON.parse(options.body));
  return new Response(JSON.stringify(fail ? { error: 'Family collection is full' } : { ok: true, family: { revision: 2, recipes: [stored] } }), { status: fail ? 409 : 200 });
} });
assert.equal(client.accept(undefined), false);
assert.equal(client.accept({ revision: 0, recipes: [] }), true);
await assert.rejects(client.add(entry), /collection is full/);
assert.equal(client.list().length, 0, 'Failed writes must not appear as shared');
fail = false;
await client.add(entry);
assert.equal(requests[0].type, 'family_add');
assert.equal(requests[0].collection, 'recipes');
assert.equal(requests[0].entry.id, requests[1].entry.id, 'Retries preserve the stable ID');
assert.equal(client.accept({ revision: 1, recipes: [] }), false, 'Old poll cannot erase a successful POST');
assert.equal(client.list()[0].asset, stored.asset);
assert.equal(client.list([{ ...entry }, { id: 'old-local', at: 500 }]).length, 2);
assert.equal(client.list([{ id: 'old-local', at: 500 }])[1].localOnly, true);
assert.equal(client.accept({ revision: 2, recipes: [] }), false);
assert.equal(changed, 2);

const peer = createSharedRecipes();
peer.accept({ revision: 2, recipes: [stored] });
assert.deepEqual(peer.list(), client.list(), 'Late joiner sees the same server recipe');
peer.accept({ revision: 3, recipes: [stored, { id: 'recipe-2', at: 2000 }] });
assert.equal(peer.list()[0].id, 'recipe-2');
console.log('Shared recipes: contract, failed writes, stable retry IDs, stale polls, late joins, assets and local retention passed.');
