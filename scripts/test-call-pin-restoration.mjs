import assert from 'node:assert/strict';
import { resolvePinnedParticipant, chooseGridLayout } from '../custom-call.js';
const people = [
  { session_id: 'new-session', user_id: 'guest-1', user_name: 'Didi' },
  { session_id: 'other', user_name: 'Family' },
  { session_id: 'local-new', local: true, user_name: 'Me' }
];
assert.equal(resolvePinnedParticipant(people, { sessionId: 'old', userId: 'guest-1', name: 'Didi' }), people[0]);
assert.equal(resolvePinnedParticipant(people, { sessionId: 'old', name: 'Didi' }), people[0]);
assert.equal(resolvePinnedParticipant(people, { sessionId: 'old', local: true }), people[2]);
assert.equal(resolvePinnedParticipant([...people, { session_id: 'duplicate', user_name: 'Didi' }], { name: 'Didi' }), null);
assert.equal(resolvePinnedParticipant(people, { userId: 'missing', name: 'Didi' }), null);
assert.equal(resolvePinnedParticipant([], { name: 'Didi' }), null);
assert.equal(resolvePinnedParticipant(people, null), null);
assert.equal(resolvePinnedParticipant(people, { sessionId: 'other' }), people[1]);
console.log('Pin restoration: changed sessions, local participant, absent and ambiguous identities passed.');

const grid = chooseGridLayout(1500, 950, 9);
assert.equal(grid.columns, 3);
assert.equal(grid.rows, 3);
for (const [width, height, count] of [[360, 540, 9], [900, 350, 9], [1500, 950, 2], [360, 540, 1], [360, 540, 30]]) {
  const layout = chooseGridLayout(width, height, count);
  assert.ok(layout.tileWidth > 0 && layout.tileHeight > 0);
  assert.ok(layout.columns * layout.tileWidth + (layout.columns - 1) * 8 <= width - 16 + 0.001);
  assert.ok(layout.columns * layout.rows >= count);
}
assert.equal(chooseGridLayout(360, 540, 30).columns, 2);
console.log('Grid: nine-person desktop regression, portrait, landscape, and overflow sizing passed.');
