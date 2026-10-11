import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { buildKeepsake } from '../frontend/keepsake-data.js';
import { createKeepsakeHtml } from '../frontend/keepsake-html.js';
import { keepsakeGames, recordingTimeline, safeVideoSource, keepsakeControls, controlsPolicy } from '../frontend/keepsake-extras.js';
import { postprocessKeepsake, run } from './postprocess-keepsake.mjs';
const snapshot = { games: {
  names: [{ name: 'लाथेश्वर <script>bad()</script>', sender: 'Pranoti', voters: ['a', 'b', 'a'] }],
  quiz: [{ sender: 'Kasturi', answers: ['Biryani', 'But', 'India', 'Smart jokes'] }]
}, family: { capsules: [{ message: 'SEALED_SECRET' }] } };
const records = [
  { type: 'recording', recordingId: 'rec-1', startAt: 1791730000000, timing: 'daily-start-ts' },
  { type: 'note', seconds: 80.5, time: 'WRONG', message: 'Baby-name game' },
  { type: 'note', seconds: 5, message: '<img src=x onerror=bad()>', estimated: true, interrupted: true }
];
assert.equal(keepsakeGames(snapshot.games).names[0].votes, 2);
assert.deepEqual(recordingTimeline(records).timeline.map(n => n.time), ['00:00:05', '00:01:20']);
for (const bad of [[], [...records, records[0]], [records[0], { type: 'note', seconds: -1, message: 'bad' }]]) assert.throws(() => recordingTimeline(bad));
for (const url of ['javascript:bad()', '//evil.test/x', 'https://user:secret@evil.test/video', 'data:text/html,x']) assert.throws(() => safeVideoSource(url));
assert.equal(safeVideoSource('recording.mp4'), 'recording.mp4');
const hash = createHash('sha256').update(keepsakeControls).digest('base64');
assert.ok((await controlsPolicy()).includes(hash));
let click, printed = 0, scrolled = 0, metadata;
const video = { readyState: 0, duration: 70, currentTime: 0,
  addEventListener(event, listener) { assert.equal(event, 'loadedmetadata'); metadata = listener; },
  load() {}, scrollIntoView() { scrolled++; } };
runInNewContext(keepsakeControls, { document: { addEventListener(event, listener) { click = listener; }, getElementById() { return video; } }, window: { print() { printed++; } } });
click({ target: { closest(selector) { return selector === '[data-keepsake-print]' ? {} : null; } } });
assert.equal(printed, 1);
click({ target: { closest(selector) { return selector === '[data-recording-seconds]' ? { dataset: { recordingSeconds: '80.5' } } : null; } } });
assert.equal(video.currentTime, 0); metadata(); assert.equal(video.currentTime, 70); assert.equal(scrolled, 1);
const original = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"></head><body><main><img src="data:image/jpeg;base64,AAA"><h1>Family</h1></main></body></html>`;
const enriched = await postprocessKeepsake(original, { snapshot, records, video: 'recording.mp4' });
for (const text of ['Pranoti', '2 votes', 'Kasturi', 'Biryani', '00:01:20', 'rec-1', 'Export PDF', hash, 'data-recording-seconds="80.5"', '(estimated)', '(unfinished note)', 'data:image/jpeg;base64,AAA']) assert.ok(enriched.includes(text), text);
assert.ok(!enriched.includes('SEALED_SECRET'));
assert.ok(!enriched.includes('<script>bad()'));
assert.ok(!enriched.includes('<img src=x'));
await assert.rejects(postprocessKeepsake(enriched, { snapshot }), /already/);
await assert.rejects(postprocessKeepsake(original, { video: 'recording.mp4', snapshot }), /requires --notes/);
const generated = await createKeepsakeHtml(buildKeepsake({ title: 'Test', honoree: 'Didi', games: snapshot.games }));
const updated = await postprocessKeepsake(await generated.blob.text(), { snapshot, records });
assert.equal(updated.split('<h2>Baby-name poll').length - 1, 1);
assert.equal(updated.split(`<script>${keepsakeControls}`).length - 1, 1);
const directory = await mkdtemp(join(tmpdir(), 'didi-keepsake-'));
try {
  const input = join(directory, 'original.html'), output = join(directory, 'enriched.html'), data = join(directory, 'events.json');
  await writeFile(input, original); await writeFile(data, JSON.stringify(snapshot));
  await run(['--input', input, '--output', output, '--snapshot', data]);
  assert.equal(await readFile(input, 'utf8'), original);
  assert.ok((await readFile(output, 'utf8')).includes('Kasturi'));
  await assert.rejects(run(['--input', input, '--output', output, '--snapshot', data]), /EEXIST/);
  await assert.rejects(run(['--input', input, '--output', input, '--snapshot', data]), /differ/);
} finally { await rm(directory, { recursive: true, force: true }); }
console.log('PASS: polls, quiz, recording bookmarks, seeking markup, escaping, CSP hash, original preservation and no overwrite');
