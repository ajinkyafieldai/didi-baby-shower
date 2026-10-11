import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRecordingNotes, recordingTime } from './recording-notes.mjs';
const dir = mkdtempSync(join(tmpdir(), 'recording-notes-'));
try {
  const input = new PassThrough(), output = new PassThrough();
  input.isTTY = output.isTTY = true; input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  let text = '', time = 0, interrupted = false;
  output.on('data', chunk => { text += chunk; });
  const file = join(dir, 'notes.jsonl');
  const notes = createRecordingNotes({ input, output, recordingId: 'recording-id', room: 'family', startTs: 1000,
    filename: file, now: () => 1065000 + time, monotonic: () => time, interrupt: () => { interrupted = true; } });
  const key = (text, name, extra = {}) => input.emit('keypress', text, { name, ...extra });
  time = 10000; key(' ', 'space');
  assert.ok(text.includes('Recording time: 00:01:15'));
  time = 30000; key('Hi 👶', undefined); key(undefined, 'return');
  const entries = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(entries[1].seconds, 75); // Capture time is frozen while typing.
  assert.equal(entries[1].message, 'Hi 👶');
  assert.equal(entries[1].estimated, false);
  key('m', 'm'); key('discard', undefined); key(undefined, 'escape');
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 2);
  time = 60000; key(' ', 'space'); key('Family enters', undefined); key(undefined, 'c', { ctrl: true });
  assert.equal(interrupted, true); notes.close(); notes.close();
  const last = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).at(-1);
  assert.equal(last.time, '00:02:05'); assert.equal(last.interrupted, true);
  assert.equal(input.isRaw, false); assert.equal(input.isPaused(), true);
  assert.equal(input.listenerCount('keypress'), 0);
  writeFileSync(join(dir, 'existing.jsonl'), 'Keep this');
  assert.throws(() => createRecordingNotes({ input, output, recordingId: 'r', filename: join(dir, 'existing.jsonl') }), /EEXIST/);
  assert.equal(readFileSync(join(dir, 'existing.jsonl'), 'utf8'), 'Keep this');
  const estimated = createRecordingNotes({ input, output, recordingId: 'r', room: 'family', filename: join(dir, 'estimated.jsonl'), now: () => 10000, monotonic: () => 0 });
  key(' ', 'space'); key('Fallback', undefined); key(undefined, 'return'); estimated.close();
  assert.equal(JSON.parse(readFileSync(join(dir, 'estimated.jsonl'), 'utf8').trim().split('\n')[1]).estimated, true);
  assert.equal(recordingTime(90061), '25:01:01');
  assert.equal(recordingTime(-1), '00:00:00');
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('PASS: frozen provider timestamp, Unicode message, cancel, interrupt save, raw terminal cleanup, clock fallback and no overwrite');
