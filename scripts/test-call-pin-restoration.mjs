import assert from 'node:assert/strict';
import { resolvePinnedParticipant } from '../custom-call.js';
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
