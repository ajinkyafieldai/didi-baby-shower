import assert from 'node:assert/strict';
import { buildKeepsake, mergeEntries, photoPath } from '../frontend/keepsake-data.js';
import { wrapText, createKeepsakePdf } from '../frontend/keepsake-pdf.js';

const model = buildKeepsake({
  title: 'Family Day', honoree: 'Didi',
  wall: [{ id: 'n', message: 'Old note' }, { id: 'p', kind: 'photo', photoId: 'local-photo' }],
  hub: {
    timeline: [{ id: 'm', when: '2010', title: 'First trip', story: 'A long adventure' }],
    pins: [{ id: 'pin', name: 'A', city: 'Mumbai', coords: [72.8, 19] }],
    guests: [{ id: 'guest', name: 'A', city: 'Mumbai' }, { id: 'b', name: 'B', city: '' }],
    recipes: [{ id: 'r', name: 'Rice', recipe: 'Older recipe' }],
    capsules: [{ id: 'c', title: 'For later', openAt: '18', sender: 'A', message: 'SECRET_DO_NOT_EXPORT' }]
  },
  family: { blessings: [{ id: 'n', message: 'Updated shared wish 💛 मराठी' }], recipes: [{ id: 'r', name: 'Rice', recipe: 'Updated shared recipe' }] },
  latestPhoto: { asset: 'photos/daily.jpg', at: Date.now(), seq: 12 },
  games: { names: [{ name: 'Boondi', sender: 'Pranoti', voters: ['one', 'two'] }], quiz: [{ sender: 'Kasturi', answers: ['Biryani', 'But', 'India', 'Jokes'] }] }
});
assert.equal(model.notes.length, 1);
assert.equal(model.notes[0].message, 'Updated shared wish 💛 मराठी');
assert.equal(model.notes[0].localOnly, false);
assert.equal(model.photos.length, 2);
assert.equal(model.moments[0].story, 'A long adventure');
assert.equal(model.people.length, 2); // Guest arrival and map pin aren't duplicate people.
assert.deepEqual(model.people[0].coords, [72.8, 19]);
assert.equal(model.recipes[0].recipe, 'Updated shared recipe');
assert.equal(model.capsules[0].openAt, '18');
assert.equal(model.games.names[0].votes, 2);
assert.ok(!JSON.stringify(model).includes('SECRET_DO_NOT_EXPORT'));
assert.equal(mergeEntries([{ id: 'a' }], []).length, 1);
assert.equal(photoPath('/api/photos?key=photos%2Fdaily.jpg'), '/api/photos?key=photos%2Fdaily.jpg');
for (const asset of ['https://other.test/image.jpg', 'photos/../secret', '/api/photos?key=other/image', 'photos/../../x']) assert.equal(photoPath(asset), null);
assert.deepEqual(wrapText('abcdefghij\nnext', s => s.length, 4), ['abcd', 'efgh', 'ij', 'next']);
assert.deepEqual(wrapText('👨‍👩‍👦 test', s => [...s].length, 20), ['👨‍👩‍👦 test']);

// A layout probe records every drawn line while exercising the actual PDF writer.
const drawn = [], canvases = [];
const jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwC/gA//2Q==';
const ctx = {
  scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {}, drawImage() {},
  measureText: s => ({ width: [...s].length * 10 }),
  fillText(value, x, y) { drawn.push({ value, x, y }); assert.ok(y < 1123, `Clipped line: ${value}`); }
};
const result = await createKeepsakePdf({ ...model, recipes: [{ name: 'Long recipe', recipe: ('Measure, mix, cook and serve.\n').repeat(160) }] }, {
  createCanvas: () => { const canvas = { getContext: () => ctx, toDataURL: () => 'data:image/jpeg;base64,' + jpeg }; canvases.push(canvas); return canvas; },
  loadPhoto: async () => null
});
assert.equal(result.blob.type, 'application/pdf');
assert.ok((await result.blob.text()).startsWith('%PDF-'));
assert.ok(result.pages > 4);
assert.equal(result.warnings.length, 2);
for (const title of ['Wishes and notes', 'Family photos', 'Moments and memories', 'Our family around the world', 'Family recipes', 'Sealed time capsules', 'Export notes']) assert.ok(drawn.some(line => line.value.startsWith(title)), title);
assert.ok(drawn.some(line => line.value.includes('Message remains sealed')));
for (const value of ['Baby-name poll', 'Didi quiz', 'Boondi', 'Kasturi', 'Comfort food: Biryani']) assert.ok(drawn.some(line => line.value.startsWith(value)), value);
assert.ok(!drawn.some(line => line.value.includes('SECRET_DO_NOT_EXPORT')));
assert.ok(canvases.every(canvas => canvas.width === 1));
console.log('Keepsake: all collections, shared/local deduplication, sealed messages, asset paths, PDF pagination and missing-photo warnings passed.');
