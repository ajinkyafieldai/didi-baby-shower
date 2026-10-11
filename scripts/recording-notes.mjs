import { openSync, appendFileSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { emitKeypressEvents, cursorTo, clearLine } from 'node:readline';

export function recordingTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
}

export function createRecordingNotes({ recordingId, room, startTs, filename,
  input = process.stdin, output = process.stdout, now = Date.now, monotonic = () => performance.now(),
  interrupt = () => process.emit('SIGINT') }) {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) {
    output.write('Timestamp notes need an interactive terminal. Recording continues.\n');
    return { close() {} };
  }
  const confirmedAt = now(), anchor = monotonic();
  const providerTime = typeof startTs === 'number' && Number.isFinite(startTs) && startTs > 0 && startTs * 1000 <= confirmedAt;
  const startAt = providerTime ? startTs * 1000 : confirmedAt;
  const initialOffset = (confirmedAt - startAt) / 1000;
  const path = resolve(filename || `didi-recording-${String(recordingId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)}-notes.jsonl`);
  const fd = openSync(path, 'wx', 0o600);
  const write = entry => appendFileSync(fd, JSON.stringify(entry) + '\n', 'utf8');
  try { write({ type: 'recording', recordingId, room, startAt, timing: providerTime ? 'daily-start-ts' : 'estimated-from-confirmation' }); }
  catch (error) { closeSync(fd); throw error; }
  let marker = null, buffer = '', closed = false;
  const wasRaw = Boolean(input.isRaw), wasFlowing = input.readableFlowing === true;
  function prompt() {
    cursorTo(output, 0); clearLine(output, 0);
    output.write(`[${marker.time}] Message: ${buffer}`);
  }
  function save() {
    const message = buffer.trim();
    if (!message) { output.write('\nNote canceled. Press any key for another timestamp.\n'); marker = null; buffer = ''; return; }
    try {
      write({ type: 'note', ...marker, message });
      output.write(`\nSaved [${marker.time}]. Press any key for another timestamp.\n`);
      marker = null; buffer = '';
    } catch { output.write('\nNOTE SAVE FAILED. Your message is still in the prompt; retry Enter or copy it before stopping.\n'); prompt(); }
  }
  function keypress(text, key = {}) {
    if (closed) return;
    if (key.ctrl && (key.name === 'c' || key.name === 'd')) { interrupt(); return; }
    if (key.name === 'escape') { if (marker) { output.write('\nNote canceled.\n'); marker = null; buffer = ''; } return; }
    if (!marker) {
      if (key.ctrl || key.meta || !text) return;
      const seconds = Math.max(0, initialOffset + (monotonic() - anchor) / 1000);
      marker = { seconds: Math.round(seconds * 1000) / 1000, time: recordingTime(seconds), at: now(), estimated: !providerTime };
      output.write(`\nRecording time: ${marker.time}${marker.estimated ? ' (estimated)' : ''}\n`);
      prompt(); return;
    }
    if (key.name === 'return' || key.name === 'enter') { save(); return; }
    if (key.name === 'backspace') { buffer = Array.from(buffer).slice(0, -1).join(''); prompt(); return; }
    if (key.ctrl && key.name === 'u') { buffer = ''; prompt(); return; }
    if (key.ctrl || key.meta || ['left', 'right', 'up', 'down', 'home', 'end', 'delete', 'tab'].includes(key.name)) return;
    if (text && !/[\x00-\x1f\x7f-\x9f]/.test(text) && buffer.length + text.length <= 2000) { buffer += text; output.write(text); }
  }
  try {
    emitKeypressEvents(input); input.setRawMode(true); input.on('keypress', keypress); input.resume();
    output.write(`Notes: ${path}\nPress any key to mark the recording time, type a message, then Enter. Esc cancels; Ctrl+C stops recording.\n`);
  } catch (error) { input.removeListener('keypress', keypress); input.setRawMode(wasRaw); closeSync(fd); throw error; }
  return {
    close() {
      if (closed) return;
      closed = true;
      if (marker && buffer.trim()) {
        try { write({ type: 'note', ...marker, message: buffer.trim(), interrupted: true }); output.write(`\nSaved unfinished note [${marker.time}].\n`); }
        catch { output.write(`\nNOTE SAVE FAILED — unsaved [${marker.time}]: ${buffer}\n`); }
      }
      input.removeListener('keypress', keypress); input.setRawMode(wasRaw);
      if (!wasFlowing) input.pause();
      closeSync(fd);
    }
  };
}
